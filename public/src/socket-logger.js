if (typeof module !== 'undefined') {
  var _ = require('underscore');
  var io = require('socket.io-client');
  var debug = true;
  var navigator = {userAgent: 'nodejs'};
}

var SocketLogger = {
  NS: 'socketLogger',
  Event: {
    MESSAGE: 'message'
  },
  EventType: {
    INFO: 'info',
    DATA: 'data',
    SOCKETS: 'sockets',
    CLEAN: 'clean'
  },
  getLocalStorage: function () {
    try {
      return ('localStorage' in window && window['localStorage']) ? window['localStorage'] : null;
    } catch (e) {
      return null;
    }
  },
  getClientId: function () {
    var storage = SocketLogger.getLocalStorage();
    var key = SocketLogger.NS + 'ClientId';
    var randomClientId = (_.random(0, 100000000) + Date.now()).toString();

    try {
      var result = storage ? storage.getItem(key) : null;
      result = result ? result : randomClientId;
      if (storage) storage.setItem(key, result);
    }
    catch (e) {
      result = randomClientId;
    }
    return result;
  },
  getSocketClient: function (connectionString, connectHandler, messageHandler) {
    "use strict";
    var client_id = SocketLogger.getClientId();
    var socket = io(connectionString);
    var stat = { in: 0, out: 0 };

    socket.on('connect', function () {
      SocketLogger.log('Socket connected');
      emit({type: SocketLogger.EventType.INFO, data: {client_id: client_id, ua: navigator.userAgent}});
      if (connectHandler) connectHandler(true);
    });

    socket.on(SocketLogger.Event.MESSAGE, function (message) {
      //SocketLogger.log('Socket message', message?message.type:'', message?message.data:'' );
      stat.in++;
      if (messageHandler) messageHandler(message);
    });

    function emit(data) {
      stat.out++;
      SocketLogger.log('Emit', data);
      socket.emit(SocketLogger.Event.MESSAGE, data);
    }

    socket.on('disconnect', function () {
      if (connectHandler) connectHandler(false);
      SocketLogger.log('Socket disconnected');
    });

    socket.on('error', function () {
      if (connectHandler) connectHandler(false);
      SocketLogger.log('Socket error');
    });

    SocketLogger.log('Socket inited');
    return {emit: emit, stat: stat};
  },
  log: function () {
    if (debug) console.log(_.isArray(arguments) ? arguments.join(', ') : arguments);
  }
};

if (typeof module !== 'undefined') {
  module.exports = {SocketLogger: SocketLogger};
  SocketLogger.log('NodeJs exports created');
}

