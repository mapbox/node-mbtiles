process.env.NODE_ENV = 'test';

var fs = require('fs');
var Step = require('step');
var assert = require('assert');
var MBTiles = require('..');

var fixtures = {
    plain_1: __dirname + '/fixtures/plain_1.mbtiles',
    empty: __dirname + '/fixtures/empty.mbtiles'
};

try { fs.unlink(fixtures.empty); } catch (err) {}


exports['get metadata'] = function(beforeExit) {
    var completed = false;

    new MBTiles(fixtures.plain_1, function(err, mbtiles) {
        if (err) throw err;

        mbtiles.getInfo(function(err, data) {
            completed = true;
            if (err) throw err;

            assert.deepEqual({
                name: 'plain_1',
                description: 'demo description',
                version: '1.0.3',
                scheme: 'tms',
                minzoom: 0,
                maxzoom: 4,
                formatter: null,
                center: [ 0, 7.500000001278025, 2 ],
                bounds: [ -179.9999999749438, -69.99999999526695, 179.9999999749438, 84.99999999782301 ],

                // These aren't part of TileJSON, but exist in an MBTiles file.
                filesize: 561152,
                type: 'baselayer',
                id: 'plain_1',
                basename: 'plain_1.mbtiles'
            }, data);
        })
    });

    beforeExit(function() {
        assert.ok(completed);
    });
};

exports['get/put metadata from empty file'] = function(beforeExit) {
    var completion = {};

    new MBTiles(fixtures.empty, function(err, mbtiles) {
        if (err) throw err;
        completion.open = true;

        mbtiles.getInfo(function(err, data) {
            if (err) throw err;
            completion.info = true;

            assert.deepEqual({
                basename: "empty.mbtiles",
                filesize: 16384,
                id: "empty",
                scheme: "tms"
            }, data);

            mbtiles.putInfo({ version: '1.0.0' }, function(err) {
                assert.ok(err);
                assert.equal(err.message, 'MBTiles not in write mode');
                completion.putFail = true;

                mbtiles.startWriting(function(err) {
                    if (err) throw err;
                    completion.startWriting = true;

                    mbtiles.putInfo({ version: '1.0.0' }, function(err) {
                        if (err) throw err;
                        completion.written = true;

                        mbtiles.stopWriting(function(err) {
                            if (err) throw err;
                            completion.stopWriting = true;

                            mbtiles.getInfo(function(err, data) {
                                if (err) throw err;
                                completion.updatedInfo = true;

                                assert.deepEqual({
                                    basename: "empty.mbtiles",
                                    filesize: 16384,
                                    id: "empty",
                                    scheme: "tms",
                                    version: "1.0.0"
                                }, data);
                            });
                        });
                    });
                });
            });
        });
    });

    beforeExit(function() {
        assert.deepEqual(completion, {
            info: true,
            open: true,
            putFail: true,
            startWriting: true,
            stopWriting: true,
            updatedInfo: true,
            written: true
        });
    });
};

