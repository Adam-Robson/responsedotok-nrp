import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Route } from './route.js';
import type { Upstream } from './upstream.js';

/**
 * Context passed to middleware and handlers.
 *
 * @property {IncomingMessage} req - The incoming HTTP request.
 * @property {ServerResponse} res - The HTTP response object.
 * @property {Route} route - The matched route configuration for this request.
 * @property {Upstream} upstream - The selected upstream server for this request.
 * @property {string} targetPath - The path to forward the request to, after stripping the route prefix.
 *
 */

export interface Context {
  req: IncomingMessage;
  res: ServerResponse;
  route: Route;
  upstream: Upstream;
  targetPath: string;
}
