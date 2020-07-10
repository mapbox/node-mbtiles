'use strict'

var EARTH_RADIUS = 6371.0088;

function degToRad(degrees) {
    return degrees * (Math.PI / 180);
}

function tileToLon(tileX, zoom) {
    return ((tileX / 2**zoom) * 360.0) - 180.0;
}

function tileToLat(tileY, zoom) {
    var n = Math.PI - 2 * Math.PI * tileY / 2**zoom;
    return (180.0 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 *
 * @param {Number} zoom
 * @param {Number} tileX
 * @param {Number} tileY
 * @returns {Number} SqKM of a given tile
 */
function calculateTileArea(zoom, tileX, tileY) {
    var left = degToRad(tileToLon(tileX, zoom));
    var top = degToRad(tileToLat(tileY, zoom));
    var right = degToRad(tileToLon(tileX + 1, zoom));
    var bottom = degToRad(tileToLat(tileY + 1, zoom));
    return (Math.PI / degToRad(180)) * EARTH_RADIUS**2 * Math.abs(Math.sin(top) - Math.sin(bottom)) * Math.abs(left - right);
}

module.exports = {
    calculateTileArea
};
