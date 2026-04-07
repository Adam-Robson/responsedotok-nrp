import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { envOverrides, applyEnvOverrides } from '../scripts/env.js';
import type { ConfigType } from '../src/lib/types/config.js';

const baseConfig: ConfigType = {
	port: 8080,
	routes: [{ match: '/api', upstreams: [{ host: 'localhost', port: 3000 }] }],
};

describe('envOverrides', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	it('returns empty object when no env vars are set', () => {
		delete process.env.PORT;
		delete process.env.HOST;
		expect(envOverrides()).toEqual({});
	});

	it('parses a valid PORT', () => {
		process.env.PORT = '3000';
		expect(envOverrides().port).toBe(3000);
	});

	it('ignores PORT below 1', () => {
		const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		process.env.PORT = '0';
		const result = envOverrides();
		expect(result.port).toBeUndefined();
		expect(write).toHaveBeenCalled();
	});

	it('ignores PORT above 65535', () => {
		const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		process.env.PORT = '99999';
		const result = envOverrides();
		expect(result.port).toBeUndefined();
		expect(write).toHaveBeenCalled();
	});

	it('ignores non-numeric PORT', () => {
		const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		process.env.PORT = 'abc';
		const result = envOverrides();
		expect(result.port).toBeUndefined();
		expect(write).toHaveBeenCalled();
	});

	it('parses a valid HOST', () => {
		process.env.HOST = '0.0.0.0';
		expect(envOverrides().host).toBe('0.0.0.0');
	});

	it('trims whitespace from HOST', () => {
		process.env.HOST = '  localhost  ';
		expect(envOverrides().host).toBe('localhost');
	});

	it('ignores empty HOST', () => {
		const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		process.env.HOST = '   ';
		const result = envOverrides();
		expect(result.host).toBeUndefined();
		expect(write).toHaveBeenCalled();
	});

	it('returns both port and host when both are valid', () => {
		process.env.PORT = '4000';
		process.env.HOST = '127.0.0.1';
		const result = envOverrides();
		expect(result.port).toBe(4000);
		expect(result.host).toBe('127.0.0.1');
	});
});

describe('applyEnvOverrides', () => {
	it('returns the original config when overrides are empty', () => {
		const result = applyEnvOverrides(baseConfig, {});
		expect(result).toBe(baseConfig);
	});

	it('overrides port', () => {
		const result = applyEnvOverrides(baseConfig, { port: 9090 });
		expect(result.port).toBe(9090);
		expect(result.routes).toBe(baseConfig.routes);
	});

	it('overrides host', () => {
		const result = applyEnvOverrides(baseConfig, { host: '127.0.0.1' });
		expect(result.host).toBe('127.0.0.1');
	});

	it('overrides both port and host', () => {
		const result = applyEnvOverrides(baseConfig, { port: 5000, host: '::1' });
		expect(result.port).toBe(5000);
		expect(result.host).toBe('::1');
	});

	it('does not mutate the original config', () => {
		applyEnvOverrides(baseConfig, { port: 1234 });
		expect(baseConfig.port).toBe(8080);
	});
});
