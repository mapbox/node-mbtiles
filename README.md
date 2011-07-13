# mbtiles

Utilities and [tilelive][1] integration for the [MBTiles][2] format.


### Installation

    npm install mbtiles


### Commandline tools

Several commandline tools are included in `bin` for manipulating existing
MBTiles files.

    mbcheck [FILE]
      Check an mbtiles for missing metadata and tiles.

    mbcompact [FILE]
      Eliminate duplicate images to reduce mbtiles filesize.

    mbpipe [COMMAND] [FILE]
      Pipe each tile to stdin of the specified command and
      write stdout into the mbtiles file.

    mbrekey [FILE]
      Rekey a compacted mbtiles to save space.


[1]: https://github.com/mapbox/tilelive.js
[2]: http://mbtiles.org
