import type { Upstream } from '../../types/upstream.js';
import { LoadBalancer } from './load-balancer.js';

/**
 * Select an upstream server based on weights.
 * Each upstream server can have an optional weight property that indicates its relative capacity.
 * The pick method calculates the total weight of all upstream servers, generates a random number,
 * and iterates through the servers to find the one that corresponds to the random number based on their weights.
 *
 * @property [pick] - A method that takes a list of upstream servers and returns an upstream server based on their weights.
 * @returns {Upstream} An upstream server selected based on weights.
 */

export class WeightedBalancer extends LoadBalancer {
  pick(upstreams: Upstream[]): Upstream {
    if (upstreams.length === 0) {
      throw new Error('No upstreams available');
    }
    const weights = upstreams.map((upstream) => {
      const weight = upstream.weight ?? 1;
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error(
          'WeightedBalancer.pick() requires all upstream weights to be positive finite numbers.',
        );
      }
      return weight;
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < upstreams.length; i++) {
      random -= weights[i];
      if (random <= 0) return upstreams[i];
    }
    // Fallback in case of rounding errors
    return upstreams[upstreams.length - 1];
  }
}
