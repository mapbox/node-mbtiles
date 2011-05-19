# mbtiles

MBTiles manipulation utilities and API integration for [tilelive.js][1].


### Installation

    npm install mbtiles


### tilelive.js integration

Example of using `tilelive` to serve tiles from an `mbtiles` file.

    var tilelive = new Server(require('mbtiles')),
    tilelive.serve({
        datasource: '/my/map.mbtiles',
        x: 0,
        y: 0,
        z: 0,
        format: 'png'
    }, function(err, data) {
        if (!err) throw Err
        // data[0]: PNG image
        // data[1]: HTTP headers object appropriate for PNG format
    });


[1]: https://github.com/mapbox/tilelive.js

