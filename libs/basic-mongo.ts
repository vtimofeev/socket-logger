///<reference path='../../treeweb-server/application/r.d.ts'/>

// utils
var url = require('url');
var path = require('path');

import async = require('async');
import _ = require('lodash');
import mongodb = require('mongodb');

import events = require('events');
import util = require('util');

import logNs = require('./basic-log');
var logger = new logNs.BasicLog('BasicMongo');
var log = logger.log;
var errlog = logger.error;
var difflog = logger.logWithDiff;

export var DbState = {
    NONE: 'none',
    CONNECTED: 'connected',
    PREPARE_DATA: 'prepare-data',
    READY: 'ready',
    ERROR: 'error'
};

export interface IBasicMongoCollection {
    name: string;
    keys: Array<any>;
}

export class BasicMongo extends events.EventEmitter {
    private url:string = null;
    private clients:Array<mongodb.Db> = [];
    private collections:{[name:string]:mongodb.Collection} = {};
    private defaultDb:mongodb.Db;

    constructor(url:string, numOfClients:number = 1, option:any = null) {
        super();
        _.bindAll(this, 'connectHandler');
        this.url = url;
    }

    connect() {
        mongodb.MongoClient.connect(this.url, {native_parser:true}, this.connectHandler);
    }


    getClient():mongodb.Db {
        return this.defaultDb;
    }

    getCollection(name:string):mongodb.Collection {
        return name?this.collections[name]:null;
    }

    connectHandler(error:any, db:mongodb.Db) {
        difflog('connect handler result %s, error %s', !!db, error);
        //if(error || !db) throw error || 'unknown db';
        this.clients.push(db);
        if(!this.defaultDb) {
            this.defaultDb = db;
            if(this.defaultDb) {
                this.defaultDb.addListener('open', function () {
                    console.log('Mongodb open handler');
                });
                this.defaultDb.addListener('error', function () {
                    console.log('Mongodb error handler');
                });
                this.defaultDb.addListener('timeout', function () {
                    console.log('Mongodb timeout handler');
                });
                this.defaultDb.addListener('close', function () {
                    console.log('Mongodb close handler');
                });
            }
        }

        this.emit(DbState.CONNECTED);
    }

    init(schemas:Array<IBasicMongoCollection>):void {
        var asyncCreateCollectionArray = [];
        var asyncSeriesEnsureIndexArray = [];
        var db:mongodb.Db = this.defaultDb;

        schemas.forEach(function (schema:IBasicMongoCollection) {
            var name = schema.name;
            var collection = db.collection(name);
            this.collections[name] = collection;

            if(!collection) {
                var c = function createCollection(cb) {
                    difflog('Create collection ' + name);
                    db.createCollection(name, function(e:any, result) {
                        cb(e, result);
                    });
                };
                asyncCreateCollectionArray.push(c);
            }

            if(schema.keys)  {
                var f = function createIndex(cb) {
                    var r = 0;
                    function createIndexHandler(e, result) {
                        if(e) cb(e,result);
                        if(++r === (schema.keys.length - 1)) cb (e, result);
                    }

                    _.each(schema.keys, function (index) {
                        difflog('Create index ' + JSON.stringify(index));
                        collection.createIndex(index, null, createIndexHandler);
                    });
                };
                asyncSeriesEnsureIndexArray.push(f);
            }
        }, this);

        var dbFunctionArray = [].concat(asyncCreateCollectionArray, asyncSeriesEnsureIndexArray);
        difflog('Created collections preparing functions: ', dbFunctionArray.length);
        async.series(dbFunctionArray, function(e, results) {
            if(!e) {
                difflog('Ready, collections created. ');
            }
        });
        this.emit(DbState.READY);
    }
}

module.exports.BasicMongo = BasicMongo;


