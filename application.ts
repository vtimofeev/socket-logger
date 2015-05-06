///<reference path='../treeweb-server/application/r.d.ts'/>

import _ = require('lodash');
import sockjs = require('sockjs');
import config = require('./config/default');
import async = require('async');
import bm = require('./libs/basic-mongo');
import bl = require('./libs/basic-log');

var logger = new bl.BasicLog('SocketLogger');

const MAX_COLLECTION_SIZE:number = 1000;
const MAX_SEND_SIZE = 10;
const STAT_INTERVAL_MS = 3000;
const sockjs_opts = {sockjs_url: "http://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js"};
const hander_opts = {prefix: '/ws'};
const dbStructure:any[] = [{name: 'logs', keys: [{time: 1}, {client_id: 1}]}, {name: 'clients', keys: [{time: 1}, {client_id: 1}]}];

var SocketLogger = {
    NS: 'socketLogger',
    Event: {
        DATA: 'data',
        CLOSE: 'close',
        COMMAND: 'command'
    },
    DataType: {
        INFO: 'info', /* Client to server : startup */
        SOCKETS: 'sockets', /* Server to client */
        /* Both */
        LOG: 'log',
        WARN: 'warn',
        ERR: 'err'
    },
    CommandType: {
        GET_CLIENTS: 'getClients', /* Client to server */
        RELOAD: 'reload', /* Server to client, reload */
        CLEAN: 'clean', /* Client to server - server to all clients that listen this channel : define client_id or null to listen */
        HISTORY: 'history', /* Client to server : get history, type: clients/logs, data: 0 to all history */
        LISTEN: 'listenToServer', /* Client to server : define client_id or null to listen */
        INIT: 'init', /* Server to client, active clients */
        STAT: 'stat' /* Server to client (listener) : update stat */
    },
    COLLECTIONS: {
        LOGS: 'logs',
        CLIENTS: 'clients'
    },
    statistic: {listeners: 0, sockets: 0, in: 0, out: 0, dbIn: 0, avgDbIn: 0, dbRead: 0, avdDbRead: 0, dbError: 0, dbInRps: 0, dbReadRps: 0, dbErrorRps: 0, dbInTt: 0, dbReadTt: 0},
    statisticPrevious: {listeners: 0, sockets: 0, in: 0, out: 0, dbIn: 0, avgDbIn: 0, dbRead: 0, avdDbRead: 0, dbError: 0, dbInRps: 0, dbReadRps: 0, dbErrorRps: 0, dbInTt: 0, dbReadTt: 0}
};


class Application {
    sockets:Array<any> = [];
    listeners:Array<any> = [];
    sockjsServer:any = null;
    bmi:bm.BasicMongo = null;
    dbReady:boolean = false;
    statInterval;

    constructor() {
        _.bindAll(this, 'init', 'socketConnectionHandler' , 'createStatistic', 'socketInfoHandler', 'socketCloseHandler', 'socketDataHandler', 'socketCommandHandler', 'sendToListeners', 'upsertData', 'insertData', 'findData');
    }

    init(server) {
        var t:Application = this;
        var sockjsServer = sockjs.createServer(sockjs_opts);
        sockjsServer.installHandlers(server, hander_opts);

        sockjsServer.on('connection', this.socketConnectionHandler);

        this.sockjsServer = sockjsServer;

        var bmi = new bm.BasicMongo(config.mongodb);
        var readyTimeout = setTimeout(function() { throw new Error('Cant connect&init mongo in 10s')}, 10000);
        bmi.on('connected', function () { bmi.init(dbStructure); });
        bmi.on('ready', function () {
            clearTimeout(readyTimeout);
            t.dbReady = true;
            t.statInterval = setInterval(t.createStatistic, STAT_INTERVAL_MS);
        });

        bmi.connect();
        this.bmi = bmi;
        return null;
    }

    createStatistic() {
        var factor = Math.round(STAT_INTERVAL_MS / 1000);
        var s = SocketLogger.statistic;
        var ps = SocketLogger.statisticPrevious;

        function view(value) { return value.toFixed(1); }
        function avg(name) { return view((s[name + 'Tt'] - ps[name + 'Tt']) / ((s[name] - ps[name]) || 1)); };
        function rps(name) { return view((s[name] - ps[name]) / factor); }

        s.avgDbIn = avg('dbIn');
        s.avdDbRead = avg('dbRead');
        s.dbInRps = rps('dbIn');
        s.dbReadRps = rps('dbRead');
        s.dbErrorRps = rps('dbError');

        console.log('Statistic: ' + JSON.stringify(s));
        SocketLogger.statisticPrevious = _.clone(s);
    }

    socketConnectionHandler(socket:any) {
        var socketHandler = new SocketInternalHandler(socket, this.socketInfoHandler, this.socketDataHandler, this.socketCommandHandler, this.socketCloseHandler);
    }

    socketInfoHandler(socket) {
        if (!this.dbReady) return;

        var isntContainInSockets:boolean = this.sockets.indexOf(socket) === -1;
        var isntContainInListeners:boolean = this.listeners.indexOf(socket) === -1;
        if(isntContainInSockets) {
            this.sockets.push(socket);
            this.upsertData(socket.info, 'client_id', 'clients');
        }
        if(isntContainInListeners && socket.info.isListener){
            this.listeners.push(socket);
            this.socketListenerInit(socket);
        }

        this.updateSocketsInfo();
    }

    updateSocketsInfo() {
        SocketLogger.statistic.sockets = this.sockets.length;
        SocketLogger.statistic.listeners = this.listeners.length;
    }

    socketCommandHandler(message, socket) {
        switch (message.type) {
            case SocketLogger.CommandType.GET_CLIENTS:
                this.findData('clients', {}, { time: -1} , message.data, 10, function(e, result) {
                    var data = JSON.stringify({ type: SocketLogger.Event.COMMAND, data: { type: SocketLogger.CommandType.INIT, data: { clients: result }}});
                    socket.write(data);
                });
                break;
        }
    }

    socketListenerInit(socket) {
        this.bmi.getCollection('clients').count(function(e, result) {
            var data = JSON.stringify({ type: SocketLogger.Event.COMMAND, data: { type: SocketLogger.CommandType.INIT, data: { clientsCount: result || -1 }}});
            socket.write(data);
        });

        this.findData('clients', {}, {time: -1}, 0, 10, function(e, result) {
            var data = JSON.stringify({ type: SocketLogger.Event.COMMAND, data: { type: SocketLogger.CommandType.INIT, data: { clients: result }}});
            socket.write(data);
        });

        this.findData('logs', {}, {time: -1}, 0, 1000, function(e, result) {
            var data = JSON.stringify({ type: SocketLogger.Event.COMMAND, data: { type: SocketLogger.CommandType.INIT, data: { logs: result }}});
            socket.write(data);
        });
    }

    socketCloseHandler(socket) {
        if (this.listeners.indexOf(socket) > -1) this.listeners = _.without(this.listeners, socket);
        this.sockets = _.without(this.sockets, socket);
        this.upsertData(socket.info, 'client_id', 'clients');
        socket.info = null;
        this.updateSocketsInfo();
    }

    socketDataHandler(message) {
        this.insertData(message, 'logs');
        this.sendToListeners(message);
    }

    sendToListeners(message) {
        var messageString = JSON.stringify({ type: SocketLogger.Event.DATA, data: message });
        _.each(this.listeners, function (socket) {
            SocketLogger.statistic.out++;
            socket.write(messageString);
        });
    }

    upsertData(data, key, collection):void {
        if (!this.dbReady) return;
        var whereQueryObject = {};
        whereQueryObject[key] = data[key];
        this.bmi.getCollection(collection).update(whereQueryObject, data, {upsert: true}, this.upsertResultHandler);
    }

    insertData(data, collection):void {
        if (!this.dbReady) return;
        this.bmi.getCollection(collection).insert(data, this.insertResultHandler);
    }

    findData(collection:string, query:any, sort:any, from = 0, limit = 100, handler:Function = null, context:any = null):void {
        this.bmi.getCollection(collection).find(query).sort(sort).skip(from || 0).limit(limit || 100).toArray(function(e, r) { if(handler) handler.call(context, e, r) });
    }

    upsertResultHandler(e, result):void {
        if (!e && result) SocketLogger.statistic.dbIn++;
        else  SocketLogger.statistic.dbError++;
    }


    insertResultHandler(e, result):void {
        if (!e && result) SocketLogger.statistic.dbIn++;
        else  SocketLogger.statistic.dbError++;
    }
}

class SocketInternalHandler {
    constructor(public socket:any, public infoHandler:Function, public dataHandler:Function, public commandHandler:Function, public closeHandler:Function) {
       _.bindAll(this, 'internalDataHandler', 'internalCloseHandler');
       this.socket.on(SocketLogger.Event.DATA, this.internalDataHandler);
       this.socket.on(SocketLogger.Event.CLOSE, this.internalCloseHandler);
    }

    internalDataHandler(draftMessage) {
        SocketLogger.statistic.in++;
        var fullMessage = JSON.parse(draftMessage);
        var message = fullMessage.data;
        var type = message ? message.type : null;
        var socket = this.socket;

        console.log('Message in type %s, sub %s, data %o ' , fullMessage.type , type, message);

        var clientId = socket.info ? socket.info.client_id : null;
        if (clientId && _.isObject(message)) {
            message.client_id = clientId;
            message.time = Date.now();
        }

        if(fullMessage.type === SocketLogger.Event.DATA) {
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
                    this.dataHandler(message);
                    break;
                }
            }
        } else {
            this.commandHandler(message, socket);
        }
    }

    internalCloseHandler() {
        this.socket.info.active = false;
        if(this.closeHandler) this.closeHandler(this.socket);
        this.dispose();
    }

    dispose() {
        this.socket = null;
        this.infoHandler = null;
        this.dataHandler = null;
        this.commandHandler = null;
        this.closeHandler = null;

    }
}

var app = new Application();
module.exports = app.init;
