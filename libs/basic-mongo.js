///<reference path='../../treeweb-server/application/r.d.ts'/>
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
// utils
var url = require('url');
var path = require('path');
var async = require('async');
var _ = require('lodash');
var mongodb = require('mongodb');
var events = require('events');
var logNs = require('./basic-log');
var logger = new logNs.BasicLog('BasicMongo');
var log = logger.log;
var errlog = logger.error;
var difflog = logger.logWithDiff;
exports.DbState = {
    NONE: 'none',
    CONNECTED: 'connected',
    PREPARE_DATA: 'prepare-data',
    READY: 'ready',
    ERROR: 'error'
};
var BasicMongo = (function (_super) {
    __extends(BasicMongo, _super);
    function BasicMongo(url, numOfClients, option) {
        if (numOfClients === void 0) { numOfClients = 1; }
        if (option === void 0) { option = null; }
        _super.call(this);
        this.url = null;
        this.clients = [];
        this.collections = {};
        _.bindAll(this, 'connectHandler');
        this.url = url;
    }
    BasicMongo.prototype.connect = function () {
        mongodb.MongoClient.connect(this.url, { native_parser: true }, this.connectHandler);
    };
    BasicMongo.prototype.getClient = function () {
        return this.defaultDb;
    };
    BasicMongo.prototype.getCollection = function (name) {
        return name ? this.collections[name] : null;
    };
    BasicMongo.prototype.connectHandler = function (error, db) {
        difflog('connect handler result %s, error %s', !!db, error);
        //if(error || !db) throw error || 'unknown db';
        this.clients.push(db);
        if (!this.defaultDb) {
            this.defaultDb = db;
            if (this.defaultDb) {
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
        this.emit(exports.DbState.CONNECTED);
    };
    BasicMongo.prototype.init = function (schemas) {
        var asyncCreateCollectionArray = [];
        var asyncSeriesEnsureIndexArray = [];
        var db = this.defaultDb;
        schemas.forEach(function (schema) {
            var name = schema.name;
            var collection = db.collection(name);
            this.collections[name] = collection;
            if (!collection) {
                var c = function createCollection(cb) {
                    difflog('Create collection ' + name);
                    db.createCollection(name, function (e, result) {
                        cb(e, result);
                    });
                };
                asyncCreateCollectionArray.push(c);
            }
            if (schema.keys) {
                var f = function createIndex(cb) {
                    var r = 0;
                    function createIndexHandler(e, result) {
                        if (e)
                            cb(e, result);
                        if (++r === (schema.keys.length - 1))
                            cb(e, result);
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
        async.series(dbFunctionArray, function (e, results) {
            if (!e) {
                difflog('Ready, collections created.');
            }
        });
        this.emit(exports.DbState.READY);
    };
    return BasicMongo;
})(events.EventEmitter);
exports.BasicMongo = BasicMongo;
module.exports.BasicMongo = BasicMongo;
//# sourceMappingURL=basic-mongo.js.map