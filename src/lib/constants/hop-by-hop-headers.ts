/**
 * Hop-by-hop headers are HTTP headers that are meant only for a single connection between two machines.
 * They are only relevant for a single transport-level connection and should not be included
 * in requests or responses that are forwarded. Stripping them is required by the HTTP/1.1 spec
 * (RFC 7230) for any intermediary like a proxy.
 *
 */

export const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
