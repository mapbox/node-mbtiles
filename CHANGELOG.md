# 0.1.0

- Modified interface to conform to Tilesource interface:
  - `tile(x, y, z, callback)` is now `getTile(z, x, y, callback)`. Note the changed order of arguments.
  - `grid(x, y, z, callback)` is now `getGrid(z, x, y, callback)`. Note the changed order of arguments.
  - Added `getInfo(callback)` method.
- Removed `index.js` with `pool`, `serve` and `store` functions.
- MBTiles objects now create their databases as a singleton. There's no need to add additional pooling around MBTiles objects; you can create as many as you want.
- The constructor now takes Tilesource URIs (e.g. mbtiles:///path/to/file.mbtiles) as strings and parsed URIs as a hash.
