import { ConfigType } from '../src/lib/types/config.js';

export interface EnvOverrides {
  host?: string;
  port?: number;
}

/**
 * Read environment variables and return any valid overrides.
 * Invalid values are logged as warnings and ignored.
 * 
 * @returns An object containing any valid overrides from
 * environment variables.
 */
export function envOverrides(): EnvOverrides {
  const overrides: EnvOverrides = {};
  const warnings: string[] = [];
  const rawPort = process.env.PORT;
  if (rawPort !== undefined) {
    const parsed = Number.parseInt(rawPort, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      warnings.push(`PORT value must be between 1 - 65535.\nRun picked up ${rawPort}`);
    } else {
      overrides.port = parsed;
    }
  }
  const rawHost = process.env.HOST;
  if (rawHost !== undefined) {
    if (rawHost.trim() === '') {
      warnings.push(`HOST value cannot be empty.\nRun picked up ${rawHost}`);
    } else {
      overrides.host = rawHost.trim();
    }
  }

  for (const w of warnings) {
    process.stdout.write(`[nrp] WARNING ${w}\n`);
  } 
  return overrides;
}

/**
 * Apply any valid overrides from .env to the given config.
 * 
 * @param config The config to apply overrides to.
 * @returns The config with any valid overrides applied.
 */
export function applyEnvOverrides(
	config: ConfigType,
	overrides: EnvOverrides,
): ConfigType {
	if (Object.keys(overrides).length === 0) return config;
	return { ...config, ...overrides };
}
