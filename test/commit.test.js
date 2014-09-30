require('sqlite3').verbose();

var fs = require('fs');
var assert = require('assert');
var MBTiles = require('..');
var fixtureDir = __dirname + '/fixtures/output';
var image = fs.readFileSync(__dirname + '/fixtures/images/plain_1_0_0_0.png');

describe('write', function() {
    before(function(done) {
        // Recreate output directory to remove previous tests.
        try { fs.unlinkSync(fixtureDir + '/commit_1.mbtiles'); } catch(err) {}
        try { fs.mkdirSync(fixtureDir, 0755); } catch(err) {}
        done();
    });
    it('test mbtiles commit lock', function(done) {
        var remaining = 10;
        new MBTiles('mbtiles://' + fixtureDir + '/commit_1.mbtiles?batch=1', function(err, mbtiles) {
            assert.ifError(err);
            mbtiles.startWriting(function(err) {
                assert.ifError(err);
                for (var i = 0; i < remaining; i++) mbtiles.putTile(0,0,0,image,putcb);
                assert.equal(mbtiles._committing, true);
                assert.equal(mbtiles._events.commit.length, 19);
            });
        });
        function putcb(err) {
            assert.ifError(err);
            if (!--remaining) done();
        }
    });
});
