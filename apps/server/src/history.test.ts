import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { bool, classicRound, makeQuiz, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import { buildApp } from './app';
import type { Db } from './db/client';
import { answer, game, participant, user } from './db/schema';
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

const get = (url: string, cookie?: string) =>
  ctx.app.inject({ method: 'GET', url, headers: cookie === undefined ? {} : { cookie } });
const post = (url: string, payload: object, cookie?: string) =>
  ctx.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });

/** Повна гра з двох запитань: Олена (з акаунтом) відповідає правильно на обидва, Тарас (гість) помиляється в першому. */
async function playedGame() {
  const host = await signUp(ctx.app, 'Ведуча');
  const olena = await signUp(ctx.app, 'Олена');
  const quiz = makeQuiz([single, text], { speedBonus: false });
  const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
  const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };

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
  return { host, olena, gameId: created.gameId, code: created.code };
}

describe('host history', () => {
  it('lists the host’s games with their outcome', async () => {
    const { host, gameId, code } = await playedGame();
    const response = await get('/api/games', host.cookie);
    expect(response.statusCode).toBe(200);
    const list = response.json() as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: gameId,
      code,
      title: 'Тестова вікторина',
      status: 'finished',
      playerCount: 2,
      questionsPlayed: 2,
      questionCount: 2,
    });
    expect(Date.parse(String(list[0].startedAt))).not.toBeNaN();
    expect(Date.parse(String(list[0].finishedAt))).not.toBeNaN();
  });

  it('shows the standings and how each question went', async () => {
    const { host, gameId } = await playedGame();
    const detail = (await get(`/api/games/${gameId}`, host.cookie)).json() as {
      rounds: Record<string, unknown>[];
      standings: Record<string, unknown>[];
      questions: Record<string, unknown>[];
    };
    expect(detail.rounds).toEqual([{ title: '', type: 'classic' }]);
    expect(detail.standings.map((s) => [s.nickname, s.rank, s.score, s.correct])).toEqual([
      ['Олена', 1, 2000, 2],
      ['Тарас', 2, 0, 0],
    ]);
    expect(detail.questions).toEqual([
      { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1 },
      { index: 1, roundIndex: 0, text: 'Яке місто називають перлиною біля моря?', type: 'text', answered: 1, accepted: 1 },
    ]);
    expect(JSON.stringify(detail)).not.toContain('correctId');
  });

  it('keeps the history after the quiz is deleted', async () => {
    const { host, gameId } = await playedGame();
    const quizzes = (await get('/api/quizzes', host.cookie)).json() as { id: string }[];
    await ctx.app.inject({ method: 'DELETE', url: `/api/quizzes/${quizzes[0].id}`, headers: { cookie: host.cookie } });
    expect((await get(`/api/games/${gameId}`, host.cookie)).statusCode).toBe(200);
  });

  it('shows nothing of one host’s games to another account or to a visitor', async () => {
    const { gameId } = await playedGame();
    const stranger = await signUp(ctx.app, 'Чужий');
    expect((await get('/api/games', stranger.cookie)).json()).toEqual([]);
    for (const response of [
      await get(`/api/games/${gameId}`, stranger.cookie),
      await get('/api/games/abc', stranger.cookie),
      await get('/api/games/11111111-1111-4111-8111-111111111111', stranger.cookie),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
    for (const url of ['/api/games', `/api/games/${gameId}`, '/api/me/history']) {
      expect((await get(url)).statusCode).toBe(401);
    }
  });
});

describe('host history: rounds', () => {
  it('shows the rounds and which round each played question belongs to', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const quiz = makeRoundsQuiz([
      classicRound('r1', [single, text], { title: 'Розминка' }),
      classicRound('r2', [bool], { title: 'Фінал' }),
    ]);
    const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: 'Олена' })).json() as {
      playerId: string;
    };
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    ctx.manager.connect(room, { role: 'player', playerId });
    const step = (type: 'start' | 'next' | 'end-round') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });

    step('start');
    step('next');
    ctx.manager.answer(room, playerId, { type: 'single', optionId: 'b' });
    step('end-round');
    step('next');
    step('next');
    ctx.manager.answer(room, playerId, { type: 'boolean', value: true });
    step('next');
    step('next');
    await ctx.recorder.idle();

    const [summary] = (await get('/api/games', host.cookie)).json() as Record<string, unknown>[];
    expect(summary).toMatchObject({ status: 'finished', questionsPlayed: 2, questionCount: 3 });
    const detail = (await get(`/api/games/${created.gameId}`, host.cookie)).json() as Record<string, unknown>;
    expect(detail.rounds).toEqual([
      { title: 'Розминка', type: 'classic' },
      { title: 'Фінал', type: 'classic' },
    ]);
    expect(detail.questions).toEqual([
      { index: 0, roundIndex: 0, text: single.text, type: 'single', answered: 1, accepted: 1 },
      { index: 1, roundIndex: 1, text: bool.text, type: 'boolean', answered: 1, accepted: 1 },
    ]);
  });

  it('shows a game played before rounds existed as one classic round', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const gameId = '33333333-3333-4333-8333-333333333333';
    const playerId = '44444444-4444-4444-8444-444444444444';
    // Рядок, яким його записав старий сервер: знімок без раундів і без журналу запитань.
    const oldSnapshot = {
      title: 'Стара гра',
      description: '',
      settings: { speedBonus: false, leaderboard: 'each', shuffleOptions: false },
      questions: [single, text, bool],
    };
    await db.insert(game).values({
      id: gameId,
      quizId: null,
      hostId: account.id,
      code: '654321',
      status: 'finished',
      title: 'Стара гра',
      quizSnapshot: oldSnapshot,
      questionsPlayed: 2,
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    await db.insert(participant).values({ id: playerId, gameId, nickname: 'Тарас', score: 1000, totalTimeMs: 0, rank: 1 });
    const given = { participantId: playerId, timeMs: 1000, overridden: false };
    await db.insert(answer).values([
      { ...given, questionIndex: 0, payload: { type: 'single', optionId: 'b' }, accepted: true, points: 1000 },
      { ...given, questionIndex: 1, payload: { type: 'text', value: 'Львів' }, accepted: false, points: 0 },
    ]);

    const [summary] = (await get('/api/games', host.cookie)).json() as Record<string, unknown>[];
    expect(summary).toMatchObject({ id: gameId, questionsPlayed: 2, questionCount: 3 });
    const detail = (await get(`/api/games/${gameId}`, host.cookie)).json() as Record<string, unknown>;
    expect(detail.rounds).toEqual([{ title: '', type: 'classic' }]);
    expect(detail.standings).toMatchObject([{ nickname: 'Тарас', score: 1000, rank: 1, correct: 1 }]);
    expect(detail.questions).toEqual([
      { index: 0, roundIndex: 0, text: single.text, type: 'single', answered: 1, accepted: 1 },
      { index: 1, roundIndex: 0, text: text.text, type: 'text', answered: 1, accepted: 0 },
    ]);
  });
});

describe('player history', () => {
  it('lists the games a signed-in player took part in', async () => {
    const { olena, host, gameId } = await playedGame();
    const response = await get('/api/me/history', olena.cookie);
    expect(response.statusCode).toBe(200);
    const list = response.json() as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      gameId,
      title: 'Тестова вікторина',
      status: 'finished',
      nickname: 'Олена',
      score: 2000,
      rank: 1,
      playerCount: 2,
      correct: 2,
      answered: 2,
      questionsPlayed: 2,
    });
    expect((await get('/api/me/history', host.cookie)).json()).toEqual([]);
  });

  it('lets a player with a broken session cookie join as a guest', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const quizId = ((await post('/api/quizzes', makeQuiz([single]), host.cookie)).json() as { id: string }).id;
    const { code } = (await post('/api/games', { quizId }, host.cookie)).json() as { code: string };

    const response = await post(`/api/games/by-code/${code}/join`, { nickname: 'Гість' }, 'better-auth.session_token=garbage');
    expect(response.statusCode).toBe(201);
    expect(ctx.manager.get(code)?.playerUsers.size).toBe(0);
  });
});
