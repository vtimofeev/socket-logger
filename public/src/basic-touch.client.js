///<reference path='../../../treeweb-server/application/r.d.ts'/>
// utils
//import _ = require('');
var BasicTouch;
(function (BasicTouch) {
    var Touch = (function () {
        function Touch(element) {
            this.element = null;
            this.dispatchedEvents = null;
            this.startEvents = null;
            if (!element)
                this.errorHandler('Cant create touch instance');
            this.element = element;
            this.initTouchStyles();
            m.add(this);
        }
        Touch.prototype.isListenedType = function (type) {
            return this.dispatchedEvents ? this.dispatchedEvents.indexOf(type) > -1 : false;
        };
        Touch.prototype.listenTypes = function (types) {
            if (!types)
                this.errorHandler('Cant listen not defined type');
            this.dispatchedEvents = (this.dispatchedEvents || []).concat(types.split(' '));
            return this;
        };
        Touch.prototype.startEvent = function (event) {
            this.startEvents = this.startEvents || [];
            if (event)
                this.startEvents.push(event);
        };
        Touch.prototype.sendEvent = function (name, se) {
            var e = document.createEvent('Event');
            e.initEvent(name, true, true);
            e['sourceEvent'] = se;
            var difference = this.getDifferenceBy(se, this.startEvents && this.startEvents[0] ? this.startEvents[0] : null);
            e['diff'] = difference;
            _.extend(e, difference);
            console.log(e);
            this.element.dispatchEvent(e);
        };
        Touch.prototype.getDifferenceBy = function (currentEvent, startEvent) {
            var result = { clientX: 0, clientY: 0, screenX: 0, screenY: 0, pageX: 0, pageY: 0, radiusX: 0, radiusY: 0 };
            var startEventData = (startEvent && startEvent.touches && startEvent.touches.length) ? startEvent.touches[0] : startEvent;
            var currentEventData = (currentEvent && currentEvent.touches && currentEvent.touches.length) ? currentEvent.touches[0] : currentEvent;
            window['log']('Get diff ', currentEventData.clientX, startEventData.clientX, currentEvent.type, startEvent.type, startEventData === currentEventData);
            if (!startEventData || !currentEventData)
                return result;
            Touch.metrics.forEach(function (m) {
                result[m] = currentEventData[m] - startEventData[m];
            });
            return result;
        };
        Touch.prototype.errorHandler = function (value) {
            console.error('Touch: ' + value);
        };
        Touch.prototype.initTouchStyles = function () {
            return;
            var previousStyleString = this.element.getAttribute('style');
            var browserSpecificStyle = Manager.browserSpecificStyle();
            this.element.setAttribute('style', previousStyleString + browserSpecificStyle);
        };
        Touch.prototype.dispose = function () {
        };
        //public differenceObject:IEventDifference = { clientX : 0, clientY : 0, screenX : 0, screenY : 0, pageX : 0, pageY : 0, radiusX : 0, radiusY : 0 };
        Touch.metrics = ['clientX', 'clientY', 'screenX', 'screenY', 'pageX', 'pageY', 'radiusX', 'radiusY'];
        return Touch;
    })();
    BasicTouch.Touch = Touch;
    var Manager = (function () {
        function Manager() {
            this.touches = [];
            this.startedTouches = [];
            this.eventMap = null;
            this.eventMap = Manager.browserSpecificEvents();
            window.addEventListener(this.eventMap.end, this.windowEndTouchHandler, false);
        }
        Manager.prototype.$get = function ($element, eventTypes) {
            if (eventTypes === void 0) { eventTypes = 'pan swipe pinch rotate'; }
            var t = new Touch($element.get(0));
            t.listenTypes(eventTypes);
            return t;
        };
        Manager.prototype.add = function (touch, state) {
            var array = this.getTouchCollection(state);
            if (array.indexOf(touch) === -1) {
                array.push(touch);
                if (!state)
                    this.listenTouch(touch, true);
            }
        };
        Manager.prototype.remove = function (touch, state) {
            var array = this.getTouchCollection(state);
            var index = array.indexOf(touch);
            if (index != -1) {
                array.splice(index, 1);
                if (!state)
                    this.listenTouch(touch, false);
            }
        };
        Manager.prototype.getTouchCollection = function (state) {
            return state ? this.startedTouches : this.touches;
        };
        Manager.prototype.listenTouch = function (touch, enable) {
            var capture = false;
            var t = this;
            touch.element.addEventListener(this.eventMap.start, function (e) {
                var state = Manager.EventState.Start;
                touch.startEvent(e);
                t.internalTouchHandler(e, state, touch);
            }, false);
            touch.element.addEventListener(this.eventMap.move, function (e) {
                var state = Manager.EventState.Move;
                t.internalTouchHandler(e, state, touch);
            }, false);
            touch.element.addEventListener(this.eventMap.end, function (e) {
                var state = Manager.EventState.End;
                t.internalTouchHandler(e, state, touch);
            }, false);
        };
        Manager.prototype.internalTouchHandler = function (e, state, touch) {
            _.each([Manager.Event.Pan], function (type) {
                var instanceOfTouch = e.touches ? e.touches[0] : e.pointers ? e.pointers[0] : e;
                window['log']('ine: ', e.type, instanceOfTouch.clientX);
                if (touch.isListenedType(type))
                    touch.sendEvent(type + state, e);
            });
        };
        Manager.prototype.windowEndTouchHandler = function (e) {
        };
        Manager.browserSpecificStyle = function () {
            return '';
        };
        Manager.browserSpecificEvents = function () {
            return {
                start: 'pointerdown',
                move: 'pointermove',
                end: 'pointerup',
                cancel: 'pointercancel'
            };
            return {
                start: 'touchstart',
                move: 'touchmove',
                end: 'touchend',
                cancel: 'touchcancel'
            };
        };
        Manager.EventState = {
            Start: 'start',
            Move: 'move',
            End: 'end',
            Cancel: 'cancel'
        };
        Manager.EventDirection = {
            LEFT: 'left',
            UP: 'up',
            DOWN: 'down',
            RIGHT: 'right'
        };
        Manager.Event = {
            Swipe: 'swipe',
            Pinch: 'pinch',
            Rotate: 'rotate',
            Pan: 'pan',
            Tap: 'tap',
            LongTap: 'longtap',
            DoubleTap: 'doubletap'
        };
        return Manager;
    })();
    var m = new Manager();
    BasicTouch.$ = m.$get;
})(BasicTouch || (BasicTouch = {}));
//# sourceMappingURL=basic-touch.client.js.map