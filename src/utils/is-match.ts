import type { Route } from '../lib/types/route.js';

export function isMatch(match: Route['match'], path: string): boolean {
  if (typeof match === 'function') {
    return match(path);
  }
  if (match === '/') {
    return true;
  }
  return (
    path === match ||
    path.startsWith(`${match}/`) ||
    path.startsWith(`${match}?`)
  );
}
