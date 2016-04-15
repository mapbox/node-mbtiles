# 0.9.0

- Add `geocoderDataIterator`.

# 0.8.2

- Robustify error handling in `getGeocoderdata`.

# 0.8.1

- Now supports Node 4.x

# 0.8.0

- `createZXYStream` only lists tile coordinates that contain tile data

# 0.7.0

- Adds `createZXYStream` method for a readstream of z/x/y tile coordinates.

# 0.6.0

- Update dep to ~sqlite@3.0.0.

# 0.5.0

- Adds support for gzip compressed vector tiles.

# 0.4.0

- Adds support for carmen (dev) geocoding API.

# 0.3.0

- `step`, `underscore`, `optimist` dependencies removed.
- Tests upgraded to use `mocha`.
- Commands removed.

# 0.2.7

- `_metadata` now returns null if the metadata table or the requested field is
    missing.

# 0.1.14

- Allows `template` key in `metadata` table.

# 0.1.0

- Modified interface to conform to Tilesource interface:
  - `tile(x, y, z, callback)` is now `getTile(z, x, y, callback)`. Note the changed order of arguments.
  - `grid(x, y, z, callback)` is now `getGrid(z, x, y, callback)`. Note the changed order of arguments.
  - Added `getInfo(callback)` method.
- Removed `index.js` with `pool`, `serve` and `store` functions.
- MBTiles objects now create their databases as a singleton. There's no need to add additional pooling around MBTiles objects; you can create as many as you want.
- The constructor now takes Tilesource URIs (e.g. mbtiles:///path/to/file.mbtiles) as strings and parsed URIs as a hash.
