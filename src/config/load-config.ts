import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfigType } from '../lib/types/config.js';
import { Config } from './config.js';

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
  } else {
    throw new Error(`Unsupported config file extension: ${extension}`);
  }
  return Config.validate(c, filePath);
}
