import { LoadBalancerStrategy } from './load-balancer-strategy.js';
import type { Upstream } from './upstream.js';

export interface LoadBalancerType {
    pick(upstream: Upstream[]): Upstream;
    create?(strategy: LoadBalancerStrategy): LoadBalancerType;
}