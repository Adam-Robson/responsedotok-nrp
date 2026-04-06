import type { Upstream } from './upstream.js';

export interface LoadBalancerType {
    select(upstream: Upstream[]): Upstream;
}