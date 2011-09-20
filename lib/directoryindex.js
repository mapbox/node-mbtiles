var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

module.exports = DirectoryIndex;
util.inherits(DirectoryIndex, EventEmitter)
function DirectoryIndex(dir) {
    this.filepath = dir;

    // Initialize and continually update the directory index.
    this.update = _(this.update).bind(this);
    process.nextTick(this.update)
    fs.watchFile(dir, this.update);
}

DirectoryIndex.prototype.getList = function(callback) {
    if (!this.list) this.once('updated', done);
    else done.call(this);

    function done() {
        if (this.err) callback(this.err);
        else callback(null, this.list);
    }
};

DirectoryIndex.prototype.getID = function(id, callback) {
    if (!this.list) this.once('updated', done);
    else done.call(this);

    function done() {
        if (this.err) callback(this.err);
        else if (!this.list[id]) callback(new Error('Tileset not found'));
        else callback(null, this.list[id]);
    }
}

DirectoryIndex.prototype.update = function() {
    var index = this;
    fs.readdir(index.filepath, function(err, files) {
        index.err = err;
        if (!err) {
            for (var result = index.list = {}, i = 0; i < files.length; i++) {
                var name = files[i].match(/^([\w-]+)\.mbtiles$/);
                if (name) {
                    result[name[1]] = 'mbtiles://' + path.join(index.filepath, name[0]);
                }
            }
            index.list = result;
        }
        index.emit('updated');
    });
};

var cache = DirectoryIndex.cache = {};
DirectoryIndex.create = function(filepath) {
    if (!cache[filepath]) {
        var oldpath = filepath;
        filepath = path.resolve(filepath);
        if (!cache[filepath]) {
            cache[filepath] = new DirectoryIndex(filepath);
        }
        // Avoid path.resolve() calls.
        cache[oldpath] = cache[filepath];
    }
    return cache[filepath];
};
