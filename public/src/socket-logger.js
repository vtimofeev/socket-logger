var isNode = typeof module !== 'undefined';
if (isNode) {
  var io = require('socket.io-client');
  var debug = true;
  var navigator = {userAgent: 'nodejs'};
}

var SocketLogger =  {
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
    RELOAD: 'reload',
    NEW: 'new',
    CLEAN: 'clean'
  },
  getLocalStorage: function () {
    "use strict";
    try {
      return ('localStorage' in window && window['localStorage']) ? window['localStorage'] : null;
    } catch (e) {
      return null;
    }
  },
  getClientId: function () {
    "use strict";
    var storage = SocketLogger.getLocalStorage();
    var key = SocketLogger.NS + 'ClientId';
    var randomClientId = (Math.round(Math.random()*1000000000) + Date.now()).toString(36);

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
  getSocketClient: function (connectionString, connectHandler, messageHandler, commandHandler, opt_clientId) {
    "use strict";
    var client_id = opt_clientId || SocketLogger.getClientId();
    var socket = io(connectionString);
    var stat = { in: 0, out: 0 };

    socket.on('connect', getSocketConnectHandler('connect'));
    socket.on('reconnect', getSocketConnectHandler('reconnect'));

    socket.on(SocketLogger.Event.DATA, function (message) {
      stat.in++;
      SocketLogger.log('Data in');
      if (messageHandler) messageHandler(message, SocketLogger.Event.DATA);
    });

    socket.on(SocketLogger.Event.COMMAND, function (message) {
      stat.in++;
      SocketLogger.log('Command in');
      var handler = commandHandler || messageHandler;
      if (handler) handler(message, SocketLogger.Event.COMMAND);
    });


    socket.on('disconnect', function () {
      if (connectHandler) connectHandler(false);
      SocketLogger.log('Socket disconnected');
    });

    socket.on('error', getSocketErrorHandler('error'));
    socket.on('reconnect_error' , getSocketErrorHandler('reconnect_error'));
    socket.on('reconnect_failed', getSocketErrorHandler('reconnect_failed'));

    function getSocketErrorHandler(type) {
      return function() {
        if (connectHandler) connectHandler(false);
        SocketLogger.log('Socket error with ' + type);
      }
    }

    function getSocketConnectHandler(type) {
      return function() {
        SocketLogger.log('Socket connected with ' + type);
        emit({type: SocketLogger.DataType.INFO, data: {client_id: client_id, ua: navigator.userAgent}});
        if (connectHandler) connectHandler(true);
      }
    }

    function getTypedDataEmit(type) {
      return function() {
        var value = (Array.prototype.slice.call(arguments)).join(', ');
        emit({type: type, data: value})
      }
    }

    function emit(data) {
      stat.out++;
      SocketLogger.log('Emit data ', data);
      socket.emit(SocketLogger.Event.DATA, data);
    }

    function command(type, value) {
      SocketLogger.log('Emit command', type, value);
      socket.emit(SocketLogger.Event.COMMAND, {type: type, data: value || null});
    }

    function getClientId() {
      return client_id;
    }

    SocketLogger.log('Socket created ' + client_id);
    var statInterval = setInterval(function() {
      SocketLogger.log('Socket', client_id, 'connected', socket.connected, ', total in', stat.in, 'out', stat.out);
    }, 5000);

    return {
      stat: stat,
      id: getClientId(),
      log: getTypedDataEmit(SocketLogger.DataType.LOG),
      warn: getTypedDataEmit(SocketLogger.DataType.WARN),
      error: getTypedDataEmit(SocketLogger.DataType.ERR),
      command: command
    };
  },

  log: function () {
    if (debug) console.log((Array.prototype.slice.call(arguments)).join(' '));
  }
};

if (typeof module !== 'undefined') {
  module.exports = {SocketLogger: SocketLogger};
  SocketLogger.log('NodeJs exports created');
}

