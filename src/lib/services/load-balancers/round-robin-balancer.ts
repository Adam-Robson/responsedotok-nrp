import type { Upstream } from '../../types/upstream.js';
import { LoadBalancer } from './load-balancer.js';

/**
 * Round Robin Load Balancer implementation. Cycle through the list of upstreams in order.
 *
 * @property {number} idx - Current index in the list of upstreams. Increments each time upstream is picked.
 * @returns [Upstream] The selected upstream server.
 */

export class RoundRobinBalancer extends LoadBalancer {
  private idx: number = 0;

  pick(upstreams: Upstream[]): Upstream {
    if (upstreams.length === 0) {
      throw new Error('No upstreams available');
    }
    const upstream = upstreams[this.idx % upstreams.length];
    this.idx = (this.idx + 1) % upstreams.length;
    return upstream;
  }
}
