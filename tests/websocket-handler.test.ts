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
import { HttpHandler } from '../src/lib/services/handlers/http-handler.js';
import { WebSocketHandler } from '../src/lib/services/handlers/websocket-handler.js';
import { HeadersService } from '../src/lib/services/headers/headers-service.js';
import type { ConfigType } from '../src/lib/types/config.js';

let wsUpstream: net.Server;
let wsUpstreamPort: number;

function makeConfig(overrides: Partial<ConfigType> = {}): ConfigType {
  return {
    port: 0,
    routes: [
      {
        match: '/ws',
        upstreams: [{ host: '127.0.0.1', port: wsUpstreamPort }],
      },
    ],
    ...overrides,
  };
}

/**
 * Bind a TCP listener and immediately close it. The OS won't reuse the
 * port instantly, so connections to it produce a deterministic
 * ECONNREFUSED — much more reliable than relying on port 1 being unused
 * in arbitrary CI environments.
 */
async function refusedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

interface ProxyHarness {
  port: number;
  rejections: Error[];
  close: () => Promise<void>;
}

async function bindHarness(wsHandler: WebSocketHandler): Promise<ProxyHarness> {
  const rejections: Error[] = [];
  const proxyServer = http.createServer();
  proxyServer.on('upgrade', (req, socket, head) => {
    wsHandler
      .upgrade(req, socket as net.Socket, head)
      .catch((err: Error) => rejections.push(err));
  });
  await new Promise<void>((r) => proxyServer.listen(0, '127.0.0.1', r));
  return {
    port: (proxyServer.address() as net.AddressInfo).port,
    rejections,
    close: () => new Promise<void>((r) => proxyServer.close(() => r())),
  };
}

function upgrade(
  proxyPort: number,
  path: string,
): Promise<{ socket: net.Socket; head: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host: '127.0.0.1', port: proxyPort },
      () => {
        socket.write(
          `GET ${path} HTTP/1.1\r\n` +
            `Host: 127.0.0.1:${proxyPort}\r\n` +
            `Upgrade: websocket\r\n` +
            `Connection: Upgrade\r\n` +
            `\r\n`,
        );
      },
    );
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\r\n')) resolve({ socket, head: data });
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('upgrade timeout')), 3000);
  });
}

beforeAll(async () => {
  // Capture the request line + headers so tests can verify what the proxy forwarded.
  wsUpstream = net.createServer((socket) => {
    socket.once('data', () => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      );
      socket.pipe(socket);
    });
  });
  await new Promise<void>((r) => wsUpstream.listen(0, '127.0.0.1', r));
  wsUpstreamPort = (wsUpstream.address() as net.AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => wsUpstream.close(() => r()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WebSocketHandler', () => {
  it('tunnels a WebSocket upgrade to the upstream', async () => {
    const httpHandler = new HttpHandler(makeConfig());
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);
    const harness = await bindHarness(wsHandler);

    const { socket, head } = await upgrade(harness.port, '/ws/chat');
    expect(head).toContain('101');
    expect(harness.rejections).toEqual([]);

    socket.destroy();
    await harness.close();
  });

  it('forwards Upgrade and Connection headers to the upstream', async () => {
    // Capture what the proxy sends to the upstream so we can verify the WS
    // handshake is intact (the global wsUpstream ignores headers).
    const captured: string[] = [];
    const captureServer = net.createServer((socket) => {
      socket.once('data', (chunk) => {
        captured.push(chunk.toString());
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
        );
      });
    });
    await new Promise<void>((r) => captureServer.listen(0, '127.0.0.1', r));
    const capturePort = (captureServer.address() as net.AddressInfo).port;

    const config = makeConfig({
      routes: [
        {
          match: '/ws',
          upstreams: [{ host: '127.0.0.1', port: capturePort }],
        },
      ],
    });
    const httpHandler = new HttpHandler(config);
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);
    const harness = await bindHarness(wsHandler);

    const { socket } = await upgrade(harness.port, '/ws/chat');
    await vi.waitFor(() => expect(captured.length).toBeGreaterThan(0));
    const forwarded = captured[0].toLowerCase();
    expect(forwarded).toMatch(/upgrade:\s*websocket/);
    expect(forwarded).toMatch(/connection:\s*upgrade/i);

    socket.destroy();
    await harness.close();
    await new Promise<void>((r) => captureServer.close(() => r()));
  });

  it('rejects with 502 on the wire when no route matches', async () => {
    const httpHandler = new HttpHandler(makeConfig());
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);
    const harness = await bindHarness(wsHandler);

    const { socket, head } = await upgrade(harness.port, '/no-match');
    expect(head).toContain('502');
    await vi.waitFor(() => expect(harness.rejections).toHaveLength(1));
    expect(harness.rejections[0].message).toMatch(/No matching route/);

    socket.destroy();
    await harness.close();
  });

  it('rejects with 502 on the wire when route has no upstreams', async () => {
    const config = makeConfig({
      routes: [{ match: '/ws', upstreams: [] }],
    });
    const httpHandler = new HttpHandler(config);
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);
    const harness = await bindHarness(wsHandler);

    const { socket, head } = await upgrade(harness.port, '/ws/chat');
    expect(head).toContain('502');
    await vi.waitFor(() => expect(harness.rejections).toHaveLength(1));
    expect(harness.rejections[0].message).toMatch(/No upstreams/);

    socket.destroy();
    await harness.close();
  });

  it('rejects when the upstream connection fails', async () => {
    const port = await refusedPort();
    const config = makeConfig({
      routes: [
        {
          match: '/ws',
          upstreams: [{ host: '127.0.0.1', port }],
        },
      ],
    });
    const httpHandler = new HttpHandler(config);
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);
    const harness = await bindHarness(wsHandler);

    const socket = net.createConnection(
      { host: '127.0.0.1', port: harness.port },
      () => {
        socket.write(
          `GET /ws/chat HTTP/1.1\r\nHost: 127.0.0.1:${harness.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`,
        );
      },
    );
    socket.on('error', () => {
      /* swallow ECONNRESET when the proxy destroys the socket */
    });

    await vi.waitFor(() => expect(harness.rejections).toHaveLength(1));
    expect(harness.rejections[0].message).toMatch(/ECONNREFUSED|connect/i);

    socket.destroy();
    await harness.close();
  });

  it('applies path rewrite rules for WebSocket upgrades', async () => {
    const config = makeConfig({
      routes: [
        {
          match: '/v1',
          upstreams: [{ host: '127.0.0.1', port: wsUpstreamPort }],
          rewrite: { stripPrefix: '/v1', addPrefix: '/ws' },
        },
      ],
    });
    const httpHandler = new HttpHandler(config);
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);
    const harness = await bindHarness(wsHandler);

    const { socket, head } = await upgrade(harness.port, '/v1/chat');
    expect(head).toContain('101');

    socket.destroy();
    await harness.close();
  });
});
