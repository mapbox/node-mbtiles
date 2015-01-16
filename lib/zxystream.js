var stream = require('stream');
var util = require('util');

module.exports = ZXYStream;
util.inherits(ZXYStream, stream.Readable);

// Readable stream of line-delimited z/x/y coordinates
// contained within the MBTiles `tiles` table/view.
function ZXYStream(source, options) {
    if (!source) throw new TypeError('MBTiles source required');

    options = options || {};

    this.source = source;
    this._afterGet = this._afterGet.bind(this);

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

    // Prepare sql statement
    if (!stream.statement) {
        stream.statement = this.source._db.prepare('SELECT zoom_level AS z, tile_column AS x, tile_row AS y FROM ' + this.table, function(err) {
            if (err && err.code === 'SQLITE_ERROR' && /no such table/.test(err.message)) return stream.push(null);
            return stream._read();
        });
        return;
    }

    stream.statement.get(stream._afterGet);
};

ZXYStream.prototype._afterGet = function(err, row) {
    if (err && err.code === 'SQLITE_ERROR' && /no such table/.test(err.message)) return this.push(null);
    if (err) return this.emit('error', err);
    if (!row) return this.push(null);
    this.push(toLine(row));
};

function toLine(row) {
    // Flip Y coordinate because MBTiles files are TMS.
    var y = row.y = (1 << row.z) - 1 - row.y;
    return row.z + '/' + row.x + '/' + y + '\n';
}

