process.env.NODE_ENV = 'test';

var fs = require('fs');
var assert = require('assert');
var MBTiles = require('..');

var fixtureDir = __dirname + '/fixtures/output';

// Recreate output directory to remove previous tests.
try { fs.unlinkSync(fixtureDir + '/write_2.mbtiles'); } catch(err) {}
try { fs.mkdirSync(fixtureDir, 0755); } catch(err) {}

exports['test mbtiles file creation'] = function(beforeExit) {
    var completed = { written: 0, read: 0 };
    new MBTiles(fixtureDir + '/write_2.mbtiles', function(err, mbtiles) {
        completed.open = true;
        if (err) throw err;

        mbtiles.startWriting(function(err) {
            completed.started = true;
            if (err) throw err;

            fs.readdirSync(__dirname + '/fixtures/grids/').forEach(insertGrid);
        });

        function insertGrid(file) {
            var coords = file.match(/^plain_2_(\d+)_(\d+)_(\d+).json$/);
            if (!coords) return;

            // Flip Y coordinate because file names are TMS, but .putGrid() expects XYZ.
            coords[2] = Math.pow(2, coords[3]) - 1 - coords[2];

            fs.readFile(__dirname + '/fixtures/grids/' + file, 'utf8', function(err, grid) {
                if (err) throw err;

                mbtiles.putGrid(coords[3] | 0, coords[1] | 0, coords[2] | 0, JSON.parse(grid), function(err) {
                    if (err) throw err;
                    completed.written++;
                    if (completed.written === 241) {
                        mbtiles.stopWriting(function(err) {
                            completed.stopped = true;
                            if (err) throw err;
                            verifyWritten();
                        });
                    }
                });
            });
        }

        function verifyWritten() {
            fs.readdirSync(__dirname + '/fixtures/grids/').forEach(function(file) {
                var coords = file.match(/^plain_2_(\d+)_(\d+)_(\d+).json$/);
                if (coords) {
                    // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
                    coords[2] = Math.pow(2, coords[3]) - 1 - coords[2];
                    mbtiles.getGrid(coords[3] | 0, coords[1] | 0, coords[2] | 0, function(err, grid) {
                        if (err) throw err;
                        assert.deepEqual(JSON.stringify(grid), fs.readFileSync(__dirname + '/fixtures/grids/' + file, 'utf8'));
                        completed.read++;
                    });
                }
            });
        }
    });

    beforeExit(function() {
        assert.deepEqual({
            open: true,
            started: true,
            written: 241,
            read: 241,
            stopped: true
        }, completed);
    })
};
