export { createProxy, ProxyServer } from './lib/services/proxy/proxy-server.js';
export type { ConfigType } from './lib/types/config.js';
export type { Context } from './lib/types/context.js';
export type { HeaderRules } from './lib/types/header-rules.js';
export type { Hooks } from './lib/types/hooks.js';
export { LoadBalancerStrategy } from './lib/types/load-balancer-strategy.js';
export type { Route } from './lib/types/route.js';
export type { RouteRewrite } from './lib/types/route-rewrite.js';
export type { Upstream } from './lib/types/upstream.js';

import process from 'node:process';
import { printHelp } from './cli/help.js';
import { parseArgs } from './cli/parse-args.js';
import { loadConfig } from './config/load-config.js';
import { applyEnvOverrides, envOverrides } from './env.js';
import { ProxyServer } from './lib/services/proxy/proxy-server.js';
import type { ConfigType } from './lib/types/config.js';

import { Logger } from './logger/logger.js';

/**
 * Reverse-proxy request handler: matches a route, picks a healthy upstream
 * via the configured load balancer, and forwards the request.
 *
 * Owns the shared HTTP/HTTPS agents and the {@link HealthService} lifecycle
 * (started/stopped via {@link start}/{@link stop}).
 */
export async function main(): Promise<void> {
  const { configPath, logLevel, help } = parseArgs(process.argv);

  if (help) {
    printHelp();
    process.exit(0);
  }

  const logger = new Logger(logLevel);

  let config: ConfigType;

  try {
    config = await loadConfig(configPath);
    config = applyEnvOverrides(config, envOverrides());
    logger.debug(`Config loaded from ${configPath}:`, { config: configPath });
  } catch (err) {
    logger.error(`Failed to load config from ${configPath}:`, {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }

  const server = new ProxyServer(config, {
    onRequest({ req, upstream, targetPath }) {
      logger.debug('→ request', {
        method: req.method,
        url: req.url,
        upstream: `${upstream.host}:${upstream.port}`,
        path: targetPath,
      });
      return true;
    },
    onResponse(ctx, statusCode) {
      logger.debug('← response', {
        statusCode,
        url: ctx.req.url,
        method: ctx.req.method,
        upstream: `${ctx.upstream.host}:${ctx.upstream.port}`,
        path: ctx.targetPath,
      });
    },
    onError(error, ctx) {
      logger.error('✗✗✗ proxy error ✗✗✗', {
        error: error.message,
        url: ctx?.req?.url,
        method: ctx?.req?.method,
        upstream: ctx?.upstream
          ? `${ctx.upstream.host}:${ctx.upstream.port}`
          : undefined,
        path: ctx?.targetPath,
      });
    },
  });

  await server.listen();
  logger.debug(
    `Proxy server is listening on ${config.host ?? ''}:${config.port}`,
    {
      port: config.port,
      host: config.host ?? 'localhost',
      routes: config.routes.length,
    },
  );

  // shutdown with grace
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const) {
    process.on(sig, async () => {
      logger.debug(
        `✗✗✗ Shut Down Mode ✗✗✗\nReceived ${sig}, Commencing shut down!`,
        { signal: sig },
      );
      try {
        await server.close();
        logger.debug('✗✗✗ Graceful shutdown bye ✗✗✗');
        process.exit(0);
      } catch (err) {
        logger.error(
          '✗✗✗ Error during shutdown; what do you think mopopipo ✗✗✗',
          {
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }
    });
  }
}

main().catch((err) => {
  console.error(
    '✗✗✗ Fatal error ✗✗✗',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
