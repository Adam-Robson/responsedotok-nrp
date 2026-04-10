import type { Upstream } from '../../types/upstream.js';
import { LoadBalancer } from './load-balancer.js';

/**
 * RandomBalancer is a load balancer that selects an upstream server randomly from the list of available servers.
 * It extends the LoadBalancer abstract class and implements the pick method to return a random upstream server.
 *
 * @property [pick] - A method that takes a list of upstream servers and returns a randomly selected upstream server.
 * @returns {Upstream} A randomly selected upstream server.
 */

export class RandomBalancer extends LoadBalancer {
  pick(upstreams: Upstream[]): Upstream {
    if (upstreams.length === 0) {
      throw new Error('No upstreams available');
    }
    const randomIndex = Math.floor(Math.random() * upstreams.length);
    return upstreams[randomIndex];
  }
}
