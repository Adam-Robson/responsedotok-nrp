/**
 * Load balancing strategies for the reverse proxy server.
 */

export enum LoadBalancerStrategy {
	RoundRobin = "round-robin",
	Random = "random",
	Weighted = "weighted",
}
