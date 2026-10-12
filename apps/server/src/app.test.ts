import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  ctx = await buildApp();
});

afterEach(async () => {
  await ctx.app.close();
});

describe('GET /health', () => {
  it('reports that the server is up', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
