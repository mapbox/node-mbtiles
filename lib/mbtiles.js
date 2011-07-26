var _ = require('underscore'),
    fs = require('fs'),
    Step = require('step'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    path = require('path'),
    url = require('url'),
    Buffer = require('buffer').Buffer,
    sm = new (require('sphericalmercator')),
    sqlite3 = require('sqlite3');

if (process.env.NODE_ENV === 'test') sqlite3.verbose();

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
MBTiles.utils = require('./utils');

var cache = {};

// Provides access to an mbtiles database file.
// - uri: A parsed URL hash, the only relevant part is `pathname`.
// - callback: Will be called when the resources have been acquired
//       or acquisition failed.
require('util').inherits(MBTiles, require('events').EventEmitter)
function MBTiles(uri, callback) {
    if (typeof uri === 'string') uri = url.parse(uri);

    if (!uri.pathname) {
        callback(new Error('Invalid URI ' + url.format(uri)));
        return;
    }

    if (uri.hostname === '.' || uri.hostname == '..') {
        uri.pathname = uri.hostname + uri.pathname;
        delete uri.hostname;
        delete uri.host;
    }

    if (!cache[uri.pathname]) {
        cache[uri.pathname] = this;
        this._open(uri);
    }

    var mbtiles = cache[uri.pathname];
    if (!mbtiles.open) {
        mbtiles.once('open', callback);
    } else {
        callback(null, mbtiles);
    }
    return undefined;
}

MBTiles.prototype._open = function(uri) {
    var mbtiles = this;
    function error(err) {
        process.nextTick(function() {
            mbtiles.emit('open', err);
        });
    }

    this.filename = uri.pathname;
    Step(function() {
        mbtiles._db = new sqlite3.Database(mbtiles.filename, this);
    }, function(err) {
        if (err) return error(err);
        mbtiles._setup(this);
    }, function(err) {
        if (err) return error(err);
        fs.stat(mbtiles.filename, this);
    }, function(err, stat) {
        if (err) return error(err);
        mbtiles._stat = stat;
        fs.watchFile(mbtiles.filename, { interval: 1000 }, function(cur, prev) {
            if (cur.mtime != prev.mtime) {
                fs.unwatchFile(mbtiles.filename);
                delete cache[uri.pathname];
            }
        });
        mbtiles.open = true;
        mbtiles.emit('open', null, mbtiles);
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

    if (this._schema) {
        return callback(null, _(this._schema).include(table));
    } else {
        this._schema = [];
        this._db.all(
            'SELECT name FROM sqlite_master WHERE type IN (?, ?)',
            'table',
            'view',
            function(err, rows) {
                if (err) return callback(err);
                this._schema = _(rows).pluck('name');
                this._exists(table, callback);
            }.bind(this)
        );
    }
};

MBTiles.prototype._close = function() {
    fs.unwatchFile(this.filename);
};

// DB integrity check.
//
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
    var mbtiles = this;
    mbtiles._exists('tiles', function(err, exists) {
        if (exists) return callback(null);
        fs.readFile(__dirname + '/schema.sql', 'utf8', function(err, sql) {
            if (err) return callback(err);
            mbtiles._db.exec(sql, callback);
        });
    });
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

    var mbtiles = this;
    this._db.get('SELECT tile_data FROM tiles WHERE ' +
        'zoom_level = ? AND tile_column = ? AND tile_row = ?',
        z, x, y,
        function(err, row) {
            if (!row || (err && err.errno == 1)) {
                return callback(new Error('Tile does not exist'));
            } else if (err) {
                return callback(err);
            } else {
                var options = {
                    'Content-Type': MBTiles.utils.getMimeType(row.tile_data),
                    'Last-Modified': mbtiles._stat.mtime,
                    'ETag': mbtiles._stat.size + '-' + Number(mbtiles._stat.mtime)
                };
                return callback(null, row.tile_data, options);
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

    var that = this;
    Step(
        function() {
            that._db.get('SELECT grid FROM grids WHERE ' +
                'zoom_level = ? AND tile_column = ? AND tile_row = ?',
                z, x, y,
                this.parallel()
            );
            that._db.all('SELECT key_name, key_json FROM grid_data WHERE ' +
                'zoom_level = ? AND tile_column = ? AND tile_row = ?',
                z, x, y,
                this.parallel()
            );
        },
        function(err, row, rows) {
            if ((!row || !row.grid) || (err && err.errno == 1)) {
                return callback(new Error('Grid does not exist'));
            }
            if (err) return callback(err);

            try {
                var grid = zlib.inflate(
                           !Buffer.isBuffer(row.grid)
                           ? new Buffer(row.grid, 'binary')
                           : row.grid
                       ).toString();
                var data = rows.reduce(function(memo, r) {
                        memo[r.key_name] = JSON.parse(r.key_json);
                        return memo;
                    }, {});
                var result = _(JSON.parse(grid)).extend({ data: data });
            } catch (err) {
                return callback(new Error('Grid is invalid'));
            }

            callback(null, result);
        }
    );
};

// Select a metadata value from the database.
//
// - @param {Function} callback
MBTiles.prototype._metadata = function(key, callback) {
    if (typeof callback !== 'function') callback = noop;

    this._db.get('SELECT value FROM metadata WHERE name = ?',
        key,
        function(err, row) {
            if (!row || (err && err.errno == 1)) return callback(new Error('Key does not exist'));
            else if (err) return callback(err);
            else return callback(null, row.value);
        });
};

// Obtain metadata from the database. Performing fallback queries if certain
// keys(like `bounds`, `minzoom`, `maxzoom`) have not been provided.
//
// - @param {Function(err, data)} callback
MBTiles.prototype.getInfo = function(callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));

    var that = this;
    var info = {};
    info.filesize = this._stat.size;
    info.scheme = 'tms';
    info.basename = path.basename(that.filename);
    info.id = path.basename(that.filename, path.extname(that.filename));
    Step(function() {
        var end = this;
        that._db.all('SELECT name, value FROM metadata', function(err, rows) {
            if (rows) for (var i = 0; i < rows.length; i++) {
                info[rows[i].name] = rows[i].value;
            }
            end(err);
        });
    },
    // Determine min/max zoom if needed
    function(err) {
        if (err && err.errno !== 1) return callback(err);
        if (info.maxzoom !== undefined
            && info.minzoom !== undefined) return this();

        var step = this;
        var zoomquery = that._db.prepare('SELECT zoom_level FROM tiles ' +
                                        'WHERE zoom_level = ? LIMIT 1', function(err) {
            if (err) {
                if (err.errno === 1) step();
                else throw new Error(err);
            } else {
                var group = step.group();
                for (var i = 0; i < 30; i++) {
                    zoomquery.get(i, group());
                }
                zoomquery.finalize();
            }
        });
    },
    function(err, rows) {
        if (err) return callback(err);
        if (rows) {
            var zooms = _(rows).chain()
                .reject(_.isUndefined)
                .pluck('zoom_level')
                .value();
            info.minzoom = zooms.shift();
            info.maxzoom = zooms.length ? zooms.pop() : info.minzoom;
        }
        this();
    },
    // Determine bounds if needed
    function(err) {
        if (err) return callback(err);
        if (info.bounds) return this();
        if (typeof info.minzoom === 'undefined') return this();

        var next = this;
        Step(
            function() {
                that._db.get(
                    'SELECT MAX(tile_column) AS maxx, ' +
                    'MIN(tile_column) AS minx, MAX(tile_row) AS maxy, ' +
                    'MIN(tile_row) AS miny FROM tiles ' +
                    'WHERE zoom_level = ?',
                    info.minzoom,
                    this
                );
            },
            function(err, row) {
                if (!err && row) {
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
                    ].join(',');
                }
                next();
            }
        );
    },
    // Return info
    function(err) {
        if (err) return callback(err);
        var range = parseInt(info.maxzoom, 10) - parseInt(info.minzoom, 10);
        info.minzoom = parseInt(info.minzoom, 10);
        if (isNaN(info.minzoom) || typeof info.minzoom !== 'number') delete info.minzoom;
        info.maxzoom = parseInt(info.maxzoom, 10);
        if (isNaN(info.maxzoom) || typeof info.maxzoom !== 'number') delete info.maxzoom;

        info.bounds = _((info.bounds || '').split(',')).map(parseFloat);
        if (info.bounds.length !== 4 || info.bounds[0] === null) delete info.bounds;

        if (info.center) info.center = _((info.center).split(',')).map(parseFloat);
        if ((!info.center || info.center.length !== 3) && info.bounds) info.center = [
            (info.bounds[2] - info.bounds[0]) / 2 + info.bounds[0],
            (info.bounds[3] - info.bounds[1]) / 2 + info.bounds[1],
            (range <= 1) ? info.maxzoom : Math.floor(range * 0.5) + info.minzoom
        ];
        if (info.center && (info.center.length !== 3 || info.center[0] === null)) {
            delete info.center;
        }

        return callback(null, info);
    });
};

// Puts the MBTiles tilestore into write mode.
//
// - @param {Function(err)} callback
MBTiles.prototype.startWriting = function(callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));

    // Sets the synchronous flag to OFF for (much) faster inserts.
    // See http://www.sqlite3.org/pragma.html#pragma_synchronous

    var mbtiles = this;
    if (!this._isWritable) {
        this._isWritable = 1;
        this._clearCaches();
        this._db.run('PRAGMA synchronous=OFF', callback);
    } else {
        this._isWritable++;
        return callback(null);
    }
};

MBTiles.prototype._clearCaches = function() {
    this._pending = 0;
    this._tileCache = {};
    this._gridCache = {};
    this._keyCache = {};
    this._dataCache = {};
    this._mapCache = {};
};

// (private) Commits the cached changes to the database.
//
// - @param {Function(err)} callback
MBTiles.prototype._commit = function(callback) {
    var mbtiles = this;
    mbtiles._db.serialize(function() {
        mbtiles._db.run('BEGIN');

        if (Object.keys(mbtiles._tileCache)) {
            // Insert images table.
            var images = mbtiles._db.prepare('REPLACE INTO images (tile_id, tile_data) VALUES (?, ?)');
            for (var id in mbtiles._tileCache) {
                images.run(id, mbtiles._tileCache[id]);
            }
            images.finalize();
        }


        if (Object.keys(mbtiles._gridCache)) {
            // Insert grid_utfgrid table.
            var grids = mbtiles._db.prepare('REPLACE INTO grid_utfgrid (grid_id, grid_utfgrid) VALUES (?, ?)');
            for (var id in mbtiles._gridCache) {
                grids.run(id, mbtiles._gridCache[id]);
            }
            grids.finalize();
        }


        if (Object.keys(mbtiles._keyCache)) {
            // Insert grid_key.
            var keys = mbtiles._db.prepare('INSERT OR IGNORE INTO grid_key (grid_id, key_name) VALUES (?, ?)');
            for (var id in mbtiles._keyCache) {
                mbtiles._keyCache[id].forEach(function(key) {
                    keys.run(id, key);
                });
            }
            keys.finalize();
        }


        if (Object.keys(mbtiles._dataCache)) {
            // Insert keymap table.
            var keymap = mbtiles._db.prepare('REPLACE INTO keymap (key_name, key_json) VALUES (?, ?)');
            for (var key in mbtiles._dataCache) {
                keymap.run(key, JSON.stringify(mbtiles._dataCache[key]));
            }
            keymap.finalize();
        }

        // Insert map table. This has to be so complicate due to a design flaw
        // in the tables.
        // TODO: This should be remedied when we upgrade the MBTiles schema.
        var mapBoth = mbtiles._db.prepare('REPLACE INTO map (zoom_level, ' +
            'tile_column, tile_row, tile_id, grid_id) VALUES (?, ?, ?, ?, ?)');
        var mapTile = mbtiles._db.prepare('REPLACE INTO map (zoom_level, ' +
            'tile_column, tile_row, tile_id, grid_id) VALUES (?, ?, ?, ?, ' +
            '(SELECT grid_id FROM map WHERE zoom_level = ? ' +
            'AND tile_column = ? AND tile_row = ?))');
        var mapGrid = mbtiles._db.prepare('REPLACE INTO map (zoom_level, ' +
            'tile_column, tile_row, tile_id, grid_id) VALUES (?, ?, ?, ' +
            '(SELECT tile_id FROM map WHERE zoom_level = ? ' +
            'AND tile_column = ? AND tile_row = ?), ?)');
        for (var coords in mbtiles._mapCache) {
            var map = mbtiles._mapCache[coords];

            if (typeof map.grid_id === 'undefined') {
                // Only the tile_id is defined.
                mapTile.run(map.z, map.x, map.y, map.tile_id, map.z, map.x, map.y);
            } else if (typeof map.tile_id === 'undefined') {
                // Only the grid_id is defined.
                mapGrid.run(map.z, map.x, map.y, map.z, map.x, map.y, map.grid_id);
            } else {
                // Both tile_id and grid_id are defined.
                mapBoth.run(map.z, map.x, map.y, map.tile_id, map.grid_id);
            }
        }
        mapBoth.finalize();
        mapTile.finalize();
        mapGrid.finalize();

        mbtiles._db.run('COMMIT', callback);
        mbtiles._clearCaches();
    });
};

// Leaves write mode.
//
// - @param {Function(err)} callback
MBTiles.prototype.stopWriting = function(callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));

    var mbtiles = this;
    if (this._isWritable) this._isWritable--;
    this._commit(function(err) {
        if (err) return callback(err);
        if (!mbtiles._isWritable) {
            mbtiles._db.run('PRAGMA synchronous=NORMAL', callback);
        } else {
            return callback(null);
        }
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

    var id = crypto.createHash('md5').update(data).digest('hex');
    if (!this._tileCache[id]) {
        // This corresponds to the images table.
        this._tileCache[id] = data;
    }

    // This corresponds to the map table.
    var coords = hash(z, x, y);
    if (!this._mapCache[coords]) this._mapCache[coords] = { z: z, x: x, y: y };
    this._mapCache[coords].tile_id = id;

    // Only commit when we can insert at least 100 rows.
    if (++this._pending >= 100) return this._commit(callback);
    else return callback(null);
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
    var id = crypto.createHash('md5').update(json).digest('hex');
    if (!this._gridCache[id]) {
        // This corresponds to the grid_utfgrid table.
        this._gridCache[id] = zlib.deflate(new Buffer(json, 'utf8'));

        // This corresponds to the grid_key table.
        this._keyCache[id] = Object.keys(data.data || {});

        // This corresponds to the keymap table.
        _(this._dataCache).extend(data.data || {});
    }

    // This corresponds to the map table.
    var coords = hash(z, x, y);
    if (!this._mapCache[coords]) this._mapCache[coords] = { z: z, x: x, y: y };
    this._mapCache[coords].grid_id = id;

    // Only commit when we can insert at least 100 rows.
    if (++this._pending >= 100) return this._commit(callback);
    else return callback(null);
};

MBTiles.prototype.putInfo = function(data, callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!this.open) return callback(new Error('MBTiles not yet loaded'));
    if (!this._isWritable) return callback(new Error('MBTiles not in write mode'));

    // Valid keys.
    var keys = [ 'name', 'type', 'description', 'version', 'formatter',
        'bounds', 'center', 'minzoom', 'maxzoom' ];

    var stmt = this._db.prepare('REPLACE INTO metadata (name, value) VALUES (?, ?)');
    stmt.on('error', callback);
    for (var key in data) {
        if (keys.indexOf(key) !== -1) stmt.run(key, String(data[key]));
    }
    stmt.finalize(callback);
};
