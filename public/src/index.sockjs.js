var app = function App() {
  'use strict';
  var $root = $('.root');
  var $status = $('.socketStatus');
  var $count = $('.clientsCount');
  var $id = $('.socketId');
  var $sockets = $('.sockets');
  var $log = $('.logContainer');
  var $socketsButton = $('.socketsButton');
  var $cleanButton = $('.cleanButton');
  var $testButton = $('.testButton');
  var $socketsFromTo = $('.clientsFromTo');

  var $socketsContainer = $('.socketsContainer');
  var waitTimeout = 0;
  var rootScroll = 0;
  var ti = 0;
  var filtredClientId = '';
  var socket = SocketLogger.getSocketClient('http://' + location.hostname + (location.port?':' + location.port:'') + '/ws', { listener: true }, socketConnectHandler, socketMessageHandler, socketCommandHandler);

  var countLines = 0;
  var clientsOffset = 0;

  var data = [];
  var clients = [];
  var clientsCount = 0;

  $socketsButton.bind('click', function() {
    $socketsContainer.toggle();
  });

  $testButton.bind('click', function() {
    $root.toggle();
  });

  $root.toggle(false);

  function socketConnectHandler(value) {
    $id.html(socket.id);
    $status.html(value ? 'connected' : 'disconnected');
  }

  function socketMessageHandler(msg) {
    var type = msg ? msg.type : null;
    var DataType = SocketLogger.DataType;
    switch (type) {
      default:
        ti++;
        //data[msg.client_id] = data[msg.client_id]?data[msg.client_id]:[];
        data.push(msg);
        var add = (filtredClientId && filtredClientId === msg.client_id) || !filtredClientId;
        if (add) addMessage(msg);
        break;
    }
  }



  function socketCommandHandler(message) {
    var type = message ? message.type : null;
    var CommandType = SocketLogger.CommandType;

    var execute = (filtredClientId && filtredClientId === message.client_id) || !filtredClientId;
    if (!execute) return;


    switch (type) {
      case CommandType.CLEAN:
        data = {};
        showData();
        break;
      case CommandType.INIT:
        if(message.data && message.data.logs) {
          data = message.data.logs;
          showData();
        }

        if(message.data && message.data.clients) {
          clients = message.data.clients;
          showClients();
          showData();
        }

        if(message.data && message.data.clientsCount) {
          clientsCount = message.data.clientsCount;
          showCount();
        }


    }

    $log.prepend($('<div class="command">' + type + '</div>'));
  }

  function addMessage(message) {
    var date = new Date(message.time);
    countLines++;
    $log.prepend($('<div class="' + message.type + '">' + date.toLocaleTimeString() + ' '  + message.data + '</div>'));
  }

  function showCount() {
    $count.html(clientsCount);
    $socketsFromTo.html('');
    var i = 0, size = 10, result = 0, $items = [], maxIteration = 10;
    function deselect() { _.each($items, function($i) { $i.toggleClass('selected', false) })};
    function getItemHandler($i, from) {
      return function() { clientsOffset = from; deselect(); $i.toggleClass('selected', true); getClientsFrom(from || 0); }
    }

    while(i < maxIteration && (result = (clientsCount - i * size)) > 0) {
      var fromToItemInstance = $('<span class="fromTo"> ' + result + ' </span> ');
      fromToItemInstance.bind('click', getItemHandler(fromToItemInstance, i*size));
      $items.push(fromToItemInstance);
      $socketsFromTo.append(fromToItemInstance);
      i++;
    }
  }
  function getClientsFrom(value) {
    console.log(value);
    socket.command(SocketLogger.CommandType.GET_CLIENTS, value);
  }

  function showClients() {
    $sockets.html('');
    var $li_items = [];
    var items = _.union([{client_id: null}], clients);

    var $ul = _.reduce(
      _.map(items || [],
        function mapItems(item, index) {
          var uaData = UAParser(item.ua);
          //console.log(JSON.stringify(uaData));
          var date = new Date(item.time);
          var content = item.client_id ? ( (index + clientsOffset) + ': ' + 'id: ' + item.client_id + ', started at ' + date.toLocaleTimeString() + ', ' + uaData.browser.name + ' ' + uaData.browser.version + ', ' + uaData.os.name + ', ' + item.href) : 'Очистить';
          var $li = $('<div>' + content + '</div>');
          $li.bind('click', $.proxy(getFilterHandler(item, $li_items), $li));
          $li_items.push($li);
          var isShow = !!item.client_id;
          var isSelected = item.client_id === filtredClientId;

          $li.css({'display': (isShow ? 'block' : 'none') });
          $li.toggleClass('selected', isSelected);
          var isActive = item.active;
          $li.toggleClass('active', isActive);

          return $li;
        }),
      function reduceItems($s, $i) {
        $s.append($i);
        return $s;
      },
      $('<div></div>')
    );

    var hasFilter = _.filter(clients, function (item) { return item.client_id === filtredClientId });
    $sockets.append($ul);
    setFilter(hasFilter ? filtredClientId : null);
  }

  function showData() {
    $log.html('');
    var items = [];
    var maxCollectionSize = 10;
    var maxFullSize = 100;

    /**
    _.each(data, function(collection, key) {
      var addCollection = filtredClientId === key || !filtredClientId;
      if(addCollection) {
        collection.splice(collection.length - maxCollectionSize);
        items.push(collection);
      }
    });
    */

    _.each(data, function(message) {
      var add = filtredClientId === message.client_id || !filtredClientId;
      if(add) {
        items.push(message);
      }
    });

    items = _.chain(items).sortBy(function(m) {return m.time; }).value();
    if (items.length > maxFullSize) items.splice(items.length - maxFullSize);
    countLines = items.length;
    items.forEach(function(m) { addMessage(m) });
  };


  function getFilterHandler(item, $li_items) {
    return function () {
      _.each($li_items, function ($li) {
        $li.toggleClass('selected', false);
      });
      if (item.client_id) this.toggleClass('selected', true);
      setFilter(item.client_id);

    };
  }

  function setFilter(id) {
    if (filtredClientId === id) return;
    filtredClientId = id;
    $sockets.find('div > div > div > div').eq(0).html('Remove selected ' + filtredClientId).css({'display': (filtredClientId ? 'block' : 'none')});
    showData();
  }

  $cleanButton.bind('click', function () {
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
    socket.log(e.type, 'clientX, clientY', Math.round(e.clientX), Math.round(e.clientY), ' scroll ', $root.scrollTop());
    scroll();
  }

  // Api methods
  return {};
}();
