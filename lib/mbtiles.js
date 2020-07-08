var fs = require('fs');
var crypto = require('crypto');
var zlib = require('zlib');
var path = require('path');
var url = require('url');
var qs = require('querystring');
var Buffer = require('buffer').Buffer;
var sm = new (require('@mapbox/sphericalmercator'));
var sqlite3 = require('sqlite3');
var tiletype = require('@mapbox/tiletype');
var ZXYStream = require('./zxystream');
var queue = require('d3-queue').queue;
var os = require('os');

if (process.env.BRIDGE_LOG_MAX_VTILE_BYTES_COMPRESSED) {
    var stats = { max:0, total:0, count:0 };
    process.on('exit', function() {
        if (stats.count > 0) {
            fs.writeFileSync(os.tmpdir() + '/tilelive-bridge-stats.json', JSON.stringify(stats));
        }
    });
}


function noop(err) {
    if (err) throw err;
}

function hash(z, x, y) {
    return (1 << z) * ((1 << z) + x) + y;
}

// MBTiles
// -------
// MBTiles class for doing common operations (schema setup, tile reading,
// insertion, etc.)
module.exports = MBTiles;
MBTiles.schema = fs.readFileSync(path.join(__dirname, './schema.sql'), 'utf8');

// Provides access to an mbtiles database file.
// - uri: A parsed URL hash, the only relevant part is `pathname`.
// - callback: Will be called when the resources have been acquired
//       or acquisition failed.
require('util').inherits(MBTiles, require('events').EventEmitter)
function MBTiles(uri, callback) {
    if (typeof uri === 'string') {
        uri = url.parse(uri, true);
        uri.pathname = qs.unescape(uri.pathname);
    }
    else if (typeof uri.query === 'string') uri.query = qs.parse(uri.query);

    if (!uri.pathname) {
        callback(new Error('Invalid URI ' + url.format(uri)));
        return;
    }

    if (uri.hostname === '.' || uri.hostname == '..') {
        uri.pathname = uri.hostname + uri.pathname;
        delete uri.hostname;
        delete uri.host;
    }
    uri.query = uri.query || {};
    if (!uri.query.batch) uri.query.batch = 100;

    if (!uri.query.mode) uri.query.mode = 'rwc';
    var flagEnum = {
        ro: sqlite3.OPEN_READONLY,
        rw: sqlite3.OPEN_READWRITE,
        rwc: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    };
    var mode = flagEnum[uri.query.mode];
    if (!mode) {
        return callback(new Error('Only supports "ro", "rw", or "rwc" mode.'));
    }

    var mbtiles = this;
    this.setMaxListeners(0);
    this.filename = uri.pathname;
    this._batchSize = +uri.query.batch;
    mbtiles._db = new sqlite3.Database(mbtiles.filename, mode, function(err) {
        if (err) return callback(err);
        fs.stat(mbtiles.filename, function(err, stat) {
            if (err) return callback(err);
            mbtiles._stat = stat;
            mbtiles.open = true;
            mbtiles.emit('open', err);
            callback(null, mbtiles);
        });
    });

    return undefined;
};

MBTiles.registerProtocols = function(tilelive) {
    tilelive.protocols['mbtiles:'] = MBTiles;
};

// Finds all mbtiles file in the filepath and returns their tilesource URI.
MBTiles.list = function(filepath, callback) {
    filepath = path.resolve(filepath);
    fs.readdir(filepath, function(err, files) {
        if (err && err.code === 'ENOENT') return callback(null, {});
        if (err) return callback(err);
        for (var result = {}, i = 0; i < files.length; i++) {
            var name = files[i].match(/^([\w-]+)\.mbtiles$/);
            if (name) result[name[1]] = 'mbtiles://' + path.join(filepath, name[0]);
        }
        return callback(null, result);
    });
};

// Finds an mbtiles file with the given ID in the filepath and returns a
// tilesource URI.
MBTiles.findID = function(filepath, id, callback) {
    filepath = path.resolve(filepath);
    var file = path.join(filepath, id + '.mbtiles');
    fs.stat(file, function(err, stats) {
        if (err) return callback(err);
        else return callback(null, 'mbtiles://' + file);
    });
};

// Retrieve the schema of the current mbtiles database and inform the caller of
// whether the specified table exists.
MBTiles.prototype._exists = function(table, callback) {
    if (typeof callback !== 'function') callback = noop;

    if (this._schema) return callback(null, this._schema.indexOf(table) !== -1);

    var sql = 'SELECT name FROM sqlite_master WHERE type IN ("table", "view")';
    var mbtiles = this;
    this._db.all(sql, function(err, rows) {
        if (err) return callback(err);
        mbtiles._schema = rows.map(function(r) { return r.name });
        mbtiles._exists(table, callback);
    });
};

// DB integrity check.
// - @param {Function(err)} callback
MBTiles.prototype._integrity = function(callback) {
    if (typeof callback !== 'function') callback = noop;

    this._db.get('PRAGMA quick_check(1)', function(err, row) {
        if (!(row && row.integrity_check && row.integrity_check === 'ok')) {
            return callback(new Error('Corrupted database.'));
        } else {
            return callback(null);
        }
    });
};

// Setup schema, indices, views for a new mbtiles database.
// - @param {Function(err)} callback
MBTiles.prototype._setup = function(callback) {
    this._db.exec(MBTiles.schema, callback);
};

// Select a tile from an mbtiles database. Scheme is XYZ.
//
// - @param {Number} z tile z coordinate.
// - @param {Number} x tile x coordinate.
// - @param {Number} y tile y coordinate.
// - @param {Function(err, grid, headers)} callback
MBTiles.prototype.getTile = function(z, x, y, callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));

    // Flip Y coordinate because MBTiles files are TMS.
    y = (1 << z) - 1 - y;

    var sql = 'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';
    var mbtiles = this;

    this._db.get(sql, z, x, y, function(err, row) {
        if ((!err && !row) || (err && err.errno == 1)) {
            return callback(new Error('Tile does not exist'));
        } else if (err) {
            return callback(err);
        } else if (!row.tile_data || !Buffer.isBuffer(row.tile_data)) {
            var err = new Error('Tile is invalid');
            err.code = 'EINVALIDTILE';
            return callback(err);
        } else {
            var headers = tiletype.headers(row.tile_data);
            headers['Last-Modified'] = new Date(mbtiles._stat.mtime).toUTCString();
            headers['ETag'] = mbtiles._stat.size + '-' + Number(mbtiles._stat.mtime);
            if (process.env.BRIDGE_LOG_MAX_VTILE_BYTES_COMPRESSED) {
                var tileDataLength = row.tile_data.length;
                stats.count++;
                stats.total = stats.total + (tileDataLength * 0.001);
                if (stats.max < tileDataLength) {
                    stats.max = tileDataLength;
                }
            }
            return callback(null, row.tile_data, headers);
        }
    });
};

// Select a grid and its data from an mbtiles database. Scheme is XYZ.
//
// - @param {Number} z tile z coordinate
// - @param {Number} x tile x coordinate
// - @param {Number} y tile y coordinate
// - @param {Function(err, grid)} callback
MBTiles.prototype.getGrid = function(z, x, y, callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));

    // Flip Y coordinate because MBTiles files are TMS.
    y = (1 << z) - 1 - y;

    var sqlgrid = 'SELECT grid FROM grids WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';
    var sqljson = 'SELECT key_name, key_json FROM grid_data WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';

    var mbtiles = this;
    mbtiles._db.get(sqlgrid, z, x, y, function(err, row) {
        if (err && err.errno !== 1) return callback(err);
        if (!row || !row.grid || err) return callback(new Error('Grid does not exist'));
        zlib.inflate(!Buffer.isBuffer(row.grid) ? new Buffer(row.grid, 'binary') : row.grid, function(err, buffer) {
            if (err) return callback(new Error('Grid is invalid:' + err.message));
            try { var grid = JSON.parse(buffer); }
            catch(err) { return callback(new Error('Grid is invalid:' + err.message)) };
            mbtiles._db.all(sqljson, z, x, y, function(err, rows) {
                if (err) return callback(err);
                grid.data = grid.data || {};
                for (var i = 0; i < rows.length; i++) {
                    try { grid.data[rows[i].key_name] = JSON.parse(rows[i].key_json); }
                    catch(err) { return callback(new Error('Grid is invalid:' + err.message)) };
                }
                callback(null, grid, {
                    'Content-Type': 'text/javascript',
                    'Last-Modified': new Date(mbtiles._stat.mtime).toUTCString(),
                    'ETag': mbtiles._stat.size + '-' + Number(mbtiles._stat.mtime)
                });
            });
        });
    });
};

MBTiles.prototype.close = function(callback) {
    this._db.close(callback);
};

// Obtain metadata from the database. Performing fallback queries if certain
// keys(like `bounds`, `minzoom`, `maxzoom`) have not been provided.
//
// - @param {Function(err, data)} callback
MBTiles.prototype.getInfo = function(callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));
    if (this._info) return callback(null, this._info);

    var mbtiles = this;
    var info = {};
    info.basename = path.basename(mbtiles.filename);
    info.id = path.basename(mbtiles.filename, path.extname(mbtiles.filename));
    info.filesize = mbtiles._stat.size;
    mbtiles._db.all('SELECT name, value FROM metadata', function(err, rows) {
        if (err && err.errno !== 1) return callback(err);
        if (rows) rows.forEach(function(row) {
            switch (row.name) {
            // The special "json" key/value pair allows JSON to be serialized
            // and merged into the metadata of an MBTiles based source. This
            // enables nested properties and non-string datatypes to be
            // captured by the MBTiles metadata table.
            case 'json':
                try { var jsondata = JSON.parse(row.value); }
                catch (err) { return callback(err); }
                Object.keys(jsondata).reduce(function(memo, key) {
                    memo[key] = memo[key] || jsondata[key];
                    return memo;
                }, info);
                break;
            case 'minzoom':
            case 'maxzoom':
                info[row.name] = parseInt(row.value, 10);
                break;
            case 'center':
            case 'bounds':
                info[row.name] = row.value.split(',').map(parseFloat);
                break;
            default:
                info[row.name] = row.value;
                break;
            }
        });

        // Guarantee that we always return proper schema type, even if 'tms' is specified in metadata
        info.scheme = 'xyz';

        ensureZooms(info, function(err, info) {
            if (err) return callback(err);
            ensureBounds(info, function(err, info) {
                if (err) return callback(err);
                ensureCenter(info, function(err, info) {
                    if (err) return callback(err);
                    mbtiles._info = info;
                    return callback(null, info);
                });
            });
        });
    });
    function ensureZooms(info, callback) {
        if ('minzoom' in info && 'maxzoom' in info) return callback(null, info);
        var remaining = 30;
        var zooms = [];
        var query = mbtiles._db.prepare('SELECT zoom_level FROM tiles WHERE zoom_level = ? LIMIT 1', function(err) {
            if (err) return callback(err.errno === 1 ? null : err, info);

            function done(err, info) {
                if (done.sent) return;
                callback(err, info);
                done.sent = true;
            }

            done.sent = false;

            for (var i = 0; i < remaining; i++) {
                query.get(i, function(err, row) {
                    if (err) return done(err);
                    if (row) zooms.push(row.zoom_level);
                    if (--remaining === 0) {
                        if (!zooms.length) return callback(null, info);
                        zooms.sort(function(a,b) { return a < b ? -1 : 1; });
                        info.minzoom = zooms[0];
                        info.maxzoom = zooms.pop();
                        return done(null, info);
                    }
                });
            }

            query.finalize();
        });
    };
    function ensureBounds(info, callback) {
        if ('bounds' in info) return callback(null, info);
        if (!('minzoom' in info)) return callback(null, info);
        mbtiles._db.get(
            'SELECT MAX(tile_column) AS maxx, ' +
            'MIN(tile_column) AS minx, MAX(tile_row) AS maxy, ' +
            'MIN(tile_row) AS miny FROM tiles ' +
            'WHERE zoom_level = ?',
            info.minzoom,
            function(err, row) {
                if (err) return callback(err);
                if (!row) return callback(null, info);

                // @TODO this breaks a little at zoom level zero
                var urTile = sm.bbox(row.maxx, row.maxy, info.minzoom, true);
                var llTile = sm.bbox(row.minx, row.miny, info.minzoom, true);
                // @TODO bounds are limited to "sensible" values here
                // as sometimes tilesets are rendered with "negative"
                // and/or other extremity tiles. Revisit this if there
                // are actual use cases for out-of-bounds bounds.
                info.bounds = [
                    llTile[0] > -180 ? llTile[0] : -180,
                    llTile[1] > -90 ? llTile[1] : -90,
                    urTile[2] < 180 ? urTile[2] : 180,
                    urTile[3] < 90 ? urTile[3] : 90
                ];
                return callback(null, info);
            });
    };
    function ensureCenter(info, callback) {
        if ('center' in info) return callback(null, info);
        if (!('bounds' in info) || !('minzoom' in info) || !('maxzoom' in info)) return callback(null, info);
        var range = info.maxzoom - info.minzoom;
        info.center = [
            (info.bounds[2] - info.bounds[0]) / 2 + info.bounds[0],
            (info.bounds[3] - info.bounds[1]) / 2 + info.bounds[1],
            range <= 1 ? info.maxzoom : Math.floor(range * 0.5) + info.minzoom
        ];
        return callback(null, info);
    };
};

// Puts the MBTiles tilestore into write mode.
//
// - @param {Function(err)} callback
MBTiles.prototype.startWriting = function(callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));

    var mbtiles = this;
    mbtiles._clearCaches();
    mbtiles._setup(function(err) {
        if (err) return callback(err);
        if (mbtiles._isWritable) return callback();

        // Sets the synchronous flag to OFF for (much) faster inserts.
        // See http://www.sqlite3.org/pragma.html#pragma_synchronous
        mbtiles._isWritable = 1;
        mbtiles._db.run('PRAGMA synchronous=OFF', callback);
    });
};

MBTiles.prototype._clearCaches = function() {
    this._pending = 0;
    this._writes = {};
};

// Queue a row to be written to a table.
MBTiles.prototype.write = function(table, id, row, callback) {
    callback = callback || function() {};

    this._writes = this._writes || {};
    this._writes[table] = this._writes[table] || {};
    this._writes[table][id] = this._writes[table][id] || {};

    // Merge row data.
    for (var key in row) this._writes[table][id][key] = row[key];

    return ++this._pending >= this._batchSize
        ? this._commit(callback)
        : callback();
};

// (private) Commits the cached changes to the database.
//
// - @param {Function(err)} callback
MBTiles.prototype._commit = function(callback) {
    var mbtiles = this;

    // If no pending commits our work's done.
    if (!mbtiles._pending) return callback();

    // If already committing wait in line.
    if (mbtiles._committing) return mbtiles.once('commit', function() {
        mbtiles._commit(callback);
    });

    var writes = mbtiles._writes;
    mbtiles._clearCaches();
    mbtiles._committing = true;
    mbtiles._db.serialize(function() {
        mbtiles._db.run('BEGIN');

        var statements = {};
        Object.keys(writes).forEach(function(table) {
            switch (table) {
            case 'map':
                // Insert map table. This has to be so complicate due to a design flaw
                // in the tables.
                // TODO: This should be remedied when we upgrade the MBTiles schema.
                var sql = '\
                    REPLACE INTO map (zoom_level, tile_column, tile_row, tile_id, grid_id)\
                    VALUES (?, ?, ?,\
                    COALESCE(?, (SELECT tile_id FROM map WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?)),\
                    COALESCE(?, (SELECT grid_id FROM map WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?)))';
                statements['map'] = mbtiles._db.prepare(sql);
                for (var id in writes[table]) {
                    var row = writes[table][id];
                    statements['map'].run(
                        row.zoom_level, row.tile_column, row.tile_row,
                        row.tile_id, row.zoom_level, row.tile_column, row.tile_row,
                        row.grid_id, row.zoom_level, row.tile_column, row.tile_row);
                }
                statements['map'].finalize();
                break;
            default:
                var rows = [];
                var args = [];
                var fields = [];
                for (var id in writes[table]) {
                    var record = writes[table][id];
                    var row = [];
                    for (var field in record) {
                        row.push(record[field]);
                        if (fields.indexOf(field) === -1) {
                            fields.push(field);
                            args.push('?');
                        }
                    }
                    rows.push(row);
                }
                var sql = 'REPLACE INTO ' + table + ' ( ' + fields.join(',') + ' ) VALUES(' + args.join(',') + ')';
                statements[table] = mbtiles._db.prepare(sql);
                while (rows.length) statements[table].run.apply(statements[table], rows.shift());
                statements[table].finalize();
                break;
            }
        });
        mbtiles._db.run('COMMIT', function(err) {
            mbtiles._committing = false;
            mbtiles.emit('commit');
            callback(err);
        });
    });
};

// Leaves write mode.
//
// - @param {Function(err)} callback
MBTiles.prototype.stopWriting = function(callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));

    var mbtiles = this;
    mbtiles._commit(function(err) {
        if (err) return callback(err);
        mbtiles._db.run('PRAGMA synchronous=NORMAL', function(err) {
            if (err) return callback(err);
            mbtiles._isWritable = false;
            return callback();
        });
    });
};

// Inserts a tile into the MBTiles store. Scheme is XYZ.
//
// - @param {Number} z tile z coordinate
// - @param {Number} x tile x coordinate
// - @param {Number} y tile y coordinate
// - @param {Buffer} buffer tile image data
// - @param {Function(err)} callback
MBTiles.prototype.putTile = function(z, x, y, data, callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));
    if (!this._isWritable) return callback(new Error('MBTiles not in write mode'));
    if (!Buffer.isBuffer(data)) return callback(new Error('Image needs to be a Buffer'));

    // Flip Y coordinate because MBTiles files are TMS.
    y = (1 << z) - 1 - y;

    // Tilelive may pass us a data.key. If not, generate an md5
    // from the image buffer data.
    var id = data.key
        ? String(data.key)
        : crypto.createHash('md5').update(data).digest('hex');

    // Queue writes for images, map table.
    var coords = hash(z, x, y);
    this.write('images', id, {
        tile_id: id,
        tile_data: data
    });
    this.write('map', coords, {
        zoom_level: z,
        tile_column: x,
        tile_row: y,
        tile_id: id
    }, callback);
};

// Inserts a grid into the MBTiles store. Scheme is XYZ.
//
// - @param {Number} z grid z coordinate
// - @param {Number} x grid x coordinate
// - @param {Number} y grid y coordinate
// - @param {Object} data grid object
// - @param {Function(err)} callback
MBTiles.prototype.putGrid = function(z, x, y, data, callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));
    if (!this._isWritable) return callback(new Error('MBTiles not in write mode'));

    // Flip Y coordinate because MBTiles files are TMS.
    y = (1 << z) - 1 - y;

    // Preprocess grid data.
    var json = JSON.stringify({ grid: data.grid, keys: data.keys });

    // Tilelive may pass us a data.key. If not, generate an md5
    // from the grid data.
    var id = data.key
        ? String(data.key)
        : crypto.createHash('md5').update(json).digest('hex');

    var coords = hash(z, x, y);
    var mbtiles = this;

    this.write('map', coords, {
        zoom_level: z,
        tile_column: x,
        tile_row: y,
        grid_id: id
    });
    zlib.deflate(new Buffer(json, 'utf8'), function(err, buffer) {
        if (err) return callback(err);
        Object.keys(data.data || {}).forEach(function(key) {
            mbtiles.write('grid_key', id + '_' + key, {
                grid_id: id,
                key_name: key
            });
            mbtiles.write('keymap', key, {
                key_name: key,
                key_json: JSON.stringify(data.data[key])
            });
        });
        mbtiles.write('grid_utfgrid', id, {
            grid_id: id,
            grid_utfgrid: buffer
        }, callback);
    });
};

MBTiles.prototype.putInfo = function(data, callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));
    if (!this._isWritable) return callback(new Error('MBTiles not in write mode'));

    var jsondata;
    var stmt = this._db.prepare('REPLACE INTO metadata (name, value) VALUES (?, ?)');
    stmt.on('error', callback);
    for (var key in data) {
        // If a data property is a javascript hash/object, slip it into
        // the 'json' field which contains stringified JSON to be merged
        // in at read time. Allows nested/deep metadata to be recorded.
        var nested = typeof data[key] === 'object' &&
            key !== 'bounds' &&
            key !== 'center';
        if (nested) {
            jsondata = jsondata || {};
            jsondata[key] = data[key];
        } else {
            stmt.run(key, String(data[key]));
        }
    }
    if (jsondata) stmt.run('json', JSON.stringify(jsondata));

    // Ensure scheme in metadata table always be 'tms'
    stmt.run('scheme', 'tms');

    var mbtiles = this;
    stmt.finalize(function(err) {
        if (err) return callback(err);
        delete mbtiles._info;
        mbtiles.getInfo(function(err, info) {
            return callback(err, null);
        });
    });
};

// Implements carmen#getGeocoderData method.
MBTiles.prototype.getGeocoderData = function(type, shard, callback) {
    return this._db.get('SELECT data FROM geocoder_data WHERE type = ? AND shard = ?', type, shard, function(err, row) {
        if (err && err.code === 'SQLITE_ERROR' && err.errno === 1) return callback();
        if (err) return callback(err);
        if (!row) return callback();
        zlib.inflate(row.data, callback);
    });
};

// Implements carmen#putGeocoderData method.
MBTiles.prototype.putGeocoderData = function(type, shard, data, callback) {
    var source = this;
    zlib.deflate(data, function(err, zdata) {
        if (err) return callback(err);
        source.write('geocoder_data', type + '.' + shard, { type:type, shard: shard, data: zdata }, callback);
    });
};

// Implements carmen#geocoderDataIterator method.
MBTiles.prototype.geocoderDataIterator = function(type) {
    var chunkSize = 100;
    var position = 0;
    var getNextIfBelow = 0.2 * chunkSize;
    var nextQueue = [];
    var dataQueue = [];
    var doneSentinel = {};
    var _this = this;

    var zlibQueue = queue(1);
    var inflate = function(data, callback) {
        zlibQueue.defer(function(cb) {
            zlib.inflate(data, function(err, buf) {
                callback(err, buf);
                cb();
            });
        });
    }

    var sending = false;
    var sendIfAvailable = function() {
        if (sending) return;
        sending = true;

        while (nextQueue.length && dataQueue.length) {
            var nextCb = nextQueue.shift(), data;
            if (dataQueue[0] == doneSentinel) {
                (function(nextCb) {
                    setImmediate(function() {
                        nextCb(null, {value: undefined, done: true});
                    });
                })(nextCb);
            } else {
                data = dataQueue.shift();
                maybeRefillBuffer();

                (function(nextCb, cbValue) {
                    inflate(data.row.data, function(err, buf) {
                        nextCb(
                            data.err,
                            {value: {shard: data.row.shard, data: buf}, done: false}
                        );
                    })
                })(nextCb, data);
            }
        }

        sending = false;
    }

    var refilling = false;
    var refillBuffer = function() {
        refilling = true;
        var segmentCount = 0;
        _this._db.each('SELECT shard, data FROM geocoder_data WHERE type = ? ORDER BY shard limit ?,?', type, position, chunkSize, function(err, row) {
            dataQueue.push({row: row, err: err});
            segmentCount += 1;
            sendIfAvailable();
        }, function() {
            refilling = false;
            if (segmentCount) {
                maybeRefillBuffer();
            } else {
                // we didn't get anything this time, so we're done
                dataQueue.push(doneSentinel);
                sendIfAvailable();
            }
        });
        position += chunkSize;
    }

    var maybeRefillBuffer = function() {
        if (dataQueue.length <= getNextIfBelow && !refilling && dataQueue[dataQueue.length - 1] != doneSentinel) {
            refillBuffer();
        }
    }

    refillBuffer();

    return {asyncNext: function(callback) {
        nextQueue.push(callback);
        sendIfAvailable();
    }}
}

// Implements carmen#getIndexableDocs method.
MBTiles.prototype.getIndexableDocs = function(pointer, callback) {
    pointer = pointer || {};
    pointer.limit = pointer.limit || 10000;
    pointer.offset = pointer.offset || 0;
    pointer.nogrids = 'nogrids' in pointer ? pointer.nogrids : false;

    // If 'carmen' option is passed in initial pointer, retrieve indexables from
    // carmen table. This option can be used to access the previously indexed
    // documents from an MBTiles database without having to know what search
    // field was used in the past (see comment below).
    if (pointer.table === 'carmen') {
        return this._db.all('SELECT c.id AS id, c.text AS text, c.zxy, k.key_json FROM carmen c JOIN keymap k ON c.id = k.key_name LIMIT ? OFFSET ?', pointer.limit, pointer.offset, function(err, rows) {
            if (err) return callback(err);
            this.geocoderMigrateDocs(rows, function(err, docs) {
                if (err) return callback(err);
                pointer.offset += pointer.limit;
                return callback(null, docs, pointer);
            });
        }.bind(this));
    }

    // By default the keymap table contains all indexable documents.
    this.getInfo(function(err, info) {
        if (err) return callback(err);
        var sql, args;
        if (pointer.nogrids) {
            sql = "SELECT key_name, key_json FROM keymap LIMIT ? OFFSET ?;";
            args = [pointer.limit, pointer.offset];
        } else {
            sql = "SELECT k.key_name AS id, k.key_json, GROUP_CONCAT(zoom_level||'/'||tile_column ||'/'||tile_row,',') AS zxy FROM keymap k JOIN grid_key g ON k.key_name = g.key_name JOIN map m ON g.grid_id = m.grid_id WHERE m.zoom_level=? GROUP BY k.key_name LIMIT ? OFFSET ?;";
            args = [info.maxzoom, pointer.limit, pointer.offset];
        }
        this._db.all(sql, args, function(err, rows) {
            if (err) return callback(err);
            this.geocoderMigrateDocs(rows, function(err, docs) {
                if (err) return callback(err);
                pointer.offset += pointer.limit;
                return callback(null, docs, pointer);
            });
        }.bind(this));
    }.bind(this));
};

MBTiles.prototype.geocoderMigrateDocs = function(rows, callback) {
    // Store docs state on callback.
    callback.docs = callback.docs || [];
    var docs = callback.docs;
    var source = this;

    // Done.
    if (!rows.length) return callback(null, docs);

    // Converts MBTiles native TMS coords to ZXY.
    function tms2zxy(zxys) {
        return zxys.split(',').map(function(tms) {
            var zxy = tms.split('/').map(function(v) { return parseInt(v, 10); });
            zxy[2] = (1 << zxy[0]) - 1 - zxy[2];
            return zxy.join('/');
        });
    }

    var row = rows.shift();
    var doc = JSON.parse(row.key_json);
    var text = row.text || doc.search || doc.name || '';
    if ('zxy' in row && text) {
        doc._id = parseInt(row.id,10).toString() === row.id ?
            parseInt(row.id,10) :
            parseInt(crypto.createHash('md5').update(row.id).digest('hex').substr(0,8), 16);
        doc._text = text;
        doc._zxy = row.zxy ? tms2zxy(row.zxy) : [];
        if (doc.score) doc._score = parseFloat(doc.score);
        if (doc.bounds) doc._bbox = doc.bounds.split(',').map(function(v) { return parseFloat(v) });
        delete doc.score;
        delete doc.bounds;
        if ('lon' in doc && 'lat' in doc) {
            doc._center = [ doc.lon, doc.lat ];
            delete doc.lon;
            delete doc.lat;
            docs.push(doc);
            source.geocoderMigrateDocs(rows, callback);
        } else {
            source.geocoderCentroid(row.id, doc._zxy, function(err, center) {
                if (err) return callback(err);
                doc._center = center;
                docs.push(doc);
                source.geocoderMigrateDocs(rows, callback);
            });
        }
    } else {
        source.geocoderMigrateDocs(rows, callback);
    }
};

// Get the [lon,lat] of a feature given an array of xyz tiles.
// Looks up a point in the feature geometry using a point from a central grid.
MBTiles.prototype.geocoderCentroid = function(id, zxy, callback) {
    var coords = [];
    for (var i = 0; i < zxy.length; i++) {
        var parts = zxy[i].split('/');
        parts[0] = parts[0] | 0;
        parts[1] = parts[1] | 0;
        parts[2] = parts[2] | 0;
        coords.push(parts);
    }
    coords.sort(function(a, b) {
        if (a[1] < b[1]) return -1;
        if (a[1] > b[1]) return 1;
        if (a[2] < b[2]) return -1;
        if (a[2] > b[2]) return 1;
        return -1;
    });
    var mid = coords[Math.floor(coords.length * 0.5)];
    this.getGrid(mid[0],mid[1],mid[2],function(err, grid) {
        if (err) return callback(err);
        if (!grid) return callback(new Error('Grid does not exist'));

        // Convert id local index in utfgrid to charactercode.
        var key = grid.keys.indexOf(id)
        key += 32;
        if (key >= 34) key++;
        if (key >= 92) key++;
        var chr = String.fromCharCode(key);

        var xy = [];
        for (var y = 0; y < grid.grid.length; y++) {
            if (grid.grid[y].indexOf(chr) === -1) continue;
            for (var x = 0; x < 64; x++) {
                if (grid.grid[y][x] === chr) xy.push([x,y]);
            }
        }
        xy.sort(function(a, b) {
            if (a[0] < b[0]) return -1;
            if (a[0] > b[0]) return 1;
            if (a[1] < b[1]) return -1;
            if (a[1] > b[1]) return 1;
            return -1;
        });
        var cxy = xy[Math.floor(xy.length * 0.5)];
        callback(null, sm.ll([
            (256*mid[1]) + (cxy[0]*4),
            (256*mid[2]) + (cxy[1]*4)
        ], mid[0]));
    });
};

MBTiles.prototype.createZXYStream = function(options) {
    return new ZXYStream(this, options);
};
