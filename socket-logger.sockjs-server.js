var _ = require('underscore');
var sockjs =  require('sockjs');
var bm = require('./libs/basic-mongo');
var config = require('./config/default');
var async = require('async');

var MAX_COLLECTION_SIZE = 1000;
var MAX_SEND_SIZE = 10;
var CLEAN_INTERVAL_MS = 60000;
var STAT_INTERVAL_MS = 3000;

var sockets = [];
var listeners = [];
var data = {};
var sockjsServer = null;
var dataCleanInterval = 0;
var statInterval = 0;

var logNS = require('./libs/basic-log');
var logger = new logNS.BasicLog('SocketLogger');


var SocketLogger = {
  NS: 'socketLogger',
  Event: {
    DATA: 'data',
    COMMAND: 'command'
  },
  DataType: {
    INFO: 'info',
    SOCKETS: 'sockets',
    LOG: 'log',
    WARN: 'warn',
    ERR: 'err'
  },
  CommandType: {
    INIT: 'init',
    RELOAD: 'reload',
    NEW: 'new',
    CLEAN: 'clean'
  },
  statistic: { listners: 0, sockets: 0, in: 0, out: 0 },
  bmi:null,
  dbReady: false,
  clean: function() {
    _.each(data, function(collection, key) {
      if(collection && collection.length > MAX_COLLECTION_SIZE * 2) {
        var startLength = collection.length;
        collection.splice(0, startLength - MAX_COLLECTION_SIZE);
        //console.log('Resize collection %s from %d to %d, last %s', key, startLength, collection.length, JSON.stringify(collection[collection.length-1]));
      }
    });
  },

  connectionHandler: function(socket){
    console.log('connection  handler ' + socket);

    socket.on(SocketLogger.Event.DATA, SocketLogger.getDefaultHandler(socket, SocketLogger.sendMessageToAll));
    socket.on('close' , function() {
      if (listeners.indexOf(socket) > -1) listeners = _.without(listeners, socket);
      sockets = _.without(sockets, socket);
      SocketLogger.updateSockets();
    });
  },

  sendInitData: function(socket) {
    if(!SocketLogger.dbReady) return;
    var result = {};
    /**
    _.each(data, function (collection, key) {
      var start = collection.length - MAX_SEND_SIZE - 1;
      var end = collection.length - 1;
      start = start < 0 ? 0 : start;
      end = end < start ? start : end;
      result[key] = collection.slice(start, end);
    });
     */
      console.log('Send init');
      var clients = [];
      var logs = {};

      logger.logWithDiff('Pre');

      async.series([
          function(cb) {
            SocketLogger.bmi.getCollection('clients').find({}).sort({'time': -1}).limit(100).toArray(
              function(e, results) {
                clients = results;
                cb(e,results);
            });
          },
          function(cb) {
            var l = 0;
            _.map(clients, function(client) {
              SocketLogger.bmi.getCollection('logs')
                .find({ client_id: client.client_id}, {limit: 100})
                .sort({time: -1})
                .toArray(
                  function(e, result) {
                  console.log('Init data logs ');
                  logs[client.client_id] = result;
                  if(++l >= clients.length) cb(e, result);
                });
            });
            if(!(clients && clients.length)) cb();
          }
        ],
        function(e, result) {
          console.log('Send logs ... ', e);
          logger.logWithDiff('SendInitData');
          socket.write(JSON.stringify({type: SocketLogger.Event.COMMAND, data: {type: SocketLogger.CommandType.INIT, data: logs }}));
        });
  },

  updateSockets: function(){
    var data =  _.map(sockets, function(socket) { return socket.info; });
    SocketLogger.sendMessageToAll(JSON.stringify({ type: SocketLogger.Event.DATA, data: {type: SocketLogger.DataType.SOCKETS, data: data } }));
    SocketLogger.statistic.listners = listeners.length;
    SocketLogger.statistic.sockets = sockets.length;
    //console.log('Update sockets ', data);
  },

  sendMessageToAll: function(message) {
    _.each(listeners, function (socket) {
      SocketLogger.statistic.out++;
      socket.write(message);
    });
  },

  sendCommandToAll: function(message) {
    if(message.type === SocketLogger.CommandType.CLEAN) data = {};
     _.each(listeners, function (socket) {
      SocketLogger.statistic.out++;
      socket.write(message);
    });
  },

  insertLogDb: function(data) {
    if(!SocketLogger.dbReady) return;
    logger.logWithDiff('Prelog');
    SocketLogger.bmi.getCollection('logs').insert(
      data,
      function(e, result) {
        logger.logWithDiff('log inserted ', e);
        //console.log('Insert log result e, result : ', e, result);
      }
    );
  },

  insertOrUpdateClientDb: function (data){
    if(!SocketLogger.dbReady) return;
    SocketLogger.bmi.getCollection('clients').update(
      {client_id : data.client_id},
      data,
      {upsert:true},
      function(e, result) {
        //console.log('Upsert client result e, result : ', e, result);
      }
    );
  },

  getDefaultHandler: function(socket, sendToAll) {
    return function(draftMessage) {
      SocketLogger.statistic.in++;
      var fullMessage = JSON.parse(draftMessage);
      var message = fullMessage.data;
      var type = message ? message.type : null;
      var clientId = socket.info?socket.info.client_id:null;

      switch (type) {
        case SocketLogger.DataType.INFO:
        {
          socket.info = message.data;
          clientId = socket.info.client_id;
          socket.info.time = Date.now();
          //data[clientId] = data[clientId]?data[clientId]:[];

          if (sockets.indexOf(socket) === -1) {
            var isListener = socket.info && socket.info.options && socket.info.options.listener;


            if(isListener) listeners.push(socket);
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
  }
};

function init(server) {
  dataCleanInterval = setInterval(SocketLogger.clean, CLEAN_INTERVAL_MS);
  statInterval = setInterval(function() { console.log('Statistic: ' + JSON.stringify(SocketLogger.statistic)); }, STAT_INTERVAL_MS);

  // 1. Echo sockjs server
  var sockjs_opts = {sockjs_url: "http://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js" };
  var hander_opts = {prefix: '/ws' };

  SocketLogger.bmi = new bm.BasicMongo(config.mongodb);
  SocketLogger.bmi.on('connected', function () { SocketLogger.bmi.init([{name: 'logs', keys: [  { time: 1}, { client_id: 1 }]}, {name: 'clients', keys: [ {time: 1}, { client_id: 1 }]} ] ); });
  SocketLogger.bmi.on('ready', function() { SocketLogger.dbReady = true; });
  SocketLogger.bmi.connect();

  sockjsServer = sockjs.createServer(sockjs_opts);
  sockjsServer.installHandlers(server, hander_opts);
  sockjsServer.on('connection', SocketLogger.connectionHandler);

  return sockjsServer;
}

module.exports = init;