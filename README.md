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

### MBTiles utilities

**Constructor**

```javascript
new MBTiles('./path/to/file.mbtiles', function(err, mbtiles) {
  // mbtiles object
});
```
