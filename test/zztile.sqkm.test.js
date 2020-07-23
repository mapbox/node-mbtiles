'use strict';
require('sqlite3').verbose();
var tape = require('tape');
var fs = require('fs');
var os = require('os');
var sinon = require('sinon');

var fixtures = {
    plain_1: __dirname + '/fixtures/plain_1.mbtiles'
};

tape('[tile.sqkm] should log sqkm in a stats file', function (assert) {
    delete require.cache[require.resolve('..')];
    process.env.BRIDGE_LOG_MAX_VTILE_BYTES_COMPRESSED = 1;
    var MBTiles = require('../lib/mbtiles');
    sinon.stub(process, 'exit');
    process.on('exit', function() {
        var assert = require('assert');
        var expectedStats = {
            '0': 508164394.24620897,
            max: 7072,
            total: 7.072,
            count: 1
        };

        var actualStats = JSON.parse(fs.readFileSync(os.tmpdir() + '/tilelive-bridge-stats.json').toString());
        assert.deepEqual(expectedStats, actualStats, 'stats should match');
        fs.unlinkSync(os.tmpdir() + '/tilelive-bridge-stats.json');
        delete process.env.BRIDGE_LOG_MAX_VTILE_BYTES_COMPRESSED;
    });
    new Promise(function (resolve, reject) {
        new MBTiles(fixtures.plain_1, function (err, mbTiles) {
            if (err) reject(err);
            resolve(mbTiles);
        });
    })
        .then(function (mbTiles) {
            return new Promise(function (resolve, reject) {
                mbTiles.getTile(0, 0, 0, function (error, tile, headers) {
                    if (error) {
                        assert.ifErr(error, 'should be empty');
                        reject(error);
                    }
                    assert.deepEqual(
                        tile,
                        fs.readFileSync(
                            __dirname + '/fixtures/images/plain_1_0_0_0.png'
                        )
                    );
                    resolve(null);
                });
            });
        })
        .catch(function (error) {
            console.log(error);
        })
        .finally(function () {
            assert.end();
            process.exit();
        });
});
