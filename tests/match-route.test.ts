import { describe, expect, it } from 'vitest';
import type { Route } from '../src/lib/types/route.js';
import { matchRoute } from '../src/utils/match-route.js';

const upstream = { host: 'localhost', port: 3000 };

describe('matchRoute', () => {
  it('returns null for an empty route list', () => {
    expect(matchRoute([], '/api')).toBeNull();
  });

  it('returns null when no route matches', () => {
    const routes: Route[] = [{ match: 's/api', upstreams: [upstream] }];
    expect(matchRoute(routes, '/other')).toBeNull();
  });

  it('returns the first matching route', () => {
    const routes: Route[] = [
      { match: '/api', upstreams: [upstream] },
      { match: '/', upstreams: [{ host: 'fallback', port: 80 }] },
    ];
    expect(matchRoute(routes, '/api/users')).toBe(routes[0]);
  });

  it('falls through to a later route when earlier ones do not match', () => {
    const routes: Route[] = [
      { match: '/api', upstreams: [upstream] },
      { match: '/', upstreams: [{ host: 'fallback', port: 80 }] },
    ];
    expect(matchRoute(routes, '/something')).toBe(routes[1]);
  });

  it('supports function-based match', () => {
    const route: Route = {
      match: (p) => p.startsWith('/admin'),
      upstreams: [upstream],
    };
    expect(matchRoute([route], '/admin/settings')).toBe(route);
    expect(matchRoute([route], '/user')).toBeNull();
  });
});
