import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfigType } from '../lib/types/config.js';

/**
 * Configure global settings.
 *
 * @property {number} port - The port number the server will listen on.
 * @property {string} [host] - The host address the server will bind to (default: '0.0.0.0').
 * @property {Route[]} routes - An array of route configurations.
 * @property {HeaderRules} [headers] - Optional header manipulation rules.
 * @property {LoadBalancerStrategy} [balancer] - Optional load balancing strategy.
 * @property {number} [timeout] - Optional request timeout in milliseconds.
 * @property {boolean} [forwardIp] - Whether to forward the client's IP address.
 * @property {number} [maxBodySize] - Maximum allowed size for request bodies in bytes.
 * @property {{ interval?: number; timeout?: number }} [healthCheck] - Optional health check configuration.
 *
 */

export class Config {
  readonly port: number;
  readonly host: string;
  readonly routes: ConfigType['routes'];
  readonly headers?: ConfigType['headers'];
  readonly balancer?: ConfigType['balancer'];
  readonly timeout?: ConfigType['timeout'];
  readonly forwardIp?: ConfigType['forwardIp'];
  readonly maxBodySize?: ConfigType['maxBodySize'];
  readonly healthCheck?: ConfigType['healthCheck'];

  private constructor(cfg: ConfigType) {
    this.port = cfg.port;
    this.host = cfg.host ?? '0.0.0.0';
    this.routes = cfg.routes;
    this.headers = cfg.headers;
    this.balancer = cfg.balancer;
    this.timeout = cfg.timeout;
    this.forwardIp = cfg.forwardIp;
    this.maxBodySize = cfg.maxBodySize;
    this.healthCheck = cfg.healthCheck;
  }

  static validate(raw: unknown, source: string): ConfigType {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Config in source ${source} must be an object`);
    }

    const conf = raw as Partial<ConfigType>;

    if (typeof conf.port !== 'number') {
      throw new Error(
        `Config in ${source} must have a numeric 'port' property`,
      );
    }
    if (conf.port < 1 || conf.port > 65535 || !Number.isInteger(conf.port)) {
      throw new Error(
        `Config in ${source} PORT must be an integer between 1 and 65535.`,
      );
    }

    if (!Array.isArray(conf.routes) || conf.routes.length === 0) {
      throw new Error(
        `Config in ${source} must have a non-empty 'routes' array`,
      );
    }

    for (const [i, rte] of conf.routes.entries()) {
      if (!rte.match && rte.match !== '') {
        throw new Error(
          `Config in ${source} is required to have routes.match at index ${i}`,
        );
      }
      if (!Array.isArray(rte.upstreams) || rte.upstreams.length === 0) {
        throw new Error(
          `Config in ${source} is required to have routes.upstreams at index ${i}`,
        );
      }
      for (const [_, u] of rte.upstreams.entries()) {
        if (!u.host || typeof u.port !== 'number') {
          throw new Error(
            `Config in ${source} is required to have Number for port and String for host.`,
          );
        }
        if (u.port < 1 || u.port > 65535 || !Number.isInteger(u.port)) {
          throw new Error(
            `Config in ${source} upstream port must be an integer between 1 and 65535.`,
          );
        }
      }
    }
    return conf as ConfigType;
  }

  static async fromFile(filePath: string): Promise<Config> {
    const absolutePath = path.resolve(filePath);
    const extension = path.extname(absolutePath).toLowerCase();
    let raw: unknown;

    if (extension === '.json') {
      const contents = await fs.readFile(absolutePath, 'utf-8');
      raw = JSON.parse(contents);
    } else if (
      extension === '.js' ||
      extension === '.mjs' ||
      extension === '.ts'
    ) {
      const module = (await import(absolutePath)) as { default?: ConfigType };
      raw = module.default ?? module;
    } else {
      throw new Error(`Unsupported config file extension: ${extension}`);
    }

    const validated = Config.validate(raw, filePath);
    return new Config(validated);
  }

  static fromObject(data: unknown, source = 'inline'): Config {
    const validated = Config.validate(data, source);
    return new Config(validated);
  }
}
