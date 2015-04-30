var _ = require('underscore');
var sockjs = require('sockjs');
var bm = require('./libs/basic-mongo');
var config = require('./config/default');
var async = require('async');
var logNS = require('./libs/basic-log');
var logger = new logNS.BasicLog('SocketLogger');

var MAX_COLLECTION_SIZE = 1000;
var MAX_SEND_SIZE = 10;
var STAT_INTERVAL_MS = 3000;

var sockets = [];
var listeners = [];
var sockjsServer = null;
var statInterval = 0;

var sockjs_opts = {sockjs_url: "http://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js"};
var hander_opts = {prefix: '/ws'};

var SocketLogger = {
  NS: 'socketLogger',
  Event: {
    DATA: 'data',
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
    INIT: 'init', /* Server to client, active clients */
    RELOAD: 'reload', /* Server to client, reload */
    NEW: 'new',
    CLEAN: 'clean', /* Client to server - server to all clients that listen this channel : define client_id or null to listen */
    LISTEN: 'listen', /* Client to server : define client_id or null to listen */
    HISTORY: 'history', /* Client to server : get history, type: clients/logs, data: 0 to all history */
    STAT: 'stat' /* Server to client (listener) : update stat */
  },
  COLLECTIONS: {
    LOGS: 'logs',
    CLIENTS: 'clients'
  },

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

  module.exports = init;