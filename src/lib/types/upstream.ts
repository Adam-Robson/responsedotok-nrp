/**
 * Configuration for the upstream server.
 *
 * @property {string} host - The upstream hostname or IP address.
 * @property {number} port - The upstream port number.
 * @property {('http' | 'https')} [protocol] - Protocol for connecting upstream - default http.
 * @property {number} [weight] - Weight of upstream used with weighted load balancing. Defaults to 1.
 */

export interface Upstream {
  host: string;
  port: number;
  protocol?: 'http' | 'https';
  weight?: number;
}
