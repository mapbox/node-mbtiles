require('sqlite3').verbose();

var fs = require('fs');
var assert = require('assert');
var zlib = require('zlib');
var queue = require('queue-async');
var MBTiles = require('..');
var fixtureDir = __dirname + '/fixtures';

describe('vector tile', function() {
    var pbf = fs.readFileSync(fixtureDir + '/0.0.0.vector.pbf'),
        deflated,
        file = fixtureDir + '/output/vt.mbtiles';

    before(function(done) {
        zlib.deflate(pbf, function(err, data) {
            assert.ifError(err);
            deflated = data;
            done();
        });
        try { fs.mkdirSync(fixtureDir + '/output', 0755); } catch(e) {}
    });

    afterEach(function() {
        try { fs.unlinkSync(file); } catch (e) {}
    });

    it('is deflated on insertion', function(done) {
        new MBTiles(file, function(err, mbtiles) {
            assert.ifError(err);
            queue(1)
                .defer(mbtiles.startWriting.bind(mbtiles))
                .defer(mbtiles.putInfo.bind(mbtiles), {format: 'pbf'})
                .defer(mbtiles.putTile.bind(mbtiles), 0, 0, 0, pbf)
                .defer(mbtiles.stopWriting.bind(mbtiles))
                .await(function(err) {
                    assert.ifError(err);
                    var sql = 'SELECT tile_data FROM tiles WHERE zoom_level = 0 AND tile_column = 0 AND tile_row = 0';
                    mbtiles._db.get(sql, function (err, row) {
                        assert.ifError(err);
                        assert.deepEqual(row.tile_data, deflated);
                        done();
                    });
                });
        });
    });

    it('is inflated on retrieval', function(done) {
        new MBTiles(file, function(err, mbtiles) {
            assert.ifError(err);
            queue(1)
                .defer(mbtiles.startWriting.bind(mbtiles))
                .defer(mbtiles.putInfo.bind(mbtiles), {format: 'pbf'})
                .defer(mbtiles.putTile.bind(mbtiles), 0, 0, 0, pbf)
                .defer(mbtiles.stopWriting.bind(mbtiles))
                .await(function (err) {
                    assert.ifError(err);
                    mbtiles.getTile(0, 0, 0, function (err, data, headers) {
                        assert.ifError(err);
                        assert.deepEqual(data, pbf);
                        assert.equal(headers['Content-Type'], 'application/x-protobuf');
                        assert.equal(headers['Content-Encoding'], undefined);
                        done();
                    });
                });
        });
    });

    it('is assumed to be deflated even if format metadata is not present', function(done) {
        new MBTiles(__dirname + '/fixtures/vector_deflate.mbtiles', function(err, mbtiles) {
            assert.ifError(err);
            mbtiles.getTile(0, 0, 0, function (err, data, headers) {
                assert.ifError(err);
                assert.equal(headers['Content-Type'], 'application/x-protobuf');
                assert.equal(headers['Content-Encoding'], undefined);
                assert.equal(data.length, 141503);
                done();
            });
        });
    });
});
