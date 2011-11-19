process.env.NODE_ENV = 'test';

var fs = require('fs');
var Step = require('step');
var MBTiles = require('..');

var fixtures = {
    doesnotexist: __dirname + '/doesnotexist'
};

try { fs.unlink(fixtures.doesnotexist); } catch (err) {}


exports['list'] = function(beforeExit, assert) {
    var completed = false; beforeExit(function() { assert.ok(completed); });

    MBTiles.list(fixtures.doesnotexist, function(err, list) {
        assert.ok(err);
        assert.ok(err.code.match(/^ENOENT/));
        
        MBTiles.list(fixtures.doesnotexist, function(err, list) {
            completed = true;
            assert.ok(err);
            assert.ok(err.code.match(/^ENOENT/));
        });
    });
};

