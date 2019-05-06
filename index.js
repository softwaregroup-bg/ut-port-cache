'use strict';
const Catbox = require('catbox');
const errors = require('./errors.json');
const url = require('url');

module.exports = ({utPort, registerErrors, utBus}) => class CachePort extends utPort {
    get defaults() {
        return {
            type: 'cache',
            client: {// catbox extension
                options: {} // catbox engine options
            },
            namespace: ['cache'],
            policy: [/* {options, segment}, {options, segment} */] // array of catbox policies
        };
    }
    init(...params) {
        Object.assign(this.errors, registerErrors(errors));
        const {engine, options} = this.config.client;
        this.client = new Catbox.Client(engine || require('catbox-memory'), options);
        return super.init(...params);
    }
    async start(...params) {
        await this.client.start();
        this.pull(this.exec);
        return super.start(...params);
    }
    exec(...params) {
        let $meta = params && params.length > 1 && params[params.length - 1];
        let methodName = $meta && $meta.method;
        if (!methodName) throw utBus.errors['bus.missingMethod']();
        let cache = $meta && $meta.cache;
        if (!cache) throw this.errors['cachePort.missingCache']({params: {methodName}});
        if (!['get', 'set', 'drop', 'testAndSet', 'touch'].includes(cache.operation)) throw this.errors['cachePort.missingOperation']({params: {methodName, operation: cache.operation}});
        let segment = cache.key && cache.key.segment;
        if (!segment) {
            let cacheParams = cache.key && cache.key.params;
            if (cacheParams && typeof cacheParams === 'object') {
                cacheParams = new url.URLSearchParams(cacheParams);
                cacheParams.sort();
            }
            segment = cacheParams ? methodName + '?' + cacheParams.toString() : methodName;
        }
        let id = cache.key && cache.key.id;
        if (id == null) {
            throw this.errors['cachePort.missingId']({params: {methodName}});
        }
        try {
            if (!this.methods[segment]) this.methods[segment] = this.createPolicy({segment});
            let value = params[0];
            if (value === undefined && cache.operation === 'set') cache.operation = 'drop';
            return this.methods[segment][cache.operation].call(this, {id, value, ttl: cache.ttl});
        } catch (e) {
            throw this.errors.cachePort(e);
        };
    }
    createPolicy({options, segment}) {
        const policy = new Catbox.Policy({
            ...options,
            expiresIn: this.config.ttl,
            getDecoratedValue: true
        }, this.client, segment);
        return {
            async get({id}) {
                const result = await policy.get(id);
                return result.cached === null ? null : result.cached.item;
            },
            async set({id, value, ttl = 0}) {
                await policy.set(id, value, ttl);
                return value;
            },
            async drop({id}) {
                await policy.drop(id);
                return null;
            },
            async testAndSet({id, value, ttl = 0}) { // set and return previous value
                const result = await policy.get(id);
                await policy.set(id, value, ttl);
                return result.cached === null ? null : result.cached.item;
            },
            async touch({id, value, ttl = this.config.ttl}) { // get or set
                const policy = new Catbox.Policy({
                    ...options,
                    expiresIn: ttl,
                    getDecoratedValue: true,
                    generateTimeout: false,
                    generateFunc: (...params) => typeof value === 'function' ? value(...params) : value
                }, this.client, segment);
                const result = await policy.get(id);
                return result.cached === null ? null : result.cached.item;
            }
        };
    }
    handlers() {
        const handlers = {};
        if (Array.isArray(this.config.policy)) {
            this.config.policy.forEach(({options, segment}) => {
                handlers[segment] = this.createPolicy({options, segment});
            });
        }
        return handlers;
    }
    stop(...params) {
        this.client && this.client.stop();
        return super.stop(...params);
    }
};
