var _ = require('underscore'),
    fs = require('fs'),
    Step = require('step'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    path = require('path'),
    sm = new (require('sphericalmercator')),
    sqlite3 = require('sqlite3');

// MBTiles
// -------
// MBTiles class for doing common operations (schema setup, tile reading,
// insertion, etc.)
module.exports = MBTiles;

// Provides access to an mbtiles database file.
// - uri: A parsed URL hash, the only relevant part is `pathname`.
// - callback: Will be called when the resources have been acquired
//       or acquisition failed.
function MBTiles(uri, callback) {
    this.filename = uri.pathname;
    this.db = new sqlite3.cached.Database(uri.pathname, function(err) {
        if (err) return callback(err);
        else callback(null, this);
    }.bind(this));
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
        callback(null, result);
    });
};

// Finds an mbtiles file with the given ID in the filepath and returns a
// tilesource URI.
MBTiles.findID = function(filepath, id, callback) {
    filepath = path.resolve(filepath);
    var file = path.join(filepath, id + '.mbtiles');
    fs.stat(file, function(err, stats) {
        if (err) callback(err);
        else callback(null, 'mbtiles://' + file);
    });
};

// Retrieve the schema of the current mbtiles database and inform the caller of
// whether the specified table exists.
MBTiles.prototype.exists = function(table, callback) {
    if (this.schema) {
        return callback(null, _(this.schema).include(table));
    } else {
        this.schema = [];
        this.db.all(
            'SELECT name FROM sqlite_master WHERE type IN (?, ?)',
            'table',
            'view',
            function(err, rows) {
                if (err) return callback(err);
                this.schema = _(rows).pluck('name');
                this.exists(table, callback);
            }.bind(this)
        );
    }
};

// DB integrity check.
MBTiles.prototype.integrity = function(callback) {
    this.db.get('PRAGMA quick_check(1)', function(err, row) {
        if (!(row && row.integrity_check && row.integrity_check === 'ok')) {
            callback(new Error('Corrupted database.'));
        } else {
            callback(null, true);
        }
    });
};

// Setup schema, indices, views for a new mbtiles database.
// Sets the synchronous flag to OFF for (much) faster inserts.
// See http://www.sqlite3.org/pragma.html#pragma_synchronous
MBTiles.prototype.setup = function(callback) {
    fs.readFile(__dirname + '/schema.sql', 'utf8', function(err, sql) {
        if (err) return callback(err);
        this.db.serialize(function() {
            this.db.run('PRAGMA synchronous = 0');
            this.db.exec(sql, callback);
        }.bind(this));
    }.bind(this));
};

// Generic object insert.
//
// - `table` String. The table to which objects should be inserted.
// - `objects` Array. Objects to be inserted, where each object attribute
//   has key/value pairs as a hash corresponding to column name and row value.
// - `callback` Function.
MBTiles.prototype.insert = function(table, objects, callback) {
    if (!objects.length) return callback(null);
    var keys = _(objects[0]).keys();
    var placeholders = [];
    _(keys).each(function(k) { placeholders.push('?'); });
    var stmt = this.db.prepare(
        'INSERT OR IGNORE INTO ' + table + ' ' +
        '(' + keys.join(',') + ') ' +
        'VALUES (' + placeholders.join(',') + ')'
    );
    for (var i = 0; i < objects.length; i++) {
        stmt.run.apply(stmt, _(objects[i]).values());
    }
    stmt.finalize(callback);
};

// Insert metadata into the mbtiles database.
//
// - @param {Object} metadata key, value hash of metadata to be inserted.
// - @param {Function} callback
MBTiles.prototype.insertMetadata = function(data, callback) {
    var metadata = _(data).map(function(value, key) {
        return { name: key, value: value};
    });
    this.insert('metadata', metadata, callback);
};

// Insert a set of tiles into an mbtiles database.
//
// - @param {Array} renders array of images to be inserted. Each item should
//   be an object of the form { z: z, x: x, y: y, data: [Image buffer] }.
// - @param {Function} callback
MBTiles.prototype.insertTiles = function(data, callback) {
    var that = this,
        map = [],
        images = [],
        ids = [];
    for (var i = 0; i < data.length; i++) {
        var tile_id = crypto
            .createHash('md5')
            .update(data[i].data)
            .digest('hex');
        !_(ids).include(tile_id) && ids.push(tile_id) && images.push({
            tile_id: tile_id,
            tile_data: data[i].data
        });
        map.push({
            tile_id: tile_id,
            zoom_level: data[i].z,
            tile_column: data[i].x,
            tile_row: data[i].y
        });
    }
    Step(
        function() {
            var group = this.group();
            that.insert('images', images, group());
            that.insert('map', map, group());
        },
        callback
    );
};

// Insert a set of grids into an mbtiles database.
//
// - @param {Array} renders array of grids to be inserted. Each item should
//   be an object of the form { z: z, x: x, y: y, data: [Image buffer], keys: [] }.
// - @param {Function} callback
MBTiles.prototype.insertGrids = function(data, callback) {
    var that = this,
        map = [],
        grids = [],
        grid_keys = [],
        features = {},
        ids = [];
    for (var i = 0; i < data.length; i++) {
        var json = JSON.stringify({
            grid: data[i].grid,
            keys: data[i].keys
        });
        var grid_id = crypto
            .createHash('md5')
            .update(json)
            .digest('hex');
        !_(ids).include(grid_id) && ids.push(grid_id) && grids.push({
            grid_id: grid_id,
            grid_utfgrid: zlib.deflate(new Buffer(json, 'utf8'))
        });
        data[i].keys.forEach(function(k) {
            grid_keys.push({
                grid_id: grid_id,
                key_name: k
            });
        });
        map.push({
            grid_id: grid_id,
            zoom_level: data[i].z,
            tile_column: data[i].x,
            tile_row: data[i].y
        });
        _(features).extend(data[i].data);
    }
    features = _(features).map(function(value, key) {
        return { key_name: key, key_json: JSON.stringify(value) };
    });
    Step(
        function() {
            var group = this.group();
            that.insert('grid_utfgrid', grids, group());
            that.insert('grid_key', grid_keys, group());
            that.insert('keymap', features, group());
            that.insertGridTiles(map, group());
        },
        callback
    );
};

// Insert grids into the mbtiles database.
//
// - @param {Object} tile tile object to be inserted.
// - @param {Function} callback
MBTiles.prototype.insertGridTiles = function(map, callback) {
    var stmt = this.db.prepare('UPDATE OR REPLACE map SET grid_id = ? WHERE ' +
        ' zoom_level = ? AND tile_column = ? AND tile_row = ?');

    for (var i = 0; i < map.length; i++) {
        stmt.run(
            map[i].grid_id,
            map[i].zoom_level,
            map[i].tile_column,
            map[i].tile_row
        );
    }

    stmt.finalize(callback);
};

// Select a tile from an mbtiles database.
//
// - @param {Number} x tile x coordinate.
// - @param {Number} y tile y coordinate.
// - @param {Number} z tile z coordinate.
// - @param {Function} callback
MBTiles.prototype.getTile = function(x, y, z, callback) {
    var mbtiles = this;
    this.db.get('SELECT tile_data FROM tiles WHERE ' +
        'zoom_level = ? AND tile_column = ? AND tile_row = ?',
        z, x, y,
        function(err, row) {
            if (err) callback(err);
            else if (!row || !row.tile_data) callback(new Error('Tile does not exist'));
            else callback(null, row.tile_data);
        });
};

// Select a grid and its data from an mbtiles database.
//
// - @param {Number} x tile x coordinate
// - @param {Number} y tile y coordinate
// - @param {Number} z tile z coordinate
// - @param {Function} callback
MBTiles.prototype.getGrid = function(x, y, z, callback) {
    var that = this;
    Step(
        function() {
            that.db.get('SELECT grid FROM grids WHERE ' +
                'zoom_level = ? AND tile_column = ? AND tile_row = ?',
                z, x, y,
                this.parallel()
            );
            that.db.all('SELECT key_name, key_json FROM grid_data WHERE ' +
                'zoom_level = ? AND tile_column = ? AND tile_row = ?',
                z, x, y,
                this.parallel()
            );
        },
        function(err, row, rows) {
            if ((!row || !row.grid) || (err && err.errno == 1)) return callback('Grid does not exist');
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
                callback(null, _(JSON.parse(grid)).extend({ data: data }));
            } catch (err) {
                callback(new Error('Grid is invalid'));
            }
        }
    );
};

// Select a metadata value from the database.
//
// - @param {Function} callback
MBTiles.prototype.metadata = function(key, callback) {
    this.db.get('SELECT value FROM metadata WHERE name = ?',
        key,
        function(err, row) {
            if (err) callback(err);
            else if (!row) callback(new Error('Key does not exist'));
            else callback(null, row.value);
        });
};

// Extend `MBTiles` class with an `info` method for retrieving metadata and
// performing fallback queries if certain keys (like `bounds`, `minzoom`,
// `maxzoom`) have not been provided.
MBTiles.prototype.getInfo = function(callback) {
    var that = this;
    var info = {};
    info.basename = path.basename(that.filename);
    info.id = info.basename.replace(path.extname(that.filename), '');
    Step(function() {
        var end = this;
        that.db.all('SELECT name, value FROM metadata', function(err, rows) {
            if (rows) for (var i = 0; i < rows.length; i++) {
                info[rows[i].name] = rows[i].value;
            }
            end(err);
        });
    },
    // Determine min/max zoom if needed
    function(err) {
        if (err) throw err;
        if (info.maxzoom !== undefined
            && info.minzoom !== undefined) return this();

        var group = this.group();

        var zoomquery = that.db.prepare('SELECT zoom_level FROM tiles ' +
                                        'WHERE zoom_level = ? LIMIT 1');
        for (var i = 0; i < 30; i++) {
            zoomquery.get(i, group());
        }
        zoomquery.finalize();
    },
    function(err, rows) {
        if (err) throw err;
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
        if (err) throw err;
        if (info.bounds) return this();
        if (typeof info.minzoom === 'undefined') return this();

        var next = this;
        Step(
            function() {
                that.db.get(
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
        info.maxzoom = parseInt(info.maxzoom, 10);
        info.bounds = _(info.bounds.split(',')).map(parseFloat);
        info.center = [
            (info.bounds[2] - info.bounds[0]) / 2 + info.bounds[0],
            (info.bounds[3] - info.bounds[1]) / 2 + info.bounds[1],
            (range <= 1) ? info.maxzoom : Math.floor(range * 0.5) + info.minzoom
        ];
        callback(null, info);
    });
};
