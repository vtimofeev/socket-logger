var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var _ = require('underscore');

var argv = (require('commander')).version('0.0.2')
  .usage('[options]')
  .option('-p, --port [number]', 'Port number, default 4004', function(v) { return parseInt(v, 10); }, 4004)
  .option('-H, --host [string]', 'Ip address to listen, default *', '*')
  .parse(process.argv);

var sockets = [];

var SocketEvent = {
  MESSAGE: 'message'
};

var SocketEventType = {
  INFO: 'info',
  DATA: 'data',
  SOCKETS: 'sockets',
  CLEAN: 'clean'
};

app.use(express.static('public'));

function sendMessageToAll(message) {
  io.emit(SocketEvent.MESSAGE, message);
}

function updateSockets() {
  sendMessageToAll({ type: SocketEventType.SOCKETS, data:  _.map(sockets, function(socket) { return socket.info; }) });
}

io.on('connection', function(socket){
  socket.on(SocketEvent.MESSAGE, function(message) {
    var type = message?message.type:null;

    switch(type) {
      case SocketEventType.INFO: {
        socket.info = message.data;
        sockets.push(socket);
        updateSockets();
        break;
      }
      default: {
        if(message && message.type) message.client_id = socket.info.client_id;
        sendMessageToAll(message);
        break;
      }
    }
  });

  socket.on('disconnect' , function() {
    sockets = _.without(sockets, socket);
    updateSockets();
  });
});

http.listen(argv.port, function(){
  console.log('listening on *:' + argv.port);
});