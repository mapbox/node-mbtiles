var fs = require('fs');
var assert = require('assert');
var MBTiles = require('..');

var fixtures = {
    plain_1: __dirname + '/fixtures/plain_1.mbtiles',
    plain_2: __dirname + '/fixtures/plain_2.mbtiles',
    plain_3: __dirname + '/fixtures/plain_3.mbtiles',
    plain_4: __dirname + '/fixtures/plain_4.mbtiles'
};

exports['get metadata'] = function(beforeExit) {
    var completion = {};

    var mbtiles = new MBTiles(fixtures.plain_1);
    mbtiles.metadata('name', function(err, value) { if (err) throw err; completion.name = value; });
    mbtiles.metadata('type', function(err, value) { if (err) throw err; completion.type = value; });
    mbtiles.metadata('description', function(err, value) { if (err) throw err; completion.description = value; });
    mbtiles.metadata('version', function(err, value) { if (err) throw err; completion.version = value; });
    mbtiles.metadata('formatter', function(err, value) { if (err) throw err; completion.formatter = value; });
    mbtiles.metadata('bounds', function(err, value) { if (err) throw err; completion.bounds = value; });
    mbtiles.metadata('invalid', function(err, value) { completion.invalid = err.message; });

    beforeExit(function() {
        assert.deepEqual(completion, {
            name: 'plain_1',
            type: 'baselayer',
            description: 'demo description',
            version: '1.0.3',
            formatter: null,
            bounds: '-179.9999999749438,-69.99999999526695,179.9999999749438,84.99999999782301',
            invalid: 'Key does not exist'
        });
    });
};

function yieldsError(status, error, msg) {
    return function(err) {
        assert.ok(err);
        assert.equal(err.message, msg);
        status[error]++;
    };
}

exports['get tiles'] = function(beforeExit) {
    var status = {
        success: 0,
        error: 0
    };

    var mbtiles = new MBTiles(fixtures.plain_1);
    fs.readdirSync(__dirname + '/fixtures/images/').forEach(function(file) {
        var coords = file.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/);
        if (coords) {
            mbtiles.getTile(coords[1] | 0, coords[2] | 0, coords[3] | 0, function(err, tile) {
                if (err) throw err;
                assert.deepEqual(tile, fs.readFileSync(__dirname + '/fixtures/images/' + file));
                status.success++;
            });
        }
    });

    mbtiles.getTile(1, 0, 0, yieldsError(status, 'error', 'Tile does not exist'));
    mbtiles.getTile(0, 0, -1, yieldsError(status, 'error', 'Tile does not exist'));
    mbtiles.getTile(0, -1, 0, yieldsError(status, 'error', 'Tile does not exist'));
    mbtiles.getTile(1, 8, 3, yieldsError(status, 'error', 'Tile does not exist'));
    mbtiles.getTile(-3, 0, 2, yieldsError(status, 'error', 'Tile does not exist'));
    mbtiles.getTile(2, 3, 18, yieldsError(status, 'error', 'Tile does not exist'));
    mbtiles.getTile(0, 0, 4, yieldsError(status, 'error', 'Tile does not exist'));

    beforeExit(function() {
        assert.equal(status.success, 285);
        assert.equal(status.error, 7);
    });
};

exports['get grids'] = function(beforeExit) {
    var status = {
        success: 0,
        error: 0
    };

    var mbtiles = new MBTiles(fixtures.plain_2);
    fs.readdirSync(__dirname + '/fixtures/grids/').forEach(function(file) {
        var coords = file.match(/^plain_2_(\d+)_(\d+)_(\d+).json$/);
        if (coords) {
            mbtiles.getGrid(coords[1] | 0, coords[2] | 0, coords[3] | 0, function(err, grid) {
                if (err) throw err;
                assert.deepEqual(JSON.stringify(grid), fs.readFileSync(__dirname + '/fixtures/grids/' + file, 'utf8'));
                status.success++;
            });
        }
    });

    mbtiles.getGrid(1, 0, 0, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 0, -1, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, -1, 0, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(1, 8, 3, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(-3, 0, 2, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(2, 3, 18, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 0, 4, yieldsError(status, 'error', 'Grid does not exist'));

    mbtiles.getGrid(3, 8, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(4, 8, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(5, 8, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(13, 4, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(0, 14, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(0, 7, 3, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(6, 2, 3, yieldsError(status, 'error', 'Grid is invalid'));

    beforeExit(function() {
        assert.equal(status.success, 241);
        assert.equal(status.error, 14);
    });
};


exports['get grids from file without interaction'] = function(beforeExit) {
    var status = {
        success: 0,
        error: 0
    };

    var mbtiles = new MBTiles(fixtures.plain_1);
    mbtiles.getGrid(1, 0, 0, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 0, -1, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, -1, 0, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(1, 8, 3, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(-3, 0, 2, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(2, 3, 18, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 0, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(3, 8, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(4, 8, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(5, 8, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(13, 4, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 14, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 7, 3, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(6, 2, 3, yieldsError(status, 'error', 'Grid does not exist'));

    beforeExit(function() {
        assert.equal(status.success, 0);
        assert.equal(status.error, 14);
    });
};

exports['get grids with different schema'] = function(beforeExit) {
    var status = {
        success: 0,
        error: 0
    };

    var mbtiles = new MBTiles(fixtures.plain_4);
    fs.readdirSync(__dirname + '/fixtures/grids/').forEach(function(file) {
        var coords = file.match(/^plain_2_(\d+)_(\d+)_(\d+).json$/);
        if (coords) {
            mbtiles.getGrid(coords[1] | 0, coords[2] | 0, coords[3] | 0, function(err, grid) {
                if (err) throw err;
                assert.deepEqual(JSON.stringify(grid), fs.readFileSync(__dirname + '/fixtures/grids/' + file, 'utf8'));
                status.success++;
            });
        }
    });

    mbtiles.getGrid(1, 0, 0, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 0, -1, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, -1, 0, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(1, 8, 3, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(-3, 0, 2, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(2, 3, 18, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 0, 4, yieldsError(status, 'error', 'Grid does not exist'));

    mbtiles.getGrid(3, 8, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(4, 8, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(5, 8, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(13, 4, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(0, 14, 4, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(0, 7, 3, yieldsError(status, 'error', 'Grid is invalid'));
    mbtiles.getGrid(6, 2, 3, yieldsError(status, 'error', 'Grid is invalid'));

    beforeExit(function() {
        assert.equal(status.success, 241);
        assert.equal(status.error, 14);
    });
};


exports['get grids from file without interaction'] = function(beforeExit) {
    var status = {
        success: 0,
        error: 0
    };

    var mbtiles = new MBTiles(fixtures.plain_1);
    mbtiles.getGrid(1, 0, 0, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 0, -1, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, -1, 0, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(1, 8, 3, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(-3, 0, 2, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(2, 3, 18, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 0, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(3, 8, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(4, 8, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(5, 8, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(13, 4, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 14, 4, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(0, 7, 3, yieldsError(status, 'error', 'Grid does not exist'));
    mbtiles.getGrid(6, 2, 3, yieldsError(status, 'error', 'Grid does not exist'));

    beforeExit(function() {
        assert.equal(status.success, 0);
        assert.equal(status.error, 14);
    });
};
