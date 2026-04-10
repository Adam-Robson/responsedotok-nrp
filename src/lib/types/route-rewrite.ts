/**
 * Global route rewrite rules.
 *
 * @property {string} [stripPrefix] - Remove the specified prefix from the request path before proxying.
 * @property {string} [addPrefix] - Add the specified prefix to the request path before proxying.
 * @property {string} [replacePath] - Replace the entire request path with the specified path before proxying.
 */

export interface RouteRewrite {
  stripPrefix?: string;
  addPrefix?: string;
  replacePath?: string;
}
