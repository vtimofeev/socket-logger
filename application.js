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
        COMMAND: 'command'
    },
    DataType: {
        INFO: 'infoToServer',
        SOCKETS: 'socketsToClient',
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
    }
};
var Application = (function () {
    function Application() {
        this.sockets = [];
        this.listeners = [];
        this.sockjsServer = null;
        this.bmi = null;
        this.dbReady = false;
        _.bindAll(this, 'init', 'socketConnectionHandler');
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
    };
    Application.prototype.socketConnectionHandler = function (socket) {
        var socketHandler = new SocketInternalHandler(socket, this.socketInfoHandler, this.socketDataHandler);
        socket.on(SocketLogger.Event.DATA, SocketLogger.getDefaultHandler(socket, SocketLogger.sendMessageToAll));
        socket.on('close', function () {
            if (listeners.indexOf(socket) > -1)
                listeners = _.without(listeners, socket);
            sockets = _.without(sockets, socket);
            SocketLogger.updateSockets();
        });
    };
    Application.prototype.socketInfoHandler = function (socket) {
        var isntContainInSockets = this.sockets.indexOf(socket) === -1;
        var isntContainInListeners = this.listeners.indexOf(socket) === -1;
        if (isntContainInSockets) {
            this.sockets.push(socket);
            this.upsertData(socket.info, 'client_id', 'clients');
        }
        if (isntContainInListeners && socket.info.isListener)
            this.listeners.push(socket);
    };
    Application.prototype.socketDataHandler = function (socket) {
    };
    Application.prototype.socketCloseHandler = function (socket) {
    };
    Application.prototype.upsertData = function (data, key, collection) {
        if (!this.dbReady)
            return;
        var whereQueryObject = {};
        whereQueryObject[key] = data[key];
        this.bmi.getCollection(collection).update(whereQueryObject, data, { upsert: true }, this.upsertResultHandler);
    };
    Application.prototype.upsertResultHandler = function (e, result) {
        if (!e && result)
            SocketLogger.statistic.dbIn++;
        else
            SocketLogger.statistic.dbError++;
    };
    Application.prototype.insertData = function (data, collection) {
    };
    return Application;
})();
var SocketInternalHandler = (function () {
    function SocketInternalHandler(socket, infoHandler, dataHandler, commandHandler) {
        this.socket = socket;
        this.infoHandler = infoHandler;
        this.dataHandler = dataHandler;
        this.commandHandler = commandHandler;
        this.socket.on(SocketLogger.Event.DATA, this.internalDataHandler);
    }
    SocketInternalHandler.prototype.internalDataHandler = function (draftMessage) {
        SocketLogger.statistic.in++;
        var fullMessage = JSON.parse(draftMessage);
        var message = fullMessage.data;
        var type = message ? message.type : null;
        var clientId = socket.info ? socket.info.client_id : null;
        switch (type) {
            case SocketLogger.DataType.INFO:
                {
                    socket.info = message.data;
                    socket.info.time = Date.now();
                    socket.info.isListener = socket.info && socket.info.options && socket.info.options.listener;
                    this.infoHandler(socket);
                }
            default:
                {
                    if (message) {
                        message.client_id = clientId;
                        message.time = Date.now();
                    }
                    //if (data[clientId]) data[clientId].push(message);
                    SocketLogger.insertLogDb(message);
                    sendToAll(JSON.stringify(fullMessage));
                    break;
                }
        }
    };
    SocketInternalHandler.prototype.functin = function (socket, sendToAll) {
        return;
    };
    SocketInternalHandler.prototype.dispose = function () {
        this.socket = null;
    };
    return SocketInternalHandler;
})();
/*
var sockets = [];
var listeners = [];
var sockjsServer = null;
var statInterval = 0;


    statistic: {listeners: 0, sockets: 0, in: 0, out: 0, dbIn: 0, avgDbIn: 0, dbRead: 0, avdDbRead: 0, dbError: 0, dbInRps: 0, dbReadRps: 0, dbErrorRps: 0, dbInTt: 0, dbReadTt: 0},
    statisticPrev: {listeners: 0, sockets: 0, in: 0, out: 0, dbIn: 0, avgDbIn: 0, dbRead: 0, avdDbRead: 0, dbError: 0, dbInRps: 0, dbReadRps: 0, dbErrorRps: 0, dbInTt: 0, dbReadTt: 0},

    bmi: null,
    dbReady: false,

    connectionHandler: function (socket) {
        socket.on(SocketLogger.Event.DATA, SocketLogger.getDefaultHandler(socket, SocketLogger.sendMessageToAll));
        socket.on('close', function () {
            if (listeners.indexOf(socket) > -1) listeners = _.without(listeners, socket);
            sockets = _.without(sockets, socket);
            SocketLogger.updateSockets();
        });
    },

    sendInitData: function (socket) {
        if (!SocketLogger.dbReady) return;
        var clients = [];
        var logs = {};

        // update last diff
        logger.lastDiff;


        async.series([
                function (cb) {
                    var time = Date.now();
                    SocketLogger.bmi.getCollection('clients').find({}).sort({'time': -1}).limit(100).toArray(
                        function (e, results) {
                            clients = results;
                            if (!e) {
                                SocketLogger.statistic.dbRead++;
                                SocketLogger.statistic.dbReadTt += (Date.now() - time);
                            }
                            else {
                                SocketLogger.statistic.dbError++;
                            }

                            cb(e, results);
                        });
                },
                function (cb) {
                    var l = 0;
                    _.each(clients, function (client) {
                        var time = Date.now();

                        SocketLogger.bmi.getCollection('logs')
                            .find({client_id: client.client_id})
                            .sort({time: -1})
                            .limit(100)
                            .toArray(
                            function (e, result) {
                                logs[client.client_id] = result;
                                if (!e) {
                                    SocketLogger.statistic.dbRead++;
                                }
                                else {
                                    SocketLogger.statistic.dbError++;
                                }

                                if (++l >= clients.length) {
                                    SocketLogger.statistic.dbReadTt += (Date.now() - time);
                                    cb(e, result);
                                }
                            });
                    });

                    if (!(clients && clients.length)) cb();
                }
            ],
            function (e, result) {
                logger.logWithDiff(' init db time, error ', e);
                socket.write(JSON.stringify({type: SocketLogger.Event.COMMAND, data: {type: SocketLogger.CommandType.INIT, data: logs}}));
            });
    },

    updateSockets: function () {
        var data = _.map(sockets, function (socket) { return socket.info; });
        SocketLogger.sendMessageToAll(JSON.stringify({type: SocketLogger.Event.DATA, data: {type: SocketLogger.DataType.SOCKETS, data: data}}));
        SocketLogger.statistic.listeners = listeners.length;
        SocketLogger.statistic.sockets = sockets.length;
    },

    sendMessageToAll: function (message) {
        _.each(listeners, function (socket) {
            SocketLogger.statistic.out++;
            socket.write(message);
        });
    },

    sendCommandToAll: function (message) {
        _.each(listeners, function (socket) {
            SocketLogger.statistic.out++;
            socket.write(message);
        });
    },

    insertLogDb: function (data) {
        if (!SocketLogger.dbReady) return;
        SocketLogger.bmi.getCollection('logs').insert(
            data,
            function (e, result) {
                if (!e && result) SocketLogger.statistic.dbIn++;
                else  SocketLogger.statistic.dbError++;

                //console.log('Insert log result e, result : ', e, result);
            }
        );
    },

    insertOrUpdateClientDb: function (data) {
        if (!SocketLogger.dbReady) return;
        SocketLogger.bmi.getCollection('clients')
            .update({client_id: data.client_id}, data, {upsert: true},
            function (e, result) {
                if (!e && result) SocketLogger.statistic.dbIn++;
                else  SocketLogger.statistic.dbError++;
            }
        );
    },

    getDefaultHandler: function (socket, sendToAll) {
        return function (draftMessage) {
            SocketLogger.statistic.in++;
            var fullMessage = JSON.parse(draftMessage);
            var message = fullMessage.data;
            var type = message ? message.type : null;
            var clientId = socket.info ? socket.info.client_id : null;

            switch (type) {
                case SocketLogger.DataType.INFO:
                {
                    socket.info = message.data;
                    clientId = socket.info.client_id;
                    socket.info.time = Date.now();
                    //data[clientId] = data[clientId]?data[clientId]:[];

                    if (sockets.indexOf(socket) === -1) {
                        var isListener = socket.info && socket.info.options && socket.info.options.listener;


                        if (isListener) listeners.push(socket);
                        sockets.push(socket);
                        SocketLogger.insertOrUpdateClientDb(socket.info);
                        SocketLogger.updateSockets();
                        SocketLogger.sendInitData(socket);
                    }
                    break;
                }
                default:
                {
                    if (message) {
                        message.client_id = clientId;
                        message.time = Date.now();
                    }
                    //if (data[clientId]) data[clientId].push(message);
                    SocketLogger.insertLogDb(message);
                    sendToAll(JSON.stringify(fullMessage));
                    break;
                }
            }
        };
    },
    createStatistic: function () {
        var factor = Math.round(STAT_INTERVAL_MS / 1000);
        var s = SocketLogger.statistic;
        var ps = SocketLogger.statisticPrev;

        function view(value) { return value.toFixed(1); }

        function avg(name) { return view((s[name + 'Tt'] - ps[name + 'Tt']) / ((s[name] - ps[name]) || 1)); };
        function rps(name) { return view((s[name] - ps[name]) / factor); }

        s.avgDbIn = avg('dbIn');
        s.avdDbRead = avg('dbRead');
        s.dbInRps = rps('dbIn');
        s.dbReadRps = rps('dbRead');
        s.dbErrorRps = rps('dbError');

        console.log('Statistic: ' + JSON.stringify(s));

        ps = _.clone(s);
    }
};

function init(server) {
    sockjsServer = sockjs.createServer(sockjs_opts);
    sockjsServer.installHandlers(server, hander_opts);
    sockjsServer.on('connection', SocketLogger.connectionHandler);

    var bmi = new bm.BasicMongo(config.mongodb);
    bmi.on('connected', function () {
        SocketLogger.bmi.init([{name: 'logs', keys: [{time: 1}, {client_id: 1}]}, {name: 'clients', keys: [{time: 1}, {client_id: 1}]}]);
    });

    bmi.on('error', function () {

    });

    bmi.on('ready', function () {
        SocketLogger.dbReady = true;
        statInterval = setInterval(SocketLogger.createStatistic, STAT_INTERVAL_MS);
    });


    bmi.connect();
    SocketLogger.bmi = bmi;
    return null;
}
*/
var app = new Application();
module.exports = app.init;
//# sourceMappingURL=application.js.map