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
      socket.emit({type: SocketLogger.EventType.DATA, data: 'testdata,' + (i++) + ',' + (ti++) + ', in per socket ' + (socket.stat.in) + ',' + (socket.stat.out)} );
      emitTestMessage(v);
    }, 500);
  };
}






