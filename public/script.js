var $root = $('.root');
var $status = $('.socketStatus');
var $id = $('.socketId');
var $clean = $('.clean');
var $sockets = $('.sockets');

var $log = $('.logContainer');
var waitTimeout = 0;
var rootScroll = 0;
var ti = 0;
var filtredClientId = '';
var socket = SocketLogger.getSocketClient('http://192.168.0.35:4004', socketConnectHandler, socketMessageHandler, socketCommandHandler);

function socketConnectHandler(value) {
  $id.html(socket.id);
  $status.html(value ? 'connected' : 'disconnected');
}

function socketMessageHandler(message) {
  var type = message ? message.type : null;
  var DataType = SocketLogger.DataType;
  switch (type) {
    case DataType.SOCKETS:
      $sockets.html('');
      var $li_items = [];
      var items = _.union([{client_id: null}], message.data);

      var $ul = _.reduce(
        _.map(items || [],
          function mapItems(item) {
            var uaData = UAParser(item.ua);
            console.log(item.ua, uaData);
            var content = item.client_id?('id: ' + item.client_id + ', ' + uaData.browser.name + ' ' + uaData.browser.version + ', '  + uaData.os.name + ', ' + item.href):'Очистить';
            var $li = $('<div>' + content + '</div>');
            $li.bind('click', $.proxy(getFilterHandler(item, $li_items), $li));
            $li_items.push($li)
            var isSelected = item.client_id === filtredClientId;
            $li.toggleClass('selected', isSelected);
            return $li;
          }),
        function reduceItems($s, $i) {
          $s.append($i);
          return $s;
        },
        $('<div></div>')
      );

      var hasFilter = _.filter(message.data, function(item) { return item.client_id === filtredClientId });
      setFilter(hasFilter?filtredClientId:null);
      $sockets.append($ul);
      break;
    default:
      ti++;
      var add = (filtredClientId && filtredClientId === message.client_id) || !filtredClientId;
      if(add) $log.prepend($('<div class="' + message.type + '">' + message.data + '</div>'));
      break;
  }
}

function socketCommandHandler(message) {
  var type = message ? message.type : null;
  var CommandType = SocketLogger.CommandType;

  var execute = (filtredClientId && filtredClientId === message.client_id) || !filtredClientId;
  if(!execute) return;

  switch(type) {
    case CommandType.CLEAN:
      $log.html('');
      break;
  }

  $log.prepend($('<div class="command">' + type + '</div>'));
}

function getFilterHandler(item, $li_items) {
  return function() {
    _.each($li_items, function($li) {
      $li.toggleClass('selected', false);
    });
    setFilter(item.client_id);
    if(item.client_id) this.toggleClass('selected', true);
  };
}

function setFilter(id) {
  if(filtredClientId === id) return;
  filtredClientId = id;
  $log.html('');
}

$clean.bind('click', function () {
  $log.html('');
  socket.command(SocketLogger.CommandType.CLEAN);
});
$status.html('none');


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
      socket.warn('animation start');
      $root.scrollTop(0);
      $root.animate({scrollTop: 100}, 500, function () {
        socket.warn('animation complete');
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
  socket.log(e.type , 'clientX, clientY' , Math.round(e.clientX) , Math.round(e.clientY) , ' scroll ' , $root.scrollTop());
  scroll();
}


