
export var BasicLogMode = {
    ALL: 3,
    WARN: 2,
    ERROR: 1
};

export class BasicLog {
    private name:string;
    private mode:number;
    private startTimestamps:{[key:string]:number} = {};
    private lastTimestamps:{[key:string]:number} = {};

    constructor(name:string, mode:number = BasicLogMode.ALL) {
        this.name = name;
        this.startTimestamps[this.name] = this.now;
        this.lastTimestamps[this.name] = this.now;
        this.mode = mode;

        this.log = this.log.bind(this);
        this.logWithDiff = this.logWithDiff.bind(this);
    }

    public log(...args:any[]) {
        if(this.mode >= BasicLogMode.ALL) console.log('[' + this.name + '] ' + args.join(', '));
    }

    public logWithDiff(...args:any[]) {
        if(this.mode >= BasicLogMode.ALL) {
            console.log('[' + this.name + '] time ' + this.diff + 'ms, last ' + this.lastDiff  + 'ms '  + args.join(', '));
        }
    }

    public error(...args:any[]) {
        if(this.mode >= BasicLogMode.ERROR) console.log('[' + this.name + '] ' + args.join(', '));
    }

    public startByName(value:string):void {
        this.startTimestamps[value] = this.now;
    }

    public diffByName(value:string):number {
        var startTime = this.startTimestamps[value]?this.startTimestamps[value]:0;
        return this.now - startTime;
    }

    public get lastDiff():number
    {
        var result = this.now - this.lastTimestamps[this.name];
        this.lastTimestamps[this.name] = this.now;
        return result;
    }


    public get diff():number
    {
        return this.now - this.startTimestamps[this.name];
    }

    public get now():number
    {
        return Date.now();
    }
}
