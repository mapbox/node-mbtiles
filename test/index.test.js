var MBTiles = require('..');

new MBTiles(__dirname + '/fixtures/plain_1.mbtiles', function(err, mbtiles) {
  if (err) throw err;
  console.log(MBTiles.list());

});
