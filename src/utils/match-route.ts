import type { Route } from '../lib/types/route.js';
import { isMatch } from './is-match.js';
/**
 * Find the first matching route for a given request path.
 * @param routes The list of routes to match against.
 * @param pathname The request path to match.
 * @returns The first matching route, or null if no match is found.
 *
 */
export function matchRoute(routes: Route[], pathname: string): Route | null {
  for (const route of routes) {
    if (isMatch(route.match, pathname)) return route;
  }
  return null;
}
