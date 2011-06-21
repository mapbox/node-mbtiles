var assert = require('assert');
var MBTiles = require('..').MBTiles;

var fixture = __dirname + '/fixtures/online.mbtiles';

exports['get online metadata'] = function(beforeExit) {
    var completion = {};

    var mbtiles = new MBTiles(fixture);
    mbtiles.metadata('name', function(err, value) { if (err) throw err; completion.name = value; });
    mbtiles.metadata('type', function(err, value) { if (err) throw err; completion.type = value; });
    mbtiles.metadata('description', function(err, value) { if (err) throw err; completion.description = value; });
    mbtiles.metadata('version', function(err, value) { if (err) throw err; completion.version = value; });
    mbtiles.metadata('formatter', function(err, value) { if (err) throw err; completion.formatter = value; });
    mbtiles.metadata('bounds', function(err, value) { if (err) throw err; completion.bounds = value; });
    mbtiles.metadata('online', function(err, value) { if (err) throw err; completion.online = value; });
    mbtiles.metadata('invalid', function(err, value) { completion.invalid = err.message; });

    beforeExit(function() {
        assert.deepEqual(completion, {
            name: 'MapQuest streets',
            type: 'baselayer',
            description: 'MapQuest’s OpenStreetMap based street level tiles.',
            version: '1.0.0',
            formatter: null,
            bounds: '-180,-90,180,90',
            online: 'http://otile1.mqcdn.com/tiles/1.0.0/osm/%z/%x/%y.png',
            invalid: 'Key does not exist'
        });
    });
};


exports['get online tiles'] = function(beforeExit) {
    var status = {
        success: 0,
        error: 0
    };

    var mbtiles = new MBTiles(fixture);

    mbtiles.db.serialize(function() {
        mbtiles.db.run("DELETE FROM map");
        mbtiles.db.run("DELETE FROM images");
    });

    mbtiles.tile(0, 0, 0, function(err, tile) {
        if (err) throw new Error(err);
        status.success++;
    });

    mbtiles.tile(0, 0, 18, function(err, tile) {
        if (err) throw new Error(err);
        status.success++;
    });

    beforeExit(function() {
        assert.equal(status.success, 2);
        assert.equal(status.error, 0);
    });
};