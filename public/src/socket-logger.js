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
    var statInterval = setInterval(function() {
      SocketLogger.log('Socket ' , client_id, ' total in ', stat.in, ' out ', stat.out);
    }, 5000);

    socket.on('connect', function () {
      SocketLogger.log('Socket connected');
      emit({type: SocketLogger.DataType.INFO, data: {client_id: client_id, ua: navigator.userAgent}});
      if (connectHandler) connectHandler(true);
    });

    socket.on(SocketLogger.Event.DATA, function (message) {
      stat.in++;
      if (messageHandler) messageHandler(message, SocketLogger.Event.DATA);
    });

    socket.on(SocketLogger.Event.COMMAND, function (message) {
      stat.in++;
      var handler = commandHandler || messageHandler;
      if (handler) handler(message, SocketLogger.Event.COMMAND);
    });

    socket.on('disconnect', function () {
      if (connectHandler) connectHandler(false);
      SocketLogger.log('Socket disconnected');
    });

    socket.on('error', function () {
      if (connectHandler) connectHandler(false);
      SocketLogger.log('Socket error');
    });

    function emit(data) {
      stat.out++;
      //SocketLogger.log('Emit', data);
      socket.emit(SocketLogger.Event.DATA, data);
    }

    function command(type, value) {
      SocketLogger.log('Command emit', type, value);
      socket.emit(SocketLogger.Event.COMMAND, {type: type, data: value || null});
    }

    function getTypedDataEmit(type) {
      return function() {
        var value = (Array.prototype.slice.call(arguments)).join(', ');
        //SocketLogger.log('Typed emit', type, value);
        emit({type: type, data: value})
      }
    }

    SocketLogger.log('Socket inited');

    return {
      stat: stat,
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

