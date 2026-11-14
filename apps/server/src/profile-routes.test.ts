import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { isAnti, STICKERS, xpForLevel, type AchievementId } from '@quiz/shared';
import { buildApp } from './app';
import { follow, profile, user, userAchievement, xpEntry } from './db/schema';
import { awardPrizes, createPrize, reservePlaces } from './prizes';
import { seedGame } from './testing/history-rows';
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
    expect(body.quizzes).toEqual([{ id: quizId, title: 'Таємна вікторина', plays: 0 }]);
    expect(body.friends).toMatchObject([{ id: tarasId, nickname: 'Тарас', avatar: null }]);
    expect(body.achievements).toHaveLength(71);
    expect(body.achievements[0]).toEqual({ id: 'first_game', earned: false, earnedAt: null });
    expect(body.stats.quizzes).toBe(1);
  });

  it('the card for the join form is only the nickname and avatar (backlog 4)', async () => {
    const response = await request('GET', '/api/me/card', taras.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: tarasId, nickname: 'Тарас', avatar: null });
    expect((await request('GET', '/api/me/card')).statusCode).toBe(401);
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
      expect(Object.keys(body).sort()).toEqual(['achievements', 'avatar', 'following', 'id', 'level', 'likes', 'nickname', 'showcase', 'stats']);
      expect(Object.keys(body.stats).sort()).toEqual(['accuracy', 'avgPlace', 'bestScore', 'games', 'hosted', 'podium', 'quizzes', 'top3', 'wins']);
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

  it('the friends list is only for its owner', async () => {
    expect((await request('GET', '/api/me/friends')).statusCode).toBe(401);
    const response = await request('GET', '/api/me/friends', olena.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ id: tarasId, nickname: 'Тарас', avatar: null }]);
    expect(response.body).not.toContain(taras.email);
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
    expect(await friends(anna.cookie)).toMatchObject([{ id: borysId, nickname: 'Борис К', avatar: null }]);
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

describe('versus', () => {
  it('versus is only about the viewer and that user', async () => {
    const vera = await signUp(ctx.app, 'Віра');
    const veraId = await idOf(vera.cookie);
    await seedGame(db, {
      hostId: veraId,
      startedAt: new Date(Date.UTC(2026, 1, 1)),
      players: [
        { userId: olenaId, nickname: 'Олена', score: 10, rank: 1 },
        { userId: tarasId, nickname: 'Тарас', score: 5, rank: 2 },
        { userId: veraId, nickname: 'Віра', score: 1, rank: 3 },
      ],
    });
    expect((await request('GET', `/api/me/versus/${tarasId}`)).statusCode).toBe(401);
    expect((await request('GET', `/api/me/versus/${olenaId}`, olena.cookie)).json()).toEqual({ error: 'self_versus' });
    expect((await request('GET', '/api/me/versus/nobody', olena.cookie)).statusCode).toBe(404);
    expect((await request('GET', `/api/me/versus/${'x'.repeat(65)}`, olena.cookie)).statusCode).toBe(404);
    const response = await request('GET', `/api/me/versus/${tarasId}`, olena.cookie);
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(['myAccuracy', 'myAhead', 'recent', 'theirAccuracy', 'theirAhead', 'together']);
    expect(Object.keys(response.json().recent[0]).sort()).toEqual(['gameId', 'myRank', 'startedAt', 'theirRank', 'title']);
    for (const secret of ['Віра', veraId, olena.email, taras.email]) expect(response.body).not.toContain(secret);
  });
});

describe('podium (11f)', () => {
  it('both profiles give the podium, the top-3 share, the best score and the average place', async () => {
    const oksana = await signUp(ctx.app, 'Оксана');
    const oksanaId = await idOf(oksana.cookie);
    await seedGame(db, {
      hostId: tarasId,
      startedAt: new Date(),
      players: [
        { userId: null, nickname: 'Гість', score: 900, rank: 1 },
        { userId: oksanaId, nickname: 'Оксана', score: 600, rank: 2 },
        { userId: null, nickname: 'Ще гість', score: 100, rank: 3 },
      ],
    });
    const expected = { podium: { first: 0, second: 1, third: 0 }, top3: 100, bestScore: 600, avgPlace: 2 };
    expect((await request('GET', `/api/profiles/${oksanaId}`)).json().stats).toMatchObject(expected);
    expect((await request('GET', '/api/me/profile', oksana.cookie)).json().stats).toMatchObject(expected);
  });
});

describe('achievements pages (12i)', () => {
  it('my page needs a session and has all 71; somebody else’s page has only the earned ones without progress', async () => {
    const yarema = await signUp(ctx.app, 'Ярема');
    const yaremaId = await idOf(yarema.cookie);
    await seedGame(db, {
      hostId: tarasId,
      startedAt: new Date(Date.UTC(2026, 2, 1, 18)),
      players: [
        { userId: yaremaId, nickname: 'Ярема', score: 100, rank: 1 },
        { userId: null, nickname: 'Гість', score: 0, rank: 2 },
      ],
    });

    expect((await request('GET', '/api/me/achievements')).statusCode).toBe(401);
    const own = await request('GET', '/api/me/achievements', yarema.cookie);
    expect(own.statusCode).toBe(200);
    const page = own.json();
    expect(Object.keys(page).sort()).toEqual(['earned', 'hideAnti', 'items', 'own', 'profile', 'total']);
    expect(page.own).toBe(true);
    expect(page.items).toHaveLength(71);
    expect(page.items.find((i: { id: string }) => i.id === 'games_10').progress).toEqual({ current: 1, goal: 10 });

    for (const cookie of [undefined, olena.cookie, yarema.cookie]) {
      const response = await request('GET', `/api/profiles/${yaremaId}/achievements`, cookie);
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.own).toBe(false);
      expect(body.profile).toEqual({ id: yaremaId, nickname: 'Ярема', avatar: null });
      expect(body.items.map((i: { id: string }) => i.id)).toEqual(['first_game', 'first_win']);
      expect(body.items.every((i: { earned: boolean; progress: unknown }) => i.earned && i.progress === null)).toBe(true);
      expect(response.body).not.toContain(yarema.email);
    }
    expect((await request('GET', '/api/profiles/nobody/achievements')).statusCode).toBe(404);
    expect((await request('GET', `/api/profiles/${'x'.repeat(65)}/achievements`)).statusCode).toBe(404);
  });
});

describe('friends online and search (backlog 9)', () => {
  it('a friend who just opened the site has a fresh lastSeenAt', async () => {
    await request('GET', '/api/me/card', taras.cookie);
    await db.update(profile).set({ lastSeenAt: null }).where(eq(profile.userId, tarasId));
    const before = Date.now();
    await request('GET', '/api/me', taras.cookie);
    const [friend] = (await request('GET', '/api/me/friends', olena.cookie)).json() as { id: string; lastSeenAt: string | null }[];
    expect(friend.id).toBe(tarasId);
    expect(Date.parse(friend.lastSeenAt!)).toBeGreaterThanOrEqual(before - 1000);
  });

  it('search suggests nicknames by their start, never the viewer, and needs a session', async () => {
    await request('GET', '/api/me/card', olena.cookie);
    expect(((await request('GET', '/api/profiles/search?q=%D1%82%D0%B0', olena.cookie)).json() as { nickname: string }[]).map((p) => p.nickname)).toContain('Тарас');
    expect(((await request('GET', '/api/profiles/search?q=%D0%BE%D0%BB%D0%B5', olena.cookie)).json() as { id: string }[]).map((p) => p.id)).not.toContain(olenaId);
    expect((await request('GET', '/api/profiles/search?q=%25', olena.cookie)).json()).toEqual([]);
    expect((await request('GET', '/api/profiles/search?q=ab')).statusCode).toBe(401);
  });
});

describe('favorite stickers (13a)', () => {
  const a = STICKERS[0]!.id;
  const b = STICKERS[1]!.id;

  it('need a session', async () => {
    expect((await request('GET', '/api/me/stickers')).statusCode).toBe(401);
    expect((await request('PUT', '/api/me/stickers', undefined, { favorites: [a] })).statusCode).toBe(401);
  });

  it('start empty, keep order, drop unknown and duplicate ids', async () => {
    expect((await request('GET', '/api/me/stickers', olena.cookie)).json()).toEqual({ favorites: [], packs: [], legacyLevel: null });
    const put = await request('PUT', '/api/me/stickers', olena.cookie, { favorites: [b, a, 'nope', b] });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ favorites: [b, a] });
    expect((await request('GET', '/api/me/stickers', olena.cookie)).json()).toMatchObject({ favorites: [b, a] });
  });

  it('refuse a bad body', async () => {
    const tooMany = await request('PUT', '/api/me/stickers', olena.cookie, { favorites: Array(41).fill(a) });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json()).toEqual({ error: 'invalid_payload' });
    expect((await request('PUT', '/api/me/stickers', olena.cookie, { favorites: 'x' })).statusCode).toBe(400);
  });

  it('drop an id that left the manifest when reading', async () => {
    await db.update(profile).set({ favoriteStickers: ['gone', a] }).where(eq(profile.userId, olenaId));
    expect((await request('GET', '/api/me/stickers', olena.cookie)).json()).toMatchObject({ favorites: [a] });
  });

  it('are separate for each player', async () => {
    expect((await request('GET', '/api/me/stickers', taras.cookie)).json()).toMatchObject({ favorites: [] });
  });

  it('34: tell the achievement packs and the inherited level', async () => {
    await db.insert(userAchievement).values({ userId: tarasId, achievementId: 'night_owl', earnedAt: new Date() }).onConflictDoNothing();
    await db.update(profile).set({ stickersLegacyLevel: 4 }).where(eq(profile.userId, tarasId));
    expect((await request('GET', '/api/me/stickers', taras.cookie)).json()).toEqual({ favorites: [], packs: ['spooky'], legacyLevel: 4 });
  });
});

describe('showcase in profiles (14a)', () => {
  it('is empty at first and carries an award and the current title after awardPrizes', async () => {
    const empty = { title: null, awards: [], pins: { prizes: [], achievements: [] } };
    expect((await request('GET', `/api/profiles/${tarasId}`)).json().showcase).toEqual(empty);
    expect((await request('GET', '/api/me/profile', taras.cookie)).json().showcase).toEqual(empty);

    const gameId = '00000000-0000-4000-8000-0000000000aa';
    const made = await createPrize(db, olenaId, { name: 'Кубок', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: 'Знавець', diploma: false });
    if (!made.ok) throw new Error('create failed');
    await reservePlaces(db, olenaId, gameId, [made.prize.id, null, null]);
    await awardPrizes(db, { gameId, quizTitle: 'Україна', at: new Date(), outcomes: [{ place: 1, prizeId: made.prize.id, winners: [{ userId: tarasId, nickname: 'Тарас' }] }] });

    for (const body of [(await request('GET', `/api/profiles/${tarasId}`)).json(), (await request('GET', '/api/me/profile', taras.cookie)).json()]) {
      expect(body.showcase.title).toMatchObject({ text: 'Знавець' });
      expect(body.showcase.awards).toHaveLength(1);
      expect(body.showcase.awards[0]).toMatchObject({ place: 1, quizTitle: 'Україна', nickname: 'Тарас' });
      expect('name' in body.showcase.awards[0].content).toBe(false);
    }
  });
});

describe('wearing looks (15a)', () => {
  const none = { color: null, frame: null, badge: null };

  it('needs a session and a valid body', async () => {
    expect((await request('PUT', '/api/me/looks', undefined, { ...none, color: 'sky' })).statusCode).toBe(401);
    expect((await request('PUT', '/api/me/looks', olena.cookie, { ...none, color: 'pink' })).statusCode).toBe(400);
  });

  it('refuses a colour above the level and wears it once the level is there', async () => {
    const locked = await request('PUT', '/api/me/looks', taras.cookie, { ...none, color: 'sky' });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toEqual({ error: 'look_locked' });

    const at = new Date('2026-10-20T10:00:00Z');
    await db.insert(xpEntry).values({ userId: tarasId, source: 'game', amount: 300, counted: true, day: '2026-10-20', at, createdAt: at });
    const worn = await request('PUT', '/api/me/looks', taras.cookie, { ...none, color: 'sky' });
    expect(worn.statusCode).toBe(200);
    expect(worn.json()).toEqual({ looks: { ...none, color: 'sky', photo: null, font: null, effect: null } });
    const shown = await request('GET', `/api/profiles/${tarasId}`);
    expect(shown.json().level.looks.color).toBe('sky');
  });

  it('wears a photo frame and a font, and refuses bad or locked ones', async () => {
    const at = new Date('2026-10-23T10:00:00Z');
    await db.insert(xpEntry).values({ userId: tarasId, source: 'game', amount: xpForLevel(17), counted: true, day: '2026-10-23', at, createdAt: at });
    const ok = await request('PUT', '/api/me/looks', taras.cookie, { ...none, photo: 'fire', font: 'hand' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().looks).toMatchObject({ photo: 'fire', font: 'hand' });
    expect((await request('PUT', '/api/me/looks', taras.cookie, { ...none, font: 'comic' })).statusCode).toBe(400);
    const locked = await request('PUT', '/api/me/looks', taras.cookie, { ...none, photo: 'aura' });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toEqual({ error: 'look_locked' });
  });

  it('34: refuses an unknown nick effect', async () => {
    expect((await request('PUT', '/api/me/looks', taras.cookie, { ...none, effect: 'smoke' })).statusCode).toBe(400);
  });
});

describe('hiding anti-achievements (12j)', () => {
  it('PUT /api/me/achievements/hide-anti saves the switch; then the public page has no anti-achievements', async () => {
    expect((await request('PUT', '/api/me/achievements/hide-anti', undefined, { hide: true })).statusCode).toBe(401);
    expect((await request('PUT', '/api/me/achievements/hide-anti', olena.cookie, { hide: 'yes' })).statusCode).toBe(400);
    expect((await request('PUT', '/api/me/achievements/hide-anti', olena.cookie, { hide: true, extra: 1 })).statusCode).toBe(400);
    const saved = await request('PUT', '/api/me/achievements/hide-anti', olena.cookie, { hide: true });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ hideAnti: true });
    expect((await request('GET', '/api/me/achievements', olena.cookie)).json().hideAnti).toBe(true);
    const page = (await request('GET', `/api/profiles/${olenaId}/achievements`, taras.cookie)).json();
    expect(page.total).toBe(55);
    expect(page.items.some((i: { id: AchievementId }) => isAnti(i.id))).toBe(false);
    expect((await request('PUT', '/api/me/achievements/hide-anti', olena.cookie, { hide: false })).json()).toEqual({ hideAnti: false });
  });
});

describe('easy mode in the profile (31)', () => {
  it('GET /api/me says easyMode false; PUT /api/me/easy saves it and /api/me reports it', async () => {
    const vira = await signUp(ctx.app, 'Віра');
    expect((await request('GET', '/api/me', vira.cookie)).json().easyMode).toBe(false);
    const on = await request('PUT', '/api/me/easy', vira.cookie, { on: true });
    expect(on.statusCode).toBe(200);
    expect(on.json()).toEqual({ easyMode: true });
    expect((await request('GET', '/api/me', vira.cookie)).json().easyMode).toBe(true);
    const off = await request('PUT', '/api/me/easy', vira.cookie, { on: false });
    expect(off.json()).toEqual({ easyMode: false });
    expect((await request('GET', '/api/me', vira.cookie)).json().easyMode).toBe(false);
  });

  it('needs a session and a plain { on: boolean }', async () => {
    expect((await request('PUT', '/api/me/easy', undefined, { on: true })).statusCode).toBe(401);
    for (const body of [{ on: 'yes' }, { on: true, x: 1 }, {}]) {
      const response = await request('PUT', '/api/me/easy', olena.cookie, body);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
  });
});
