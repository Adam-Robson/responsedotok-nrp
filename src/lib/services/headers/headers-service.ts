import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { HOP_BY_HOP_HEADERS } from '../../constants/hop-by-hop-headers.js';
import type { HeaderRules } from '../../types/header-rules.js';

/**
 * HeaderService is responsible for managing HTTP headers for both requests and responses.
 * It merges global header rules with route-specific header rules, and ensures that
 * hop-by-hop headers are stripped from requests before they are sent to upstream servers.
 * It also handles the forwarding of client IP information via the X-Forwarded-For header.
 * @param {HeaderRules | undefined} globalRules - The global header rules to apply to all requests and responses.
 * @param {boolean} forwardIp - Whether to forward the client's IP address in the X-Forwarded-For header.
 * @returns {HeaderService} An instance of the HeaderService class.
 */

export class HeadersService {
  constructor(
    private readonly globalRules: HeaderRules | undefined,
    private readonly forwardIp: boolean,
  ) {}

  /**
   * Build the headers to send to the upstream, merging global + route rules.
   * Hop-by-hop headers are stripped automatically.
   * @param req The incoming HTTP request.
   * @param routeRules The header rules for the route.
   * @param upstream The upstream host and port.
   * @returns The headers to send to the upstream.
   */

  buildRequestHeaders(
    req: IncomingMessage,
    routeRules: HeaderRules | undefined,
    upstream: { host: string; port: number },
  ): IncomingHttpHeaders {
    const headers: IncomingHttpHeaders = { ...req.headers };

    this.stripHopByHop(headers);

    headers.host = `${upstream.host}:${upstream.port}`;

    if (this.forwardIp) {
      const existing = headers['x-forwarded-for'];
      const clientIp = req.socket.remoteAddress ?? 'unknown';
      headers['x-forwarded-for'] = existing
        ? `${existing}, ${clientIp}`
        : clientIp;
      headers['x-forwarded-proto'] ??= (req.socket as { encrypted?: boolean })
        .encrypted
        ? 'https'
        : 'http';
      headers['x-forwarded-host'] ??= req.headers.host ?? '';
    }

    this.applyRules(headers, this.globalRules, 'request');
    this.applyRules(headers, routeRules, 'request');

    return headers;
  }

  /**
   * Apply response headers based on the given route rules.
   * @param res The server response to apply headers to.
   * @param routeRules The header rules for the route.
   */

  applyResponseHeaders(
    res: ServerResponse,
    routeRules: HeaderRules | undefined,
  ): void {
    for (const key of [
      ...(this.globalRules?.removeResponse ?? []),
      ...(routeRules?.removeResponse ?? []),
    ]) {
      res.removeHeader(key.toLowerCase());
    }

    for (const rules of [this.globalRules?.response, routeRules?.response]) {
      if (!rules) continue;
      for (const [key, value] of Object.entries(rules)) {
        res.setHeader(key.toLowerCase(), value);
      }
    }
  }

  /**
   * Strip hop-by-hop headers from the given headers.
   * @param headers The headers to strip hop-by-hop headers from.
   */
  private stripHopByHop(headers: IncomingHttpHeaders): void {
    const cxn = headers.connection;
    if (typeof cxn === 'string') {
      for (const name of cxn.split(',')) {
        delete headers[name.trim().toLowerCase()];
      }
    }
    for (const name of HOP_BY_HOP_HEADERS) {
      delete headers[name];
    }
  }

  /**
   * Apply header rules based on the direction (request or response).
   * @param headers The headers to apply the rules to.
   * @param rules The header rules to apply.
   * @param direction The direction of the headers ('request' or 'response').
   * @returns void
   */

  private applyRules(
    headers: IncomingHttpHeaders,
    rules: HeaderRules | undefined,
    direction: 'request' | 'response',
  ): void {
    if (!rules) return;

    const removeKey =
      direction === 'request' ? 'removeRequest' : 'removeResponse';
    const addKey = direction;

    for (const key of rules[removeKey] ?? []) {
      delete headers[key.toLowerCase()];
    }
    for (const [key, value] of Object.entries(rules[addKey] ?? {})) {
      headers[key.toLowerCase()] = value;
    }
  }
}
