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
        assert.ok(err);
        assert.equal(err.message, 'ENOENT, No such file or directory');
        
        MBTiles.list(fixtures.doesnotexist, function(err, list) {
            completed = true;
            assert.ok(err);
            assert.equal(err.message, 'ENOENT, No such file or directory');
        });
    });
};

