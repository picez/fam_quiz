import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ShowcasePins } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { prizeAward } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});
afterAll(async () => {
  await ctx.app.close();
});

type Method = 'GET' | 'POST' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });
const idOf = async (cookie: string) => ((await call('GET', '/api/me', cookie)).json() as { id: string }).id;

async function award(userId: string): Promise<string> {
  const [row] = await db
    .insert(prizeAward)
    .values({
      userId,
      prizeId: randomUUID(),
      gameId: randomUUID(),
      place: 1,
      content: { name: 'Кубок', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false },
      quizTitle: 'Україна',
      nickname: 'Оля',
      awardedAt: new Date(),
    })
    .returning({ id: prizeAward.id });
  return row!.id;
}

describe('showcase pin routes', () => {
  it('want a sign-in', async () => {
    expect((await call('GET', '/api/me/showcase/pins')).statusCode).toBe(401);
    expect((await call('POST', '/api/me/showcase/pins', undefined, { kind: 'achievement', id: 'sniper' })).statusCode).toBe(401);
    expect((await call('DELETE', '/api/me/showcase/pins/achievement/sniper')).statusCode).toBe(401);
  });

  it('pin, refuse and unpin', async () => {
    const owner = await signUp(ctx.app, 'Власниця');
    const other = await signUp(ctx.app, 'Інший');
    const ownerId = await idOf(owner.cookie);
    const otherId = await idOf(other.cookie);
    expect((await call('GET', '/api/me/showcase/pins', owner.cookie)).json()).toEqual({ prizes: [], achievements: [] });

    for (const body of [{}, { kind: 'prize', id: 'x' }, { kind: 'achievement', id: 'nope' }, { kind: 'title', id: 'x' }]) {
      const response = await call('POST', '/api/me/showcase/pins', owner.cookie, body);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }

    const theirs = await award(otherId);
    const foreign = await call('POST', '/api/me/showcase/pins', owner.cookie, { kind: 'prize', id: theirs });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: 'not_found' });

    const mine = [await award(ownerId), await award(ownerId), await award(ownerId), await award(ownerId)];
    for (const id of mine.slice(0, 3)) {
      const response = await call('POST', '/api/me/showcase/pins', owner.cookie, { kind: 'prize', id });
      expect(response.statusCode).toBe(200);
    }
    const again = await call('POST', '/api/me/showcase/pins', owner.cookie, { kind: 'prize', id: mine[0] });
    expect(again.statusCode).toBe(200);
    expect((again.json() as ShowcasePins).prizes).toHaveLength(3);
    const full = await call('POST', '/api/me/showcase/pins', owner.cookie, { kind: 'prize', id: mine[3] });
    expect(full.statusCode).toBe(409);
    expect(full.json()).toEqual({ error: 'showcase_full' });

    expect((await call('DELETE', '/api/me/showcase/pins/title/x', owner.cookie)).statusCode).toBe(404);
    const removed = await call('DELETE', `/api/me/showcase/pins/prize/${mine[1]}`, owner.cookie);
    expect(removed.statusCode).toBe(200);
    expect((removed.json() as ShowcasePins).prizes).toHaveLength(2);
    expect((removed.json() as ShowcasePins).prizes).not.toContain(mine[1]);
    const repeat = await call('DELETE', `/api/me/showcase/pins/prize/${mine[1]}`, owner.cookie);
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json()).toEqual(removed.json());

    const expected = (await call('GET', '/api/me/showcase/pins', owner.cookie)).json() as ShowcasePins;
    const profile = await call('GET', `/api/profiles/${ownerId}`, other.cookie);
    expect(profile.statusCode).toBe(200);
    const body = profile.json() as { showcase: { pins: ShowcasePins } };
    expect(body.showcase.pins).toEqual(expected);
    expect(Object.keys(body).sort()).toEqual(['achievements', 'avatar', 'following', 'id', 'level', 'likes', 'nickname', 'showcase', 'stats']);
    expect((await call('GET', '/api/me/showcase/pins', other.cookie)).json()).toEqual({ prizes: [], achievements: [] });
  });
});
