require('sqlite3').verbose();

var fs = require('fs');
var MBTiles = require('..');
var assert = require('assert');

var fixtures = {
    plain_1: __dirname + '/fixtures/plain_1.mbtiles',
    plain_2: __dirname + '/fixtures/plain_2.mbtiles',
    plain_3: __dirname + '/fixtures/plain_3.mbtiles',
    plain_4: __dirname + '/fixtures/plain_4.mbtiles',
    non_existent: __dirname + '/fixtures/non_existent.mbtiles',
    corrupt: __dirname + '/fixtures/corrupt.mbtiles'
};

function yieldsError(assert, error, msg, callback) {
    return function(err) {
        assert.ok(err);
        var re = new RegExp( "^" + msg, "i");
        assert.ok(err.message.match(re));
        if (callback) callback();
    };
}

describe('read', function() {
    var loaded = {};

    before(function(done) {
        try { fs.unlinkSync(fixtures.non_existent); } catch (err) {}
        done();
    });
    before(function(done) {
        var queue = Object.keys(fixtures);
        var load = function() {
            if (!queue.length) return done();
            var key = queue.shift();
            new MBTiles(fixtures[key], function(err, mbtiles) {
                if (err) throw err;
                loaded[key] = mbtiles;
                load();
            });
        };
        load();
    });

    fs.readdirSync(__dirname + '/fixtures/images/').forEach(function(file) {
        var coords = file.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/);
        if (!coords) return;

        // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
        coords = [ coords[3], coords[1], coords[2] ];
        coords[2] = Math.pow(2, coords[0]) - 1 - coords[2];
        it('tile ' + coords.join('/'), function(done) {
            loaded.plain_1.getTile(coords[0] | 0, coords[1] | 0, coords[2] | 0, function(err, tile, headers) {
                if (err) throw err;
                assert.deepEqual(tile, fs.readFileSync(__dirname + '/fixtures/images/' + file));
                assert.equal(headers['Content-Type'], 'image/png');
                assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
                assert.ok(/\d+-\d+/.test(headers['ETag']));
                done();
            });
        });
        it('grid ' + coords.join('/'), function(done) {
            loaded.plain_1.getGrid(coords[0] | 0, coords[1] | 0, coords[2] | 0, yieldsError(assert, 'error', 'Grid does not exist', done));
        });
    });
    [   [0,1,0],
        [-1,0,0],
        [0,0,1],
        [3,1,-1],
        [2,-3,3],
        [18,2,262140],
        [4,0,15]
    ].forEach(function(coords) {
        it('tile ' + coords.join('/'), function(done) {
            loaded.plain_1.getTile(coords[0], coords[1], coords[2], yieldsError(assert, 'error', 'Tile does not exist', done));
        });
    });

    fs.readdirSync(__dirname + '/fixtures/grids/').forEach(function(file) {
        var coords = file.match(/^plain_2_(\d+)_(\d+)_(\d+).json$/);
        if (!coords) return;

        // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
        coords = [ coords[3], coords[1], coords[2] ];
        coords[2] = Math.pow(2, coords[0]) - 1 - coords[2];
        it('grid ' + coords.join('/'), function(done) {
            loaded.plain_2.getGrid(coords[0] | 0, coords[1] | 0, coords[2] | 0, function(err, grid, headers) {
                if (err) throw err;
                assert.deepEqual(JSON.stringify(grid), fs.readFileSync(__dirname + '/fixtures/grids/' + file, 'utf8'));
                assert.equal(headers['Content-Type'], 'text/javascript');
                assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
                assert.ok(/\d+-\d+/.test(headers['ETag']));
                done();
            });
        });
        it('grid alt ' + coords.join('/'), function(done) {
            loaded.plain_4.getGrid(coords[0] | 0, coords[1] | 0, coords[2] | 0, function(err, grid, headers) {
                if (err) throw err;
                assert.deepEqual(JSON.stringify(grid), fs.readFileSync(__dirname + '/fixtures/grids/' + file, 'utf8'));
                assert.equal(headers['Content-Type'], 'text/javascript');
                assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
                assert.ok(/\d+-\d+/.test(headers['ETag']));
                done();
            });
        });
    });
    [   [0,1,0],
        [-1,0,0],
        [0,0,1],
        [3,1,-1],
        [2,-3,3],
        [18,2,262140],
        [4,0,15]
    ].forEach(function(coords) {
        it('grid ' + coords.join('/'), function(done) {
            loaded.plain_2.getGrid(coords[0], coords[1], coords[2], yieldsError(assert, 'error', 'Grid does not exist', done));
        });
        it('grid alt ' + coords.join('/'), function(done) {
            loaded.plain_4.getGrid(coords[0], coords[1], coords[2], yieldsError(assert, 'error', 'Grid does not exist', done));
        });
    });
    [   [0,1,0],
        [-1,0,0],
        [0,0,-1],
        [3,1,8],
        [2,-3,0],
        [18,2,3],
        [4,0,0],
        [4,3,8],
        [4,4,8],
        [4,5,8],
        [4,13,4],
        [4,0,14],
        [3,0,7],
        [3,6,2]
    ].forEach(function(coords) {
        it('dne ' + coords.join('/'), function(done) {
            loaded.non_existent.getTile(coords[0], coords[1], coords[2], yieldsError(assert, 'error', 'Tile does not exist', done));
        });
        it('corrupt ' + coords.join('/'), function(done) {
            loaded.corrupt.getTile(coords[0], coords[1], coords[2], yieldsError(assert, 'error', 'SQLITE_CORRUPT: database disk image is malformed', done));
        });
    });
});
