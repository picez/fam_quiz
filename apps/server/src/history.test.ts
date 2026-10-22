import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Answer } from '@quiz/shared';
import { blitzRound, boardRound, bool, chain, classicRound, finalRound, makeQuiz, makeRoundsQuiz, match, single, text, withId, withVideo } from '@quiz/engine/testing';
import { buildApp } from './app';
import { gameTables } from './history';
import type { Db } from './db/client';
import { answer, game, participant, user } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { playToEnd } from './testing/final-game';
import { FakeScheduler } from './testing/fake-scheduler';
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
  step('next');
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
    expect(detail.questions).toMatchObject([
      { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1, cell: null },
      { index: 1, roundIndex: 0, text: 'Яке місто називають перлиною біля моря?', type: 'text', answered: 1, accepted: 1, cell: null },
    ]);
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
    expect(detail.questions).toMatchObject([
      { index: 0, roundIndex: 0, text: single.text, type: 'single', answered: 1, accepted: 1, cell: null },
      { index: 1, roundIndex: 1, text: bool.text, type: 'boolean', answered: 1, accepted: 1, cell: null },
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
    expect(detail.questions).toMatchObject([
      { index: 0, roundIndex: 0, text: single.text, type: 'single', answered: 1, accepted: 1, cell: null },
      { index: 1, roundIndex: 0, text: text.text, type: 'text', answered: 1, accepted: 0, cell: null },
    ]);
  });
});

describe('history: blitz attempts', () => {
  it('history counts a player with two blitz attempts once', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const olena = await signUp(ctx.app, 'Олена');
    const quiz = makeRoundsQuiz([blitzRound('b1', [single], { attempts: 2 })]);
    const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const joinAs = async (nickname: string, cookie?: string) =>
      ((await post(`/api/games/by-code/${created.code}/join`, { nickname }, cookie)).json() as { playerId: string }).playerId;
    const olenaId = await joinAs('Олена', olena.cookie);
    const tarasId = await joinAs('Тарас');
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    for (const playerId of [olenaId, tarasId]) ctx.manager.connect(room, { role: 'player', playerId });
    const attempt = (playerId: string, optionId: string) => {
      expect(ctx.manager.buzz(room, playerId)).toEqual({ ok: true });
      expect(ctx.manager.answer(room, playerId, { type: 'single', optionId })).toEqual({ ok: true });
      expect(ctx.manager.host(room, { type: 'accept', playerId })).toEqual({ ok: true });
    };

    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(ctx.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    attempt(olenaId, 'a');
    attempt(tarasId, 'c');
    attempt(olenaId, 'b');
    expect(room.state.phase).toBe('locked');
    await ctx.recorder.idle();

    const detail = (await get(`/api/games/${created.gameId}`, host.cookie)).json() as {
      standings: Record<string, unknown>[];
      questions: Record<string, unknown>[];
    };
    expect(detail.questions).toMatchObject([{ index: 0, answered: 2, accepted: 1 }]);
    expect(detail.standings.map((s) => [s.nickname, s.correct])).toEqual([
      ['Олена', 1],
      ['Тарас', 0],
    ]);
    const [played] = (await get('/api/me/history', olena.cookie)).json() as Record<string, unknown>[];
    expect(played).toMatchObject({ gameId: created.gameId, answered: 1, correct: 1 });
  });
});

describe('host history: broken snapshot', () => {
  it('does not fail the whole history because of one snapshot that no longer passes the schema', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const base = { hostId: account.id, quizId: null, status: 'finished' as const, questionsPlayed: 0, finishedAt: new Date() };
    const goodId = '55555555-5555-4555-8555-555555555555';
    const badId = '66666666-6666-4666-8666-666666666666';
    await db.insert(game).values({
      ...base,
      id: goodId,
      code: '111222',
      title: 'Добра',
      quizSnapshot: makeRoundsQuiz([classicRound('r1', [single, text])]),
      startedAt: new Date(2026, 0, 2),
    });
    // Знімок, якого сьогоднішня схема не приймає: у запитань немає потрібних полів.
    await db.insert(game).values({
      ...base,
      id: badId,
      code: '333444',
      title: 'Зіпсована',
      quizSnapshot: { title: 'Зіпсована', rounds: [{ id: 'r1', questions: [{}, {}, {}] }] },
      startedAt: new Date(2026, 0, 1),
    });
    await db.insert(participant).values({ id: '77777777-7777-4777-8777-777777777777', gameId: badId, nickname: 'Тарас', score: 5, totalTimeMs: 0, rank: 1 });

    const listed = await get('/api/games', host.cookie);
    expect(listed.statusCode).toBe(200);
    const list = listed.json() as Record<string, unknown>[];
    expect(list.map((g) => [g.id, g.questionCount])).toEqual([
      [goodId, 2],
      [badId, 3],
    ]);

    const detail = await get(`/api/games/${badId}`, host.cookie);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      rounds: [],
      questions: [],
      standings: [{ nickname: 'Тарас', score: 5, rank: 1 }],
    });
  });
});

describe('gameTables', () => {
  it('an empty list makes no query', async () => {
    const untouchable = new Proxy({}, { get: () => { throw new Error('db used'); } }) as Db;
    expect(await gameTables(untouchable, [])).toEqual([]);
  });

  it('reads round types for new, old and broken snapshots and groups players with their rows', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const base = { hostId: account.id, quizId: null, status: 'finished' as const, questionsPlayed: 0, finishedAt: new Date() };
    const ids = { modern: 'a1111111-1111-4111-8111-111111111111', old: 'a2222222-2222-4222-8222-222222222222', broken: 'a3333333-3333-4333-8333-333333333333' };
    await db.insert(game).values([
      {
        ...base,
        id: ids.modern,
        code: '700001',
        title: 'Нова',
        quizSnapshot: makeRoundsQuiz([classicRound('r1', [single]), blitzRound('r2', [single]), finalRound('r3', text)]),
        startedAt: new Date(2026, 1, 3),
      },
      {
        ...base,
        id: ids.old,
        code: '700002',
        title: 'Стара',
        quizSnapshot: { title: 'Стара', description: '', settings: { speedBonus: false, leaderboard: 'each', shuffleOptions: false }, questions: [single, text] },
        startedAt: new Date(2026, 1, 2),
      },
      {
        ...base,
        id: ids.broken,
        code: '700003',
        title: 'Зіпсована',
        quizSnapshot: { title: 'Зіпсована', rounds: [{ id: 'r1', questions: [{}] }, { id: 'r2', type: 'classic' }] },
        startedAt: new Date(2026, 1, 1),
      },
    ]);
    const p = { a: 'b1111111-1111-4111-8111-111111111111', b: 'b2222222-2222-4222-8222-222222222222', c: 'b3333333-3333-4333-8333-333333333333' };
    await db.insert(participant).values([
      { id: p.a, gameId: ids.modern, userId: account.id, nickname: 'А', score: 30, totalTimeMs: 0, rank: 1 },
      { id: p.b, gameId: ids.modern, nickname: 'Б', score: 10, totalTimeMs: 0, rank: 2 },
      { id: p.c, gameId: ids.old, nickname: 'В', score: 0, totalTimeMs: 0, rank: null },
    ]);
    const given = { timeMs: 1000, overridden: false, payload: null };
    await db.insert(answer).values([
      { ...given, participantId: p.a, questionIndex: 0, roundIndex: 0, accepted: true, points: 20 },
      { ...given, participantId: p.a, questionIndex: 1, roundIndex: 1, accepted: true, points: 10 },
      { ...given, participantId: p.b, questionIndex: 1, roundIndex: 1, attempt: 1, accepted: false, points: 10 },
    ]);

    const tables = await gameTables(db, [ids.modern, ids.old, ids.broken]);
    const byId = new Map(tables.map((table) => [table.gameId, table]));
    expect(byId.size).toBe(3);
    expect(byId.get(ids.modern)!.roundTypes).toEqual(['classic', 'blitz', 'final']);
    expect(byId.get(ids.old)!.roundTypes).toEqual(['classic']);
    expect(byId.get(ids.broken)!.roundTypes).toEqual([]);
    expect(byId.get(ids.broken)!.players).toEqual([]);
    expect(byId.get(ids.modern)).toMatchObject({ status: 'finished', startedAt: new Date(2026, 1, 3).toISOString() });
    const players = [...byId.get(ids.modern)!.players].sort((x, y) => y.score - x.score);
    expect(players).toEqual([
      {
        participantId: p.a,
        userId: account.id,
        score: 30,
        rank: 1,
        rows: expect.arrayContaining([
          { roundIndex: 0, attempt: 0, accepted: true, points: 20 },
          { roundIndex: 1, attempt: 0, accepted: true, points: 10 },
        ]),
      },
      { participantId: p.b, userId: null, score: 10, rank: 2, rows: [{ roundIndex: 1, attempt: 1, accepted: false, points: 10 }] },
    ]);
    expect(players[0].rows).toHaveLength(2);
    expect(byId.get(ids.old)!.players).toEqual([{ participantId: p.c, userId: null, score: 0, rank: null, rows: [] }]);
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

describe('host history: board', () => {
  it('history shows board questions by cell with the chooser and points', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const cell = (id: string, points: number) => ({ ...withId(single, id), points });
    const quiz = makeRoundsQuiz([
      boardRound('g1', [
        { title: 'Міста', cells: [cell('c11', 100), cell('c12', 200), cell('c13', 300)] },
        { title: 'Річки', cells: [cell('c21', 100), cell('c22', 200), cell('c23', 300)] },
        { title: 'Гори', cells: [cell('c31', 100), cell('c32', 200), cell('c33', 300)] },
      ]),
      classicRound('r2', [bool]),
    ]);
    const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const joined = (await post(`/api/games/by-code/${created.code}/join`, { nickname: 'Анна' })).json() as { playerId: string };
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    ctx.manager.connect(room, { role: 'player', playerId: joined.playerId });
    const step = (type: 'start' | 'next' | 'lock' | 'end-round') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });

    step('start');
    step('next');
    expect(ctx.manager.pick(room, joined.playerId, 'c11')).toEqual({ ok: true });
    expect(ctx.manager.answer(room, joined.playerId, { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    expect(ctx.manager.host(room, { type: 'accept', playerId: joined.playerId })).toEqual({ ok: true });
    while (room.state.phase !== 'board') step('next');
    step('end-round');
    while ((room.state.phase as string) !== 'question') step('next');
    step('lock');
    while ((room.state.phase as string) !== 'finished') step('next');
    await ctx.recorder.idle();

    const detail = (await get(`/api/games/${created.gameId}`, host.cookie)).json() as { questions: Record<string, unknown>[] };
    expect(detail.questions[0].cell).toEqual({ category: 'Міста', price: 100, multiplier: 1, chooser: 'Анна', points: 100, kind: 'normal', scores: [] });
    expect(detail.questions.at(-1)?.cell).toBeNull();
  });

  it('a blitz cell shows its kind and everyone’s points, penalty rows are not responses', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const cell = (id: string, points: number) => ({ ...withId(single, id), points });
    const quiz = makeRoundsQuiz([
      boardRound('g1', [
        { title: 'Міста', cells: [{ question: cell('c11', 100), kind: 'blitz', mark: 'x2', penalty: 'all' }, cell('c12', 200), cell('c13', 300)] },
        { title: 'Річки', cells: [cell('c21', 100), cell('c22', 200), cell('c23', 300)] },
        { title: 'Гори', cells: [cell('c31', 100), cell('c32', 200), cell('c33', 300)] },
      ]),
    ]);
    const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const ids: Record<string, string> = {};
    for (const nickname of ['Анна', 'Богдан', 'Віра']) {
      const joined = (await post(`/api/games/by-code/${created.code}/join`, { nickname })).json() as { playerId: string };
      ctx.manager.connect(room, { role: 'player', playerId: joined.playerId });
      ids[nickname] = joined.playerId;
    }
    const step = (type: 'start' | 'next' | 'lock') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });
    step('start');
    step('next');
    expect(ctx.manager.pick(room, ids['Анна'], 'c11')).toEqual({ ok: true });
    for (const [nickname, optionId] of [['Анна', 'a'], ['Богдан', 'b']] as const) {
      expect(ctx.manager.buzz(room, ids[nickname])).toEqual({ ok: true });
      expect(ctx.manager.answer(room, ids[nickname], { type: 'single', optionId })).toEqual({ ok: true });
      expect(ctx.manager.host(room, { type: 'accept', playerId: ids[nickname] })).toEqual({ ok: true });
    }
    expect(room.state.phase).toBe('locked');
    step('next');
    await ctx.recorder.idle();

    const detail = (await get(`/api/games/${created.gameId}`, host.cookie)).json() as {
      questions: { answered: number; cell: Record<string, unknown>; responses: { nickname: string; answer: unknown; accepted: boolean }[] }[];
    };
    // Віра лише отримала «Мінус для всіх»: вона не відповідала.
    expect(detail.questions[0].answered).toBe(2);
    expect(detail.questions[0].cell).toMatchObject({ kind: 'blitz', chooser: 'Анна', multiplier: 2 });
    expect(detail.questions[0].cell.scores).toEqual([
      { nickname: 'Богдан', points: 200 },
      { nickname: 'Анна', points: -200 },
      { nickname: 'Віра', points: -200 },
    ]);
    expect(detail.questions[0].responses).toEqual([
      { nickname: 'Богдан', answer: { type: 'single', optionId: 'b' }, accepted: true },
      { nickname: 'Анна', answer: { type: 'single', optionId: 'a' }, accepted: false },
    ]);
  });

  it('an old game without cell kinds still renders', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const gameId = '99999999-9999-4999-8999-999999999999';
    const playerId = '99999999-9999-4999-8999-999999999990';
    const cell = (id: string) => ({ ...withId(single, id), points: 100 });
    // Знімок до плану 6c: клітинки без kind і penalty.
    const round = boardRound('g1', [
      { title: 'Міста', cells: [cell('c11'), cell('c12'), cell('c13')] },
      { title: 'Річки', cells: [cell('c21'), cell('c22'), cell('c23')] },
      { title: 'Гори', cells: [cell('c31'), cell('c32'), cell('c33')] },
    ]);
    const oldRound = {
      ...round,
      categories: round.categories.map((c) => ({ ...c, cells: c.cells.map(({ kind: _kind, penalty: _penalty, ...rest }) => ({ ...rest, mark: c.id === 'c1' ? 'x2' : 'none' })) })),
    };
    await db.insert(game).values({
      id: gameId,
      hostId: account.id,
      quizId: null,
      status: 'finished',
      questionsPlayed: 1,
      finishedAt: new Date(),
      code: '777888',
      title: 'Старе поле',
      quizSnapshot: { ...makeRoundsQuiz([]), title: 'Старе поле', rounds: [oldRound] },
      plays: [{ roundIndex: 0, questionId: 'c11', cell: { cellId: 'c11', chooserId: playerId } }],
      startedAt: new Date(2026, 0, 4),
    });
    await db.insert(participant).values({ id: playerId, gameId, nickname: 'Анна', userId: null, score: 200, totalTimeMs: 0, rank: 1 });
    await db.insert(answer).values({ participantId: playerId, questionIndex: 0, attempt: 0, roundIndex: 0, payload: { type: 'single', optionId: 'b' }, timeMs: 10, accepted: true, points: 200, streakBonus: 0, overridden: false });

    const response = await get(`/api/games/${gameId}`, host.cookie);
    expect(response.statusCode).toBe(200);
    const detail = response.json() as { questions: { cell: Record<string, unknown> }[] };
    expect(detail.questions[0].cell).toMatchObject({ kind: 'normal', scores: [], chooser: 'Анна', points: 200 });
  });

  it('counts the cells of a board round in a snapshot that no longer passes the schema', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    await db.insert(game).values({
      hostId: account.id,
      quizId: null,
      status: 'finished',
      questionsPlayed: 0,
      finishedAt: new Date(),
      id: '88888888-8888-4888-8888-888888888888',
      code: '555666',
      title: 'Поле',
      quizSnapshot: { title: 'Поле', rounds: [{ id: 'g1', type: 'board', categories: [{ cells: [{}, {}] }, { cells: [{}, {}, {}] }] }] },
      startedAt: new Date(2026, 0, 3),
    });
    const list = (await get('/api/games', host.cookie)).json() as Record<string, unknown>[];
    expect(list.map((g) => g.questionCount)).toEqual([5]);
  });
});

describe('host history: answers', () => {
  async function start(quiz: object, scheduler?: FakeScheduler) {
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, ...(scheduler === undefined ? {} : { scheduler }) });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const enter = async (nickname: string) => {
      const playerId = ((await send(`/api/games/by-code/${created.code}/join`, { nickname })).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId });
      return playerId;
    };
    const detail = async () => {
      await local.recorder.idle();
      return (await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })).json() as {
        questions: { question: { type: string }; responses: unknown[] }[];
        standings: { nickname: string; correct: number }[];
      };
    };
    return { local, room, enter, detail, localDb };
  }

  it('history returns each player answer with the question snapshot, a match answer as links', async () => {
    const { local, room, enter, detail } = await start(makeQuiz([match], { speedBonus: false }));
    const olena = await enter('Олена');
    const taras = await enter('Тарас');
    const right: Answer = { type: 'match', links: [{ left: 'a', right: 'x' }, { left: 'b', right: 'y' }, { left: 'c', right: 'z' }] };
    const swapped: Answer = { type: 'match', links: [{ left: 'a', right: 'y' }, { left: 'b', right: 'x' }, { left: 'c', right: 'z' }] };
    const step = (type: 'start' | 'lock' | 'next') => expect(local.manager.host(room, { type })).toEqual({ ok: true });
    step('start');
    step('next');
    local.manager.answer(room, olena, right);
    local.manager.answer(room, taras, swapped);
    step('next');
    step('next');
    const result = await detail();
    expect(result.questions[0].question.type).toBe('match');
    expect(result.questions[0].responses).toEqual([
      { nickname: 'Олена', answer: right, accepted: true },
      { nickname: 'Тарас', answer: swapped, accepted: false },
    ]);
    await local.app.close();
  });

  it('history lists chain summaries and counts a finished chain as correct', async () => {
    const { local, room, enter, detail } = await start(makeQuiz([chain], { speedBonus: false }));
    const olena = await enter('Олена');
    const taras = await enter('Тарас');
    const step = (type: 'start' | 'lock' | 'next') => expect(local.manager.host(room, { type })).toEqual({ ok: true });
    step('start');
    step('next');
    for (const word of ['Риба', 'Океан', 'Корабель']) local.manager.guess(room, olena, word);
    local.manager.guess(room, taras, 'Риба');
    step('lock');
    step('next');
    step('next');
    const result = await detail();
    expect(result.questions[0].question.type).toBe('chain');
    expect(result.questions[0].responses).toMatchObject([
      { nickname: 'Олена', answer: { type: 'chain', solved: 3, hints: 0 }, accepted: true },
      { nickname: 'Тарас', answer: { type: 'chain', solved: 1, hints: 0 }, accepted: false },
    ]);
    expect(result.standings.map((s) => [s.nickname, s.correct])).toEqual([
      ['Олена', 1],
      ['Тарас', 0],
    ]);
    await local.app.close();
  });

  it('a game with a video question shows in the history like any other', async () => {
    const { local, room, enter, detail, localDb } = await start(makeQuiz([withVideo(single, { id: 'dQw4w9WgXcQ', start: 42 })], { speedBonus: false }));
    const olena = await enter('Олена');
    const taras = await enter('Тарас');
    const step = (type: 'start' | 'lock' | 'next') => expect(local.manager.host(room, { type })).toEqual({ ok: true });
    step('start');
    step('next');
    local.manager.answer(room, olena, { type: 'single', optionId: 'b' });
    local.manager.answer(room, taras, { type: 'single', optionId: 'a' });
    step('next');
    step('next');
    const result = await detail();
    expect(result.questions[0].question).toMatchObject({ video: { id: 'dQw4w9WgXcQ', start: 42 } });
    expect(result.questions[0].responses).toMatchObject([
      { nickname: 'Олена', accepted: true },
      { nickname: 'Тарас', accepted: false },
    ]);
    const rows = await localDb.select().from(answer);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.timeMs).toBeGreaterThanOrEqual(0);
    await local.app.close();
  });

  it('history lists a missed blitz attempt with a null answer', async () => {
    const scheduler = new FakeScheduler();
    const { local, room, enter, detail } = await start(makeRoundsQuiz([blitzRound('b1', [single], { answerWindow: 5 })]), scheduler);
    const olena = await enter('Олена');
    expect(local.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(local.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(local.manager.buzz(room, olena)).toEqual({ ok: true });
    scheduler.advance(5000);
    expect(room.state.phase).toBe('locked');
    const result = await detail();
    expect(result.questions[0].responses).toEqual([{ nickname: 'Олена', answer: null, accepted: false }]);
    await local.app.close();
  });
  it('history shows final wagers and silence is not an answer', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const quiz = makeRoundsQuiz([classicRound('r1', [withId(single, 's1')], { speedBonus: false }), finalRound('f', withId(single, 'f1'))]);
    const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const join = async (nickname: string) =>
      ((await post(`/api/games/by-code/${created.code}/join`, { nickname })).json() as { playerId: string }).playerId;
    const anna = await join('Анна');
    const bohdan = await join('Богдан');
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    for (const playerId of [anna, bohdan]) ctx.manager.connect(room, { role: 'player', playerId });
    const stake = (id: string) => (id === anna ? 300 : 200);
    // Зупинка на розкритті фіналу: у завершеній грі вилучити гравця вже не можна.
    playToEnd(ctx.manager, room, [anna, bohdan], [anna], stake, (r) => r.state.roundIndex === 1 && r.state.phase === 'reveal');
    expect(room.state.phase).toBe('reveal');
    await ctx.recorder.idle();

    const read = async () =>
      (await get(`/api/games/${created.gameId}`, host.cookie)).json() as {
        questions: { final: { entries: { nickname: string }[] } | null; answered: number; responses: { nickname: string }[] }[];
      };
    const detail = await read();
    expect(detail.questions[0].final).toBeNull();
    expect(detail.questions[1].final).toEqual({
      entries: [
        { nickname: 'Анна', answer: { type: 'single', optionId: 'b' }, wager: 300, points: 300, accepted: true },
        { nickname: 'Богдан', answer: null, wager: 200, points: -200, accepted: false },
      ],
    });
    expect(detail.questions[1].answered).toBe(1);
    expect(detail.questions[1].responses.map((r) => r.nickname)).toEqual(['Анна']);

    expect(ctx.manager.host(room, { type: 'kick', playerId: bohdan })).toEqual({ ok: true });
    playToEnd(ctx.manager, room, [anna], [anna], stake);
    await ctx.recorder.idle();
    expect((await read()).questions[1].final?.entries.map((e) => e.nickname)).toEqual(['Анна']);
  });
});
