import net from 'node:net';
import type { Upstream } from '../../types/upstream.js';

/**
 * Check the health of upstream servers periodically via TCP and
 * track health status. Upstreams all begin as healthy, and
 * are only marked as unhealthy after failing a health check.
 *
 * @property [unhealthy]
 */

export class HealthService {
  private readonly unhealthy: Set<string> = new Set();
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private started = false;

  constructor(
    private readonly upstreams: Upstream[],
    private readonly interval: number = 30000,
    private readonly timeout: number = 5000,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const u of this.upstreams) {
      this.probe(u);
      const timer = setInterval(() => this.probe(u), this.interval);
      timer.unref();
      this.timers.push(timer);
    }
  }

  stop(): void {
    for (const t of this.timers) {
      clearInterval(t);
    }
    this.timers.length = 0;
    this.started = false;
  }

  isHealthy(u: Upstream): boolean {
    return !this.unhealthy.has(this.key(u));
  }

  private key(u: Upstream): string {
    return `${u.host}:${u.port}`;
  }

  private probe(u: Upstream): void {
    const key = this.key(u);
    const socket = net.createConnection({
      host: u.host,
      port: u.port,
    });

    socket.setTimeout(this.timeout);
    socket.on('connect', () => {
      this.unhealthy.delete(key);
      socket.destroy();
    });

    socket.on('error', () => {
      this.unhealthy.add(key);
      socket.destroy();
    });

    socket.on('timeout', () => {
      this.unhealthy.add(key);
      socket.destroy();
    });
  }
}
