import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { Db } from './db/client';
import { listServerErrors } from './error-store';
import { log, reportError, setErrorReporter, type ErrorContext } from './log';
import { TEST_AUTH } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let db: Db;
let close: () => Promise<void> = async () => {};

beforeAll(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await close();
});

describe('HTTP 5xx (30a)', () => {
  it('a route that throws answers 500 and reaches reportError with the route, without the IP', async () => {
    const reports: { error: unknown; context: ErrorContext }[] = [];
    const level = log.level;
    log.level = 'silent';
    const unhook = setErrorReporter((error, context) => reports.push({ error, context }));
    const ctx = await buildApp({ db, auth: TEST_AUTH });
    close = async () => {
      await ctx.app.close();
      unhook();
      log.level = level;
    };
    ctx.app.get('/api/test-boom/:id', async () => {
      throw new Error('boom');
    });
    ctx.app.get('/api/test-bad', async (_request, reply) => reply.code(400).send({ error: 'bad' }));
    ctx.app.get('/api/test-thrown-4xx', async () => {
      throw Object.assign(new Error('nope'), { statusCode: 422 });
    });
    ctx.app.get('/api/test-thrown-503', async () => {
      throw Object.assign(new Error('down'), { statusCode: 503 });
    });
    const response = await ctx.app.inject({ method: 'GET', url: '/api/test-boom/42', remoteAddress: '203.0.113.7' });
    expect(response.statusCode).toBe(500);
    expect(reports).toHaveLength(1);
    expect((reports[0].error as Error).message).toBe('boom');
    expect(reports[0].context).toEqual({ where: 'http', event: 'GET /api/test-boom/:id' });
    expect(JSON.stringify(reports[0].context)).not.toContain('203.0.113.7');
    // 4xx — не збій сервера.
    expect((await ctx.app.inject({ method: 'GET', url: '/api/test-bad' })).statusCode).toBe(400);
    expect(reports).toHaveLength(1);
    // Кинута помилка з кодом 4xx — теж не збій; з кодом 5xx — збій.
    expect((await ctx.app.inject({ method: 'GET', url: '/api/test-thrown-4xx' })).statusCode).toBe(422);
    expect(reports).toHaveLength(1);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/test-thrown-503' })).statusCode).toBe(503);
    expect(reports).toHaveLength(2);
    expect(reports[1].context).toEqual({ where: 'http', event: 'GET /api/test-thrown-503' });
  });

  it('a 500 is stored with its route', async () => {
    const reports: ErrorContext[] = [];
    const level = log.level;
    log.level = 'silent';
    const unhook = setErrorReporter((_error, context) => reports.push(context));
    const ctx = await buildApp({ db, auth: TEST_AUTH });
    close = async () => {
      await ctx.app.close();
      unhook();
      log.level = level;
    };
    ctx.app.get('/boom', async () => {
      throw new Error('no user olya@example.com');
    });
    expect((await ctx.app.inject({ method: 'GET', url: '/boom' })).statusCode).toBe(500);
    await ctx.errors!.flush();
    const listed = await listServerErrors(db, { status: 'new', page: 1 }, new Date());
    const row = listed.rows.find((r) => r.event === 'GET /boom');
    expect(row).toMatchObject({ where: 'http', event: 'GET /boom', message: 'no user [email]', count: 1 });
    expect(reports).toEqual([{ where: 'http', event: 'GET /boom' }]);
  });

  it('errorLog: false stores nothing and closing the app removes the sink', async () => {
    const level = log.level;
    log.level = 'silent';
    const off = await buildApp({ db, auth: TEST_AUTH, errorLog: false });
    expect(off.errors).toBeNull();
    await off.app.close();
    const on = await buildApp({ db, auth: TEST_AUTH });
    await on.app.close();
    try {
      // Після close застосунку слот знято: збій більше нікуди не пишеться.
      reportError(new Error('after close'), { where: 'process' });
      await on.errors!.flush();
      const listed = await listServerErrors(db, { status: 'new', page: 1 }, new Date());
      expect(listed.rows.some((r) => r.message === 'after close')).toBe(false);
    } finally {
      log.level = level;
    }
  });
});
