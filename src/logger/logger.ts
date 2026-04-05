import { LEVELS, type LogLevel, type Log } from '../lib/types/log';

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