# nrp

Zero-Dependency reverse proxy for Node.js. Route incoming HTTP and WebSocket traffic to
one or more upstream servers with load balancing, healthchecks, path rewriting, and 
header control. 

Use `nrp` as a **CLI tool** or import it as a **library**.

**Node.js 22+ required**

## Start Reverse Proxy

1. Install with `npm install @responsedotok/nrp`.

2. Create a JSON config file {`proxy.config.json`};

```json
{
  "port": 8881, 
  "routes": {
    {
      "match": "/api",
      "rewrite": { 
        "stripPrefix": "/api" 
      },
      "upstreams": [{ 
        "host": "localhost", 
        "port": 3001
      }]
    },
    {
      "match": "/",
      "upstreams": [{ 
        "host": "localhost",
        "port": 3000
      }]
    }
  }
}
```

3. Run with `npx nrp --config ./proxy.config.json`.

This produces a server that listens on PORT number 8888, forwarding requests received by
route `/api/*` to port 3001 (stripping the `/api` prefix), and all other requests received
to port 3000.

## Features

|  Feature        |  Summary                                                |
| ----------      |  -------                                                |
| Routing         | Match requests by URL prefix                            |
|                 | or with a custom function.                              |
|                 |                                                         |
| Rewrite path    |  Strip prefix, add  prefix;                             |
|                 |  replace the entire path before                         |
|                 |  forwarding.                                            |
|                 |                                                         |
| Header control  | Add, override, or remove                                |
|                 | request/response headers                                |
|                 | globally or per-route.                                  |
|                 |                                                         |
| WebSocket proxy | Transparent TCP tunnel for                              |
|                 | `Upgrade` requests.                                     |
|                 |                                                         |
| Load balancing  | Round-robin, random, or weighted                        |
|                 |  distribution across multiple                           |
|                 |  upstream signals.                                      |
|                 |                                                         |
| Health checks   |  Periodic TCP probes automatically                      |
|                 |  remove unhealthy upstreams from rotation.              |
|                 |                                                         |
| Lifecycle hooks | Intercept requests, inspect responses, handle errrors   |
|                 |                                                         |
| Graceful        | Drains in-flight requests before closingg server.       | 
| shutdown        |                                                         |

---

## CLI Reference

```bash
nrp [options]
```

|  Flag               |  Short  |  Default          |  Description                           |
|  ----               |  -----  |  -------          | -----------                            |
|`--config <path>`    |`-c`     |`./nrp.config.json`| Path to config                         |
|`--log-level <level>`|`-l`     |`info`             | `debug`,`info`,`warn`,`error`,`silent` |
|`--help`             |`-h`     | --                | Print help & exit                      |

Config files can be `.json`, `.js`, `.mjs` (default export), `.ts`

For more readable logs, pipe to `pino-pretty`:

```bash
nrp -c ./proxy.config.json -l debug | npx pino-pretty
```

---

## Use as library

Use `ProxyServer` for lifecycle hooks and access tot he underlying server:

```typescript
import { ProxyServer, LoadBalancerStrategy } from "@responsedotok/nrp";
import type { ConfigType, Hooks } from "@responsedotok/nrp";

const config: ConfigType = {
  port: 8080,
  balancer: LoadBalancerStrategy.RoundRobin,
  routes: [
    {
      match: "/api",
      rewrite: { stripPrefix: "/api" },
      upstreams: [{ host: "localhost", port: 3001 }],
    },
    {
      match: "/",
      upstreams: [{ host: "localhost", port: 3000 }],
    },
  ],
};

const server = new ProxyServer(config, {
  onRequest(ctx) {
    console.log(`-> ${ctx.req.method} ${ctx.req.url}`);
    return true; // return false to abort with 403
  },
  onResponse(ctx, statusCode) {
    console.log(`<- ${statusCode}`);
  },
  onError(err, ctx) {
    console.error(err.message, ctx.req?.url);
  },
});

await server.listen();
process.on("SIGTERM", () => server.close());
```

Or use `createProxy` to creats and start the server:

```ts
import { createProxy } from "@responsedotok/nrp";

const proxy = await createProxy({ port: 8080, routes: [...] });
process.on("SIGTERM", () => proxy.close());
```

## Configuration

| Field         | Type          | Default         | Description                                                      |
| -----         | ----          | -------         | -------------                                                    |
| `port`        | `number`      |   --            | **required**                                                     |
| `host`        | `string`      |  `"0.0.0.0"`    | Address to bind                                                  |
| `routes`      | `Route[]`     |  --             |  **required** ordered list of routes                             |
| `balancer`    | `Balancer`    |  --             | Default load balancer                                            |
| `timeout`     | `number`      | `30000`         | Upstream request timeout in ms                                   |
| `maxBodySize` | `number`      | --              | Max request body in bytes (returns `413` if exceeded)            |
| `forwardIp`   | `boolean`     | `true`          | Add `X-Forwarded-For`. `X-Forwarded-Host`, `X-Forwarded-Proto`   |
| `healthCheck` | `object`      | --              | `{ interval?: number, timeout?: number }` for TCP health probes  |
| `headers`     | `HeaderRules` | --              | Global header rules (applied to all routes)                      |


### Route fields

| Field         | Type                                | Description                                                           |
| ---           | ------                              | ------------                                                          |
| `match`       | `string` or `(pathname) => boolean` | URL prefix or custom predicate (functions require `.js`/`.ts` config) |
| `upstreams`   | `Upstream[]`                        | **required.** Target servers                                          |
| `rewrite`     | `RouteRewrite`                      | Path rewrite rules                                                    |
| `headers`     | `HeaderRules`                       | Per-route header rules (merged on top of global)                      |
| `balancer`    | `LoadBalancerStrategy`              | Override the global load balancer for this route                      |
| `timeout`     | `number`                            | Per-route upstream timeout in ms                                      |
| `maxBodySize` | `number`                            | Per-route body size limit in bytes                                    |

### Upstream fields

| Field      | Type     | Default  | Description                                       |
| ---        | -------  | ------   | --------                                          |
| `host`     | `string` | --       | **required.** Hostname or IP                      |
| `port`     | `number` | --       | **required.** Port                                |
| `protocol` | `string` | `"http"` | `"http"` or `"https"` (use `"https"` for TLS/WSS) |
| `weight`   | `number` | `1`      | Weight for the `Weighted` balancer                |

### Path rewriting

Rewrites are applied in order: `stripPrefix` then `addPrefix`. 

Using `replacePath` skips both.

| Field         | Description                               |
| -----         | --------                                  |
| `stripPrefix` | Remove this prefix from the incoming path |
| `addPrefix`   | Prepend this to the resulting path        |
| `replacePath` | Replace the entire path with this value   |

Example: incoming `/api/users/42` with `stripPrefix: "/api"` and `addPrefix: "/v1"` becomes `/v1/users/42`.

### Header rules

| Field           | Type                     | Description                                     |
| ---             | ---                      | -------------                                   |
| `request`       | `Record<string, string>` | Headers to add/override on the upstream request |
| `response`      | `Record<string, string>` | Headers to add/override on the client response  |
| `removeRequest` | `string[]`               | Headers to strip from the upstream request      |
| `removeResponse`| `string[]`               | Headers to strip from the client response       |

Hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, etc.) are stripped automatically.

---

## Load balancing

In JSON config files, use the string values: `"round-robin"`, `"random"`, `"weighted"`.

In source-code, use the `LoadBalancerStrategy` enum.

- **`RoundRobin`** (default) -- cycles through upstreams in order
- **`Random`** -- picks one at random per request
- **`Weighted`** -- picks based on `weight` values (higher = more traffic)

When a connection fails before any response has started, nrp retries with the next upstream.

If all upstreams fail, it returns `502 Bad Gateway`.

## Health checks

Allows periodic TCP checks and marks unreachable upstreams as unhealthy, excluding them from
load balancing. 

```json
{ "healthCheck": { "interval": 30000, "timeout": 5000 } }
```

## WebSocket proxying

Any route whose `match` covers the upgrade URL handles WebSocket connections automatically
via raw TCP tunnel. For TLS upstreams (WSS), set `protocol: "https"`.

## Building from source

```bash
npm install
npm run build     # outputs ESM + CJS to dist/
npm test -- --run # run tests once
```

## License

MIT
