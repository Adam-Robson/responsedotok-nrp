import { LoadBalancerStrategy } from '../../types/load-balancer-strategy.js';
import type { Upstream } from '../../types/upstream.js';
import { RoundRobinBalancer } from './round-robin-balancer.js';
import { RandomBalancer } from './random-balancer.js';
import { WeightedBalancer } from './weighted-balancer.js';

/**
 * LoadBalancer is an abstract class that defines the interface for load balancers. 
 * It has a static create method that takes a LoadBalancerStrategy and returns an
 * instance of the corresponding load balancer implementation. 
 * 
 * @property [pick] - An abstract method that takes a list of upstream servers and returns
 * an upstream server based on the strategy selected.
 * @returns {LoadBalancer} An instance of a load balancer.
 */

export abstract class LoadBalancer {
  abstract pick(upstreams: Upstream[]): Upstream;

  static create(strategy: LoadBalancerStrategy): LoadBalancer {
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
}
