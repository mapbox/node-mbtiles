require('sqlite3').verbose();

var fs = require('fs');
var MBTiles = require('..');
var assert = require('assert');
var fixtures = {
    doesnotexist: __dirname + '/doesnotexist'
};

describe('list', function() {
    before(function(done) {
        try { fs.unlinkSync(fixtures.doesnotexist); } catch (err) {}
        done();
    });
    it('list', function(done) {
        MBTiles.list(fixtures.doesnotexist, function(err, list) {
            assert.ifError(err);
            assert.deepEqual(list, {});
            done();
        });
    });
});

