///<reference path='../treeweb-server/application/r.d.ts'/>
var _ = require('lodash');
var sockjs = require('sockjs');
var config = require('./config/default');
var bm = require('./libs/basic-mongo');
var bl = require('./libs/basic-log');
var logger = new bl.BasicLog('SocketLogger');
var MAX_COLLECTION_SIZE = 1000;
var MAX_SEND_SIZE = 10;
var STAT_INTERVAL_MS = 3000;
var sockjs_opts = { sockjs_url: "http://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js" };
var hander_opts = { prefix: '/ws' };
var dbStructure = [{ name: 'logs', keys: [{ time: 1 }, { client_id: 1 }] }, { name: 'clients', keys: [{ time: 1 }, { client_id: 1 }] }];
var SocketLogger = {
    NS: 'socketLogger',
    Event: {
        DATA: 'data',
        CLOSE: 'close',
        COMMAND: 'command'
    },
    DataType: {
        INFO: 'info',
        SOCKETS: 'sockets',
        INIT: 'init',
        /* Both */
        LOG: 'log',
        WARN: 'warn',
        ERR: 'err'
    },
    CommandType: {
        RELOAD: 'reload',
        CLEAN: 'clean',
        HISTORY: 'history',
        LISTEN: 'listenToServer',
        INIT: 'initToClient',
        STAT: 'statToClient' /* Server to client (listener) : update stat */
    },
    COLLECTIONS: {
        LOGS: 'logs',
        CLIENTS: 'clients'
    },
    statistic: { listeners: 0, sockets: 0, in: 0, out: 0, dbIn: 0, avgDbIn: 0, dbRead: 0, avdDbRead: 0, dbError: 0, dbInRps: 0, dbReadRps: 0, dbErrorRps: 0, dbInTt: 0, dbReadTt: 0 },
    statisticPrevious: { listeners: 0, sockets: 0, in: 0, out: 0, dbIn: 0, avgDbIn: 0, dbRead: 0, avdDbRead: 0, dbError: 0, dbInRps: 0, dbReadRps: 0, dbErrorRps: 0, dbInTt: 0, dbReadTt: 0 }
};
var Application = (function () {
    function Application() {
        this.sockets = [];
        this.listeners = [];
        this.sockjsServer = null;
        this.bmi = null;
        this.dbReady = false;
        _.bindAll(this, 'init', 'socketConnectionHandler', 'createStatistic', 'socketInfoHandler', 'socketCloseHandler', 'socketDataHandler', 'sendToListeners', 'upsertData', 'insertData', 'findData');
    }
    Application.prototype.init = function (server) {
        var t = this;
        var sockjsServer = sockjs.createServer(sockjs_opts);
        sockjsServer.installHandlers(server, hander_opts);
        sockjsServer.on('connection', this.socketConnectionHandler);
        this.sockjsServer = sockjsServer;
        var bmi = new bm.BasicMongo(config.mongodb);
        var readyTimeout = setTimeout(function () { throw new Error('Cant connect&init mongo in 10s'); }, 10000);
        bmi.on('connected', function () { bmi.init(dbStructure); });
        bmi.on('ready', function () {
            clearTimeout(readyTimeout);
            t.dbReady = true;
            t.statInterval = setInterval(t.createStatistic, STAT_INTERVAL_MS);
        });
        bmi.connect();
        this.bmi = bmi;
        return null;
    };
    Application.prototype.createStatistic = function () {
        var factor = Math.round(STAT_INTERVAL_MS / 1000);
        var s = SocketLogger.statistic;
        var ps = SocketLogger.statisticPrevious;
        function view(value) { return value.toFixed(1); }
        function avg(name) { return view((s[name + 'Tt'] - ps[name + 'Tt']) / ((s[name] - ps[name]) || 1)); }
        ;
        function rps(name) { return view((s[name] - ps[name]) / factor); }
        s.avgDbIn = avg('dbIn');
        s.avdDbRead = avg('dbRead');
        s.dbInRps = rps('dbIn');
        s.dbReadRps = rps('dbRead');
        s.dbErrorRps = rps('dbError');
        console.log('Statistic: ' + JSON.stringify(s));
        SocketLogger.statisticPrevious = _.clone(s);
    };
    Application.prototype.socketConnectionHandler = function (socket) {
        var socketHandler = new SocketInternalHandler(socket, this.socketInfoHandler, this.socketDataHandler, null, this.socketCloseHandler);
    };
    Application.prototype.socketInfoHandler = function (socket) {
        var isntContainInSockets = this.sockets.indexOf(socket) === -1;
        var isntContainInListeners = this.listeners.indexOf(socket) === -1;
        if (isntContainInSockets) {
            this.sockets.push(socket);
            this.upsertData(socket.info, 'client_id', 'clients');
        }
        if (isntContainInListeners && socket.info.isListener) {
            this.listeners.push(socket);
            this.socketListenerInit(socket);
        }
        this.updateSocketsInfo();
    };
    Application.prototype.updateSocketsInfo = function () {
        SocketLogger.statistic.sockets = this.sockets.length;
        SocketLogger.statistic.listeners = this.listeners.length;
    };
    Application.prototype.socketListenerInit = function (socket) {
        this.bmi.getCollection('clients').count(function (e, result) {
            var data = JSON.stringify({ type: SocketLogger.Event.COMMAND, data: { type: SocketLogger.CommandType.INIT, data: { clientsCount: result || -1 } } });
            socket.write(data);
        });
        this.findData('clients', {}, { time: -1 }, 0, 10, function (e, result) {
            var data = JSON.stringify({ type: SocketLogger.Event.COMMAND, data: { type: SocketLogger.CommandType.INIT, data: { clients: result } } });
            socket.write(data);
        });
        this.findData('logs', {}, { time: -1 }, 0, 1000, function (e, result) {
            var data = JSON.stringify({ type: SocketLogger.Event.COMMAND, data: { type: SocketLogger.CommandType.INIT, data: { logs: result } } });
            socket.write(data);
        });
    };
    Application.prototype.socketCloseHandler = function (socket) {
        if (this.listeners.indexOf(socket) > -1)
            this.listeners = _.without(this.listeners, socket);
        this.sockets = _.without(this.sockets, socket);
        this.upsertData(socket.info, 'client_id', 'clients');
        socket.info = null;
        this.updateSocketsInfo();
    };
    Application.prototype.socketDataHandler = function (message) {
        this.insertData(message, 'logs');
        this.sendToListeners(message);
    };
    Application.prototype.sendToListeners = function (message) {
        var messageString = JSON.stringify(message);
        _.each(this.listeners, function (socket) {
            SocketLogger.statistic.out++;
            socket.write(messageString);
        });
    };
    Application.prototype.upsertData = function (data, key, collection) {
        if (!this.dbReady)
            return;
        var whereQueryObject = {};
        whereQueryObject[key] = data[key];
        this.bmi.getCollection(collection).update(whereQueryObject, data, { upsert: true }, this.upsertResultHandler);
    };
    Application.prototype.insertData = function (data, collection) {
        if (!this.dbReady)
            return;
        this.bmi.getCollection(collection).insert(data, this.insertResultHandler);
    };
    Application.prototype.findData = function (collection, query, sort, from, limit, handler, context) {
        if (from === void 0) { from = 0; }
        if (limit === void 0) { limit = 100; }
        if (handler === void 0) { handler = null; }
        if (context === void 0) { context = null; }
        this.bmi.getCollection(collection).find(query).sort(sort).skip(from).limit(limit).toArray(function (e, r) { if (handler)
            handler.call(context, e, r); });
    };
    Application.prototype.upsertResultHandler = function (e, result) {
        if (!e && result)
            SocketLogger.statistic.dbIn++;
        else
            SocketLogger.statistic.dbError++;
    };
    Application.prototype.insertResultHandler = function (e, result) {
        if (!e && result)
            SocketLogger.statistic.dbIn++;
        else
            SocketLogger.statistic.dbError++;
    };
    return Application;
})();
var SocketInternalHandler = (function () {
    function SocketInternalHandler(socket, infoHandler, dataHandler, commandHandler, closeHandler) {
        this.socket = socket;
        this.infoHandler = infoHandler;
        this.dataHandler = dataHandler;
        this.commandHandler = commandHandler;
        this.closeHandler = closeHandler;
        _.bindAll(this, 'internalDataHandler', 'internalCloseHandler');
        this.socket.on(SocketLogger.Event.DATA, this.internalDataHandler);
        this.socket.on(SocketLogger.Event.CLOSE, this.internalCloseHandler);
    }
    SocketInternalHandler.prototype.internalDataHandler = function (draftMessage) {
        SocketLogger.statistic.in++;
        var fullMessage = JSON.parse(draftMessage);
        var message = fullMessage.data;
        var type = message ? message.type : null;
        var socket = this.socket;
        console.log('Message in type %s, sub %s, data %o ', fullMessage.type, type, message);
        var clientId = socket.info ? socket.info.client_id : null;
        switch (type) {
            case SocketLogger.DataType.INFO:
                {
                    socket.info = message.data;
                    socket.info.active = true;
                    socket.info.time = Date.now();
                    socket.info.isListener = socket.info && socket.info.options && socket.info.options.listener;
                    this.infoHandler(socket);
                    break;
                }
            default:
                {
                    if (_.isObject(message)) {
                        message.client_id = clientId;
                        message.time = Date.now();
                    }
                    this.dataHandler(message);
                    break;
                }
        }
    };
    SocketInternalHandler.prototype.internalCloseHandler = function () {
        this.socket.info.active = false;
        if (this.closeHandler)
            this.closeHandler(this.socket);
        this.dispose();
    };
    SocketInternalHandler.prototype.dispose = function () {
        this.socket = null;
        this.infoHandler = null;
        this.dataHandler = null;
        this.commandHandler = null;
        this.closeHandler = null;
    };
    return SocketInternalHandler;
})();
var app = new Application();
module.exports = app.init;
//# sourceMappingURL=application.js.map