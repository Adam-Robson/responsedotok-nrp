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
   * Tunnel a WebSocket upgrade between the client socket and a chosen
   * upstream. Resolves once the upstream connection is established and
   * piping has been wired; rejects on any error along the way.
   *
   * On rejection the handler has already responded to the client (502 +
   * destroy) and cleaned up; the caller's only job is to surface the
   * error (logs, hooks).
   */
  upgrade(
    req: IncomingMessage,
    socket: net.Socket,
    head: Buffer,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const { config } = this.httpHandler;
      const url = new URL(req.url ?? '/', 'http://localhost');
      const route = matchRoute(config.routes, url.pathname);

      if (!route || route.upstreams.length === 0) {
        this.fail(socket, 502, 'Bad Gateway');
        reject(
          new Error(
            route
              ? `No upstreams configured for route '${url.pathname}'`
              : `No matching route for WebSocket upgrade '${url.pathname}'`,
          ),
        );
        return;
      }

      const candidates = this.httpHandler.healthyCandidates(route.upstreams);
      const upstream = this.httpHandler.getBalancer(route).pick(candidates);

      const targetPath =
        rewritePath(url.pathname, route.rewrite) + (url.search ?? '');
      const upgradeHeaders = this.headersService.buildUpgradeHeaders(
        req,
        route.headers,
        upstream,
      );

      const requestLine = `${req.method ?? 'GET'} ${targetPath} HTTP/1.1\r\n`;
      const headerBlock = `${Object.entries(upgradeHeaders)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n')}\r\n\r\n`;

      const useTls = upstream.protocol === 'https';
      const connectOptions = { host: upstream.host, port: upstream.port };
      let settled = false;
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const settleReject = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const onConnect = () => {
        upstreamSocket.write(requestLine + headerBlock);
        if (head.length > 0) upstreamSocket.write(head);
        socket.pipe(upstreamSocket);
        upstreamSocket.pipe(socket);
        settleResolve();
      };

      const upstreamSocket = useTls
        ? tls.connect(connectOptions, onConnect)
        : net.createConnection(connectOptions, onConnect);

      const cleanup = () => {
        socket.destroy();
        upstreamSocket.destroy();
      };

      upstreamSocket.on('error', (err) => {
        cleanup();
        settleReject(err instanceof Error ? err : new Error(String(err)));
      });

      upstreamSocket.setTimeout(
        route.timeout ?? config.timeout ?? 30000,
        () => {
          cleanup();
          settleReject(
            new Error(
              `Upstream WebSocket connection timed out ${upstream.host}:${upstream.port}`,
            ),
          );
        },
      );

      socket.on('error', cleanup);
      socket.on('close', cleanup);
      upstreamSocket.on('close', cleanup);
    });
  }

  private fail(socket: net.Socket, status: number, message: string): void {
    if (!socket.destroyed && socket.writable) {
      socket.write(`HTTP/1.1 ${status} ${message}\r\n\r\n`);
    }
    socket.destroy();
  }
}
