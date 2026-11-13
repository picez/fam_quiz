import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { guarded, log, LOG_REDACT, logLevel, reportError, setErrorReporter } from './log';

describe('log redaction (30a)', () => {
  it('hides query details, parameters and secrets of database errors', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const test = pino({ redact: LOG_REDACT }, sink);
    const error = Object.assign(new Error('duplicate key'), { detail: 'Key (email)=(olena@example.com) exists', params: ['olena@example.com', 'tok'], cause: Object.assign(new Error('pg'), { detail: 'secret detail' }) });
    test.error({ err: error, token: 'tok-1', auth: { email: 'a@b.c' } }, 'fail');
    const written = lines.join('');
    expect(written).toContain('duplicate key');
    for (const secret of ['olena@example.com', 'secret detail', 'tok-1', 'a@b.c']) expect(written).not.toContain(secret);
  });
});

describe('log level (30a)', () => {
  it('LOG_LEVEL wins, tests default to warn, everything else to info', () => {
    expect(logLevel({ LOG_LEVEL: 'debug', VITEST: 'true' })).toBe('debug');
    expect(logLevel({ VITEST: 'true' })).toBe('warn');
    expect(logLevel({ NODE_ENV: 'test' })).toBe('warn');
    expect(logLevel({ NODE_ENV: 'production' })).toBe('info');
    expect(logLevel({ LOG_LEVEL: ' ' })).toBe('info');
    expect(logLevel({ LOG_LEVEL: 'verbose' })).toBe('info');
    expect(logLevel({ LOG_LEVEL: 'WARN' })).toBe('warn');
    expect(logLevel({ LOG_LEVEL: 'silent' })).toBe('silent');
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
