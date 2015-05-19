///<reference path='../../../treeweb-server/application/r.d.ts'/>
// utils
//import _ = require('');
var BasicTouch;
(function (BasicTouch) {
    var Touch = (function () {
        function Touch(element) {
            this.element = null;
            this.startPointers = null;
            this.lastDifferences = null;
            this.dispatchedEvents = null;
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
        Object.defineProperty(Touch.prototype, "isInEvent", {
            get: function () {
                return !!this.startPointers;
            },
            enumerable: true,
            configurable: true
        });
        Touch.prototype.getPointers = function (event) {
            return event.touches || event.pointers || [event];
        };
        Touch.prototype.getPointerId = function (pointer) {
            return pointer.id || pointer.identifier;
        };
        Touch.prototype.startEventHandler = function (event) {
            this.startPointers = this.startPointers || {};
            var pointers = this.getPointers(event);
            _.each(pointers, function (pointer) {
                var id = this.getPointerId(pointer); // set default for mouse
                this.startPointers[id] = { id: id, clientX: pointer.clientX, clientY: pointer.clientY };
            }, this);
        };
        Touch.prototype.endEventHandler = function (event) {
            this.startPointers = null;
        };
        Touch.prototype.sendEvent = function (name, se) {
            var e = document.createEvent('Event');
            e.initEvent(name, true, true);
            this.lastDifferences = this.getDifferenceFromStart(this.getPointers(se), this.startPointers);
            e[Manager.EventFields.SourceEvent] = se;
            e[Manager.EventFields.FirstDifference] = this.lastDifferences && this.lastDifferences.length ? this.lastDifferences[0] : null;
            e[Manager.EventFields.Difference] = this.lastDifferences;
            _.extend(e, e[Manager.EventFields.FirstDifference]);
            console.log(e);
            this.element.dispatchEvent(e);
        };
        Touch.prototype.getDifferenceFromStart = function (pointers, startPointers) {
            var result = [];
            if (!pointers || !startPointers)
                return result;
            _.each(pointers, function (pointer) {
                var id = this.getPointerId(pointer);
                var startPointer = startPointers[id];
                var pr = { id: id, clientX: Math.round(pointer['clientX'] - startPointer['clientX']), clientY: Math.round(pointer['clientY'] - startPointer['clientY']) };
                result.push(pr);
            }, this);
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
            Manager.support.pointerEvents = window['onpointermove'] !== undefined;
            Manager.support.maxTouchPoints = navigator.maxTouchPoints || 0;
            this.eventMap = Manager.browserSpecificEvents();
            window.addEventListener(this.eventMap.end, this.windowEndTouchHandler, false);
            window.addEventListener(this.eventMap.cancel, this.windowEndTouchHandler, false);
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
                touch.startEventHandler(e);
                t.internalTouchHandler(e, state, touch);
            }, false);
            touch.element.addEventListener(this.eventMap.move, function (e) {
                var state = Manager.EventState.Move;
                if (touch.isInEvent)
                    t.internalTouchHandler(e, state, touch);
            }, false);
            touch.element.addEventListener(this.eventMap.end, function (e) {
                var state = Manager.EventState.End;
                t.internalTouchHandler(e, state, touch);
                touch.endEventHandler(e);
            }, false);
        };
        Manager.prototype.internalTouchHandler = function (e, state, touch) {
            _.each([Manager.Event.Pan], function (type) {
                var touches = e.touches;
                var pointers = e.pointers;
                var instanceOfTouch = touches ? touches[0] : pointers ? pointers[0] : e;
                console.log(e);
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
            if (Manager.support.pointerEvents) {
                return { start: 'pointerdown', move: 'pointermove', end: 'pointerup', cancel: 'pointercancel' };
            }
            else if (Manager.support.maxTouchPoints === 0) {
                return { start: 'mousedown', move: 'mousemove', end: 'mouseup', cancel: 'mousecancel' };
            }
            else {
                return { start: 'touchstart', move: 'touchmove', end: 'touchend', cancel: 'touchcancel' };
            }
        };
        Manager.support = { pointerEvents: false, maxTouchPoints: 0 };
        Manager.EventFields = {
            FirstDifference: 'fd',
            SecondDifference: 'sd',
            Difference: 'difference',
            SourceEvent: 'sourceEvent'
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