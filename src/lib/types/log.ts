export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Log {
  date?: Date;
  level: LogLevel;
  message: string;
  body: string | string[] | Record<string, unknown>;
}

export const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};
