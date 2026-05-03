import type { IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import https from 'node:https';
import { matchRoute } from '../../../utils/match-route.js';
import { rewritePath } from '../../../utils/rewrite-path.js';
import type { ConfigType } from '../../types/config.js';
import type { Context } from '../../types/context.js';
import type { Hooks } from '../../types/hooks.js';
import { LoadBalancerStrategy } from '../../types/load-balancer-strategy.js';

import type { Upstream } from '../../types/upstream.js';
import { HeadersService } from '../headers/headers-service.js';
import { HealthService } from '../health/health-service.js';
import { createBalancer } from '../load-balancers/create-balancer.js';
import type { LoadBalancer } from '../load-balancers/load-balancer.js';

const RETRY_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class HttpHandler {
  private readonly balancers = new Map<object, LoadBalancer>();
  private readonly globalBalancer: LoadBalancer;
  private readonly httpAgent = new http.Agent({ keepAlive: true });
  private readonly httpsAgent = new https.Agent({ keepAlive: true });
  private readonly healthService: HealthService;
  private readonly headersService: HeadersService;

  constructor(
    readonly config: ConfigType,
    private readonly hooks: Hooks = {},
    headersService?: HeadersService,
  ) {
    this.globalBalancer = createBalancer(
      config.balancer ?? LoadBalancerStrategy.RoundRobin,
    );

    this.headersService =
      headersService ??
      new HeadersService(config.headers, config.forwardIp ?? true);

    const allUpstreams = [
      ...new Map(
        config.routes
          .flatMap((r) => r.upstreams)
          .map((u) => [`${u.host}:${u.port}`, u]),
      ).values(),
    ];
    this.healthService = new HealthService(
      allUpstreams,
      config.healthCheck?.interval,
      config.healthCheck?.timeout,
    );
  }

  start(): void {
    this.healthService.start();
  }

  stop(): void {
    this.healthService.stop();
  }

  async handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    const route = matchRoute(this.config.routes, pathname);
    if (!route) {
      this.sendError(res, 502, 'Bad Gateway');
      return;
    }

    const maxBodySize = route.maxBodySize ?? this.config.maxBodySize;
    if (maxBodySize !== undefined) {
      const contentLength = Number(req.headers['content-length']);
      if (!Number.isNaN(contentLength) && contentLength > maxBodySize) {
        req.resume();
        this.sendError(res, 413, 'Payload too large.');
        return;
      }
    }

    const candidates = this.healthyCandidates(route.upstreams);
    if (candidates.length === 0) {
      this.handleError(
        new Error(`No upstreams configured for route '${pathname}'`),
        { req, route },
        res,
      );
      return;
    }

    const balancer = this.getBalancer(route);
    const upstream = balancer.pick(candidates);

    const targetPath =
      rewritePath(pathname, route.rewrite) + (url.search ?? '');

    const ctx: Context = { req, res, route, upstream, targetPath };

    if (this.hooks.onRequest) {
      try {
        const proceed = await this.hooks.onRequest({
          req,
          route,
          upstream,
          targetPath,
        });
        if (!proceed) {
          this.sendError(res, 403, 'Forbidden');
          return;
        }
      } catch (err) {
        this.handleError(
          err instanceof Error ? err : new Error(String(err)),
          ctx,
          res,
        );
        return;
      }
    }
    await this.forward(ctx, new Set<Upstream>([upstream]));
  }

  private forward(ctx: Context, tried: Set<Upstream>): Promise<void> {
    return new Promise((resolve) => {
      const { req, res, upstream, targetPath, route } = ctx;

      const protocol = upstream.protocol ?? 'http';
      const transport = protocol === 'https' ? https : http;

      const forwardHeaders = this.headersService.buildRequestHeaders(
        req,
        route.headers,
        upstream,
      );

      const options: http.RequestOptions = {
        hostname: upstream.host,
        port: upstream.port,
        method: req.method,
        path: targetPath,
        headers: forwardHeaders,
        timeout: route.timeout ?? this.config.timeout ?? 30000,
        agent: protocol === 'https' ? this.httpsAgent : this.httpAgent,
      };

      const proxyReq = transport.request(options, (proxyRes) => {
        res.statusCode = proxyRes.statusCode ?? 502;

        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (v !== undefined) res.setHeader(k, v);
        }

        this.headersService.applyResponseHeaders(res, route.headers);

        proxyRes.on('error', (err) => {
          this.handleError(err, ctx, res);
          resolve();
        });

        if (this.hooks.onResponse) {
          Promise.resolve(this.hooks.onResponse(ctx, res.statusCode))
            .catch((err) => {
              this.handleError(
                err instanceof Error ? err : new Error(String(err)),
                ctx,
                res,
              );
            })
            .then(() => {
              proxyRes.pipe(res, { end: true });
              proxyRes.on('end', resolve);
            });
        } else {
          proxyRes.pipe(res, { end: true });
          proxyRes.on('end', resolve);
        }
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        this.handleError(
          new Error(
            `Upstream request timed out ${upstream.host}:${upstream.port}`,
          ),
          ctx,
          res,
        );
        resolve();
      });

      let bodyTooLarge = false;
      let bodyConsumed = false;

      proxyReq.on('error', (err) => {
        if (bodyTooLarge) {
          if (!res.headersSent) this.sendError(res, 413, 'Payload Too Large');
          resolve();
          return;
        }

        if (!res.headersSent && this.canRetry(req, bodyConsumed)) {
          tried.add(upstream);

          const remaining = route.upstreams.filter((u) => !tried.has(u));
          const healthyRemaining = remaining.filter((u) =>
            this.healthService.isHealthy(u),
          );
          const candidates =
            healthyRemaining.length > 0 ? healthyRemaining : remaining;

          if (candidates.length > 0) {
            const balancer = this.getBalancer(route);
            const nextUpstream = balancer.pick(candidates);
            const nextCtx = { ...ctx, upstream: nextUpstream };
            this.forward(nextCtx, tried).then(resolve);
            return;
          }
        }

        this.handleError(err, ctx, res);
        resolve();
      });

      req.on('error', (err) => {
        this.handleError(err, ctx, res);
        resolve();
      });

      const maxBodySize = route.maxBodySize ?? this.config.maxBodySize;
      let bodyBytes = 0;
      req.on('data', (chunk: Buffer) => {
        bodyConsumed = true;
        if (maxBodySize === undefined) return;
        bodyBytes += chunk.length;
        if (!bodyTooLarge && bodyBytes > maxBodySize) {
          bodyTooLarge = true;
          req.resume();
          proxyReq.destroy();
        }
      });

      req.pipe(proxyReq, { end: true });
    });
  }

  /**
   * Retry is only safe when the upstream connection failed before any
   * request body was streamed. For idempotent methods with no body the
   * retry is a no-op replay; for others the body has been consumed by
   * the first pipe and cannot be re-sent.
   */
  private canRetry(req: IncomingMessage, bodyConsumed: boolean): boolean {
    if (bodyConsumed) return false;
    const method = (req.method ?? 'GET').toUpperCase();
    if (!RETRY_SAFE_METHODS.has(method)) return false;
    const cl = req.headers['content-length'];
    if (cl !== undefined && cl !== '0') return false;
    if (req.headers['transfer-encoding']) return false;
    return true;
  }

  healthyCandidates(upstreams: Upstream[]): Upstream[] {
    const healthy = upstreams.filter((u) => this.healthService.isHealthy(u));
    return healthy.length > 0 ? healthy : upstreams;
  }

  getBalancer(route: {
    upstreams: Upstream[];
    balancer?: string;
  }): LoadBalancer {
    if (!route.balancer) return this.globalBalancer;

    if (!this.balancers.has(route)) {
      this.balancers.set(
        route,
        createBalancer(route.balancer as LoadBalancerStrategy),
      );
    }
    return this.balancers.get(route) ?? this.globalBalancer;
  }

  private handleError(
    err: Error,
    ctx: Partial<Context>,
    res: ServerResponse,
  ): void {
    this.hooks.onError?.(err, ctx);
    if (!res.headersSent) {
      this.sendError(res, 502, 'Bad Gateway');
    }
  }

  private sendError(
    res: ServerResponse,
    status: number,
    message: string,
  ): void {
    if (res.headersSent) return;
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(`${status} ${message}`);
  }
}
