var assert = require('assert');
var MBTiles = require('..').MBTiles;

var fixtures = {
    plain_1: __dirname + '/fixtures/plain_1.mbtiles',
    plain_2: __dirname + '/fixtures/plain_2.mbtiles',
    plain_3: __dirname + '/fixtures/plain_3.mbtiles'
};

exports['get metadata'] = function(beforeExit) {
    var completion = {};

    var mbtiles = new MBTiles(fixtures.plain_1);
    mbtiles.metadata('name', function(err, value) { if (err) throw err; completion.name = value; });
    mbtiles.metadata('type', function(err, value) { if (err) throw err; completion.type = value; });
    mbtiles.metadata('description', function(err, value) { if (err) throw err; completion.description = value; });
    mbtiles.metadata('version', function(err, value) { if (err) throw err; completion.version = value; });
    mbtiles.metadata('formatter', function(err, value) { if (err) throw err; completion.formatter = value; });
    mbtiles.metadata('bounds', function(err, value) { if (err) throw err; completion.bounds = value; });
    mbtiles.metadata('invalid', function(err, value) { completion.invalid = err; });

    beforeExit(function() {
        assert.deepEqual(completion, {
            name: 'plain_1',
            type: 'baselayer',
            description: 'demo description',
            version: '1.0.3',
            formatter: null,
            bounds: '-179.9999999749438,-69.99999999526695,179.9999999749438,84.99999999782301',
            invalid: 'Key does not exist'
        });
    });
};
