exports.BasicLogMode = {
    ALL: 3,
    WARN: 2,
    ERROR: 1
};
var BasicLog = (function () {
    function BasicLog(name, mode) {
        if (mode === void 0) { mode = exports.BasicLogMode.ALL; }
        this.startTimestamps = {};
        this.lastTimestamps = {};
        this.name = name;
        this.startTimestamps[this.name] = this.now;
        this.lastTimestamps[this.name] = this.now;
        this.mode = mode;
        this.log = this.log.bind(this);
        this.logWithDiff = this.logWithDiff.bind(this);
    }
    BasicLog.prototype.log = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (this.mode >= exports.BasicLogMode.ALL)
            console.log('[' + this.name + '] ' + args.join(', '));
    };
    BasicLog.prototype.logWithDiff = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (this.mode >= exports.BasicLogMode.ALL) {
            console.log('[' + this.name + '] time ' + this.diff + 'ms, last ' + this.lastDiff + 'ms ' + args.join(', '));
        }
    };
    BasicLog.prototype.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (this.mode >= exports.BasicLogMode.ERROR)
            console.log('[' + this.name + '] ' + args.join(', '));
    };
    BasicLog.prototype.startByName = function (value) {
        this.startTimestamps[value] = this.now;
    };
    BasicLog.prototype.diffByName = function (value) {
        var startTime = this.startTimestamps[value] ? this.startTimestamps[value] : 0;
        return this.now - startTime;
    };
    Object.defineProperty(BasicLog.prototype, "lastDiff", {
        get: function () {
            var result = this.now - this.lastTimestamps[this.name];
            this.lastTimestamps[this.name] = this.now;
            return result;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BasicLog.prototype, "diff", {
        get: function () {
            return this.now - this.startTimestamps[this.name];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BasicLog.prototype, "now", {
        get: function () {
            return Date.now();
        },
        enumerable: true,
        configurable: true
    });
    return BasicLog;
})();
exports.BasicLog = BasicLog;
//# sourceMappingURL=basic-log.js.map