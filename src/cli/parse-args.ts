import { LoadBalancerStrategy } from '../lib/types/load-balancer-strategy.js';
import type { LogLevel } from '../lib/types/log.js';

/**
 * Parse command line arguments to execute the program.
 * Supported arguments:
 * --help, -h: Show help message
 * --config, -c <path>: Path to the configuration file (default: ./proxy.config.json)
 * --log-level, -l <level>: Log level (default: info)
 * --env, -e <key=value>: Set environment variables (can be used multiple times)
 * --balancer, -b <strategy>: Load balancer strategy (round-robin | random | weighted)
 *
 * @param argv The command line arguments (process.argv)
 * @returns An object containing the parsed arguments
 */
export function parseArgs(argv: string[]): {
  configPath: string;
  logLevel: LogLevel;
  help: boolean;
  env: Record<string, string>;
  balancer?: LoadBalancerStrategy;
} {
  const args = argv.slice(2);
  let configPath = './proxy.config.json';
  let logLevel: LogLevel = 'info';
  let help = false;
  const env: Record<string, string> = {};
  let balancer: LoadBalancerStrategy | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--config':
      case '-c':
        if (i + 1 >= args.length) throw new Error(`Missing value for ${arg}`);
        configPath = args[++i] as string;
        break;
      case '--log-level':
      case '-l':
        if (i + 1 >= args.length) throw new Error(`Missing value for ${arg}`);
        logLevel = args[++i] as LogLevel;
        break;
      case '--env':
      case '-e': {
        if (i + 1 >= args.length) throw new Error(`Missing value for ${arg}`);
        const [key, value] = args[++i].split('=');
        if (!key || !value)
          throw new Error(`Invalid value for ${arg}: ${args[i]}`);
        env[key] = value;
        break;
      }
      case '--balancer':
      case '-b': {
        if (i + 1 >= args.length) throw new Error(`Missing value for ${arg}`);
        const value = args[++i] as string;
        const valid = Object.values(LoadBalancerStrategy) as string[];
        if (!valid.includes(value)) {
          throw new Error(
            `Invalid value for ${arg}: ${value}. Must be one of: ${valid.join(', ')}`,
          );
        }
        balancer = value as LoadBalancerStrategy;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { configPath, logLevel, help, env, balancer };
}
