# mbtiles

Node.js utilities and [tilelive](https://github.com/mapbox/tilelive.js) integration for the [MBTiles](http://mbtiles.org) format.

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
new MBTiles('./path/to/file.mbtiles', function(err, mbtiles) {
  console.log(mbtiles) // mbtiles object with methods listed below
});
```

### Reading

**`getTile`**

Get an individual tile from the MBTiles table. This can be a raster or gzipped vector tile. Also returns headers that are important for serving over HTTP.

```javascript
mbtiles.getTile(z, x, y, function(err, data, headers) {
  // `data` is your gzipped buffer - use zlib to gunzip or inflate
});
```

**`getInfo`**

Get info of an MBTiles file, which is stored in the `metadata` table. Includes information like zoom levels, bounds, vector_layers, that were created during generation. This performs fallback queries if certain keys like `bounds`, `minzoom`, or `maxzoom` have not been provided.

```javascript
mbtiles.getInfo(function(err, info) {
  console.log(info); // info
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

**`putInfo(data, callback)`**

Put an information object into the metadata table. Any nested JSON will be stringified and stored in the "json" row of the metadata table. This will replace any matching key/value fields in the table.
