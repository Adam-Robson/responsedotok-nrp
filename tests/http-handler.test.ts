import http from 'node:http';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { HttpHandler } from '../src/lib/services/handlers/http-handler.js';
import type { ConfigType } from '../src/lib/types/config.js';
import type { Hooks } from '../src/lib/types/hooks.js';
import { LoadBalancerStrategy } from '../src/lib/types/load-balancer-strategy.js';
import type { Upstream } from '../src/lib/types/upstream.js';

let upstreamServer: http.Server;
let upstreamPort: number;

/**
 * Bind a TCP listener and immediately close it to obtain a port that
 * deterministically refuses connections, regardless of CI sandbox
 * policy on low-numbered ports.
 */
async function refusedPort(): Promise<number> {
  const net = await import('node:net');
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as import('net').AddressInfo).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

/**
 * Create config object for test; allow overrides.
 * @param overrides
 * @returns Config object with defaults for testing, overridden when necessary.
 */
function makeConfig(overrides: Partial<ConfigType> = {}): ConfigType {
  return {
    port: 0,
    routes: [
      {
        match: '/api',
        upstreams: [{ host: '127.0.0.1', port: upstreamPort }],
      },
    ],
    ...overrides,
  };
}

/**
 * Test Helper
 * Send an HTTP request to the HTTP handler.
 * @param handler Handler to test.
 * @param path Request path.
 * @param options Request options - optional.
 * @returns Promise to resolve with the response: status, body, and headers.
 */
function request(
  handler: HttpHandler,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => handler.handler(req, res));
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as import('net').AddressInfo).port;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: options.method ?? 'GET',
          headers: options.headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            server.close();
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString(),
              headers: res.headers,
            });
          });
        },
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (options.body) req.write(options.body);
      req.end();
    });
  });
}

/**
 * Test infrastructure
 * Upstream started before all tests;
 * closed after all tests;
 * restore mocks after each test.
 */
beforeAll(async () => {
  upstreamServer = http.createServer((req, res) => {
    if (req.url === '/api/slow') {
      // Never respond — used for timeout tests
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain', 'x-upstream': 'true' });
    res.end(`OK ${req.method} ${req.url}`);
  });
  await new Promise<void>((r) => upstreamServer.listen(0, '127.0.0.1', r));
  upstreamPort = (upstreamServer.address() as import('net').AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => upstreamServer.close(() => r()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Tests for HttpHandler
 * Each tests contains a brief description of its purpose
 * following the it() function call.
 */

describe('HttpHandler', () => {
  it('proxies a matching request to the upstream', async () => {
    const handler = new HttpHandler(makeConfig());
    const res = await request(handler, '/api/hello');
    expect(res.status).toBe(200);
    expect(res.body).toBe('OK GET /api/hello');
  });

  it('returns 502 for an unmatched route', async () => {
    const handler = new HttpHandler(makeConfig());
    const res = await request(handler, '/no-match');
    expect(res.status).toBe(502);
    expect(res.body).toContain('Bad Gateway');
  });

  it('returns 413 when content-length exceeds maxBodySize', async () => {
    const config = makeConfig({
      routes: [
        {
          match: '/api',
          upstreams: [{ host: '127.0.0.1', port: upstreamPort }],
          maxBodySize: 5,
        },
      ],
    });
    const handler = new HttpHandler(config);
    const res = await request(handler, '/api/data', {
      method: 'POST',
      headers: { 'content-length': '9999' },
      body: 'x'.repeat(100),
    });
    expect(res.status).toBe(413);
  });

  it('calls onRequest hook and blocks when it returns false', async () => {
    const onRequest = vi.fn().mockResolvedValue(false);
    const hooks: Hooks = { onRequest };
    const handler = new HttpHandler(makeConfig(), hooks);
    const res = await request(handler, '/api/blocked');
    expect(res.status).toBe(403);
    expect(onRequest).toHaveBeenCalledOnce();
  });

  it('calls onRequest hook and continues when it returns true', async () => {
    const onRequest = vi.fn().mockResolvedValue(true);
    const hooks: Hooks = { onRequest };
    const handler = new HttpHandler(makeConfig(), hooks);
    const res = await request(handler, '/api/allowed');
    expect(res.status).toBe(200);
    expect(onRequest).toHaveBeenCalledOnce();
  });

  it('returns 502 when onRequest hook throws', async () => {
    const onRequest = vi.fn().mockRejectedValue(new Error('hook error'));
    const hooks: Hooks = { onRequest };
    const handler = new HttpHandler(makeConfig(), hooks);
    const res = await request(handler, '/api/error');
    expect(res.status).toBe(502);
  });

  it('calls onResponse hook after receiving upstream response', async () => {
    const onResponse = vi.fn();
    const hooks: Hooks = { onResponse };
    const handler = new HttpHandler(makeConfig(), hooks);
    const res = await request(handler, '/api/ok');
    expect(res.status).toBe(200);
    expect(onResponse).toHaveBeenCalledOnce();
    expect(onResponse.mock.calls[0][1]).toBe(200);
  });

  it('calls onError hook and returns 502 when upstream is unreachable', async () => {
    const port = await refusedPort();
    const onError = vi.fn();
    const hooks: Hooks = { onError };
    const config = makeConfig({
      routes: [
        {
          match: '/api',
          upstreams: [{ host: '127.0.0.1', port }],
        },
      ],
    });
    const handler = new HttpHandler(config, hooks);
    const res = await request(handler, '/api/fail');
    expect(res.status).toBe(502);
    expect(onError).toHaveBeenCalled();
  });

  it('does not retry POST requests with a body when the first upstream fails', async () => {
    const refused = await refusedPort();
    const config = makeConfig({
      routes: [
        {
          match: '/api',
          upstreams: [
            { host: '127.0.0.1', port: refused },
            { host: '127.0.0.1', port: upstreamPort },
          ],
        },
      ],
    });
    const handler = new HttpHandler(config);
    const res = await request(handler, '/api/data', {
      method: 'POST',
      headers: { 'content-length': '5' },
      body: 'hello',
    });
    // First upstream is refused; retry would silently lose the body, so
    // the handler must surface the failure rather than retry.
    expect(res.status).toBe(502);
  });

  it('applies rewrite rules to the forwarded path', async () => {
    const config = makeConfig({
      routes: [
        {
          match: '/v1',
          upstreams: [{ host: '127.0.0.1', port: upstreamPort }],
          rewrite: { stripPrefix: '/v1', addPrefix: '/api' },
        },
      ],
    });
    const handler = new HttpHandler(config);
    const res = await request(handler, '/v1/hello');
    expect(res.status).toBe(200);
    expect(res.body).toBe('OK GET /api/hello');
  });

  it('forwards query strings to the upstream', async () => {
    const handler = new HttpHandler(makeConfig());
    const res = await request(handler, '/api/search?q=test&page=1');
    expect(res.status).toBe(200);
    expect(res.body).toBe('OK GET /api/search?q=test&page=1');
  });

  it('uses the global balancer strategy from config', () => {
    const config = makeConfig({ balancer: LoadBalancerStrategy.Random });
    const handler = new HttpHandler(config);
    // Should not throw — constructor creates the balancer
    expect(handler).toBeDefined();
  });

  describe('healthyCandidates', () => {
    it('falls back to all upstreams when none are healthy', () => {
      const upstreams: Upstream[] = [
        { host: '127.0.0.1', port: 1 },
        { host: '127.0.0.1', port: 2 },
      ];
      const handler = new HttpHandler(
        makeConfig({
          routes: [{ match: '/api', upstreams }],
        }),
      );
      // Without starting health service, all are treated as healthy
      const result = handler.healthyCandidates(upstreams);
      expect(result).toEqual(upstreams);
    });
  });

  describe('getBalancer', () => {
    it('returns global balancer when route has no balancer', () => {
      const handler = new HttpHandler(makeConfig());
      const route = { upstreams: [{ host: '127.0.0.1', port: 3000 }] };
      const b1 = handler.getBalancer(route);
      const b2 = handler.getBalancer(route);
      expect(b1).toBe(b2);
    });

    it('creates and caches a route-specific balancer', () => {
      const handler = new HttpHandler(makeConfig());
      const route = {
        upstreams: [{ host: '127.0.0.1', port: 3000 }],
        balancer: LoadBalancerStrategy.Random,
      };
      const b1 = handler.getBalancer(route);
      const b2 = handler.getBalancer(route);
      expect(b1).toBe(b2);
    });
  });

  it('retries on the next upstream when the first fails (idempotent GET)', async () => {
    const refused = await refusedPort();
    const config = makeConfig({
      routes: [
        {
          match: '/api',
          upstreams: [
            { host: '127.0.0.1', port: refused },
            { host: '127.0.0.1', port: upstreamPort },
          ],
        },
      ],
    });
    const handler = new HttpHandler(config);
    const res = await request(handler, '/api/retry');
    expect(res.status).toBe(200);
    expect(res.body).toBe('OK GET /api/retry');
  });
});
