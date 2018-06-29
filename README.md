# UT-PORT-CACHE

ut-port-cache is a multi-strategy object caching port.
It is a convinient wrapper for [catbox](https://github.com/hapijs/catbox) which in the same time provides the standard mechanisms for logging, monitoring, error handling, etc. inherited from [ut-port](https://github.com/softwaregroup-bg/ut-port).

## Usage

This port can be used the same way as any other `ut` compliant port. E.g.
```javascript
{
    ports: [
        {
            id: 'cache',
            createPort: require('ut-port-cache'),
            logLevel: 'info',
            concurrency: 100
            // other configuration options
            // ...
        }
        // other ports
        //...
    ]
    // modules ...
}
```
For more information about how to bootstrap a `ut port` click [here](https://github.com/softwaregroup-bg/ut-run)

## Specific configuration

Besides `id`, `logLevel`, `concurrency`, and other configuration options which are common for all ports, ut-port-cache defines 2 additional properties which are:
* **`client`** - This object provides a low-level cache abstraction.
    * `engine` - An object or a prototype function implementing the cache strategy
    * `options` - The strategy configuration object

More information about how to configure the client `engine` and `options` can be found [here](https://github.com/hapijs/catbox#client)
* **`policy`**
    * `options` - The policy configuration object
    * `segment` - Used to isolate cached items within the cache partition

More information about how to configure the policy `options` and `segment` can be found [here](https://github.com/hapijs/catbox#policy)


### A full example illustrating how to setup a ut-cache-port
```javascript
{
    ports: [
        {
            id: 'cache',
            createPort: require('ut-port-cache'),
            logLevel: 'info',
            client: {
                engine: require('catbox-redis'),
                options: {} // catbox-redis options
            },
            policy: [
                {
                    segment: 'foo',
                    options: {} // x policy options
                },
                {
                    segment: 'bar',
                    options: {} // x policy options
                }
            ]
        }
    ]
}
```

In the example above the port is configured to use [Redis](https://redis.io/) as a caching layer.

A list of all ready-to-use catbox plugins can be found [here](https://github.com/hapijs/catbox#installation).

## Api

By setting up the port using the [example](#A-full-example-illustrating-how-to-setup-a-ut-cache-port) above it will expose the following methods available through [ut-bus](https://github.com/softwaregroup-bg/ut-bus):
* `cache.set({id, segment, value, ttl})`
    * params
        * `id` - a unique item identifier string (per segment). Can be an empty string.
        * `segment` - a caching segment name string. Enables using a single cache server for storing different sets of items with overlapping ids.
        * `value` - the string or object value to be stored.
        * `ttl` - a time-to-live value in milliseconds after which the item is automatically removed from the cache (or is marked invalid).
    * returns
        * succes
            * A promise resolving to `undefined`
        * failure
            * A promise rejecting to a `javascript exception`
* `cache.get({id, segment})`
    * params
        * `id` - a unique item identifier string (per segment). Can be an empty string.
        * `segment` - a caching segment name string. Enables using a single cache server for storing different sets of items with overlapping
    * returns
        * succes
            * A promise resolving to `null` if the item is not found
            * otherwise, a promise resolving to an object with the following properties
                * `item` - the value stored in the cache using set().
                * `stored` - the timestamp when the item was stored in the cache (in milliseconds).
                * `ttl` - the remaining time-to-live (not the original value used when storing the object).
        * failure
            * A promise rejecting to a `javascript exception`
* `cache.drop({id, segment})`
    * params
        * `id` - a unique item identifier string (per segment). Can be an empty string.
        * `segment` - a caching segment name string. Enables using a single cache server for storing different sets of items with overlapping
    * returns
        * succes
            * A promise resolving to `undefined`
        * failure
            * A promise rejecting to a `javascript exception`
* `cache.foo.set({id, value, ttl})`
     * params
        * `id` - a unique item identifier string (per segment). Can be an empty string.
        * `value` - the string or object value to be stored.
        * `ttl` - a time-to-live value in milliseconds after which the item is automatically removed from the cache (or is marked invalid).
    * returns
        * succes
            * A promise resolving to `undefined`
        * failure
            * A promise rejecting to a `javascript exception`
* `cache.foo.get({id})`
    * params
        * `id` - a unique item identifier string (per segment). Can be an empty string.
    * returns
        * succes
            * A promise resolving to the requested item if found, otherwise to `null`.
            * If `getDecoratedValue` is `true`, then a promise resolving to an object with the following properties:
                * `value` - the fetched or generated value.
                * `cached` - null if a valid item was not found in the cache, or an object with the following keys:
                    * `item` - the cached value.
                    * `stored` - the timestamp when the item was stored in the cache.
                    * `ttl` - the cache ttl value for the record.
                    * `isStale` - true if the item is stale.
                * `report` - an object with logging information about the generation operation containing the following keys (as relevant):
                    * `msec` - the cache lookup time in milliseconds.
                    * `stored` - the timestamp when the item was stored in the cache.
                    * `isStale` - true if the item is stale.
                    * `ttl` - the cache ttl value for the record.
                    * `error` - lookup error.
        * failure
            * A promise rejecting to a `javascript exception`
* `cache.foo.drop({id})`
    * params
        * `id` - a unique item identifier string (per segment). Can be an empty string. for storing different sets of items with overlapping
    * returns
        * succes
            * A promise resolving to `undefined`
        * failure
            * A promise rejecting to a `javascript exception`
* `cache.bar.set({id, value, ttl})` -  same signature as `cache.foo.set({id, value, ttl})`
* `cache.bar.get({id})` -  same signature as `cache.foo.get({id})`
* `cache.bar.drop({id})` -  same signature as `cache.foo.drop({id})`

In summary the following happens
Methods `get`, `set` and `drop` get registered by the top level cache client and the same set of methods get registered for each policy.
The main difference is that the methods of the global cache object require that a `segment` is passed each time, while the policy methods don't as the segment is part of their names: i.e. each method has the signature: `${portId}.${segment}.${operation}`.
Also the `policy` object provides a convenient cache interface by setting a global policy which is automatically applied to every storage action, and the response from the policy `get` method varies based on the global `getDecoratedValue` configuration.


## Example

This is a trivial example illustrating the resquest/response signatures of all different methods.

Note: Assumming we are in the scope of a funciton which has a reference to `ut-bus` bound to its context.

```javascript
const segment = 'global';
const id = 'asd';
const value = {x: 1, y: 2};
Promise.resolve()
    .then(result => {
        // step 1
        return this.importMethod('cache.foo.set')({id, value, ttl: 999999});
    })
    .then(result => {
        // step 2
        // resultr is undefined
        return this.importMethod('cache.set')({id, segment, value, ttl: 999999});
    })
    .then(result => {
        // step 3
        // result is undefined
        return this.importMethod('cache.foo.get')({id});
    })
    .then(result => {
        // step 4
        // result is
        /* {
            "x": 1,
            "y": 2
        } */
        // if getDecoratedValue is true then result would be something like
        /* {
            "value": {
                "x": 1,
                "y": 2
            },
            "cached": {
                "item": {
                    "x": 1,
                    "y": 2
                },
                "stored": 1530270725446,
                "ttl": 958016,
                "isStale": false
            },
            "report": {
                "msec": 19.019037008285522,
                "stored": 1530270725446,
                "ttl": 958016,
                "isStale": false
            }
        } */
        return this.importMethod('cache.get')({id, segment});
    })
    .then(result => {
        // step 5
        // result is
        /* {
            "item": {
                "x": 1,
                "y": 2
            },
            "stored": 1530271029367,
            "ttl": 995804
        } */
        return this.importMethod('cache.foo.drop')({id});
    })
    .then(result => {
        // step 6
        // result is undefined
        return this.importMethod('cache.drop')({id, segment});
    })
    .then(result => {
        // step 7
        // result is undefined
        return result;
    })
    .catch(e => {
        // an exception in case any of the above calls fail
        throw e;
    });
```

Before starting to drop the records in step 5 the redis store will have the following contents:

| key  | value |
| ---- | ----- |
| catbox:global:asd  | {"item":{"x":1,"y":2},"stored":1530272083811,"ttl":999999}  |
| catbox:foo:asd  | {"item":{"x":1,"y":2},"stored":1530272083808,"ttl":999999}  |
