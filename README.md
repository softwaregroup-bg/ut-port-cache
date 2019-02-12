# ut-port-cache

`ut-port-cache` is a multi-strategy object caching port.
It is a convinient wrapper for [catbox](https://github.com/hapijs/catbox)
and provides on top of that the standard `ut` mechanisms for logging,
monitoring, error handling, etc. inherited from
[ut-port](https://github.com/softwaregroup-bg/ut-port).

## Usage

This port can be used the same way as any other `ut` compliant port.
For more information about how to bootstrap a `ut port` click [here](https://github.com/softwaregroup-bg/ut-run)

## Configuration

Besides `logLevel`, `concurrency`, and other configuration options
which are common for all ports, ut-port-cache defines 2 additional
properties:

* **`client`** - This object provides a low-level cache abstraction.
  * `engine` - An object or a prototype function implementing the cache strategy
  * `options` - The strategy configuration object

More information about how to configure the client `engine` and `options`
can be found [here](https://github.com/hapijs/catbox#client)

* **`policy`**
  * `options` - The policy configuration object
  * `segment` - Used to isolate cached items within the cache partition

More information about how to configure the policy `options` and `segment`
can be found [here](https://github.com/hapijs/catbox#policy)

Both client and policy are optional.
If client engine is not provided then
[catbox-memory](https://github.com/hapijs/catbox-memory) will be used by default.
So therefore if you need to store data in memory only
then omit the client.engine configuration
and just pass client.options in case it is necessary to adjust
[maxByteSize](https://github.com/hapijs/catbox-memory#options)
or
[allowMixedContent](https://github.com/hapijs/catbox-memory#options).

### Configuration example

```javascript
function cache() {
    return class cache extends require('ut-port-cache')(...arguments) {
        get defaults() {
            engine: require('catbox-redis'),
            options: {} // catbox-redis options
            policy: [
                {
                    segment: 'module.foo.get',
                    options: {} // segment 'module.foo.get' options
                },
                {
                    segment: 'bar',
                    options: {} // segment 'bar' options
                }
            ]
        }
    };
}
```

In the example above the port is configured to use
[Redis](https://redis.io/) as a caching layer.

A list of all ready-to-use catbox plugins can be found
[here](https://github.com/hapijs/catbox#installation).

## API

By setting up the port using the
[example](#configuration-example) above it will expose the following set of
methods available through [ut-bus](https://github.com/softwaregroup-bg/ut-bus):

* `bus.importMethod('cache/module.entity.action')(value, {cache})`

  * `module.entity.action` is arbitrary string, usually corresponding to a
  namespaced method call and helps in determining the segment
  * `value` is the value for the cache operation
  * `cache` determines the cache operation and parameters and has the following
  structire {`operation`, `ttl`, `key`: {`id`, `params`, `segment`}}, where:
    * `operation` is one of 'get', 'set', 'drop' and determines what to do.
    * `ttl` is optional time to keep the `value` in the cache,
    when operation is 'set', with default taken from port configuration
    property `ttl`
    * `key` determines the cache key, as per following:
      * `id` - unique string value per cache segment
      * `segment` - if specified non falsy value, defines the cache segment
      * `params` - if segment is falsy, this helps for deremining cache segmet
        as per following rules:
        * if it is object, the cache segment is constructed by deterministically
        converting the object to URL parameters, for example if
        `params={x:1, y: 2}`, the segment becomes 'module.entity.action?x=1&y=2'
        * if it is truthy, it is converted to string and appended as query string,
        for example if `params='xyz'`, the cache segment is 'module.entity.action?xyz'
        * otherwise, the cache segment is simply 'module.entity.action'
  * `return` value is determined by cache operation as follows:
    * rejected promise when error happened during any of the cache operations
    * promise resolving to `null`, when 'set' operation was successful
    * promise resolving to `null`, when 'drop' operation was successful
    * promise resolving `null`, when 'get' resulted in cache miss
    * promise resolving to the cached value, when 'get' operation resulted
    in cache hit

## Example

This is a trivial example illustrating the resquest/response signatures of all
different methods.

```javascript
const segment = 'global';
const id = 'asd';
const valueFoo = {x: 1, y: 2};
const valueBar = [1, 2];
Promise.resolve()
    .then(result => { // step 1
        return bus.importMethod('cache/module.foo.get')(valueFoo, {
            cache:{
                operation:'set',
                ttl: 999999,
                key:{id}
            }
        });
    })
    .then(result => { // step 2, result is null
        return bus.importMethod('cache/module.bar.get')(valueBar, {
            cache:{
                operation:'set',
                ttl: 999999,
                key:{id, segment: 'bar'}
            }
        });
    })
    .then(result => { // step 3, result is null
        return bus.importMethod('cache/module.foo.get')(undefined, {
            cache:{
                operation:'get',
                key:{id}
            }
        });
    })
    .then(result => { // step 4, result is { "x": 1, "y": 2 }
        return bus.importMethod('cache/module.bar.get')(undefined, {
            cache:{
                operation:'get',
                key:{id, segment: 'bar'}
            }
        });
    })
    .then(result => { // step 5, result is [1, 2]
        return bus.importMethod('cache/module.foo.get')(undefined, {
            cache:{
                operation:'drop',
                key:{id}
            }
        });
    })
    .then(result => { // step 6 result is null
        return bus.importMethod('cache/module.bar.get')(undefined, {
            cache:{
                operation:'drop',
                key:{id, segment: 'bar'}
            }
        });
    })
    .then(result => { // step 7 result is null
        return result;
    })
    .catch(e => { // an exception in case any of the above calls fail
        throw e;
    });
```

Before starting to drop the records in step 5
the redis store will have the following contents:

| **key**                | **value**                                                   |
| ---------------------- | ----------------------------------------------------------- |
| catbox:module.foo.get  | {"item":{"x":1,"y":2},"stored":1530272083808,"ttl":999999}  |
| catbox:bar             | {"item":[1,2],"stored":1530272083811,"ttl":999999}          |
