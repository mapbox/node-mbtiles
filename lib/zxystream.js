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
    this.batch = options.batch || 1000;

    // max tiles used to end a stream early
    this.maxTilesCount = 1;
    this.maxTiles = options.maxTiles || Infinity;

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
        var query = 'SELECT zoom_level AS z, tile_column AS x, tile_row AS y FROM ' + this.table;
        if (this.table === 'map') query += ' WHERE tile_id is not null';

        stream.statement = this.source._db.prepare(query, function(err) {
            if (err && err.code === 'SQLITE_ERROR' && /no such table/.test(err.message)) return stream.push(null);
            return stream._read();
        });
        return;
    }

    var lines = '';
    var error;
    var remaining = stream.batch;

    for (var i = 0; i < stream.batch; i++) stream.statement.get(afterGet);

    function afterGet(err, row) {
        stream.maxTilesCount++;
        if (err && err.code === 'SQLITE_ERROR' && /no such table/.test(err.message)) {
            // no-op
        } else if (err) {
            error = err;
        } else if (!row) {
            // no-op
        } else {
            lines += toLine(row);
        }

        // if we hit the max number of tiles to analyze, push the lines
        // already gathered and signal the end of the stream
        if (stream.maxTilesCount > stream.maxTiles) {
            if (lines) stream.push(lines);
            stream.statement.finalize();
            stream.push(null);
            return;
        }

        if (!--remaining) {
            if (error) {
                stream.emit('error', error);
            } else {
                if (lines) {
                  stream.push(lines);
                } else {
                    stream.statement.finalize();
                    stream.push(null);
                }
            }
        }
    }
};

function toLine(row) {
    // Flip Y coordinate because MBTiles files are TMS.
    var y = row.y = (1 << row.z) - 1 - row.y;
    return row.z + '/' + row.x + '/' + y + '\n';
}
