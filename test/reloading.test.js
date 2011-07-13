process.env.NODE_ENV = 'test';

var fs = require('fs');
var assert = require('assert');
var MBTiles = require('..');

var fixtureDir = __dirname + '/fixtures/output';
var fixtures = {
    source: __dirname + '/fixtures/plain_1.mbtiles',
    destination: fixtureDir + '/write_3.mbtiles'
};

// Load entire database as buffer.
var file = fs.readFileSync(fixtures.source);

// Recreate output directory to remove previous tests.
try { fs.unlinkSync(fixtures.destination); } catch(err) {}
try { fs.mkdirSync(fixtureDir, 0755); } catch(err) {}

exports['test file reloading during copying'] = function(beforeExit) {
    var completed = false;
    var status = {
        success: 0,
        error: 0
    };

    var tiles = [
        [ 0, 0, 0 ],
        [ 1, 0, 1 ],
        [ 4, 0, 5 ],
        [ 4, 0, 4 ],
        [ 1, 0, 0 ],
        [ 3, 6, 3 ],
        [ 4, 8, 6 ],
        [ 4, 9, 1 ],
        [ 4, 9, 10 ],
        [ 4, 9, 7 ],
        [ 4, 9, 6 ]
    ];

    var fd = fs.openSync(fixtures.destination, 'w');
    // Start copying the file. Write first 100 KB and last 100 KB, then wait.
    fs.writeSync(fd, file, 0, 100000, 0);
    fs.writeSync(fd, file, 461152, 100000, 461152);

    function writeRest() {
        setTimeout(function() {
            fs.writeSync(fd, file, 100000, 461152, 100000);
            fs.closeSync(fd);

            setTimeout(function() {
                new MBTiles(fixtures.destination, function(err, mbtiles) {
                    var returned = 0;
                    tiles.forEach(function(c) {
                        mbtiles.getTile(c[0], c[1], c[2], function(err, tile) {
                            if (++returned === tiles.length) mbtiles._close();
                            if (err) assert.ok(false, "Couldn't load tile " + c[0] + '/' + c[1] + '/' + c[2]);
                            else status.success++;
                        });
                    });
                });

            }, 2000);
        }, 1000);
    }

    // Try reading.
    new MBTiles(fixtures.destination, function(err, mbtiles) {
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
                id: 'write_3',
                basename: 'write_3.mbtiles'
            }, data);
        });

        var returned = 0;
        tiles.forEach(function(c) {
            mbtiles.getTile(c[0], c[1], c[2], function(err, tile) {
                if (++returned === tiles.length) writeRest();
                if (err) status.error++;
                else assert.ok(false, "Could unexpectedly load tile " + c[0] + '/' + c[1] + '/' + c[2]);
            });
        });
    });


    beforeExit(function() {
        assert.ok(completed);
        assert.equal(status.error, 11);
        assert.equal(status.success, 11);
    });
};