import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthService } from '../src/lib/services/health/health-service.js';
import type { Upstream } from '../src/lib/types/upstream.js';

const upstream: Upstream = { host: '127.0.0.1', port: 9999 };

describe('HealthService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks all upstreams as healthy initially', () => {
    const svc = new HealthService([upstream]);
    expect(svc.isHealthy(upstream)).toBe(true);
  });

  it('marks an upstream as healthy after a successful TCP connect', async () => {
    const server = net.createServer();
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
    const port = (server.address() as net.AddressInfo).port;
    const u: Upstream = { host: '127.0.0.1', port };

    const svc = new HealthService([u], 100_000, 2000);
    svc.start();

    // Give the probe time to connect
    await new Promise((r) => setTimeout(r, 200));
    expect(svc.isHealthy(u)).toBe(true);

    svc.stop();
    await new Promise<void>((res) => server.close(() => res()));
  });

  it('marks an upstream as unhealthy when connection is refused', async () => {
    // Port with nothing listening
    const u: Upstream = { host: '127.0.0.1', port: 1 };
    const svc = new HealthService([u], 100_000, 1000);
    svc.start();

    await new Promise((r) => setTimeout(r, 500));
    expect(svc.isHealthy(u)).toBe(false);

    svc.stop();
  });

  it('recovers when an upstream comes back online', async () => {
    // Start with nothing listening — upstream goes unhealthy
    const server = net.createServer();
    const u: Upstream = { host: '127.0.0.1', port: 1 };

    const svc = new HealthService([u], 300, 200);
    svc.start();

    await new Promise((r) => setTimeout(r, 400));
    expect(svc.isHealthy(u)).toBe(false);

    // Now start a server on that port and update the upstream
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
    const port = (server.address() as net.AddressInfo).port;
    const u2: Upstream = { host: '127.0.0.1', port };

    svc.stop();

    const svc2 = new HealthService([u2], 300, 200);
    svc2.start();
    await new Promise((r) => setTimeout(r, 400));
    expect(svc2.isHealthy(u2)).toBe(true);

    svc2.stop();
    await new Promise<void>((res) => server.close(() => res()));
  });

  it('stop() clears all interval timers', () => {
    const svc = new HealthService([upstream], 500, 200);
    const clearSpy = vi.spyOn(global, 'clearInterval');
    svc.start();
    svc.stop();
    expect(clearSpy).toHaveBeenCalled();
  });
});
