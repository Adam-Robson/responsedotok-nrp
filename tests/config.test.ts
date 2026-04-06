import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Config } from '../src/config/config.js';
import { loadConfig } from '../src/config/load-config.js';

const validConfig = {
	port: 8080,
	routes: [{ match: '/api', upstreams: [{ host: 'localhost', port: 3000 }] }],
};

async function writeTempFile(content: string, ext: string): Promise<string> {
	const filePath = path.join(os.tmpdir(), `proxy-test-${Date.now()}${ext}`);
	await fs.writeFile(filePath, content, 'utf-8');
	return filePath;
}

describe("loadConfig", () => {
	it("loads a valid JSON config", async () => {
		const filePath = await writeTempFile(JSON.stringify(validConfig), ".json");
		const config = await loadConfig(filePath);
		expect(config.port).toBe(8080);
		expect(config.routes).toHaveLength(1);
	});

	it("throws for an unsupported file extension", async () => {
		const filePath = await writeTempFile("{}", ".yaml");
		await expect(loadConfig(filePath)).rejects.toThrow(
			"Unsupported config file extension",
		);
	});

	it("throws when config is not an object", async () => {
		const filePath = await writeTempFile('"just a string"', ".json");
		await expect(loadConfig(filePath)).rejects.toThrow("must be an object");
	});

	it("throws when port is missing", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				routes: [{ match: "/", upstreams: [{ host: "a", port: 80 }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("numeric 'port'");
	});

	it("throws when port is not a number", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				port: "abc",
				routes: [{ match: "/", upstreams: [{ host: "a", port: 80 }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("numeric 'port'");
	});

	it("throws when routes is missing", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({ port: 8080 }),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("non-empty 'routes'");
	});

	it("throws when routes is an empty array", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({ port: 8080, routes: [] }),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("non-empty 'routes'");
	});

	it("throws when a route is missing match", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				port: 8080,
				routes: [{ upstreams: [{ host: "a", port: 80 }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("routes.match");
	});

	it("throws when a route has an empty upstreams array", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({ port: 8080, routes: [{ match: "/", upstreams: [] }] }),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("routes.upstreams");
	});

	it("throws when an upstream is missing host", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				port: 8080,
				routes: [{ match: "/", upstreams: [{ port: 80 }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow();
	});

	it("throws when an upstream port is not a number", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				port: 8080,
				routes: [{ match: "/", upstreams: [{ host: "a", port: "abc" }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow();
	});

	it("throws when server port is 0", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				port: 0,
				routes: [{ match: "/", upstreams: [{ host: "a", port: 80 }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("1 and 65535");
	});

	it("throws when server port exceeds 65535", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				port: 99999,
				routes: [{ match: "/", upstreams: [{ host: "a", port: 80 }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("1 and 65535");
	});

	it("throws when server port is a float", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				port: 80.5,
				routes: [{ match: "/", upstreams: [{ host: "a", port: 80 }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("1 and 65535");
	});

	it("throws when upstream port is out of range", async () => {
		const filePath = await writeTempFile(
			JSON.stringify({
				port: 8080,
				routes: [{ match: "/", upstreams: [{ host: "a", port: 99999 }] }],
			}),
			".json",
		);
		await expect(loadConfig(filePath)).rejects.toThrow("1 and 65535");
	});
});

describe("Config", () => {
	it("constructs from valid data", () => {
		const cfg = Config.fromObject(validConfig);
		expect(cfg.port).toBe(8080);
	});

	it("throws when constructed with invalid data", () => {
		expect(
			() => Config.fromObject({ port: "not-a-number", routes: [] }),
		).toThrow();
	});

	it("loads from a file via Config.fromFile", async () => {
		const filePath = await writeTempFile(JSON.stringify(validConfig), ".json");
		const cfg = await Config.fromFile(filePath);
		expect(cfg.port).toBe(8080);
	});
});
