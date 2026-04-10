import type { Upstream } from '../../types/upstream.js';

/**
 * Abstract class that defines the interface for load balancers.
 * Concrete implementations: RoundRobin, Random, Weighted extend
 * this class and implement pick method.
 *
 * Use {@link createBalancer} to instantiate a concrete balancer
 * by strategy name.
 */
export abstract class LoadBalancer {
  abstract pick(upstreams: Upstream[]): Upstream;
}
