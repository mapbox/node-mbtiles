var MBTiles = require('./lib/mbtiles'),
    zlib = require('zlib'),
    Buffer = require('buffer').Buffer,
    Step = require('step');

module.exports = {
    MBTiles: MBTiles,
    pool: function(datasource, options) {
        return {
            create: function(callback) {
                var resource = new MBTiles(
                    datasource,
                    options,
                    function() { callback(resource); }
                );
            },
            destroy: function(resource) {
                resource.db.close(function() {});
            }
        }
    },
    serve: function(resource, options, callback) {
        switch (options.format) {
        case 'layer.json':
            Step(
                function() {
                    resource.metadata('formatter', this.parallel());
                    resource.metadata('legend', this.parallel());
                },
                function(err, f, l) {
                    var layer = {};
                    f && (layer.formatter = f);
                    l && (layer.legend = l);
                    options.jsonp && (layer = options.jsonp + '(' + JSON.stringify(layer) + ');');
                    callback(null, [layer, { 'Content-Type': 'text/javascript' }]);
                }
            );
            break;
        case 'grid.json':
            var grid;
            Step(
                function() {
                    resource.grid(options.x, options.y, options.z, this);
                },
                function(err, buf) {
                    if (err) throw err;
                    if (!Buffer.isBuffer(buf))
                        buf = new Buffer(buf, 'binary');
                    var inflated = zlib.inflate(buf);
                    this(null,inflated);
                },
                function(err, buf) {
                    if (err) throw err;
                    grid = buf.toString();
                    resource.grid_data(options.x, options.y, options.z, this);
                },
                function(err, gd) {
                    if (err) return callback(err);
                    // Manually append grid data as a string to the grid buffer.
                    // Ideally we would
                    //
                    //     JSON.stringify(_.extend(JSON.parse(grid), { data: gd }))
                    //
                    // But calling JSON stringify will escape UTF8 characters of a
                    // high enough ordinal making the grid data unusable. Instead,
                    // manipulate the JSON string directly, popping the trailing }
                    // off and splicing the grid data in at the "data" key.
                    grid = grid.substr(0, grid.length - 1)
                        + ', "data":'
                        + JSON.stringify(gd)
                        + '}';
                    options.jsonp && (grid = options.jsonp + '(' + grid + ');');
                    callback(err, [grid, { 'Content-Type': 'text/javascript' }]);
                }
            );
            break;
        default:
            resource.tile(options.x, options.y, options.z, function(err, image) {
                callback(err, [image, { 'Content-Type': 'image/png' }]);
            });
            break;
        }
    },
    store: function(step, resource, data, callback) {
        switch (step) {
        case 'setup':
            resource.setup(callback);
            break;
        case 'tiles':
            resource.insertTiles(data, callback);
            break;
        case 'grids':
            resource.insertGrids(data, callback);
            break;
        case 'finish':
            callback();
            break;
        }
    }
};

