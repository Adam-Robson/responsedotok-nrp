import http from 'node:http';
import net from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpHandler } from '../src/lib/services/handlers/http-handler.js';
import { WebSocketHandler } from '../src/lib/services/handlers/websocket-handler.js';
import { HeadersService } from '../src/lib/services/headers/headers-service.js';
import type { ConfigType } from '../src/lib/types/config.js';

/**
 * Tests for WebSocketHandler. These are more like integration tests since they
 * involve actual TCP connections and a minimal HTTP server to simulate the
 * proxy and upstream. The focus is on verifying that WebSocket upgrade requests
 * are correctly handled, routed to the upstream, and that errors are handled
 * gracefully.
 * 
 * @params overrides - Partial config overrides to customize the proxy
 * configuration for each test case.
 */
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
 * Minimal WebSocket-like upgrade: send an HTTP upgrade request and return the
 * raw socket + upstream response line.
 */
function upgrade(
  proxyPort: number,
  path: string,
): Promise<{ socket: net.Socket; head: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: proxyPort }, () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${proxyPort}\r\n` +
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

/**
 * Test infrastructure
 */
beforeAll(async () => {
  // Minimal TCP server that responds with upgrade to any request,
  // simulating an upstream that accepts WebSocket connections.
  wsUpstream = net.createServer((socket) => {
    socket.once('data', () => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
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
    const config = makeConfig();
    const httpHandler = new HttpHandler(config);
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);

    const proxyServer = http.createServer();
    proxyServer.on('upgrade', (req, socket, head) => {
      wsHandler.upgrade(req, socket as net.Socket, head);
    });
    await new Promise<void>((r) => proxyServer.listen(0, '127.0.0.1', r));
    const proxyPort = (proxyServer.address() as net.AddressInfo).port;

    const { socket, head } = await upgrade(proxyPort, '/ws/chat');
    expect(head).toContain('101');

    socket.destroy();
    await new Promise<void>((r) => proxyServer.close(() => r()));
  });

  it('destroys socket with 502 when no route matches', async () => {
    const config = makeConfig();
    const httpHandler = new HttpHandler(config);
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);

    const proxyServer = http.createServer();
    proxyServer.on('upgrade', (req, socket, head) => {
      wsHandler.upgrade(req, socket as net.Socket, head);
    });
    await new Promise<void>((r) => proxyServer.listen(0, '127.0.0.1', r));
    const proxyPort = (proxyServer.address() as net.AddressInfo).port;

    const { socket, head } = await upgrade(proxyPort, '/no-match');
    expect(head).toContain('502');

    socket.destroy();
    await new Promise<void>((r) => proxyServer.close(() => r()));
  });

  it('destroys socket with 502 when route has no upstreams', async () => {
    const config = makeConfig({
      routes: [{ match: '/ws', upstreams: [] }],
    });
    const httpHandler = new HttpHandler(config);
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);

    const proxyServer = http.createServer();
    proxyServer.on('upgrade', (req, socket, head) => {
      wsHandler.upgrade(req, socket as net.Socket, head);
    });
    await new Promise<void>((r) => proxyServer.listen(0, '127.0.0.1', r));
    const proxyPort = (proxyServer.address() as net.AddressInfo).port;

    const { socket, head } = await upgrade(proxyPort, '/ws/chat');
    expect(head).toContain('502');

    socket.destroy();
    await new Promise<void>((r) => proxyServer.close(() => r()));
  });

  it('calls notifyError when upstream connection fails', async () => {
    const config = makeConfig({
      routes: [
        {
          match: '/ws',
          upstreams: [{ host: '127.0.0.1', port: 1 }], // nothing listening
        },
      ],
    });
    const httpHandler = new HttpHandler(config);
    const notifySpy = vi.spyOn(httpHandler, 'notifyError');
    const headersService = new HeadersService(undefined, true);
    const wsHandler = new WebSocketHandler(httpHandler, headersService);

    const proxyServer = http.createServer();
    proxyServer.on('upgrade', (req, socket, head) => {
      wsHandler.upgrade(req, socket as net.Socket, head);
    });
    await new Promise<void>((r) => proxyServer.listen(0, '127.0.0.1', r));
    const proxyPort = (proxyServer.address() as net.AddressInfo).port;

    const socket = net.createConnection({ host: '127.0.0.1', port: proxyPort }, () => {
      socket.write(
        `GET /ws/chat HTTP/1.1\r\nHost: 127.0.0.1:${proxyPort}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`,
      );
    });

    // Wait for the error to propagate
    await new Promise((r) => setTimeout(r, 500));
    expect(notifySpy).toHaveBeenCalled();

    socket.destroy();
    await new Promise<void>((r) => proxyServer.close(() => r()));
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

    const proxyServer = http.createServer();
    proxyServer.on('upgrade', (req, socket, head) => {
      wsHandler.upgrade(req, socket as net.Socket, head);
    });

    await new Promise<void>((r) => proxyServer.listen(0, '127.0.0.1', r));
    const proxyPort = (proxyServer.address() as net.AddressInfo).port;

    const { socket, head } = await upgrade(proxyPort, '/v1/chat');
    expect(head).toContain('101');

    socket.destroy();
    
    await new Promise<void>((r) => proxyServer.close(() => r()));
  });
});
