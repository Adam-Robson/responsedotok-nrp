import { describe, it, expect } from 'vitest';
import { HeadersService } from '../src/lib/services/headers/headers-service.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

const makeReq = (
	headers: Record<string, unknown>,
	remoteAddress = '1.2.3.4',
	encrypted = false,
): IncomingMessage => {
	return {
		headers: headers as IncomingMessage['headers'],
		socket: { remoteAddress, encrypted },
	} as unknown as IncomingMessage;
};

const makeRes = () => {
	const headers: Record<string, unknown> = {};
	const res: Partial<ServerResponse> & { _headers: Record<string, unknown> } = {
		_headers: headers,
		setHeader(name: string, value: unknown) {
			headers[name.toLowerCase()] = value;
		},
		removeHeader(name: string) {
			delete headers[name.toLowerCase()];
		},
	};
	return res as unknown as ServerResponse & { _headers: Record<string, unknown> };
};

describe('HeadersService', () => {
	it('strips hop-by-hop headers and sets host header for upstream', () => {
		const svc = new HeadersService(undefined, false);
		const req = makeReq({
			connection: 'X-Remove, keep-alive',
			'x-remove': 'v',
			'keep-alive': '1',
			host: 'orig-host',
		});

		const out = svc.buildRequestHeaders(req, undefined, { host: 'upstream', port: 8080 });

		expect(out.host).toBe('upstream:8080');
		expect(out['x-remove']).toBeUndefined();
		expect(out['keep-alive']).toBeUndefined();
		expect(out.connection).toBeUndefined();
	});

	it('forwards client IP and sets x-forwarded headers when enabled', () => {
		const svc = new HeadersService(undefined, true);
		const req = makeReq({ host: 'example.com', 'x-forwarded-for': '9.9.9.9' }, '1.2.3.4', true);

		const out = svc.buildRequestHeaders(req, undefined, { host: 'u', port: 80 });

		expect(out['x-forwarded-for']).toBe('9.9.9.9, 1.2.3.4');
		expect(out['x-forwarded-proto']).toBe('https');
		expect(out['x-forwarded-host']).toBe('example.com');
	});

	it('applies global and route request rules (add/remove) in order', () => {
		const globalRules = {
			removeRequest: ['to-remove'],
			request: { 'x-global': 'g' },
		} as any;
		const routeRules = {
			removeRequest: ['x-global'],
			request: { 'x-route': 'r' },
		} as any;

		const svc = new HeadersService(globalRules, false);
		const req = makeReq({ 'x-global': 'g', 'to-remove': 'v' });
		const out = svc.buildRequestHeaders(req, routeRules, { host: 'u', port: 1 });

		expect(out['x-global']).toBeUndefined();
		expect(out['x-route']).toBe('r');
		expect(out['to-remove']).toBeUndefined();
	});

	it('applies response header removals and additions from global and route rules', () => {
		const globalRules = {
			removeResponse: ['server'],
			response: { 'x-global': 'g' },
		} as any;
		const routeRules = {
			removeResponse: ['x-global'],
			response: { 'x-route': 'r' },
		} as any;

		const res = makeRes();
		// seed some headers that should be removed
		res._headers['server'] = 'nginx';
		res._headers['x-global'] = 'g';

		const svc = new HeadersService(globalRules, false);
		svc.applyResponseHeaders(res, routeRules);

		expect(res._headers['server']).toBeUndefined();
		// global response headers are applied after removals, so x-global will be present
		expect(res._headers['x-global']).toBe('g');
		expect(res._headers['x-route']).toBe('r');
	});
});
