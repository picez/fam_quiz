import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { buildApp } from './app';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
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
      standings: Record<string, unknown>[];
      questions: Record<string, unknown>[];
    };
    expect(detail.standings.map((s) => [s.nickname, s.rank, s.score, s.correct])).toEqual([
      ['Олена', 1, 2000, 2],
      ['Тарас', 2, 0, 0],
    ]);
    expect(detail.questions).toEqual([
      { index: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1 },
      { index: 1, text: 'Яке місто називають перлиною біля моря?', type: 'text', answered: 1, accepted: 1 },
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
