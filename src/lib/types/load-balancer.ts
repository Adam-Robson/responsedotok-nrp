import type { Upstream } from './upstream.js';

export interface LoadBalancer {
    select(upstream: Upstream[]): Upstream;
}