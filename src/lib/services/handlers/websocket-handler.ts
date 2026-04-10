import type { IncomingMessage } from 'node:http';
import net from 'node:net';

import tls from 'node:tls';
import { matchRoute } from '../../../utils/match-route.js';
import { rewritePath } from '../../../utils/rewrite-path.js';
import type { HeadersService } from '../headers/headers-service.js';
import type { HttpHandler } from './http-handler.js';

export class WebSocketHandler {
  constructor(
    private readonly httpHandler: HttpHandler,
    private readonly headersService: HeadersService,
  ) {}

  /**
   * Handle WebSocket requests by tunneling raw TCP between the
   * client and the selected upstream.
   * @param req The incoming HTTP request.
   * @param socket Network socket between the client and the proxy.
   * @param head The first packet of the upgraded stream, if any.
   * @returns Promise<void> A promise that resolves when the WebSocket connection is established or
   * rejected if an error occurs.
   */

  async upgrade(
    req: IncomingMessage,
    socket: net.Socket,
    head: Buffer,
  ): Promise<void> {
    const { config } = this.httpHandler;
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = matchRoute(config.routes, url.pathname);

    if (!route) {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
      return;
    }

    if (route.upstreams.length === 0) {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
      return;
    }

    const candidates = this.httpHandler.healthyCandidates(route.upstreams);
    const upstream = this.httpHandler.getBalancer(route).pick(candidates);

    const targetPath =
      rewritePath(url.pathname, route.rewrite) + (url.search ?? '');
    const upgradeHeaders = this.headersService.buildRequestHeaders(
      req,
      route.headers,
      upstream,
    );

    const requestLine = `${req.method ?? 'GET'} ${targetPath} HTTP/1.1\r\n`;
    const headerBlock = `${Object.entries(upgradeHeaders)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n')}\r\n\r\n`;

    const useTls = upstream.protocol === 'https';
    const connectOptions = { host: upstream.host, port: upstream.port };
    const onConnect = () => {
      upstreamSocket.write(requestLine + headerBlock);
      if (head.length > 0) upstreamSocket.write(head);

      // Bidirectional pipe
      socket.pipe(upstreamSocket);
      upstreamSocket.pipe(socket);
    };
    const upstreamSocket = useTls
      ? tls.connect(connectOptions, onConnect)
      : net.createConnection(connectOptions, onConnect);

    const cleanup = () => {
      socket.destroy();
      upstreamSocket.destroy();
    };

    upstreamSocket.on('error', (err) => {
      this.httpHandler.notifyError(err, { req });
      cleanup();
    });

    upstreamSocket.setTimeout(
      route.timeout ?? config.timeout ?? 30000,
      cleanup,
    );

    socket.on('error', cleanup);
    socket.on('close', cleanup);
    upstreamSocket.on('close', cleanup);
  }
}
