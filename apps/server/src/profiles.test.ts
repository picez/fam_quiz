import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, text, withId } from '@quiz/engine/testing';
import { buildApp } from './app';
import { createTestDb } from './testing/test-db';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { playToEnd } from './testing/final-game';
import { game, participant, profile, user } from './db/schema';
import { ensureProfile, profileFacts, saveProfile } from './profiles';
import { markInterrupted } from './recorder';

const addUser = (db: Awaited<ReturnType<typeof createTestDb>>, id: string, name: string) =>
  db.insert(user).values({ id, name, email: `${id}@example.com` });

describe('default nickname', () => {
  it('makes a default nickname from the account name', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена Петренко');

    expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена Петренко', avatar: null });
    expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена Петренко', avatar: null });
    expect(await db.select().from(profile)).toHaveLength(1);
  });

  it('adds a number when the default nickname is taken', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена');
    await addUser(db, 'u2', 'Олена');
    await addUser(db, 'u3', 'олена');

    expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Олена');
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Олена 2');
    expect((await ensureProfile(db, 'u3'))?.nickname).toBe('олена 3');
  });

  it('fits a long name with its number into 20 characters and replaces an unusable one', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олександра-Анастасія Ш');
    await addUser(db, 'u2', 'Олександра-Анастасія Ш');
    await addUser(db, 'u3', 'Я');

    expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Олександра-Анастасія');
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Олександра-Анастас 2');
    expect((await ensureProfile(db, 'u3'))?.nickname).toBe('Гравець');
  });

  it('two simultaneous first reads create one profile', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена');

    const [a, b] = await Promise.all([ensureProfile(db, 'u1'), ensureProfile(db, 'u1')]);
    expect(a).toEqual(b);
    expect(await db.select().from(profile).where(eq(profile.userId, 'u1'))).toHaveLength(1);
  });

  it('has no profile for an unknown user', async () => {
    const db = await createTestDb();
    expect(await ensureProfile(db, 'nobody')).toBeNull();
  });
});

describe('saving a profile', () => {
  it('nicknames are unique regardless of case, spacing and apostrophes', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Один');
    await addUser(db, 'u2', 'Два');

    expect(await saveProfile(db, 'u1', { nickname: 'Оля К’', avatar: null })).toMatchObject({ ok: true });
    expect(await saveProfile(db, 'u2', { nickname: "оля к'", avatar: null })).toEqual({ ok: false, error: 'nickname_taken' });
    expect(await saveProfile(db, 'u1', { nickname: 'ОЛЯ К’', avatar: '/uploads/0123456789abcdef.png' })).toEqual({
      ok: true,
      profile: { id: 'u1', nickname: 'ОЛЯ К’', avatar: '/uploads/0123456789abcdef.png' },
    });
  });
});

describe('profile facts', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await buildApp({ db, auth: TEST_AUTH });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const post = (url: string, payload: object, cookie?: string) =>
    ctx.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });

  const idOf = async (email: string) => {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    return row.id;
  };

  const earned = (achievements: { id: string; earned: boolean }[]) => achievements.filter((a) => a.earned).map((a) => a.id);

  /** Ведуча з двома вікторинами проводить гру [single, text]: Олена (акаунт) правильно обидва, Тарас (гість) помиляється. */
  async function playedGame() {
    const host = await signUp(ctx.app, 'Ведуча');
    const olena = await signUp(ctx.app, 'Олена');
    const quiz = makeQuiz([single, text], { speedBonus: false });
    await post('/api/quizzes', quiz, host.cookie);
    const { game: created } = await startGame(ctx.app, quiz, host.cookie);

    const joinAs = async (nickname: string, cookie?: string) =>
      ((await post(`/api/games/by-code/${created.code}/join`, { nickname }, cookie)).json() as { playerId: string }).playerId;
    const olenaId = await joinAs('Олена', olena.cookie);
    const tarasId = await joinAs('Тарас');

    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    for (const playerId of [olenaId, tarasId]) ctx.manager.connect(room, { role: 'player', playerId });
    const step = (type: 'start' | 'lock' | 'next') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });

    step('start');
    ctx.manager.answer(room, olenaId, { type: 'single', optionId: 'b' });
    ctx.manager.answer(room, tarasId, { type: 'single', optionId: 'a' });
    step('next');
    step('next');
    step('next');
    ctx.manager.answer(room, olenaId, { type: 'text', value: 'Одеса' });
    step('lock');
    step('next');
    step('next');
    await ctx.recorder.idle();
    return { hostId: await idOf(host.email), olenaId: await idOf(olena.email), gameId: created.gameId };
  }

  it('profileFacts counts played games, wins, accuracy, quizzes and hosted games', async () => {
    const { hostId, olenaId, gameId } = await playedGame();

    const olena = await profileFacts(db, olenaId);
    expect(olena.stats).toEqual({ games: 1, wins: 1, accuracy: 100, quizzes: 0, hosted: 0 });
    expect(olena.wins).toEqual([{ gameId, title: 'Тестова вікторина', startedAt: expect.any(String), rank: 1 }]);
    expect(Date.parse(olena.wins[0].startedAt)).not.toBeNaN();
    expect(earned(olena.achievements)).toEqual(['first_game', 'first_win']);
    expect(olena.achievements).toHaveLength(8);

    const host = await profileFacts(db, hostId);
    expect(host.stats).toEqual({ games: 0, wins: 0, accuracy: null, quizzes: 2, hosted: 1 });
    expect(host.wins).toEqual([]);
    expect(earned(host.achievements)).toEqual(['host']);
  });

  it('a game the host abandoned does not count as hosted', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const { game: created } = await startGame(ctx.app, makeQuiz([single, text]), host.cookie);
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: 'Тарас' })).json() as { playerId: string };
    ctx.manager.connect(room, { role: 'player', playerId });
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    await markInterrupted(db);

    const [row] = await db.select({ status: game.status }).from(game).where(eq(game.id, created.gameId));
    expect(row.status).toBe('aborted');
    const facts = await profileFacts(db, await idOf(host.email));
    expect(facts.stats.hosted).toBe(0);
    expect(earned(facts.achievements)).toEqual([]);
  });

  it('profileFacts counts every game, not only the latest hundred', async () => {
    const hostId = randomUUID();
    const playerId = randomUUID();
    await db.insert(user).values([
      { id: hostId, name: 'Ведуча', email: `${hostId}@example.com` },
      { id: playerId, name: 'Олена', email: `${playerId}@example.com` },
    ]);
    const games = Array.from({ length: 101 }, (_, i) => ({
      id: randomUUID(),
      hostId,
      code: String(100000 + i),
      status: 'finished' as const,
      title: `Гра ${i}`,
      quizSnapshot: {},
      questionsPlayed: 0,
      startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      finishedAt: new Date(Date.UTC(2026, 0, 1, 1, i)),
    }));
    await db.insert(game).values(games);
    await db.insert(participant).values(
      games.map((g) => ({ id: randomUUID(), gameId: g.id, nickname: 'Олена', userId: playerId, score: 0, totalTimeMs: 0, rank: 1 })),
    );

    const facts = await profileFacts(db, playerId);
    expect(facts.stats.games).toBe(101);
    expect(earned(facts.achievements)).toEqual(['first_game', 'games_10', 'games_50']);
  });
  it('a final answer counts like any answer in profile stats, silence does not break a perfect game', async () => {
    const classic = ['s1', 's2', 's3', 's4', 's5'].map((id) => withId(single, id));
    const quiz = makeRoundsQuiz([classicRound('r1', classic, { speedBonus: false }), finalRound('f', withId(single, 'f1'))]);
    const host = await signUp(ctx.app, 'Ведуча');
    const play = async (name: string, finalAnswers: (id: string) => string[]) => {
      const player = await signUp(ctx.app, name);
      const { game: created } = await startGame(ctx.app, quiz, host.cookie);
      const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: name }, player.cookie)).json() as { playerId: string };
      const room = ctx.manager.get(created.code);
      if (room === undefined) throw new Error('room missing');
      ctx.manager.connect(room, { role: 'player', playerId });
      playToEnd(ctx.manager, room, [playerId], finalAnswers(playerId), () => 0);
      expect(room.state.phase).toBe('finished');
      await ctx.recorder.idle();
      return profileFacts(db, await idOf(player.email));
    };

    const silent = await play('Мовчазна', () => []);
    expect(silent.stats.accuracy).toBe(83);
    expect(earned(silent.achievements)).toContain('perfect_game');

    const right = await play('Впевнена', (id) => [id]);
    expect(right.stats.accuracy).toBe(100);
    expect(earned(right.achievements)).toEqual(expect.arrayContaining(['perfect_game', 'streak_5']));
  });
});
