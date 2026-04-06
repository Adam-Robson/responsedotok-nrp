import { LEVELS, type LogLevel, type Log } from '../lib/types/log';

/**
 * Emit logs in JSOn format to stdout and stderr at levels debug, info, warn and error.
 * Logs at the error and warn levels are emitted to stderr; logs at the debug and info levels
 * are emitted to stdout. Each log line is a JSON object with the following properties:
 * - date: the date and time when the log was emitted
 * - level: the log level (debug, info, warn or error)
 * - message: the log message
 * - body: an optional object with additional information about the log
 * The log level can be set when creating a Logger instance. Logs at levels below the set level
 * are not emitted. For example, if the log level is set to 'info', logs at the 'debug' level
 * are not emitted, but logs at the 'info', 'warn' and 'error' levels are emitted.
 * The default log level is 'debug', which means that all logs are emitted.
 */

export class Logger {
  private readonly level: number;

  constructor(l: LogLevel = 'debug') {
    this.level = LEVELS[l];
  }

  debug(m: string, extra?: Record<string, unknown>): void {
    this.emit('debug', m, extra);
  }

  info(m: string, extra?: Record<string, unknown>): void {
    this.emit('info', m, extra);
  }

  warn(m: string, extra?: Record<string, unknown>): void {
    this.emit('warn', m, extra);
  }

  error(m: string, extra?: Record<string, unknown>): void {
    this.emit('error', m, extra);
  }

  private emit(l: LogLevel, m: string, extra?: Record<string, unknown>): void {
    if (LEVELS[l] < this.level) return;
    const line = JSON.stringify({
      date: new Date(),
      level: l,
      message: m,
      body: extra ?? {}
    } satisfies Log);
    
    if (l === 'error' || l === 'warn') {
      process.stderr.write(`${line}\n`);

      console.error(line);
    } else {
      process.stdout.write(`${line}\n`);
      
      console.info(line);
    }
  }
}