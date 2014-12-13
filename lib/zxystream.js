var stream = require('stream');
var util = require('util');

module.exports = ZXYStream;
util.inherits(ZXYStream, stream.Readable);

// Readable stream of line-delimited z/x/y coordinates
// contained within the MBTiles `tiles` table/view.
//
// The `batch` option exists to allow tests to check that
// multiple calls to `_read` are handled properly. IRL the
// default offset of 1000 should be reasonably efficient
// and not worth messing with.
function ZXYStream(source, options) {
    if (!source) throw new TypeError('MBTiles source required');

    options = options || {};

    if (options.batch !== undefined && typeof options.batch !== 'number')
        throw new TypeError('options.batch must be a positive integer');

    this.source = source;
    this.batch = options.batch || 1000;
    this.offset = 0;

    stream.Readable.call(this);
}

ZXYStream.prototype._read = function() {
    var stream = this;

    // Check for the existence of a map table that is indexed.
    if (!stream.table) {
        return this.source._db.get("select count(1) as count from sqlite_master where type = 'index' and tbl_name = 'map';", function(err, row) {
            if (err) return stream.emit('error', err);
            stream.table = row.count >= 1 ? 'map' : 'tiles';
            return stream._read();
        });
    }

    this.source._db.all('SELECT zoom_level AS z, tile_column AS x, tile_row AS y FROM ' + this.table + ' LIMIT ' + this.batch + ' OFFSET ' + this.offset, function(err, rows) {
        if (err && err.code === 'SQLITE_ERROR' && /no such table/.test(err.message)) return stream.push(null);
        if (err) return stream.emit('error', err);
        if (!rows.length) return stream.push(null);
        stream.offset += stream.batch;
        var chunk = '';
        for (var i = 0; i < rows.length; i++) chunk += toLine(rows[i]);
        stream.push(chunk);
    });
};

function toLine(row) {
    // Flip Y coordinate because MBTiles files are TMS.
    var y = row.y = (1 << row.z) - 1 - row.y;
    return row.z + '/' + row.x + '/' + y + '\n';
}

