import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerLetterWordsRoutes } from './letterwords-routes';
import { nounsOf } from './wordladder/nouns';

let app: FastifyInstance;

async function build(user: { id: string } | null = null) {
  app = Fastify();
  await app.register(rateLimit, { global: false });
  await registerLetterWordsRoutes(app, { nouns: nounsOf(['морква', 'острів', 'ставок', 'кіт', 'сік']), currentUser: async () => user });
  return app;
}

const check = (payload: unknown, remoteAddress = '127.0.0.1') =>
  app.inject({ method: 'POST', url: '/api/letterwords/check', payload: payload as object, remoteAddress });

afterEach(async () => {
  await app.close();
});

describe('letter words check route (27d)', () => {
  it('counts the possible words and names the longest', async () => {
    await build();
    const response = await check({ letters: 'Морк васті' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ possible: 5, best: ['морква', 'острів'] });
    expect((await check({ letters: 'бджщ' })).json()).toEqual({ possible: 0, best: [] });
  });

  it('refuses a bad body', async () => {
    await build();
    for (const payload of [{ letters: 'abc' }, { letters: 'кіт' }, { letters: 'а'.repeat(13) }, { letters: 5 }, {}]) {
      const response = await check(payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
  });

  it('limits the rate', async () => {
    await build({ id: 'olena' });
    for (let i = 0; i < 60; i += 1) expect((await check({ letters: 'морквасті' }, '10.0.0.1')).statusCode).toBe(200);
    expect((await check({ letters: 'морквасті' }, '10.0.0.2')).statusCode).toBe(429);
  });
});
