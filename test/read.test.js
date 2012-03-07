process.env.NODE_ENV = 'test';

var fs = require('fs');
var MBTiles = require('..');


var fixtures = {
    plain_1: __dirname + '/fixtures/plain_1.mbtiles',
    plain_2: __dirname + '/fixtures/plain_2.mbtiles',
    plain_3: __dirname + '/fixtures/plain_3.mbtiles',
    plain_4: __dirname + '/fixtures/plain_4.mbtiles',
    non_existent: __dirname + '/fixtures/non_existent.mbtiles',
    corrupt: __dirname + '/fixtures/corrupt.mbtiles'
};

try { fs.unlink(fixtures.non_existent); } catch (err) {}

function yieldsError(assert, status, error, msg) {
    return function(err) {
        assert.ok(err);
        var re = new RegExp( "^" + msg, "i");
        assert.ok(err.message.match(re));
        status[error]++;
    };
}


exports['get tiles'] = function(beforeExit, assert) {
    var status = {
        success: 0,
        error: 0
    };

    new MBTiles(fixtures.plain_1, function(err, mbtiles) {
        if (err) throw err;
        fs.readdirSync(__dirname + '/fixtures/images/').forEach(function(file) {
            var coords = file.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/);
            if (coords) {
                // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
                coords[2] = Math.pow(2, coords[3]) - 1 - coords[2];
                mbtiles.getTile(coords[3] | 0, coords[1] | 0, coords[2] | 0, function(err, tile, headers) {
                    if (err) throw err;
                    assert.deepEqual(tile, fs.readFileSync(__dirname + '/fixtures/images/' + file));
                    assert.equal(headers['Content-Type'], 'image/png');
                    assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
                    assert.ok(/\d+-\d+/.test(headers['ETag']));
                    status.success++;
                });
            }
        });

        mbtiles.getTile(0, 1, 0, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(-1, 0, 0, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(0, 0, 1, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(3, 1, -1, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(2, -3, 3, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(18, 2, 262140, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(4, 0, 15, yieldsError(assert, status, 'error', 'Tile does not exist'));
    });


    beforeExit(function() {
        assert.equal(status.success, 285);
        assert.equal(status.error, 7);
    });
};

exports['get grids'] = function(beforeExit, assert) {
    var status = {
        success: 0,
        error: 0
    };

    new MBTiles(fixtures.plain_2, function(err, mbtiles) {
        if (err) throw err;
        fs.readdirSync(__dirname + '/fixtures/grids/').forEach(function(file) {
            var coords = file.match(/^plain_2_(\d+)_(\d+)_(\d+).json$/);
            if (coords) {
                // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
                coords[2] = Math.pow(2, coords[3]) - 1 - coords[2];
                mbtiles.getGrid(coords[3] | 0, coords[1] | 0, coords[2] | 0, function(err, grid, headers) {
                    if (err) throw err;
                    assert.deepEqual(JSON.stringify(grid), fs.readFileSync(__dirname + '/fixtures/grids/' + file, 'utf8'));
                    assert.equal(headers['Content-Type'], 'text/javascript');
                    assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
                    assert.ok(/\d+-\d+/.test(headers['ETag']));
                    status.success++;
                });
            }
        });

        mbtiles.getGrid(0, 1, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(-1, 0, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(0, 0, 1, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(3, 1, -1, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(2, -3, 3, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(18, 2, 262140, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 0, 15, yieldsError(assert, status, 'error', 'Grid does not exist'));
    });


    beforeExit(function() {
        assert.equal(status.success, 241);
        assert.equal(status.error, 7);
    });
};


exports['get grids from file without interaction'] = function(beforeExit, assert) {
    var status = {
        success: 0,
        error: 0
    };

    new MBTiles(fixtures.plain_1, function(err, mbtiles) {
        if (err) throw err;
        mbtiles.getGrid(0, 1, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(-1, 0, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(0, 0, -1, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(3, 1, 8, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(2, -3, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(18, 2, 3, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 0, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 3, 8, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 4, 8, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 5, 8, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 13, 4, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 0, 14, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(3, 0, 7, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(3, 6, 2, yieldsError(assert, status, 'error', 'Grid does not exist'));
    });

    beforeExit(function() {
        assert.equal(status.success, 0);
        assert.equal(status.error, 14);
    });
};

exports['get grids with different schema'] = function(beforeExit, assert) {
    var status = {
        success: 0,
        error: 0
    };

    new MBTiles(fixtures.plain_4, function(err, mbtiles) {
        if (err) throw err;
        fs.readdirSync(__dirname + '/fixtures/grids/').forEach(function(file) {
            var coords = file.match(/^plain_2_(\d+)_(\d+)_(\d+).json$/);
            if (coords) {
                // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
                coords[2] = Math.pow(2, coords[3]) - 1 - coords[2];
                mbtiles.getGrid(coords[3] | 0, coords[1] | 0, coords[2] | 0, function(err, grid) {
                    if (err) throw err;
                    assert.deepEqual(JSON.stringify(grid), fs.readFileSync(__dirname + '/fixtures/grids/' + file, 'utf8'));
                    status.success++;
                });
            }
        });

        mbtiles.getGrid(0, 1, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(-1, 0, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(0, 0, 1, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(3, 1, -1, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(2, -3, 3, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(18, 2, 262140, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 0, 15, yieldsError(assert, status, 'error', 'Grid does not exist'));
    });

    beforeExit(function() {
        assert.equal(status.success, 241);
        assert.equal(status.error, 7);
    });
};


exports['get grids from file without interaction'] = function(beforeExit, assert) {
    var status = {
        success: 0,
        error: 0
    };

    new MBTiles(fixtures.plain_1, function(err, mbtiles) {
        if (err) throw err;
        mbtiles.getGrid(0, 1, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(-1, 0, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(0, 0, -1, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(3, 1, 8, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(2, -3, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(18, 2, 3, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 0, 0, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 3, 8, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 4, 8, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 5, 8, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 13, 4, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(4, 0, 14, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(3, 0, 7, yieldsError(assert, status, 'error', 'Grid does not exist'));
        mbtiles.getGrid(3, 6, 2, yieldsError(assert, status, 'error', 'Grid does not exist'));
    });

    beforeExit(function() {
        assert.equal(status.success, 0);
        assert.equal(status.error, 14);
    });
};

exports['get tiles from non-existent file'] = function(beforeExit, assert) {
    var status = {
        success: 0,
        error: 0
    };

    new MBTiles(fixtures.non_existent, function(err, mbtiles) {
        if (err) throw err;
        mbtiles.getTile(0, 1, 0, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(-1, 0, 0, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(0, 0, -1, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(3, 1, 8, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(2, -3, 0, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(18, 2, 3, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(4, 0, 0, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(4, 3, 8, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(4, 4, 8, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(4, 5, 8, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(4, 13, 4, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(4, 0, 14, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(3, 0, 7, yieldsError(assert, status, 'error', 'Tile does not exist'));
        mbtiles.getTile(3, 6, 2, yieldsError(assert, status, 'error', 'Tile does not exist'));
    });

    beforeExit(function() {
        assert.equal(status.success, 0);
        assert.equal(status.error, 14);
    });
};

exports['get tiles from corrupt file'] = function(beforeExit, assert) {
    var status = {
        success: 0,
        error: 0
    };
    var error;
    new MBTiles(fixtures.corrupt, function(err, mbtiles) {
        error = err;
    });

    beforeExit(function() {
        assert.throws(
            function() {
                throw err;
            },
            Error
        );
    });
};


