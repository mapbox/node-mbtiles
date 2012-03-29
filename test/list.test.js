process.env.NODE_ENV = 'test';

var fs = require('fs');
var Step = require('step');
var assert = require('assert');
var MBTiles = require('..');

var fixtures = {
    doesnotexist: __dirname + '/doesnotexist'
};

try { fs.unlink(fixtures.doesnotexist); } catch (err) {}


exports['list'] = function(beforeExit) {
    var completed = false; beforeExit(function() { assert.ok(completed); });

    MBTiles.list(fixtures.doesnotexist, function(err, list) {
        assert.equal(err, null);
        assert.deepEqual(list, {});

        MBTiles.list(fixtures.doesnotexist, function(err, list) {
            completed = true;
            assert.equal(err, null);
            assert.deepEqual(list, {});
        });
    });
};

