require('sqlite3').verbose();

var tape = require('tape');
var fs = require('fs');
var MBTiles = require('..');
var fixtureDir = __dirname + '/fixtures/output';
var image = fs.readFileSync(__dirname + '/fixtures/images/plain_1_0_0_0.png');

tape('setup', function(assert) {
    // Recreate output directory to remove previous tests.
    try { fs.unlinkSync(fixtureDir + '/commit_1.mbtiles'); } catch(err) {}
    try { fs.mkdirSync(fixtureDir, 0755); } catch(err) {}
    assert.end();
});
tape('test mbtiles commit lock', function(assert) {
    var remaining = 10;
    new MBTiles('mbtiles://' + fixtureDir + '/commit_1.mbtiles?batch=1', function(err, mbtiles) {
        assert.ifError(err, 'new MBTiles');
        mbtiles.startWriting(function(err) {
            assert.ifError(err, 'startWriting');
            for (var i = 0; i < remaining; i++) mbtiles.putTile(0,0,0,image,putcb);
            assert.equal(mbtiles._committing, true, 'Sets committing lock');
            assert.equal(mbtiles._events.commit.length, 19, 'Queues commits');
        });
    });
    function putcb(err) {
        assert.ifError(err, 'putTile');
        if (!--remaining) assert.end();
    }
});
