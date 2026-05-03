import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../src/logger/logger.js';

describe('Logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes info messages to stdout as JSON', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    new Logger('info').info('hello');
    expect(write).toHaveBeenCalledOnce();
    const line = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(line.level).toBe('info');
    expect(line.message).toBe('hello');
    expect(typeof line.date).toBe('string');
  });

  it('writes debug messages to stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    new Logger('debug').debug('trace');
    expect(write).toHaveBeenCalledOnce();
    const line = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(line.level).toBe('debug');
  });

  it('writes error messages to stderr', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    new Logger('info').error('oops');
    expect(write).toHaveBeenCalledOnce();
    const line = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(line.level).toBe('error');
  });

  it('writes warn messages to stderr', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    new Logger('info').warn('watch out');
    expect(write).toHaveBeenCalledOnce();
    const line = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(line.level).toBe('warn');
  });

  it('suppresses messages below the configured level', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    new Logger('error').info('suppressed');
    new Logger('error').warn('suppressed');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('suppresses all output at silent level', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const logger = new Logger('silent');
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('includes meta fields in the JSON output', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    new Logger('debug').debug('msg', { requestId: '123', userId: 42 });
    const line = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(line.body.requestId).toBe('123');
    expect(line.body.userId).toBe(42);
  });

  it('defaults to info level when no level is provided', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const logger = new Logger();
    logger.debug('hidden');
    logger.info('shown');
    expect(stdout).toHaveBeenCalledOnce();
    const line = JSON.parse(stdout.mock.calls[0]?.[0] as string);
    expect(line.level).toBe('info');
    expect(line.message).toBe('shown');
  });
});
