import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeQuiz, single, text, withId } from '@quiz/engine/testing';
import type { ChallengeAttemptStart, ChallengeMine, GroupDetail, LeaguePickInfo } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { user } from './db/schema';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;
let host: Awaited<ReturnType<typeof account>>;
let vira: Awaited<ReturnType<typeof account>>;
let family: GroupDetail;
let friends: GroupDetail;
let strangers: GroupDetail;

type Method = 'GET' | 'POST' | 'PUT';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function account(name: string) {
  const made = await signUp(ctx.app, name);
  const [row] = await db.select().from(user).where(eq(user.email, made.email));
  return { ...made, id: row.id };
}

async function newGroup(cookie: string, name: string, emoji: string): Promise<GroupDetail> {
  const created = await call('POST', '/api/groups', cookie, { name, emoji, description: '' });
  expect(created.statusCode).toBe(201);
  return created.json() as GroupDetail;
}

const newGame = async () => (await startGame(ctx.app, makeQuiz([single]), host.cookie)).game.code;
const league = (code: string) => `/api/games/by-code/${code}/league`;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
  host = await account('Ведуча');
  vira = await account('Віра');
  family = await newGroup(host.cookie, 'Родина', '🌻');
  friends = await newGroup(host.cookie, 'Друзі з двору', '🏡');
  strangers = await newGroup(vira.cookie, 'Сусіди', '🌊');
});

afterAll(async () => {
  await ctx.app.close();
});

describe('the league pick of a lobby (45)', () => {
  it('GET …/league gives the host’s own groups and no pick', async () => {
    const code = await newGame();
    const got = await call('GET', league(code), host.cookie);
    expect(got.statusCode).toBe(200);
    const info = got.json() as LeaguePickInfo;
    expect(info.groupId).toBeNull();
    expect(info.groups.map((g) => g.id).sort()).toEqual([family.id, friends.id].sort());
    expect(info.groups.find((g) => g.id === family.id)).toEqual({ id: family.id, name: 'Родина', emoji: '🌻', people: 1 });
  });

  it('PUT …/league marks with an own group, refuses a stranger’s group and a bad body', async () => {
    const code = await newGame();
    const set = await call('PUT', league(code), host.cookie, { groupId: family.id });
    expect(set.statusCode).toBe(200);
    expect((set.json() as LeaguePickInfo).groupId).toBe(family.id);
    expect(ctx.manager.get(code)!.league).toEqual({ groupId: family.id, groupName: 'Родина' });
    expect(((await call('GET', league(code), host.cookie)).json() as LeaguePickInfo).groupId).toBe(family.id);

    const foreign = await call('PUT', league(code), host.cookie, { groupId: strangers.id });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: 'group_not_found' });
    const missing = await call('PUT', league(code), host.cookie, { groupId: '77777777-7777-4777-8777-777777777777' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'group_not_found' });
    expect(ctx.manager.get(code)!.league?.groupId).toBe(family.id);

    for (const body of [{ groupId: 'not-a-uuid' }, { groupId: family.id, extra: 1 }, {}]) {
      const bad = await call('PUT', league(code), host.cookie, body);
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({ error: 'invalid_payload' });
    }

    const cleared = await call('PUT', league(code), host.cookie, { groupId: null });
    expect(cleared.statusCode).toBe(200);
    expect((cleared.json() as LeaguePickInfo).groupId).toBeNull();
    expect(ctx.manager.get(code)!.league).toBeNull();
  });

  it('a stranger’s room and a guest get game_not_found', async () => {
    const code = await newGame();
    for (const cookie of [vira.cookie, undefined]) {
      const got = await call('GET', league(code), cookie);
      expect(got.statusCode).toBe(404);
      expect(got.json()).toEqual({ error: 'game_not_found' });
      const put = await call('PUT', league(code), cookie, { groupId: strangers.id });
      expect(put.statusCode).toBe(404);
      expect(put.json()).toEqual({ error: 'game_not_found' });
    }
    expect(ctx.manager.get(code)!.league).toBeNull();
    expect((await call('GET', league('ZZZZZZ'), host.cookie)).statusCode).toBe(404);
  });

  it('locked after the start', async () => {
    const code = await newGame();
    expect((await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Гість' })).statusCode).toBe(201);
    const room = ctx.manager.get(code)!;
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    const late = await call('PUT', league(code), host.cookie, { groupId: family.id });
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: 'wrong_phase' });
    expect(room.league).toBeNull();
  });

  it('a challenge room has no league pick', async () => {
    const saved = await call('POST', '/api/quizzes', vira.cookie, makeQuiz([single, withId(single, 'q2'), withId(single, 'q3')]));
    const { id: quizId } = saved.json() as { id: string };
    const created = await call('POST', `/api/quizzes/${quizId}/challenge`, vira.cookie);
    expect(created.statusCode).toBe(201);
    const { code: challengeCode } = created.json() as ChallengeMine;
    const attempt = await call('POST', `/api/challenges/${challengeCode}/attempt`, host.cookie);
    expect(attempt.statusCode).toBe(201);
    const { code } = attempt.json() as ChallengeAttemptStart;
    const got = await call('GET', league(code), host.cookie);
    expect(got.statusCode).toBe(404);
    expect(got.json()).toEqual({ error: 'game_not_found' });
    const put = await call('PUT', league(code), host.cookie, { groupId: family.id });
    expect(put.statusCode).toBe(409);
    expect(put.json()).toEqual({ error: 'not_allowed' });
    expect(ctx.manager.get(code)!.league).toBeNull();
  });

  it('the autopilot author may mark the lobby', async () => {
    const saved = await call('POST', '/api/quizzes', host.cookie, makeQuiz([single, text]));
    const { id: quizId } = saved.json() as { id: string };
    const started = await call('POST', '/api/games', host.cookie, { quizId, autopilot: true, nickname: 'Ведуча' });
    expect(started.statusCode).toBe(201);
    const { code } = started.json() as { code: string };
    expect(((await call('GET', league(code), host.cookie)).json() as LeaguePickInfo).groups).toHaveLength(2);
    const set = await call('PUT', league(code), host.cookie, { groupId: friends.id });
    expect(set.statusCode).toBe(200);
    expect(ctx.manager.get(code)!.league).toEqual({ groupId: friends.id, groupName: 'Друзі з двору' });
  });
});
