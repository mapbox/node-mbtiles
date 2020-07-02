# 0.12.0

- Remove support for node versions < 10
- Add support for node v12, v14
- Upgrade to sqlite3@5.0.0

# 0.11.0

## Breaking changes
- getInfo() returns `scheme` as `xyz` instead of `tms` [#66](https://github.com/mapbox/node-mbtiles/pull/66) - [@hannesj](https://github.com/hannesj)

## Improvements

- use `path.join` so pkg can auto detect assets [#80](https://github.com/mapbox/node-mbtiles/pull/80) - [@jingsam](https://github.com/jingsam)

# 0.10.0

- Now supporting node v10
- Upgraded to @mapbox/sphericalmercator@1.1.0
- Upgraded to sqlite3@4.x with node v10 support
- Dropped support for node versions before 4 (due to sqlite2 upgrade)
- Remove unused utility code [#77](https://github.com/mapbox/node-mbtiles/pull/77)
- Add `mode` option to MBTiles constructor which allows you to specify READONLY (ro), READWRITE (rw), or the default READWRITECREATE (rwc) [#73](https://github.com/mapbox/node-mbtiles/pull/73) - _added by [@jingsam](https://github.com/jingsam)_

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
