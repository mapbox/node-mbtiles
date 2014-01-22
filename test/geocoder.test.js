var fs = require('fs');
var assert = require('assert');
var util = require('util');
var MBTiles = require('..');

describe('geocoder (carmen) API', function() {

var expected = {
    bounds: '-141.005548666451,41.6690855919108,-52.615930948992,83.1161164353916',
    lat: 56.8354595949484,
    lon: -110.424643384994,
    name: 'Canada',
    population: 33487208,
    search: 'Canada, CA'
};

var tmp = '/tmp/mbtiles-test-' + (+new Date).toString(16);
var index;
var from;
var to;

before(function() {
    try { fs.mkdirSync(tmp); } catch(err) { throw err; }
});
before(function(done) {
    index = new MBTiles(__dirname + '/fixtures/geocoder_data.mbtiles', done);
});
before(function(done) {
    from = new MBTiles(__dirname + '/fixtures/geocoder_legacy.mbtiles', done);
});
before(function(done) {
    to = new MBTiles(tmp + '/indexed.mbtiles', done);
});

after(function(done) {
    this.timeout(5000);
    index.close(function(err) {
        if (err) throw err;
        from.close(function(err) {
            if (err) throw err;
            to.close(function(err) {
                if (err) throw err;
                try { fs.unlinkSync(tmp + '/indexed.mbtiles'); } catch(err) { throw err; }
                try { fs.rmdirSync(tmp); } catch(err) { throw err; }
                done();
            });
        });
    });
});

it('getGeocoderData', function(done) {
    index.getGeocoderData('term', 0, function(err, buffer) {
        assert.ifError(err);
        assert.equal(3891, buffer.length);
        done();
    });
});

it('putGeocoderData', function(done) {
    this.timeout(5000);
    to.startWriting(function(err) {
        assert.ifError(err);
        to.putGeocoderData('term', 0, new Buffer('asdf'), function(err) {
            assert.ifError(err);
            to.stopWriting(function(err) {
                assert.ifError(err);
                to.getGeocoderData('term', 0, function(err, buffer) {
                    assert.ifError(err);
                    assert.deepEqual('asdf', buffer.toString());
                    done();
                });
            });
        });
    });
});

it('getIndexableDocs', function(done) {
    from.getIndexableDocs({ limit: 10 }, function(err, docs, pointer) {
        assert.ifError(err);
        assert.equal(docs.length, 10);
        assert.deepEqual(pointer, { limit: 10, offset: 10, nogrids: false });
        assert.deepEqual(docs[0], {
            AREA: 0,
            FIPS: 'AA',
            ISO2: 'AW',
            ISO3: 'ABW',
            name: 'Aruba',
            POP2005: 102897,
            REGION: 19,
            SUBREGION: 29,
            UN: 533,
            _id: 4214083313,
            _text: 'Aruba',
            _zxy: [ '4/4/7' ],
            _center: [ -69.977, 12.517 ]
        });
        from.getIndexableDocs(pointer, function(err, docs, pointer) {
            assert.ifError(err);
            assert.equal(docs.length, 10);
            assert.deepEqual(pointer, { limit: 10, offset: 20, nogrids: false });
            assert.deepEqual(docs[0], {
                AREA: 20,
                FIPS: 'AQ',
                ISO2: 'AS',
                ISO3: 'ASM',
                name: 'American Samoa',
                POP2005: 64051,
                REGION: 9,
                SUBREGION: 61,
                UN: 16,
                _id: 2093723708,
                _text: 'American Samoa',
                _zxy: [ '4/0/8' ],
                _center: [ -170.73, -14.318 ]
            });
            done();
        });
    });
});

it('geocoderCentroid ABW', function(done) {
    from.geocoderCentroid('ABW', ['4/4/7'], function(err, center) {
        assert.ifError(err);
        assert.deepEqual([ -70.3125, 12.554563528593656 ], center);
        done();
    });
});

it('geocoderCentroid ASM', function(done) {
    from.geocoderCentroid('ASM', ['4/0/8'], function(err, center) {
        assert.ifError(err);
        assert.deepEqual([-170.859375,-14.264383087562637], center);
        done();
    });
});

it('geocoderCentroid USA', function(done) {
    from.geocoderCentroid('USA', [
        '4/0/7',
        '4/0/6',
        '4/0/5',
        '4/0/4',
        '4/0/3',
        '4/1/7',
        '4/1/4',
        '4/1/3',
        '4/2/6',
        '4/2/5',
        '4/2/4',
        '4/3/6',
        '4/3/5',
        '4/4/7',
        '4/4/6',
        '4/4/5',
        '4/5/5',
        '4/15/5'
    ], function(err, center) {
        assert.ifError(err);
        assert.deepEqual([-118.828125,46.07323062540835], center);
        done();
    });
});

});
