require('sqlite3').verbose();

var fs = require('fs');
var MBTiles = require('..');
var tape = require('tape');

var non_existent = __dirname + '/fixtures/non_existent.mbtiles';

try { fs.unlinkSync(non_existent); } catch (err) {}

tape('Open with ro mode', function(assert) {
  new MBTiles(non_existent + '?mode=ro', function(err, mbtiles) {
    assert.ok(err);
    assert.ok(err.message.match(/SQLITE_CANTOPEN: unable to open database file/));
    assert.end();
  })
})

tape('Open with rw mode', function(assert) {
  new MBTiles(non_existent + '?mode=rw', function(err, mbtiles) {
    assert.ok(err);
    assert.ok(err.message.match(/SQLITE_CANTOPEN: unable to open database file/));
    assert.end();
  })
})

tape('Open with rwc mode', function(assert) {
  new MBTiles(non_existent + '?mode=rwc', function(err, mbtiles) {
    assert.notOk(err);
    assert.end();
  })
})
