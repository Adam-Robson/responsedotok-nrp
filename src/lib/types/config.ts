import type { HeaderRules } from './header-rules.js';
import type { LoadBalancerStrategy } from './load-balancer-strategy.js';
import type { Route } from './route.js';

/**
 * Global configuration types.
 *
 * @property {number} port - Port to listen on - default 8888.
 * @property {string} [host] - Host to listen on - default '0.0.0.0'.
 * @property {Route[]} routes - Array of route configurations.
 * @property {HeaderRules} [headers] - Global header rules applied to every request/response.
 * @property {LoadBalancerStrategy} [balancer] - Load balancer strategy - default 'round-robin'.
 * @property {number} [timeout] - Proxy request timeout - default 30000ms (30sec).
 * @property {boolean} [forwardIp] - Enable or disable forwarding the client IP in the X-Forwarded-For header - default true.
 */

export interface ConfigType {
  port: number;
  host?: string;
  routes: Route[];
  headers?: HeaderRules;
  balancer?: LoadBalancerStrategy;
  timeout?: number;
  forwardIp?: boolean;
  maxBodySize?: number;
  healthCheck?: { interval?: number; timeout?: number };
}
