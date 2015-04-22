var SocketLogger = require('../public/src/socket-logger').SocketLogger;
var ti = 0;


function createSocket() {
  var i = 0;
  var mt = 0;

  var socket = SocketLogger.getSocketClient('http://192.168.0.35:4004',
    function connectHandler(v) {
      if(v) emitTestMessage(v);
    }
  );

  function emitTestMessage(v) {
    if (!v) {
      clearTimeout(mt);
      return;
    }
    mt = setTimeout(function () {
      socket.log('testdata, send by this ' + (i++) + ', total send by instance test app ' + (ti++) + ', in messages per this ' + socket.stat.in);
      emitTestMessage(v);
    }, 500);
  };
}

createSocket();






