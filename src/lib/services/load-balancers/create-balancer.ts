import { LoadBalancerStrategy } from '../../types/load-balancer-strategy.js';
import type { LoadBalancer } from './load-balancer.js';
import { RandomBalancer } from './random-balancer.js';
import { RoundRobinBalancer } from './round-robin-balancer.js';
import { WeightedBalancer } from './weighted-balancer.js';

/**
 * Factory function that creates a concrete LoadBalancer for a given strategy.
 *
 * This lives in its own module to avoid a circular dependency: the abstract
 * LoadBalancer class must be importable by the subclass modules without
 * pulling in the subclasses themselves.
 */
export function createBalancer(strategy: LoadBalancerStrategy): LoadBalancer {
  switch (strategy) {
    case LoadBalancerStrategy.RoundRobin:
      return new RoundRobinBalancer();
    case LoadBalancerStrategy.Random:
      return new RandomBalancer();
    case LoadBalancerStrategy.Weighted:
      return new WeightedBalancer();
    default: {
      const exhaustive: never = strategy;
      throw new Error(`Unknown load balancer strategy: ${exhaustive}`);
    }
  }
}
