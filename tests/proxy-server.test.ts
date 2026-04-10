import http from 'node:http';
import net from 'node:net';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createProxy,
  ProxyServer,
} from '../src/lib/services/proxy/proxy-server.js';
import type { ConfigType } from '../src/lib/types/config.js';
import { Logger } from '../src/logger/logger.js';

let upstreamServer: http.Server;
let upstreamPort: number;

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

function get(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
  });
}

function wsUpgrade(
  port: number,
  path: string,
): Promise<{ socket: net.Socket; head: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `\r\n`,
      );
    });
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\r\n')) {
        resolve({ socket, head: data });
      }
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('upgrade timeout')), 3000);
  });
}

// --- lifecycle --------------------------------------------------------------

beforeAll(async () => {
  upstreamServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`OK ${req.method} ${req.url}`);
  });
  await new Promise<void>((r) => upstreamServer.listen(0, '127.0.0.1', r));
  upstreamPort = (upstreamServer.address() as net.AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => upstreamServer.close(() => r()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- tests ------------------------------------------------------------------

describe('ProxyServer', () => {
  it('listens and proxies HTTP requests to the upstream', async () => {
    const proxy = new ProxyServer(makeConfig());
    await proxy.listen();
    const addr = proxy.httpServer.address() as net.AddressInfo;

    const res = await get(addr.port, '/api/hello');
    expect(res.status).toBe(200);
    expect(res.body).toBe('OK GET /api/hello');

    await proxy.close();
  });

  it('returns 502 for unmatched routes', async () => {
    const proxy = new ProxyServer(makeConfig());
    await proxy.listen();
    const addr = proxy.httpServer.address() as net.AddressInfo;

    const res = await get(addr.port, '/unknown');
    expect(res.status).toBe(502);

    await proxy.close();
  });

  it('catches unhandled request errors and returns 502', async () => {
    const config = makeConfig({
      routes: [
        {
          match: '/api',
          upstreams: [{ host: '127.0.0.1', port: 1 }],
        },
      ],
    });
    const onError = vi.fn();
    const proxy = new ProxyServer(config, { onError });
    await proxy.listen();
    const addr = proxy.httpServer.address() as net.AddressInfo;

    const res = await get(addr.port, '/api/fail');
    expect(res.status).toBe(502);

    await proxy.close();
  });

  it('calls the onError hook when a request fails', async () => {
    const config = makeConfig({
      routes: [
        {
          match: '/api',
          upstreams: [{ host: '127.0.0.1', port: 1 }],
        },
      ],
    });
    const onError = vi.fn();
    const proxy = new ProxyServer(config, { onError });
    await proxy.listen();
    const addr = proxy.httpServer.address() as net.AddressInfo;

    await get(addr.port, '/api/fail');
    expect(onError).toHaveBeenCalled();

    await proxy.close();
  });

  it('rejects listen() when the port is already in use', async () => {
    const proxy1 = new ProxyServer(makeConfig());
    await proxy1.listen();
    const addr = proxy1.httpServer.address() as net.AddressInfo;

    const proxy2 = new ProxyServer(makeConfig({ port: addr.port }));
    await expect(proxy2.listen()).rejects.toThrow();

    await proxy1.close();
  });

  it('uses a custom logger when provided', async () => {
    const logger = new Logger('debug');
    const infoSpy = vi.spyOn(logger, 'info');
    const proxy = new ProxyServer(makeConfig(), {}, logger);
    await proxy.listen();

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Listening'));

    await proxy.close();
  });

  it('logs shutdown messages on close', async () => {
    const logger = new Logger('debug');
    const infoSpy = vi.spyOn(logger, 'info');
    const proxy = new ProxyServer(makeConfig(), {}, logger);
    await proxy.listen();
    await proxy.close();

    expect(infoSpy).toHaveBeenCalledWith('Shutting down…');
    expect(infoSpy).toHaveBeenCalledWith('Server closed');
  });

  it('exposes the underlying http.Server via httpServer getter', () => {
    const proxy = new ProxyServer(makeConfig());
    expect(proxy.httpServer).toBeInstanceOf(http.Server);
  });

  it('defaults to empty hooks when none are provided', async () => {
    const proxy = new ProxyServer(makeConfig());
    await proxy.listen();
    const addr = proxy.httpServer.address() as net.AddressInfo;

    const res = await get(addr.port, '/api/hello');
    expect(res.status).toBe(200);

    await proxy.close();
  });

  it('handles WebSocket upgrades through the proxy', async () => {
    // Set up a minimal upstream that accepts upgrades
    const wsUpstreamServer = net.createServer((socket) => {
      socket.once('data', () => {
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n\r\n',
        );
        socket.pipe(socket);
      });
    });
    await new Promise<void>((r) => wsUpstreamServer.listen(0, '127.0.0.1', r));
    const wsPort = (wsUpstreamServer.address() as net.AddressInfo).port;

    const config = makeConfig({
      routes: [
        {
          match: '/ws',
          upstreams: [{ host: '127.0.0.1', port: wsPort }],
        },
      ],
    });
    const proxy = new ProxyServer(config);
    await proxy.listen();
    const addr = proxy.httpServer.address() as net.AddressInfo;

    const { socket, head } = await wsUpgrade(addr.port, '/ws/chat');
    expect(head).toContain('101');

    socket.destroy();
    await proxy.close();
    await new Promise<void>((r) => wsUpstreamServer.close(() => r()));
  });

  it('destroys socket on WebSocket upgrade to unmatched route', async () => {
    const proxy = new ProxyServer(makeConfig());
    await proxy.listen();
    const addr = proxy.httpServer.address() as net.AddressInfo;

    const { socket, head } = await wsUpgrade(addr.port, '/no-match');
    expect(head).toContain('502');

    socket.destroy();
    await proxy.close();
  });

  it('calls onError hook for failed WebSocket upgrades', async () => {
    const config = makeConfig({
      routes: [
        {
          match: '/ws',
          upstreams: [{ host: '127.0.0.1', port: 1 }],
        },
      ],
    });
    const onError = vi.fn();
    const proxy = new ProxyServer(config, { onError });
    await proxy.listen();
    const addr = proxy.httpServer.address() as net.AddressInfo;

    const socket = net.createConnection(
      { host: '127.0.0.1', port: addr.port },
      () => {
        socket.write(
          `GET /ws/chat HTTP/1.1\r\nHost: 127.0.0.1:${addr.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`,
        );
      },
    );

    await new Promise((r) => setTimeout(r, 500));
    socket.destroy();
    await proxy.close();

    // The error could be caught in the WebSocketHandler or bubble to ProxyServer's catch
    expect(onError).toHaveBeenCalled();
  });
});

describe('createProxy', () => {
  it('creates and starts a proxy server', async () => {
    const proxy = await createProxy(makeConfig());
    const addr = proxy.httpServer.address() as net.AddressInfo;
    expect(addr.port).toBeGreaterThan(0);

    const res = await get(addr.port, '/api/hello');
    expect(res.status).toBe(200);

    await proxy.close();
  });

  it('passes hooks and logger to the proxy server', async () => {
    const logger = new Logger('debug');
    const infoSpy = vi.spyOn(logger, 'info');
    const onRequest = vi.fn().mockResolvedValue(true);

    const proxy = await createProxy(makeConfig(), { onRequest }, logger);
    const addr = proxy.httpServer.address() as net.AddressInfo;

    await get(addr.port, '/api/hello');
    expect(onRequest).toHaveBeenCalledOnce();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Listening'));

    await proxy.close();
  });
});
