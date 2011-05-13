var fs = require('fs');
var assert = require('assert');
var MBTiles = require('..').MBTiles;

var fixtureDir = __dirname + '/fixtures/output';

// Recreate output directory to remove previous tests.
try { fs.rmdirSync(fixtureDir); } catch(err) {}
fs.mkdirSync(fixtureDir, 0755);

exports['test mbtiles file creation'] = function(beforeExit) {
    var mbtiles = new MBTiles(fixtureDir + '/test_1.mbtiles');

    mbtiles.setup();
};
