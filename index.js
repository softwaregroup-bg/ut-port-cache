'use strict';
const Catbox = require('catbox');
const errors = require('./errors.json');
module.exports = ({utPort, registerErrors}) => class CachePort extends utPort {
    get defaults() {
        return {
            id: 'cache',
            client: {// catbox extension
                engine: require('catbox-memory'), // catbox default engine
                options: {} // catbox engine options
            },
            policy: [/* {options, segment}, {options, segment} */] // array of catbox policies
        };
    }
    init(...params) {
        Object.assign(this.errors, registerErrors(errors));
        const {engine, options} = this.config.client;
        this.client = new Catbox.Client(engine, options);
        return super.init(...params);
    }
    async start(...params) {
        await this.client.start();
        this.pull((msg = {}, $meta = {}) => {
            const method = $meta.method;
            if (!method) {
                throw this.bus.errors.missingMethod();
            }
            if (typeof this.config[method] !== 'function') {
                throw this.bus.errors.methodNotFound({params: {method}});
            }
            return this.config[method](msg, $meta)
                .catch(e => {
                    throw this.errors.cache(e);
                });
        });
        return super.start(...params);
    }
    handlers() {
        const handlers = {
            get: ({id, segment}) => this.client.get({id, segment}),
            set: ({id, segment, value, ttl = 0}) => this.client.set({id, segment}, value, ttl),
            drop: ({id, segment}) => this.client.drop({id, segment})
        };
        if (Array.isArray(this.config.policy)) {
            this.config.policy.forEach(policyConfig => {
                const {options = {}, segment} = policyConfig;
                const policy = new Catbox.Policy(options, this.client, segment);
                handlers[`${segment}.get`] = ({id}) => policy.get(id);
                handlers[`${segment}.set`] = ({id, value, ttl = 0}) => policy.set(id, value, ttl);
                handlers[`${segment}.drop`] = ({id}) => policy.drop(id);
            });
        }
        return handlers;
    }
    stop(...params) {
        this.client && this.client.stop();
        return super.stop(...params);
    }
};
