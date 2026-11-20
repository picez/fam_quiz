import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { guarded, log, LOG_REDACT, logLevel, reportError, setErrorReporter, setErrorSink } from './log';

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

describe('error sink (64)', () => {
  it('reportError reaches the sink after the reporter, and a throwing sink is swallowed', () => {
    const level = log.level;
    log.level = 'silent';
    const order: string[] = [];
    const unhookReporter = setErrorReporter(() => order.push('reporter'));
    const unsink = setErrorSink((error, context) => {
      order.push(`sink:${(error as Error).message}:${context.where}`);
      throw new Error('sink');
    });
    try {
      expect(() => reportError(new Error('boom'), { where: 'socket' })).not.toThrow();
      expect(order).toEqual(['reporter', 'sink:boom:socket']);
      unsink();
      reportError(new Error('later'), { where: 'socket' });
      expect(order).toEqual(['reporter', 'sink:boom:socket', 'reporter']);
    } finally {
      unsink();
      unhookReporter();
      log.level = level;
    }
  });

  it('a throwing reporter still lets the sink run', () => {
    const level = log.level;
    log.level = 'silent';
    const sink = vi.fn();
    const unhook = setErrorReporter(() => {
      throw new Error('hook');
    });
    const unsink = setErrorSink(sink);
    try {
      reportError(new Error('x'), { where: 'process' });
      expect(sink).toHaveBeenCalledTimes(1);
    } finally {
      unsink();
      unhook();
      log.level = level;
    }
  });
});
