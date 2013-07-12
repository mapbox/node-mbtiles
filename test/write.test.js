require('sqlite3').verbose();

var fs = require('fs');
var assert = require('assert');
var MBTiles = require('..');
var fixtureDir = __dirname + '/fixtures/output';

describe('write', function() {
    before(function(done) {
        // Recreate output directory to remove previous tests.
        try { fs.unlinkSync(fixtureDir + '/write_1.mbtiles'); } catch(err) {}
        try { fs.mkdirSync(fixtureDir, 0755); } catch(err) {}
        done();
    });
    it('test mbtiles file creation', function(done) {
        this.timeout(20e3);

        var completed = { written: 0, read: 0 };
        new MBTiles(fixtureDir + '/write_1.mbtiles', function(err, mbtiles) {
            completed.open = true;
            if (err) throw err;

            mbtiles.startWriting(function(err) {
                completed.started = true;
                if (err) throw err;

                fs.readdirSync(__dirname + '/fixtures/images/').forEach(insertTile);
            });

            function insertTile(file) {
                var coords = file.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/);
                if (!coords) return;

                // Flip Y coordinate because file names are TMS, but .putTile() expects XYZ.
                coords[2] = Math.pow(2, coords[3]) - 1 - coords[2];

                var tile = fs.readFileSync(__dirname + '/fixtures/images/' + file);
                mbtiles.putTile(coords[3] | 0, coords[1] | 0, coords[2] | 0, tile, function(err) {
                    if (err) throw err;
                    completed.written++;
                    if (completed.written === 285) {
                        mbtiles.stopWriting(function(err) {
                            completed.stopped = true;
                            if (err) throw err;
                            verifyWritten();
                        });
                    }
                });
            }

            function verifyWritten() {
                fs.readdirSync(__dirname + '/fixtures/images/').forEach(function(file) {
                    var coords = file.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/);
                    if (coords) {
                        // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
                        coords[2] = Math.pow(2, coords[3]) - 1 - coords[2];
                        mbtiles.getTile(coords[3] | 0, coords[1] | 0, coords[2] | 0, function(err, tile) {
                            if (err) throw err;
                            assert.deepEqual(tile, fs.readFileSync(__dirname + '/fixtures/images/' + file));
                            completed.read++;
                            if (completed.read === 285) done();
                        });
                    }
                });
            }
        });
    });
});
