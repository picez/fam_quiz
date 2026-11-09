import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerWordLadderRoutes } from './wordladder-routes';
import { nounsOf } from './wordladder/nouns';

let app: FastifyInstance;

async function build(user: { id: string } | null = null) {
  app = Fastify();
  await app.register(rateLimit, { global: false });
  await registerWordLadderRoutes(app, { nouns: nounsOf(['поле', 'пола']), currentUser: async () => user });
  return app;
}

const check = (payload: unknown, remoteAddress = '127.0.0.1') =>
  app.inject({ method: 'POST', url: '/api/wordladder/check', payload: payload as object, remoteAddress });

afterEach(async () => {
  await app.close();
});

describe('word ladder check route', () => {
  it('returns the words missing from the dictionary', async () => {
    await build();
    const response = await check({ words: ['ПОЛЕ', 'поси', 'pola'] });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ unknown: ['поси', 'pola'] });
    expect((await check({ words: ['пола'] })).json()).toEqual({ unknown: [] });
  });

  it('refuses a bad body', async () => {
    await build();
    for (const payload of [{ words: Array.from({ length: 22 }, () => 'поле') }, { words: 'поле' }, { words: [] }, {}]) {
      const response = await check(payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
  });

  it('limits the rate', async () => {
    await build({ id: 'olena' });
    for (let i = 0; i < 60; i += 1) expect((await check({ words: ['поле'] }, '10.0.0.1')).statusCode).toBe(200);
    // Ключ — користувач, а не адреса: інша адреса того самого користувача теж упирається в обмеження.
    expect((await check({ words: ['поле'] }, '10.0.0.2')).statusCode).toBe(429);
  });

  it('counts guests by address', async () => {
    await build();
    for (let i = 0; i < 60; i += 1) expect((await check({ words: ['поле'] }, '10.0.0.1')).statusCode).toBe(200);
    expect((await check({ words: ['поле'] }, '10.0.0.1')).statusCode).toBe(429);
    expect((await check({ words: ['поле'] }, '10.0.0.2')).statusCode).toBe(200);
  });
});
