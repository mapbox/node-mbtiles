mbpipe(1) -- Pipe each tile in an mbtiles to a command
======================================================

## SYNOPSIS

`mbpipe` <command> <file>

## DESCRIPTION

The mbpipe(1) command pipes each tile in an mbtiles archive to
the specified command and write stdout back into the archive.

## OPTIONS

`--help` display this help and exit

## EXAMPLES

mbpipe "pngquant 32" world.mbtiles

## AUTHOR

Written by MapBox.

## REPORTING BUGS

Please report bugs on the GitHub issue tracker:
<`https://github.com/mapbox/node-mbtiles/issues`>

## SEE ALSO

mbcheck(1), mbcompact(1), mbrekey(1)
