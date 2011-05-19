var MBTiles = require('./lib/mbtiles'),
    utils = require('./lib/utils'),
    Step = require('step');

module.exports = {
    MBTiles: MBTiles,
    utils: utils,
    pool: function(datasource) {
        return {
            create: function(callback) {
                var resource = new MBTiles(
                    datasource,
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
                    callback(null, [layer, { 'Content-Type': 'text/javascript' }]);
                }
            );
            break;
        case 'grid.json':
            resource.grid(options.x, options.y, options.z, function(err, grid) {
                callback(err, [grid, { 'Content-Type': 'text/javascript' }]);
            });
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
        case 'metadata':
            resource.insertMetadata(data, callback);
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

