var _ = require('underscore');
var ioServer =  require('socket.io');

var MAX_COLLECTION_SIZE = 1000;
var MAX_SEND_SIZE = 10;
var CLEAN_INTERVAL_MS = 60000;
var STAT_INTERVAL_MS = 3000;

var sockets = [];
var listeners = [];
var data = {};
var io = null;
var dataCleanInterval = 0;
var statInterval = 0;

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
    GET_CLIENTS: 'getClients',
    INIT: 'init',
    RELOAD: 'reload',
    NEW: 'new',
    CLEAN: 'clean'
  },
  statistic: { listners: 0, sockets: 0, in: 0, out: 0 },
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
    socket.on(SocketLogger.Event.DATA, SocketLogger.getDefaultHandler(socket, SocketLogger.sendMessageToAll));
    socket.on(SocketLogger.Event.COMMAND, SocketLogger.getDefaultHandler(socket, SocketLogger.sendCommandToAll));
    socket.on('disconnect' , function() {
      if (listeners.indexOf(socket) > -1) listeners = _.without(listeners, socket);
      sockets = _.without(sockets, socket);
      SocketLogger.updateSockets();
    });
  },

  sendInitData: function(socket) {
    var result = {};
    _.each(data, function (collection, key) {
      var start = collection.length - MAX_SEND_SIZE - 1;
      var end = collection.length - 1;
      start = start < 0 ? 0 : start;
      end = end < start ? start : end;
      result[key] = collection.slice(start, end);
    });
    socket.emit(SocketLogger.Event.COMMAND, {type: SocketLogger.CommandType.INIT, data: result})
  },

  updateSockets: function(){
    var data =  _.map(sockets, function(socket) { return socket.info; });
    SocketLogger.sendMessageToAll({type: SocketLogger.DataType.SOCKETS, data: data });

    SocketLogger.statistic.listners = listeners.length;
    SocketLogger.statistic.sockets = sockets.length;

    //console.log('Update sockets ', data);
  },

  sendMessageToAll: function(message) {
    _.each(listeners, function (socket) {
      SocketLogger.statistic.out++;
      socket.emit(SocketLogger.Event.DATA, message);
    });
  },

  sendCommandToAll: function(message) {
    if(message.type === SocketLogger.CommandType.CLEAN) data = {};
    //io.emit(SocketLogger.Event.COMMAND, message);
    _.each(listeners, function (socket) {
      SocketLogger.statistic.out++;
      socket.emit(SocketLogger.Event.DATA, message);
    });
  },

  getDefaultHandler: function(socket, sendToAll) {
    return function(message) {
      SocketLogger.statistic.in++;

      var type = message ? message.type : null;
      var clientId = socket.info?socket.info.client_id:null;

      switch (type) {
        case SocketLogger.DataType.INFO:
        {
          socket.info = message.data;
          clientId = socket.info.client_id;
          data[clientId] = data[clientId]?data[clientId]:[];

          if (sockets.indexOf(socket) === -1) {
            var isListener = socket.info && socket.info.options && socket.info.options.listener;
            if(isListener) listeners.push(socket);
            sockets.push(socket);
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

          if (data[clientId]) data[clientId].push(message);
          sendToAll(message);
          break;
        }
      }
    };
  }
};

function init(http) {
  io = ioServer(http);
  dataCleanInterval = setInterval(SocketLogger.clean, CLEAN_INTERVAL_MS);
  statInterval = setInterval(function() { console.log('Statistic: ' + JSON.stringify(SocketLogger.statistic)); }, STAT_INTERVAL_MS);
  return io.on('connection', SocketLogger.connectionHandler);
}

module.exports = init;