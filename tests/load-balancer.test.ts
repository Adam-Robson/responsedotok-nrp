import { describe, expect, it } from 'vitest';
import { createBalancer } from '../src/lib/services/load-balancers/create-balancer.js';
import { RandomBalancer } from '../src/lib/services/load-balancers/random-balancer.js';
import { RoundRobinBalancer } from '../src/lib/services/load-balancers/round-robin-balancer.js';
import { WeightedBalancer } from '../src/lib/services/load-balancers/weighted-balancer.js';
import { LoadBalancerStrategy } from '../src/lib/types/load-balancer-strategy.js';
import type { Upstream } from '../src/lib/types/upstream.js';

const upstreams: Upstream[] = [
  { host: '10.0.0.1', port: 3000 },
  { host: '10.0.0.2', port: 3000 },
  { host: '10.0.0.3', port: 3000 },
];

describe('createBalancer', () => {
  it('creates a RoundRobinBalancer for round-robin strategy', () => {
    const balancer = createBalancer(LoadBalancerStrategy.RoundRobin);
    expect(balancer).toBeInstanceOf(RoundRobinBalancer);
  });

  it('creates a RandomBalancer for random strategy', () => {
    const balancer = createBalancer(LoadBalancerStrategy.Random);
    expect(balancer).toBeInstanceOf(RandomBalancer);
  });

  it('creates a WeightedBalancer for weighted strategy', () => {
    const balancer = createBalancer(LoadBalancerStrategy.Weighted);
    expect(balancer).toBeInstanceOf(WeightedBalancer);
  });

  it('throws for an unknown strategy', () => {
    expect(() => createBalancer('unknown' as LoadBalancerStrategy)).toThrow(
      /Unknown load balancer strategy/,
    );
  });
});

describe('RoundRobinBalancer', () => {
  it('cycles through upstreams in order', () => {
    const balancer = new RoundRobinBalancer();
    expect(balancer.pick(upstreams)).toBe(upstreams[0]);
    expect(balancer.pick(upstreams)).toBe(upstreams[1]);
    expect(balancer.pick(upstreams)).toBe(upstreams[2]);
    expect(balancer.pick(upstreams)).toBe(upstreams[0]);
  });

  it('throws when no upstreams are provided', () => {
    const balancer = new RoundRobinBalancer();
    expect(() => balancer.pick([])).toThrow('No upstreams available');
  });

  it('wraps around after exhausting all upstreams', () => {
    const balancer = new RoundRobinBalancer();
    for (let i = 0; i < upstreams.length; i++) balancer.pick(upstreams);
    expect(balancer.pick(upstreams)).toBe(upstreams[0]);
  });
});

describe('RandomBalancer', () => {
  it('returns an upstream from the provided list', () => {
    const balancer = new RandomBalancer();
    const result = balancer.pick(upstreams);
    expect(upstreams).toContain(result);
  });

  it('distributes picks across upstreams over many calls', () => {
    const balancer = new RandomBalancer();
    const counts = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const u = balancer.pick(upstreams);
      counts.set(u.host, (counts.get(u.host) ?? 0) + 1);
    }
    for (const u of upstreams) {
      expect(counts.get(u.host)).toBeGreaterThan(0);
    }
  });
});

describe('WeightedBalancer', () => {
  it('returns an upstream from the provided list', () => {
    const balancer = new WeightedBalancer();
    const result = balancer.pick(upstreams);
    expect(upstreams).toContain(result);
  });

  it('throws when no upstreams are provided', () => {
    const balancer = new WeightedBalancer();
    expect(() => balancer.pick([])).toThrow('No upstreams available');
  });

  it('defaults weight to 1 when not specified', () => {
    const balancer = new WeightedBalancer();
    const counts = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const u = balancer.pick(upstreams);
      counts.set(u.host, (counts.get(u.host) ?? 0) + 1);
    }
    for (const u of upstreams) {
      expect(counts.get(u.host)).toBeGreaterThan(0);
    }
  });
});
