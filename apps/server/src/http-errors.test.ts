import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { Db } from './db/client';
import { log, setErrorReporter, type ErrorContext } from './log';
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
    const response = await ctx.app.inject({ method: 'GET', url: '/api/test-boom/42', remoteAddress: '203.0.113.7' });
    expect(response.statusCode).toBe(500);
    expect(reports).toHaveLength(1);
    expect((reports[0].error as Error).message).toBe('boom');
    expect(reports[0].context).toEqual({ where: 'http', event: 'GET /api/test-boom/:id' });
    expect(JSON.stringify(reports[0].context)).not.toContain('203.0.113.7');
    // 4xx — не збій сервера.
    expect((await ctx.app.inject({ method: 'GET', url: '/api/test-bad' })).statusCode).toBe(400);
    expect(reports).toHaveLength(1);
  });
});
