import { describe, expect, it, vi } from 'vitest';
import { guarded, log, logLevel, reportError, setErrorReporter } from './log';

describe('log level (30a)', () => {
  it('LOG_LEVEL wins, tests default to warn, everything else to info', () => {
    expect(logLevel({ LOG_LEVEL: 'debug', VITEST: 'true' })).toBe('debug');
    expect(logLevel({ VITEST: 'true' })).toBe('warn');
    expect(logLevel({ NODE_ENV: 'test' })).toBe('warn');
    expect(logLevel({ NODE_ENV: 'production' })).toBe('info');
    expect(logLevel({ LOG_LEVEL: ' ' })).toBe('info');
  });
});

describe('reportError (30a)', () => {
  it('passes the error and its context to the hook and never throws, even when the hook does', () => {
    const level = log.level;
    log.level = 'silent';
    const hook = vi.fn(() => {
      throw new Error('hook');
    });
    const unhook = setErrorReporter(hook);
    try {
      const error = new Error('boom');
      expect(() => reportError(error, { where: 'socket', room: '123456', event: 'player:answer', role: 'player' })).not.toThrow();
      expect(hook).toHaveBeenCalledWith(error, { where: 'socket', room: '123456', event: 'player:answer', role: 'player' });
      const run = guarded({ where: 'room-timer', room: '123456', what: 'expiry' }, () => {
        throw new Error('timer');
      });
      expect(run).not.toThrow();
      expect(hook).toHaveBeenCalledTimes(2);
    } finally {
      unhook();
      log.level = level;
    }
  });
});
