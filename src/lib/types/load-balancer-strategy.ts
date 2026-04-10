/**
 * Load balancing strategies for the reverse proxy server as an enumeration.
 */

export enum LoadBalancerStrategy {
  RoundRobin = 'round-robin',
  Random = 'random',
  Weighted = 'weighted',
}
