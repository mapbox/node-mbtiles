var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    utils = {};

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
            field.map(function(val, i) {
                if (i >= lengths.length - 1) return val;
                return val + Array(lengths[i] - val.toString().length + 1).join(' ');
            }).join('  ')
        );
    });
};

function Queue(callback, concurrency) {
    this.callback = callback;
    this.concurrency = concurrency || 10;
    this.next = this.next.bind(this);
    this.invoke = this.invoke.bind(this);
    this.queue = [];
    this.running = 0;
}
util.inherits(Queue, EventEmitter);

Queue.prototype.add = function(item) {
    this.queue.push(item);
    if (this.running < this.concurrency) {
        this.running++;
        this.next();
    }
};

Queue.prototype.invoke = function() {
    if (this.queue.length) {
        this.callback(this.queue.shift(), this.next);
    } else {
        this.next();
    }
};

Queue.prototype.next = function(err) {
    if (this.queue.length) {
        process.nextTick(this.invoke);
    } else {
        this.running--;
        if (!this.running) {
            this.emit('empty');
        }
    }
};

utils.Queue = Queue;

module.exports = utils;
