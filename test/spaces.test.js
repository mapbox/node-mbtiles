var tape = require('tape');
var MBTiles = require('..');

tape('opens mbtiles file with spaces', function(assert) {
    new MBTiles(__dirname + '/fixtures/with spaces.mbtiles', function(err, mbtiles) {
        assert.ifError(err);
        mbtiles.getInfo(function(err, info) {
            assert.ifError(err);
            assert.deepEqual(info.level1, {level2:'property'});
            assert.deepEqual(info.custom, ['custom list']);
            assert.end();
        });
    });
});
