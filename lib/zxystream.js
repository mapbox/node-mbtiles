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

    stream.Readable.call(this);
}

ZXYStream.prototype._read = function() {
    var stream = this;

    // Check for the existence of a map table that is indexed.
    if (!stream.table) {
        setImmediate(function() {
            try {
                var stmt = stream.source._db.prepare("select count(1) as count from sqlite_master where type = 'index' and tbl_name = 'map';");
                var row = stmt.get();
                stream.table = row.count >= 1 ? 'map' : 'tiles';
                return stream._read();
            } catch (err) {
                return stream.emit('error', err);
            }
        });
        return;
    }

    // Prepare sql statement
    if (!stream.statement) {
        var query = 'SELECT zoom_level AS z, tile_column AS x, tile_row AS y FROM ' + this.table;
        if (this.table === 'map') query += ' WHERE tile_id is not null';

        setImmediate(function() {
            try {
                stream.statement = stream.source._db.prepare(query);
                stream.statementIterator = stream.statement.iterate();
                return stream._read();
            } catch (err) {
                if (err.code === 'ERR_SQLITE_ERROR' && /no such table/.test(err.message)) {
                    return stream.push(null);
                }
                return stream.emit('error', err);
            }
        });
        return;
    }

    var lines = '';
    var count = 0;
    
    setImmediate(function() {
        try {
            for (var i = 0; i < stream.batch; i++) {
                var result = stream.statementIterator.next();
                if (result.done) {
                    if (lines) stream.push(lines);
                    stream.push(null);
                    return;
                }
                lines += toLine(result.value);
                count++;
            }
            
            if (lines) stream.push(lines);
        } catch (err) {
            if (err.code === 'ERR_SQLITE_ERROR' && /no such table/.test(err.message)) {
                stream.push(null);
            } else {
                stream.emit('error', err);
            }
        }
    });
};

function toLine(row) {
    // Flip Y coordinate because MBTiles files are TMS.
    var y = row.y = (1 << row.z) - 1 - row.y;
    return row.z + '/' + row.x + '/' + y + '\n';
}
