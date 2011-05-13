var _ = require('underscore'),
    fs = require('fs'),
    Step = require('step'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    sqlite3 = require('sqlite3');

// MBTiles
// -------
// MBTiles class for doing common operations (schema setup, tile reading,
// insertion, etc.)
function MBTiles(filename, callback) {
    this.filename = filename;
    this.db = new sqlite3.Database(filename, callback);
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
    if (!objects.length) return callback();
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
MBTiles.prototype.tile = function(x, y, z, callback) {
    this.db.get('SELECT tile_data FROM tiles WHERE ' +
        'zoom_level = ? AND tile_column = ? AND tile_row = ?',
        z, x, y,
        function(err, row) {
            if (err) callback(err);
            else if (!row || !row.tile_data) callback('Tile does not exist');
            else callback(null, row.tile_data);
        });
};

// Select a grid and its data from an mbtiles database.
//
// - @param {Number} x tile x coordinate
// - @param {Number} y tile y coordinate
// - @param {Number} z tile z coordinate
// - @param {Function} callback
MBTiles.prototype.grid = function(x, y, z, callback) {
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
            if (err) return callback(err);
            if (!row || !row.grid) return callback('Grid does not exist');

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
                callback('Grid is invalid');
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
            else if (!row) callback('Key does not exist');
            else callback(null, row.value);
        });
};

module.exports = MBTiles;
