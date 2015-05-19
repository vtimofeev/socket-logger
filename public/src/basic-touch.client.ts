///<reference path='../../../treeweb-server/application/r.d.ts'/>

// utils
//import _ = require('');

module BasicTouch {
    export class Touch {
        public element:Element = null;
        public startPointers:{[key:string]:IPointer} = null;
        public lastDifferences:IPointer[] = null;

        private dispatchedEvents:Array<string> = null;

        //public differenceObject:IEventDifference = { clientX : 0, clientY : 0, screenX : 0, screenY : 0, pageX : 0, pageY : 0, radiusX : 0, radiusY : 0 };
        private static metrics = ['clientX', 'clientY', 'screenX', 'screenY', 'pageX', 'pageY', 'radiusX', 'radiusY'];

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

        get isInEvent() {
            return !!this.startPointers;
        }

        getPointers(event:any):IPointer[] {
            return  event.touches || event.pointers || [event];
        }

        getPointerId(pointer:IPointer):any {
            return pointer.id || pointer.identifier;
        }

        startEventHandler(event:Event) {
            this.startPointers = this.startPointers || {};
            var pointers = this.getPointers(event);
            _.each(pointers, function (pointer:IPointer) {
                var id = this.getPointerId(pointer); // set default for mouse
                this.startPointers[id] = {id: id, clientX: pointer.clientX, clientY: pointer.clientY};
            }, this);
        }

        endEventHandler(event:Event) {
            this.startPointers = null;
        }

        sendEvent(name:string, se:Event) {
            var e:Event = document.createEvent('Event');
            e.initEvent(name, true, true);

            this.lastDifferences = this.getDifferenceFromStart(this.getPointers(se), this.startPointers);

            e[Manager.EventFields.SourceEvent] = se;
            e[Manager.EventFields.FirstDifference] = this.lastDifferences && this.lastDifferences.length?this.lastDifferences[0]:null;
            e[Manager.EventFields.Difference] = this.lastDifferences;

            _.extend(e, e[Manager.EventFields.FirstDifference]);
            console.log(e);
            this.element.dispatchEvent(e);
        }

        getDifferenceFromStart(pointers:IPointer[], startPointers:{[key:string]:IPointer}):IPointer[] {
            var result:IPointer[] = [];
            if (!pointers || !startPointers) return result;
            _.each(pointers, function(pointer) {
                var id:any = this.getPointerId(pointer);
                var startPointer:IPointer = startPointers[id];
                var pr:IPointer = {id: id, clientX: Math.round(pointer['clientX'] - startPointer['clientX']), clientY: Math.round(pointer['clientY'] - startPointer['clientY'])};
                result.push(pr);
            }, this);
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
        private static support = {pointerEvents: false, maxTouchPoints: 0}

        constructor() {
            Manager.support.pointerEvents = window['onpointermove'] !== undefined;
            Manager.support.maxTouchPoints = navigator.maxTouchPoints || 0;

            this.eventMap = Manager.browserSpecificEvents();
            window.addEventListener(this.eventMap.end, this.windowEndTouchHandler, false);
            window.addEventListener(this.eventMap.cancel, this.windowEndTouchHandler, false);
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
                touch.startEventHandler(e);
                t.internalTouchHandler(e, state, touch);
            }, false);

            touch.element.addEventListener(this.eventMap.move, function (e:Event) {
                var state = Manager.EventState.Move;
                if (touch.isInEvent) t.internalTouchHandler(e, state, touch);
            }, false);

            touch.element.addEventListener(this.eventMap.end, function (e:Event) {
                var state = Manager.EventState.End;
                t.internalTouchHandler(e, state, touch);
                touch.endEventHandler(e);
            }, false);
        }

        internalTouchHandler(e:Event, state:string, touch:Touch) {
            _.each([Manager.Event.Pan], function (type) {
                var touches:any[] = (<any> e).touches;
                var pointers:any[] = (<any> e).pointers;
                var instanceOfTouch = touches ? touches[0] : pointers ? pointers[0] : e;
                console.log(e);
                window['log']('ine: ', e.type, instanceOfTouch.clientX);
                if (touch.isListenedType(type)) touch.sendEvent(type + state, e);
            });
        }

        windowEndTouchHandler(e:Event) {
        }

        static browserSpecificStyle():string {
            return '';
        }

        static browserSpecificEvents():any {
            if (Manager.support.pointerEvents) {
                return {start: 'pointerdown', move: 'pointermove', end: 'pointerup', cancel: 'pointercancel'};
            }
            else if (Manager.support.maxTouchPoints === 0) {
                return {start: 'mousedown', move: 'mousemove', end: 'mouseup', cancel: 'mousecancel'};
            }
            else {
                return {start: 'touchstart', move: 'touchmove', end: 'touchend', cancel: 'touchcancel'};
            }
        }

        public static EventFields:any = {
            FirstDifference: 'fd',
            SecondDifference: 'sd',
            Difference: 'difference',
            SourceEvent: 'sourceEvent'
        };

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
        cancel:string;
    }

    interface IEventDifference {
        //screenX:number;
        //screenY:number;
        clientX:number;
        clientY:number;
        //pageX:number;
        //pageY:number;
        //radiusX:number;
        //radiusY:number;
    }

    interface IPointer {
        id:string;
        clientX:number;
        clientY:number;
    }

}


