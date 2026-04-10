import path from 'node:path';
import fs from 'node:fs/promises';
import { Config } from './config.js';
import type { ConfigType } from '../lib/types/config.js';

export async function loadConfig(filePath: string): Promise<ConfigType> {
	const absolutePath = path.resolve(filePath);
	const extension = path.extname(absolutePath).toLowerCase();
	let c: unknown;
	if (extension === '.json') {
		const contents = await fs.readFile(absolutePath, 'utf-8');
		c = JSON.parse(contents);
	} else if (
		extension === '.js' ||
		extension === '.mjs' ||
		extension === '.ts'
	) {
		const module = (await import(absolutePath)) as { default?: ConfigType };
		c = module.default ?? module;
	} else if (extension === '.env') {
		const envConfig = await fs.readFile(absolutePath, 'utf-8');
		const parsed = Object.fromEntries(
			envConfig
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith('#'))
				.map((line) => {
					const [key, ...rest] = line.split('=');
					return [key, rest.join('=')];
				}),
		);
		c = parsed;
	} else {
		throw new Error(`Unsupported config file extension: ${extension}`);
	}
	return Config.validate(c, filePath);
}
