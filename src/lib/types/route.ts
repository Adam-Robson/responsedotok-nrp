/**
 * Type for a route, globally.
 *
 * @interface Route
 * @property {string | RouteMatch} match - A string or a function to determine if a request matches this route.
 * @property {Upstream[]} upstreams - Al list of upstream servers to proxy requests to.
 * @property {RouteRewrite} [rewrite] - Optional rules to rewrite the request path before prxying.
 * @property {HeaderRules} [headers] - Optional rules to modify request & response headers.
 * @property {LoadBalancerStrategy} [balancer] - OPtional load balancing strategy for distributing requests across upstreams.
 */

import type { HeaderRules } from './header-rules.js';
import type { LoadBalancerStrategy } from './load-balancer-strategy.js';
import type { RouteMatch } from './route-match.js';
import type { RouteRewrite } from './route-rewrite.js';
import type { Upstream } from './upstream.js';

export interface Route {
  match: string | RouteMatch;
  upstreams: Upstream[];
  rewrite?: RouteRewrite;
  headers?: HeaderRules;
  balancer?: LoadBalancerStrategy;
  timeout?: number;
  maxBodySize?: number;
}
