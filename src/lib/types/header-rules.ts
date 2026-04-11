/**
 * Header rules for nrp (the Node.js reverse proxy).
 *
 * This file defines the types for setting header rules that
 * can be applied to requests and responses coming
 * in to the nrp proxy server.
 *
 * @property {Record<string, string>} [request] - Headers to add or override for outgoing requests.
 * @property {Record<string, string>} [response] - Headers to add or override for incoming responses.
 * @property {string[]} [removeRequest] - Headers to remove from outgoing requests.
 * @property {string[]} [removeResponse] - Headers to remove from incoming responses.
 */

export interface HeaderRules {
  request?: Record<string, string>;
  response?: Record<string, string>;
  removeRequest?: string[];
  removeResponse?: string[];
}
