require('sqlite3').verbose();

var fs = require('fs');
var tape = require('tape');
var MBTiles = require('..');
var fixtures = {
    doesnotexist: __dirname + '/doesnotexist'
};

try { fs.unlinkSync(fixtures.doesnotexist); } catch (err) {}

tape('list', function(assert) {
    MBTiles.list(fixtures.doesnotexist, function(err, list) {
        assert.ifError(err);
        assert.deepEqual(list, {});
        assert.end();
    });
});
