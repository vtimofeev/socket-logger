var SocketLogger = require('../public/src/socket-logger.sockjs-client').SocketLogger;
var ti = 0;
var limitMessages = 1000000;
var startTime  = Date.now();
var ended = false;

function createSocket() {
  var i = 0;
  var mt = 0;

  var socket = SocketLogger.getSocketClient('http://95.85.38.224:4004/ws', null, connectHandler);

  function connectHandler(v) {
    emitTestMessage(v);
    return;
    /*
     setTimeout(function () {
     if(!socket) return;
     console.log('Timeout destroy ' + socket);
     socket.destroy();
     socket = null;
     }, 5000);


     setTimeout(function () {
     console.log('Timeout create');
     if(socket) socket.destroy();
     socket = SocketLogger.getSocketClient('http://192.168.0.35:4004', connectHandler);
     }, 10000);
     */
  }

  function emitTestMessage(v) {
    if (!v || mt) {
      clearTimeout(mt);
    }

    if (!v) return;
    mt = setTimeout(function () {
      if(ended) return;
      if(ti < limitMessages) {
        socket.log('testdata, send by this ' + (i++) + ', total send by instance test app ' + (ti++) + ', in messages per this ' + socket.stat.in);
        emitTestMessage(v);
      } else {
        ended = true;
        console.log('The test is ended. Time ms, totalMessages : ' , (Date.now() - startTime) , ti);
      }
    }, 1000);
  };
}

for (var i = 0; i < 500; i++) {
  setTimeout(createSocket, i*20);
}







