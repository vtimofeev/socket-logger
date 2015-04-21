var $root = $('.root');
var $status = $('.status');
var $clean = $('.clean');
var $sockets = $('.sockets');
var $log = $('.log');
var waitTimeout = 0;
var rootScroll = 0;
var ti = 0;

var socket = SocketLogger.getSocketClient('http://192.168.0.35:4004', socketConnectHandler, socketMessageHandler);

function socketConnectHandler(value) {
  $status.html(value ? 'connected' : 'disconnected');
}

function socketMessageHandler(message) {
  var type = message ? message.type : null;
  var EventType = SocketLogger.EventType;
  switch (type) {
    case EventType.SOCKETS:
      $sockets.html(_.map(message.data || [], function (item) { return 'client_id: ' + item.client_id + ', ua ' + item.ua; }).join('<br />'));
      $log.html('');
      break;
    case EventType.CLEAN:
      $log.html('');
      break;
    default:
      ti++;
      //if(ti%100 === 0) $log.prepend(ti + ', ' + message.data + '<br/> ');
      $log.prepend(message.data + '<br/> ');
      break;
  }
}


$clean.bind('click', function () {
  $log.html('');
  socket.emit({type: 'clean', data: null});
});
$status.html('none');

function wait() {
  waitTimeout = _.delay(function () {
    socket.emit({type: 'data', data: 'wait'});
    wait();
  }, 10000);
}

function scroll() {
  waitTimeout = _.delay(function () {
    var tempScroll = $root.scrollTop();
    if (tempScroll === rootScroll) return;
    rootScroll = tempScroll;
    //socket.emit('message', {type: 'data', data: 'scroll ' + Math.round(rootScroll)});
    scroll();
  }, 100);
}

$root.bind('touchstart touchmove touchend touchcancel ' +
           'pointerdown pointerenter pointerleave pointermove pointerout pointerover ' +
           'mouseup mousedown mouseenter mouseleave mousemove mouseout mouseover mouseup ' +
           'swipe swipeLeft swipeRight swipeUp swipeDown ' +
           'doubleTap tap singleTap longTap',
  defaultHandler
);

$root.bind('scroll', function (e) {
  //e.preventDefault();
  //defaultHandler(e);
});

$root.bind('pointerout', function () {
  _.delay(function () {
      socket.emit({type: 'data', data: 'animation start'});
      $root.scrollTop(0);

      $root.animate({scrollTop: 100}, 500, function () {
        socket.emit({type: 'data', data: 'animation complete'});
      });
      scroll();
    },
    3000);
});

var el = $root.get(0);
el.addEventListener("MSGestureStart", defaultHandler, false);
el.addEventListener("MSGestureEnd", defaultHandler, false);
el.addEventListener("MSGestureChange", defaultHandler, false);
el.addEventListener("MSInertiaStart", defaultHandler, false);
el.addEventListener("MSGestureTap", defaultHandler, false);
el.addEventListener("MSGestureHold", defaultHandler, false);

function defaultHandler(e) {
  socket.emit({type: 'data', data: e.type + ', clientX, clientY: ' + Math.round(e.clientX) + ', ' + Math.round(e.clientY) + ', scroll ' + $root.scrollTop()});
  scroll();
}


