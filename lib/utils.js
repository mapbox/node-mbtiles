var utils = {};

utils.table = function(fields) {
    if (!fields[0]) return;
    var lengths = fields[0].map(function(val, i) {
        return Math.max.apply(Math, fields.map(function(field) {
            if (field[i] === undefined) field[i] = '';
            return field[i].toString().length;
        }));
    });
    fields.forEach(function(field) {
        console.warn(
            '  ' + field.map(function(val, i) {
                if (i >= lengths.length - 1) return val;
                return val + Array(lengths[i] - val.toString().length + 1).join(' ');
            }).join('  ')
        );
    });
};

module.exports = utils;
