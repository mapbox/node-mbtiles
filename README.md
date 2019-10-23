# mbtiles

Node.js utilities and [tilelive](https://github.com/mapbox/tilelive.js) integration for the [MBTiles](https://github.com/mapbox/mbtiles-spec) format.

[![Build Status](https://travis-ci.org/mapbox/node-mbtiles.svg?branch=master)](https://travis-ci.org/mapbox/node-mbtiles)
[![Build status](https://ci.appveyor.com/api/projects/status/04wbok5rs3eroffe)](https://ci.appveyor.com/project/Mapbox/node-mbtiles)

# Installation

```
npm install @mapbox/mbtiles
```

```javascript
var MBTiles = require('@mapbox/mbtiles');
```

# API

### Constructor

All MBTiles instances need to be constructed before any of the methods become available. *NOTE: All methods described below assume you've taken this step.*

```javascript
new MBTiles('./path/to/file.mbtiles?mode={ro, rw, rwc}', function(err, mbtiles) {
  console.log(mbtiles) // mbtiles object with methods listed below
});
```

The `mode` query parameter is a opening flag of mbtiles. It is optional, default as `rwc`. Available flags are:

- `ro`: readonly mode, will throw error if the mbtiles does not exist.
- `rw`: read and write mode, will throw error if the mbtiles does not exist.
- `rwc`: read, write and create mode, will create a new mbtiles if the mbtiles does not exist.

### Reading

**`getTile(z, x, y, callback)`**

Get an individual tile from the MBTiles table. This can be a raster or gzipped vector tile. Also returns headers that are important for serving over HTTP.

```javascript
mbtiles.getTile(z, x, y, function(err, data, headers) {
  // `data` is your gzipped buffer - use zlib to gunzip or inflate
});
```

**`getInfo(callback)`**

Get info of an MBTiles file, which is stored in the `metadata` table. Includes information like zoom levels, bounds, vector_layers, that were created during generation. This performs fallback queries if certain keys like `bounds`, `minzoom`, or `maxzoom` have not been provided.

```javascript
mbtiles.getInfo(function(err, info) {
  console.log(info); // info
});
```

**`getGrid(z, x, y, callback)`**

Get a [UTFGrid](https://github.com/mapbox/utfgrid-spec) tile from the MBTiles table.

```javascript
mbtiles.getGrid(z, x, y, function(err, data) {
  // continue onwards
});
```

### Writing

**`startWriting`** AND **`stopWriting`**

In order to write a new (or currently existing) MBTiles file you need to "start" and "stop" writing. First, [construct](#constructor) the MBTiles object.

```javascript
mbtiles.startWriting(function(err) {
  // start writing with mbtiles methods (putTile, putInfo, etc)
  mbtiles.stopWriting(function(err) {
    // stop writing to your mbtiles object
  });
});
```

**`putTile(z, x, y, buffer, callback)`**

Add a new tile buffer to a specific ZXY. This can be a raster tile or a _gzipped_ vector tile (we suggest using `require('zlib')` to gzip your tiles).

```javascript
var zlib = require('zlib');

zlib.gzip(fs.readFileSync('./path/to/file.mvt'), function(err, buffer) {
  mbtiles.putTile(0, 0, 0, buffer, function(err) {
    // continue onward
  });
});
```

**`putInfo(data, callback)`**

Put an information object into the metadata table. Any nested JSON will be stringified and stored in the "json" row of the metadata table. This will replace any matching key/value fields in the table.

```javascript
var exampleInfo = {
  "name": "hello-world",
  "description":"the world in vector tiles",
  "format":"pbf",
  "version": 2,
  "minzoom": 0,
  "maxzoom": 4,
  "center": "0,0,1",
  "bounds": "-180.000000,-85.051129,180.000000,85.051129",
  "type": "overlay",
  "json": `{"vector_layers": [ { "id": "${layername}", "description": "", "minzoom": 0, "maxzoom": 4, "fields": {} } ] }`
};

mbtiles.putInfo(exampleInfo, function(err) {
  // continue onward
});
```

**`putGrid(z, x, y, grid, callback)`**

Inserts a [UTFGrid](https://github.com/mapbox/utfgrid-spec) tile into the MBTiles store. Grids are in JSON format.

```javascript
var fs = require('fs');
var grid = JSON.parse(fs.readFileSync('./path/to/grid.json', 'utf8'));
mbtiles.putGrid(0, 0, 0, grid, function(err) {
  // continue onward
});
```

## Hook up to tilelive

When working at scale, node-mbtiles is meant to be used within a [Tilelive](https://github.com/mapbox/tilelive) ecosystem. For example, you could set up an MBTiles file as a "source" and an S3 destination as a "sink" (using tilelive-s3). Assuming you have a system set up with an `mbtiles://` protocol that points to a specific file and authorized to write to the s3 bucket:

```javascript
var tilelive = require('@mapbox/tilelive');
var MBTiles = require('@mapbox/mbtiles');
var s3 = require('@mapbox/tilelive-s3');

s3.registerProtocols(tilelive);
MBTiles.registerProtocols(tilelive);

var sourceUri = 'mbtiles:///User/hello/path/to/file.mbtiles';
var sinkUri = 's3://my-bucket/tiles/{z}/{x}/{y}';

// load the mbtiles source
tilelive.load(sourceUri, function(err, src) {
  // load the s3 sink
  tilelive.load(sinkUri, function(err, dest) {

    var options = {}; // prepare options for tilelive copy
    options.listScheme = src.createZXYStream(); // create ZXY stream from mbtiles

    // now copy all tiles to the destination
    tilelive.copy(src, dst, options, function(err) {
      console.log('tiles are now on s3!');
    });
  });
});
```

# Test

```
npm test
```
