var express = require('express');
var app = express();
var http = require('http').Server(app);
var socketLogger = require('./socket-logger.sockjs-server')(http);

var argv = (require('commander')).version('0.0.2')
  .usage('[options]')
  .option('-p, --port [number]', 'Port number, default 4004', function(v) { return parseInt(v, 10); }, 4004)
  .option('-H, --host [string]', 'Ip address to listen, default *', '*')
  .parse(process.argv);

app.use(express.static('public'));


http.listen(argv.port, function(){
  console.log('listening on *:' + argv.port);
});
