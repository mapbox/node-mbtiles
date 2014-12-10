var tape = require('tape');
var MBTiles = require('../lib/mbtiles.js');
var source;

tape('zxystream setup', function(assert) {
    new MBTiles(__dirname + '/fixtures/plain_2.mbtiles', function(err, s) {
        assert.ifError(err);
        source = s;
        assert.end();
    });
});

tape('zxystream default batch', function(assert) {
    var stream = source.createZXYStream();
    var output = '';
    var called = 0;

    assert.deepEqual(stream.source, source, 'sets stream.source');
    assert.deepEqual(stream.batch, 1000, 'sets stream.batch = 1000');
    assert.deepEqual(stream.offset, 0, 'sets stream.offset = 0');

    stream.on('data', function(lines) {
        assert.equal(stream.table, 'map');
        output += lines;
        called++;
    });
    stream.on('end', function() {
        var queue = output.toString().split('\n');
        assert.equal(queue.length, 270);
        assert.equal(called, 1, 'emitted data x1 times');
        checkTile(queue);
        function checkTile(queue) {
            if (!queue.length) return assert.end();
            var zxy = queue.shift();
            if (!zxy) return checkTile(queue);
            zxy = zxy.split('/');
            source.getTile(zxy[0], zxy[1], zxy[2], function(err, buffer, headers) {
                assert.equal(!err && (buffer instanceof Buffer), true, zxy.join('/') + ' exists');
                checkTile(queue);
            });
        }
    });
});


tape('zxystream batch = 10', function(assert) {
    var stream = source.createZXYStream({batch:10});
    var output = '';
    var called = 0;

    assert.deepEqual(stream.source, source, 'sets stream.source');
    assert.deepEqual(stream.batch, 10, 'sets stream.batch = 10');
    assert.deepEqual(stream.offset, 0, 'sets stream.offset = 0');

    stream.on('data', function(lines) {
        assert.equal(stream.table, 'map');
        output += lines;
        called++;
    });
    stream.on('end', function() {
        var queue = output.toString().split('\n');
        assert.equal(queue.length, 270);
        assert.equal(called, 27, 'emitted data x27 times');
        checkTile(queue);
        function checkTile(queue) {
            if (!queue.length) return assert.end();
            var zxy = queue.shift();
            if (!zxy) return checkTile(queue);
            zxy = zxy.split('/');
            source.getTile(zxy[0], zxy[1], zxy[2], function(err, buffer, headers) {
                assert.equal(!err && (buffer instanceof Buffer), true, zxy.join('/') + ' exists');
                checkTile(queue);
            });
        }
    });
});

tape('zxystream unindexed', function(assert) {
    new MBTiles(__dirname + '/fixtures/unindexed.mbtiles', function(err, s) {
        assert.ifError(err);
        source = s;
        assert.end();
    });
});

tape('zxystream unindexed zxystream', function(assert) {
    var stream = source.createZXYStream();
    var output = '';
    var called = 0;

    assert.deepEqual(stream.source, source, 'sets stream.source');
    assert.deepEqual(stream.batch, 1000, 'sets stream.batch = 1000');
    assert.deepEqual(stream.offset, 0, 'sets stream.offset = 0');

    stream.on('data', function(lines) {
        assert.equal(stream.table, 'tiles');
        output += lines;
        called++;
    });
    stream.on('end', function() {
        var queue = output.toString().split('\n');
        assert.equal(queue.length, 286);
        assert.equal(called, 1, 'emitted data x27 times');
        checkTile(queue);
        function checkTile(queue) {
            if (!queue.length) return assert.end();
            var zxy = queue.shift();
            if (!zxy) return checkTile(queue);
            zxy = zxy.split('/');
            source.getTile(zxy[0], zxy[1], zxy[2], function(err, buffer, headers) {
                assert.equal(!err && (buffer instanceof Buffer), true, zxy.join('/') + ' exists');
                checkTile(queue);
            });
        }
    });
});



tape('zxystream empty', function(assert) {
    new MBTiles(__dirname + '/fixtures/non_existent.mbtiles', function(err, s) {
        assert.ifError(err);
        source = s;
        assert.end();
    });
});

tape('zxystream empty zxystream', function(assert) {
    var stream = source.createZXYStream();
    var called = 0;
    stream.on('data', function(lines) {
        called++;
    });
    stream.on('end', function() {
        assert.equal(called, 0, 'data never called');
        assert.end();
    });
});


