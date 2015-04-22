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
var data

app.use(express.static('public'));

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
    RELOAD: 'reload',
    NEW: 'new',
    CLEAN: 'clean'
  },
  connectionHandler: function(socket){
    socket.on(SocketLogger.Event.DATA, SocketLogger.getDefaultHandler(socket, SocketLogger.sendMessageToAll));
    socket.on(SocketLogger.Event.COMMAND, SocketLogger.getDefaultHandler(socket, SocketLogger.sendCommandToAll));

    socket.on('disconnect' , function() {
      sockets = _.without(sockets, socket);
      SocketLogger.updateSockets();
    });
  },
  updateSockets: function(){
    var data =  _.map(sockets, function(socket) { return socket.info; });
    SocketLogger.sendMessageToAll({type: SocketLogger.DataType.SOCKETS, data: data });
    console.log('Update sockets ', data);

  },
  sendMessageToAll: function(message) {
    io.emit(SocketLogger.Event.DATA, message);
  },
  sendCommandToAll: function(message) {
    io.emit(SocketLogger.Event.COMMAND, message);
  },
  getDefaultHandler: function(socket, sendToAll) {
    return function(message) {
      var type = message ? message.type : null;
      switch (type) {
        case SocketLogger.DataType.INFO:
        {
          socket.info = message.data;
          if (sockets.indexOf(socket) === -1) {
            sockets.push(socket);
            SocketLogger.updateSockets();
          }
          break;
        }
        default:
        {
          if (message && message.type) message.client_id = socket.info.client_id;
          sendToAll(message);
          break;
        }
      }
    };
  }
};

io.on('connection', SocketLogger.connectionHandler);

http.listen(argv.port, function(){
  console.log('listening on *:' + argv.port);
});