var fs = require('fs');
var assert = require('assert');
var MBTiles = require('..');

var fixtureDir = __dirname + '/fixtures/output';

// Recreate output directory to remove previous tests.
try { fs.unlinkSync(fixtureDir + '/test_1.mbtiles'); } catch(err) {}
try { fs.mkdirSync(fixtureDir, 0755); } catch(err) {}

exports['test mbtiles file creation'] = function(beforeExit) {
    var completed = {};
    new MBTiles(fixtureDir + '/test_1.mbtiles', function(err, mbtiles) {
        completed.open = true;
        if (err) throw err;
    });

    beforeExit(function() {
        assert.deepEqual({
            open: true
        }, completed);
    })
};
