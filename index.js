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
    async exec(...params) {
        let $meta = params && params.length > 1 && params[params.length - 1];
        let methodName = $meta && $meta.method;
        if (!methodName) throw utBus.errors['bus.missingMethod']();
        let cache = $meta && $meta.cache;
        if (!cache) throw this.errors['cachePort.missingCache']({methodName});
        if (!['get', 'set', 'drop'].includes(cache.operation)) throw this.errors['cachePort.missingOperation']({methodName, operation: cache.operation});
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
            throw this.errors['cachePort.missingId']({methodName});
        }
        try {
            let fn = this.methods[segment] || this;
            let cached = await fn[cache.operation].call(this, {id, segment, value: params[0], ttl: cache.ttl});
            return cached && cached.item;
        } catch (e) {
            throw this.errors.cachePort(e);
        };
    }
    get({id, segment}) {
        return this.client.get({id, segment});
    }
    async set({id, segment, value, ttl = this.config.ttl}) {
        await this.client.set({id, segment}, value, ttl);
        return null;
    }
    async drop({id, segment}) {
        await this.client.drop({id, segment});
        return null;
    }
    handlers() {
        const handlers = {};
        if (Array.isArray(this.config.policy)) {
            this.config.policy.forEach(policyConfig => {
                const {options = {}, segment} = policyConfig;
                const policy = new Catbox.Policy(options, this.client, segment);
                handlers[segment] = {
                    get: ({id}) => policy.get(id),
                    set: ({id, value, ttl = this.config.ttl}) => policy.set(id, value, ttl),
                    drop: ({id}) => policy.drop(id)
                };
            });
        }
        return handlers;
    }
    stop(...params) {
        this.client && this.client.stop();
        return super.stop(...params);
    }
};
