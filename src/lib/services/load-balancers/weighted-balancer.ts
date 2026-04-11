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
      throw new Error('No upstream servers available');
    }
    const totalWeight = upstreams.reduce((sum, u) => sum + (u.weight ?? 1), 0);
    let random = Math.random() * totalWeight;
    for (const upstream of upstreams) {
      random -= upstream.weight ?? 1;
      if (random <= 0) return upstream;
    }
    return upstreams[upstreams.length - 1] as Upstream;
  }
}
