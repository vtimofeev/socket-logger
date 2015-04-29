///<reference path='../../../treeweb-server/application/r.d.ts'/>

// utils
//import _ = require('');


module BasicTouch {
    export class Touch {
        public element:Element = null;
        private dispatchedEvents:Array<string> = null;
        public startEvents:Array<any> = null;

        //public differenceObject:IEventDifference = { clientX : 0, clientY : 0, screenX : 0, screenY : 0, pageX : 0, pageY : 0, radiusX : 0, radiusY : 0 };
        private static metrics = [ 'clientX', 'clientY', 'screenX', 'screenY', 'pageX', 'pageY', 'radiusX', 'radiusY'];

        constructor(element:Element) {
            if (!element) this.errorHandler('Cant create touch instance');
            this.element = element;
            this.initTouchStyles();
            m.add(this);
        }

        isListenedType(type:string):boolean {
            return this.dispatchedEvents ? this.dispatchedEvents.indexOf(type) > -1 : false;
        }

        listenTypes(types:string):Touch {
            if (!types) this.errorHandler('Cant listen not defined type');
            this.dispatchedEvents = (this.dispatchedEvents || []).concat(types.split(' '));
            return this;
        }

        startEvent(event:Event) {
            this.startEvents = this.startEvents || [];
            if (event) this.startEvents.push(event);
        }

        sendEvent(name:string, se:Event) {
            var e:Event = document.createEvent('Event');
            e.initEvent(name, true, true);
            e['sourceEvent'] = se;
            var difference = this.getDifferenceBy(se, this.startEvents && this.startEvents[0]?this.startEvents[0]:null  );
            e['diff'] = difference;
            _.extend(e, difference);
            console.log(e);
            this.element.dispatchEvent(e);
        }

        getDifferenceBy(currentEvent:any, startEvent:any):IEventDifference {
            var result:IEventDifference = { clientX : 0, clientY : 0, screenX : 0, screenY : 0, pageX : 0, pageY : 0, radiusX : 0, radiusY : 0 };
            var startEventData:any = (startEvent && startEvent.touches && startEvent.touches.length)?startEvent.touches[0]:startEvent;
            var currentEventData:any = (currentEvent && currentEvent.touches && currentEvent.touches.length)?currentEvent.touches[0]:currentEvent;
            window['log']('Get diff ' , currentEventData.clientX, startEventData.clientX, currentEvent.type, startEvent.type, startEventData === currentEventData);

            if(!startEventData || !currentEventData) return result;

            Touch.metrics.forEach(function(m) {
                result[m] = currentEventData[m] - startEventData[m];
            });

            return result;
        }


        errorHandler(value:string):void {
            console.error('Touch: ' + value);
        }

        initTouchStyles():void {
            return;
            var previousStyleString:string = this.element.getAttribute('style');
            var browserSpecificStyle:string = Manager.browserSpecificStyle();
            this.element.setAttribute('style', previousStyleString + browserSpecificStyle);
        }

        dispose() {
        }
    }

    class Manager {
        private touches:Array<Touch> = [];
        private startedTouches:Array<Touch> = [];
        private eventMap:IBrowserEventMap = null;

        constructor() {
            this.eventMap = Manager.browserSpecificEvents();
            window.addEventListener(this.eventMap.end, this.windowEndTouchHandler, false);
        }

        $get($element, eventTypes:string = 'pan swipe pinch rotate'):Touch {
            var t = new Touch($element.get(0));
            t.listenTypes(eventTypes);
            return t;
        }

        add(touch:Touch, state?:string):void {
            var array = this.getTouchCollection(state);
            if (array.indexOf(touch) === -1) {
                array.push(touch);
                if (!state) this.listenTouch(touch, true);
            }
        }

        remove(touch:Touch, state?:string):void {
            var array = this.getTouchCollection(state);
            var index = array.indexOf(touch);
            if (index != -1) {
                array.splice(index, 1);
                if (!state) this.listenTouch(touch, false);
            }
        }

        getTouchCollection(state:string):Array<Touch> {
            return state ? this.startedTouches : this.touches;
        }

        listenTouch(touch:Touch, enable:boolean) {
            var capture = false;
            var t:Manager = this;

            touch.element.addEventListener(this.eventMap.start, function (e:Event) {
                var state = Manager.EventState.Start;
                touch.startEvent(e);
                t.internalTouchHandler(e, state, touch);
            }, false);

            touch.element.addEventListener(this.eventMap.move, function (e:Event) {
                var state = Manager.EventState.Move;
                t.internalTouchHandler(e, state, touch);
            }, false);

            touch.element.addEventListener(this.eventMap.end, function (e:Event) {
                var state = Manager.EventState.End;
                t.internalTouchHandler(e, state, touch);
            }, false);
        }

        internalTouchHandler(e:Event, state:string, touch:Touch) {
            _.each([Manager.Event.Pan], function(type) {
                window['log']('ine: ' , e.type, e.touches[0].clientX);
                if (touch.isListenedType(type)) touch.sendEvent(type + state, e);
            });
        }

        windowEndTouchHandler(e:Event) {
        }

        static browserSpecificStyle():string {
            return '';
        }

        static browserSpecificEvents():any {
            return {
                start: 'touchstart',
                move: 'touchmove',
                end: 'touchend',
                cancel: 'touchcancel'
            };
        }

        public static EventState:any = {
            Start: 'start',
            Move: 'move',
            End: 'end',
            Cancel: 'cancel'
        };

        public static EventDirection:any = {
            LEFT: 'left',
            UP: 'up',
            DOWN: 'down',
            RIGHT: 'right'
        };

        public static Event:any = {
            Swipe: 'swipe',
            Pinch: 'pinch',
            Rotate: 'rotate',
            Pan: 'pan',
            Tap: 'tap',
            LongTap: 'longtap',
            DoubleTap: 'doubletap'
        };
    }

    var m:Manager = new Manager();
    export var $ = m.$get;

    interface IBrowserEventMap {
        start:string;
        move:string;
        end:string;
    }

    interface IEventDifference {
        screenX:number;
        screenY:number;
        clientX:number;
        clientY:number;
        pageX:number;
        pageY:number;
        radiusX:number;
        radiusY:number;
    }



}
