import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { buildApp } from './app';
import { follow, user } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof createTestDb>>;
let olena: Awaited<ReturnType<typeof signUp>>;
let taras: Awaited<ReturnType<typeof signUp>>;
let olenaId: string;
let tarasId: string;
let quizId: string;

const request = (method: 'GET' | 'PUT' | 'DELETE', url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
const idOf = async (cookie: string) => ((await request('GET', '/api/me', cookie)).json() as { id: string }).id;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
  olena = await signUp(ctx.app, 'Олена');
  taras = await signUp(ctx.app, 'Тарас');
  olenaId = await idOf(olena.cookie);
  tarasId = await idOf(taras.cookie);
  const quiz = { ...makeQuiz([single]), title: 'Таємна вікторина' };
  const saved = await ctx.app.inject({ method: 'POST', url: '/api/quizzes', payload: quiz, headers: { cookie: olena.cookie } });
  quizId = (saved.json() as { id: string }).id;
  await db.insert(follow).values({ followerId: olenaId, followeeId: tarasId });
});

afterAll(async () => {
  await ctx.app.close();
});

describe('own profile', () => {
  it('the owner sees email, quizzes, wins and friends', async () => {
    const response = await request('GET', '/api/me/profile', olena.cookie);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.email).toBe(olena.email);
    expect(body.nickname).toBe('Олена');
    expect(body.quizzes).toEqual([{ id: quizId, title: 'Таємна вікторина' }]);
    expect(body.friends).toEqual([{ id: tarasId, nickname: 'Тарас', avatar: null }]);
    expect(body.achievements).toHaveLength(16);
    expect(body.stats.quizzes).toBe(1);
  });

  it('own profile and changes need a session', async () => {
    expect((await request('GET', '/api/me/profile')).statusCode).toBe(401);
    expect((await request('PUT', '/api/me/profile', undefined, { nickname: 'Зірка', avatar: null })).statusCode).toBe(401);
  });
});

describe('public profile', () => {
  it('never carries private fields, not even for its owner', async () => {
    for (const cookie of [undefined, taras.cookie, olena.cookie]) {
      const response = await request('GET', `/api/profiles/${olenaId}`, cookie);
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Object.keys(body).sort()).toEqual(['achievements', 'avatar', 'following', 'id', 'nickname', 'stats']);
      expect(Object.keys(body.stats).sort()).toEqual(['accuracy', 'games', 'hosted', 'quizzes', 'wins']);
      expect(response.body).not.toContain(olena.email);
      expect(response.body).not.toContain('Таємна вікторина');
      expect(response.body).not.toContain('Тарас');
    }
  });

  it('following tells a signed-in visitor whether they follow, and is null for guests and the owner', async () => {
    const following = async (cookie?: string) => (await request('GET', `/api/profiles/${olenaId}`, cookie)).json().following;
    expect(await following()).toBeNull();
    expect(await following(olena.cookie)).toBeNull();
    expect(await following(taras.cookie)).toBe(false);
    await db.insert(follow).values({ followerId: tarasId, followeeId: olenaId });
    expect(await following(taras.cookie)).toBe(true);
  });

  it('an unknown or removed user has no profile', async () => {
    const missing = await request('GET', '/api/profiles/nobody');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'not_found' });
    expect((await request('GET', `/api/profiles/${'x'.repeat(65)}`)).statusCode).toBe(404);

    const ghost = await signUp(ctx.app, 'Привид');
    const ghostId = await idOf(ghost.cookie);
    await db.insert(follow).values({ followerId: olenaId, followeeId: ghostId });
    expect((await request('GET', `/api/profiles/${ghostId}`)).statusCode).toBe(200);
    await db.delete(user).where(eq(user.id, ghostId));
    expect((await request('GET', `/api/profiles/${ghostId}`)).statusCode).toBe(404);
    const friends = (await request('GET', '/api/me/profile', olena.cookie)).json().friends as { id: string }[];
    expect(friends.map((f) => f.id)).toEqual([tarasId]);
  });
});

describe('changing the profile', () => {
  it('a taken or invalid nickname is refused', async () => {
    await request('PUT', '/api/me/profile', olena.cookie, { nickname: 'Зірка', avatar: null });
    const taken = await request('PUT', '/api/me/profile', taras.cookie, { nickname: 'зірка', avatar: null });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'nickname_taken' });
    const invalid = await request('PUT', '/api/me/profile', taras.cookie, { nickname: 'З', avatar: null });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'nickname_invalid' });
    await request('PUT', '/api/me/profile', olena.cookie, { nickname: 'Олена', avatar: null });
  });

  it('a foreign avatar address is refused', async () => {
    const response = await request('PUT', '/api/me/profile', olena.cookie, { nickname: 'Зірка', avatar: 'https://evil.example/x.png' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_payload' });
    expect((await request('GET', `/api/profiles/${olenaId}`)).json().nickname).toBe('Олена');
  });

  it('the owner changes nickname and avatar', async () => {
    const avatar = '/uploads/0123456789abcdef.png';
    const response = await request('PUT', '/api/me/profile', olena.cookie, { nickname: '  Зірка ', avatar });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: olenaId, nickname: 'Зірка', avatar });
    const shown = (await request('GET', `/api/profiles/${olenaId}`)).json();
    expect(shown.nickname).toBe('Зірка');
    expect(shown.avatar).toBe(avatar);
  });
});

describe('friends', () => {
  let anna: Awaited<ReturnType<typeof signUp>>;
  let borys: Awaited<ReturnType<typeof signUp>>;
  let annaId: string;
  let borysId: string;

  beforeAll(async () => {
    anna = await signUp(ctx.app, 'Анна');
    borys = await signUp(ctx.app, 'Борис');
    annaId = await idOf(anna.cookie);
    borysId = await idOf(borys.cookie);
    await request('PUT', '/api/me/profile', borys.cookie, { nickname: 'Борис К', avatar: null });
  });

  it('finds a profile by its exact nickname only', async () => {
    const found = await request('GET', `/api/profiles?nickname=${encodeURIComponent(' борис  к ')}`, anna.cookie);
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual({ id: borysId, nickname: 'Борис К', avatar: null });
    expect((await request('GET', '/api/profiles?nickname=%D0%91%D0%BE%D1%80%D0%B8%D1%81', anna.cookie)).statusCode).toBe(404);
    expect((await request('GET', '/api/profiles', anna.cookie)).statusCode).toBe(400);
    expect((await request('GET', `/api/profiles?nickname=${'x'.repeat(101)}`, anna.cookie)).statusCode).toBe(400);
    expect((await request('GET', '/api/profiles?nickname=%D0%91%D0%BE%D1%80%D0%B8%D1%81%20%D0%9A')).statusCode).toBe(401);
  });

  it('a signed-in user adds and removes a friend, one-way and without confirmation', async () => {
    const url = `/api/me/friends/${borysId}`;
    expect((await request('PUT', url, anna.cookie)).statusCode).toBe(204);
    expect((await request('PUT', url, anna.cookie)).statusCode).toBe(204);
    const friends = async (cookie: string) => (await request('GET', '/api/me/profile', cookie)).json().friends;
    expect(await friends(anna.cookie)).toEqual([{ id: borysId, nickname: 'Борис К', avatar: null }]);
    expect(await friends(borys.cookie)).toEqual([]);
    expect((await request('GET', `/api/profiles/${borysId}`, anna.cookie)).json().following).toBe(true);
    expect((await request('DELETE', url, anna.cookie)).statusCode).toBe(204);
    expect(await friends(anna.cookie)).toEqual([]);
    expect((await request('DELETE', url, anna.cookie)).statusCode).toBe(204);
    expect((await request('DELETE', url)).statusCode).toBe(401);
  });

  it('nobody can follow themselves or a missing user', async () => {
    const self = await request('PUT', `/api/me/friends/${annaId}`, anna.cookie);
    expect(self.statusCode).toBe(400);
    expect(self.json()).toEqual({ error: 'self_follow' });
    expect((await request('PUT', '/api/me/friends/nobody', anna.cookie)).statusCode).toBe(404);
    expect((await request('PUT', `/api/me/friends/${borysId}`)).statusCode).toBe(401);
  });
});
