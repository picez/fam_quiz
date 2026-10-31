import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { breakdownOf, DEFAULT_RULES, defaultTeams, type Answer, type Question } from '@quiz/shared';
import { LADDER_RIGHT, LADDER_WRONG, bluff, blitzRound, boardRound, bool, chain, classicRound, clues, cloud, finalRound, poll, wall, makeQuiz, makeRoundsQuiz, match, pin, single, slider, sortQ, survey, surveyCloud, text, withId, withReveal, withVideo, survivalQuestions, survivalRound, survivalTrials, wipeoutLadder, wipeoutRound, ladderRound } from '@quiz/engine/testing';
import { buildApp } from './app';
import { rankPlayers, scoreLines, sortOf } from '@quiz/engine';
import { answeredTypes, gameTables, hostGame, hostGames, playerGames } from './history';
import type { Db } from './db/client';
import { ADJUSTMENT_ATTEMPT, answer, game, participant, PENALTY_ATTEMPT, user, VOTE_ATTEMPT } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { playToEnd } from './testing/final-game';
import { playLadderQuestion } from './testing/ladder-game';
import { playSurvivalQuestion } from './testing/survival-game';
import { playWipeout } from './testing/wipeout-game';
import { FakeScheduler } from './testing/fake-scheduler';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';
import { TEAM_HOST, recordedTeamGame, toEnd, toQuestion } from './testing/team-game';

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
      teams: false,
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
    // 11f: колонки й розбивка — з рядків answer; коригувань у такій грі немає, і це не помилка.
    expect(detail.standings).toMatchObject([
      { rounds: [1000], breakdown: { parts: [{ source: 'answers', plus: 1000, minus: 0 }], plus: 1000, minus: 0 } },
    ]);
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
    const quiz = makeRoundsQuiz([blitzRound('b1', [single], { attempts: 2, check: 'manual' })]);
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
      expect(ctx.manager.host(room, { type: 'judge', playerId, correct: optionId === 'b' })).toEqual({ ok: true });
    };

    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(ctx.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    attempt(olenaId, 'a');
    attempt(tarasId, 'c');
    attempt(olenaId, 'b');
    expect(room.state.phase).toBe('locked');
    // В історії гравця лише завершені ігри.
    expect(ctx.manager.host(room, { type: 'end' })).toEqual({ ok: true });
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
      standings: [{ nickname: 'Тарас', score: 5, rank: 1, rounds: [], breakdown: { parts: [], plus: 0, minus: 0 } }],
    });
  });

  it('a broken snapshot still gives points per round and a breakdown; answer rows count as answers (11f)', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const { gameId } = await seedGame(db, {
      hostId: account.id,
      startedAt: new Date(),
      snapshot: { title: 'Зіпсована', rounds: [{ id: 'r1', type: 'final', questions: [{}] }, { id: 'r2', type: 'wipeout', questions: [{}] }] },
      players: [
        {
          userId: null,
          nickname: 'Тарас',
          score: 700,
          rank: 1,
          rows: [
            { questionIndex: 0, roundIndex: 0, accepted: true, points: 1000 },
            { questionIndex: 1, roundIndex: 1, accepted: false, points: -300 },
          ],
        },
      ],
    });
    const detail = await hostGame(db, account.id, gameId);
    expect(detail?.questions).toEqual([]);
    expect(detail?.standings.map((s) => [s.nickname, s.rounds, s.breakdown])).toEqual([
      ['Тарас', [1000, -300], { parts: [{ source: 'answers', plus: 1000, minus: -300 }], plus: 1000, minus: -300 }],
    ]);
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
        memberUserIds: [],
        score: 30,
        rank: 1,
        rows: expect.arrayContaining([
          { roundIndex: 0, attempt: 0, accepted: true, points: 20, wager: null },
          { roundIndex: 1, attempt: 0, accepted: true, points: 10, wager: null },
        ]),
      },
      { participantId: p.b, userId: null, memberUserIds: [], score: 10, rank: 2, rows: [{ roundIndex: 1, attempt: 1, accepted: false, points: 10, wager: null }] },
    ]);
    expect(players[0].rows).toHaveLength(2);
    expect(byId.get(ids.old)!.players).toEqual([{ participantId: p.c, userId: null, memberUserIds: [], score: 0, rank: null, rows: [] }]);
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
      { nickname: 'Богдан', answer: { type: 'single', optionId: 'b' }, accepted: true, buff: null, spare: null, awayMs: null, appeal: null },
      { nickname: 'Анна', answer: { type: 'single', optionId: 'a' }, accepted: false, buff: null, spare: null, awayMs: null, appeal: null },
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
      { nickname: 'Олена', answer: right, accepted: true, buff: null, spare: null, awayMs: null, appeal: null },
      { nickname: 'Тарас', answer: swapped, accepted: false, buff: null, spare: null, awayMs: null, appeal: null },
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

  it('history lists sort summaries and the board price of a sort cell', async () => {
    const scheduler = new FakeScheduler();
    type Started = Awaited<ReturnType<typeof start>>;
    const sortWords = ({ local, room }: Started, playerId: string, count: number, wrongFirst = false) => {
      const move = (right: boolean) => {
        const head = sortOf(room.state, playerId).queue[0];
        const category = sortQ.words.find((w) => w.id === head)?.categoryId ?? '';
        local.manager.sort(room, playerId, head, right ? category : category === 'c1' ? 'c2' : 'c1');
      };
      if (wrongFirst) {
        move(false);
        scheduler.advance(3000);
      }
      for (let i = 0; i < count; i += 1) move(true);
    };
    const classic = await start(makeQuiz([sortQ], { speedBonus: false }), scheduler);
    const olena = await classic.enter('Олена');
    const taras = await classic.enter('Тарас');
    const step = (type: 'start' | 'lock' | 'next') => expect(classic.local.manager.host(classic.room, { type })).toEqual({ ok: true });
    step('start');
    step('next');
    sortWords(classic, olena, 4, true);
    sortWords(classic, taras, 2);
    step('lock');
    step('next');
    step('next');
    const result = await classic.detail();
    expect(result.questions[0].question.type).toBe('sort');
    expect(result.questions[0].responses).toMatchObject([
      { nickname: 'Олена', answer: { type: 'sort', sorted: 4, total: 4, misses: 1 }, accepted: true },
      { nickname: 'Тарас', answer: { type: 'sort', sorted: 2, total: 4, misses: 0 }, accepted: false },
    ]);
    expect(result.standings).toMatchObject([{ nickname: 'Олена', score: 400 }, { nickname: 'Тарас', score: 200 }]);
    await classic.local.app.close();

    const field = await start(
      makeRoundsQuiz([
        boardRound('g1', [
          { title: 'Сортування', cells: [{ mark: 'x2', answerMode: 'phone', question: sortQ }, withId(single, 's1'), withId(single, 's2')] },
          { title: 'Інше', cells: [withId(single, 's3'), withId(single, 's4'), withId(single, 's5')] },
          { title: 'Ще', cells: [withId(single, 's6'), withId(single, 's7'), withId(single, 's8')] },
        ]),
      ]),
      scheduler,
    );
    const anna = await field.enter('Анна');
    expect(field.local.manager.host(field.room, { type: 'start' })).toEqual({ ok: true });
    expect(field.local.manager.host(field.room, { type: 'next' })).toEqual({ ok: true });
    expect(field.local.manager.pick(field.room, anna, sortQ.id)).toEqual({ ok: true });
    sortWords(field, anna, 4);
    const detail = await field.detail();
    expect((detail.questions[0] as unknown as { cell: object }).cell).toMatchObject({ price: 400, multiplier: 2, points: 800 });
    await field.local.app.close();
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
    const { local, room, enter, detail } = await start(makeRoundsQuiz([blitzRound('b1', [single], { answerWindow: 5, check: 'manual' })]), scheduler);
    const olena = await enter('Олена');
    expect(local.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(local.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(local.manager.buzz(room, olena)).toEqual({ ok: true });
    scheduler.advance(5000);
    expect(room.state.phase).toBe('locked');
    const result = await detail();
    expect(result.questions[0].responses).toEqual([{ nickname: 'Олена', answer: null, accepted: false, buff: null, spare: null, awayMs: null, appeal: null }]);
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
      mode: 'classic',
      entries: [
        { nickname: 'Анна', answer: { type: 'single', optionId: 'b' }, wager: 300, points: 300, accepted: true, awayMs: null },
        { nickname: 'Богдан', answer: null, wager: 200, points: -200, accepted: false, awayMs: null },
      ],
    });
    expect(detail.questions[1].answered).toBe(1);
    expect(detail.questions[1].responses.map((r) => r.nickname)).toEqual(['Анна']);

    expect(ctx.manager.host(room, { type: 'kick', playerId: bohdan })).toEqual({ ok: true });
    playToEnd(ctx.manager, room, [anna], [anna], stake);
    await ctx.recorder.idle();
    expect((await read()).questions[1].final?.entries.map((e) => e.nickname)).toEqual(['Анна']);
  });

  it('history shows the stored wager and the bank mode, totals match', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const quiz = makeRoundsQuiz([classicRound('r1', [withId(single, 's1')], { speedBonus: false }), finalRound('f', withId(single, 'f1'), { wagerMode: 'bank' })]);
    const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const join = async (nickname: string) =>
      ((await post(`/api/games/by-code/${created.code}/join`, { nickname })).json() as { playerId: string }).playerId;
    const anna = await join('Анна');
    const bohdan = await join('Богдан');
    const vira = await join('Віра');
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    for (const playerId of [anna, bohdan, vira]) ctx.manager.connect(room, { role: 'player', playerId });
    const stakes = new Map([[anna, 1000], [bohdan, 400], [vira, 200]]);
    // Банк 1000 ділиться 400 : 200 — 666 і 333, залишок 1 найбільшій ставці.
    playToEnd(ctx.manager, room, [anna, bohdan, vira], [bohdan, vira], (id) => stakes.get(id) ?? 0, undefined, [anna]);
    expect(room.state.phase).toBe('finished');
    await ctx.recorder.idle();

    const detail = (await get(`/api/games/${created.gameId}`, host.cookie)).json() as {
      standings: { participantId: string; score: number }[];
      questions: { final: { mode: string; entries: { nickname: string; wager: number; points: number; accepted: boolean }[] } | null }[];
    };
    const final = detail.questions[1].final;
    expect(final?.mode).toBe('bank');
    expect(final?.entries.map(({ nickname, wager, points, accepted }) => ({ nickname, wager, points, accepted }))).toEqual([
      { nickname: 'Богдан', wager: 400, points: 667, accepted: true },
      { nickname: 'Віра', wager: 200, points: 333, accepted: true },
      { nickname: 'Анна', wager: 1000, points: -1000, accepted: false },
    ]);
    expect(detail.questions[0].final).toBeNull();
    const scores = new Map(room.state.players.map((p) => [p.id, p.score]));
    expect(detail.standings.map((row) => row.score)).toEqual(detail.standings.map((row) => scores.get(row.participantId)));
    expect(detail.standings.map((row) => row.score)).toEqual([1667, 1333, 0]);
  });

  it('old rows without a wager keep |points|', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    // Знімок старої гри: фінал без типу ставок читається як «Класичні».
    const { wagerMode: _mode, ...oldFinal } = finalRound('f', withId(single, 'f1'));
    const { gameId } = await seedGame(db, {
      hostId: account.id,
      startedAt: new Date(2026, 1, 1),
      snapshot: makeRoundsQuiz([oldFinal as ReturnType<typeof finalRound>]),
      players: [
        { userId: null, nickname: 'Олена', score: 500, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 500 }] },
        { userId: null, nickname: 'Тарас', score: -300, rank: 2, rows: [{ questionIndex: 0, accepted: false, points: -300 }] },
      ],
    });
    const final = (await hostGame(db, account.id, gameId))?.questions[0].final;
    expect(final?.mode).toBe('classic');
    expect(final?.entries.map(({ nickname, wager, points }) => [nickname, wager, points])).toEqual([
      ['Олена', 500, 500],
      ['Тарас', 300, -300],
    ]);
  });
});

describe('history: score adjustments', () => {
  const hostAccount = async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    return { ...host, id: account.id };
  };

  it('the game detail lists adjustments by seq with nicknames; old games have none', async () => {
    const host = await hostAccount();
    const { gameId } = await seedGame(db, {
      hostId: host.id,
      startedAt: new Date(2026, 2, 1),
      players: [
        { userId: null, nickname: 'Олена', score: 900, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000 }], adjustments: [{ seq: 1, points: -100 }] },
        { userId: null, nickname: 'Тарас', score: 0, rank: 2, rows: [{ questionIndex: 0, accepted: false, points: 0 }] },
      ],
    });
    const { gameId: oldId } = await seedGame(db, {
      hostId: host.id,
      startedAt: new Date(2026, 2, 2),
      players: [{ userId: null, nickname: 'Віра', score: 0, rank: 1 }],
    });

    expect((await hostGame(db, host.id, gameId))?.adjustments).toEqual([{ seq: 1, roundIndex: 0, afterQuestion: 0, nickname: 'Олена', points: -100, source: 'host' }]);
    expect((await hostGame(db, host.id, oldId))?.adjustments).toEqual([]);
  });

  it('an undo row carries what it undoes; the breakdown shows it as undo in its round (12a)', async () => {
    const host = await hostAccount();
    const { gameId } = await seedGame(db, {
      hostId: host.id,
      startedAt: new Date(2026, 2, 3),
      players: [
        {
          userId: null,
          nickname: 'Олена',
          score: 0,
          rank: 1,
          rows: [{ questionIndex: 0, accepted: true, points: 1000 }],
          adjustments: [{ seq: 2, points: -1000, source: 'undo', undoesQuestion: 0 }],
        },
        {
          userId: null,
          nickname: 'Тарас',
          score: 0,
          rank: 1,
          adjustments: [{ seq: 1, points: 50 }, { seq: 3, points: -50, source: 'undo', undoesSeq: 1 }],
        },
      ],
    });
    const detail = await hostGame(db, host.id, gameId);
    expect(detail?.adjustments).toEqual([
      { seq: 1, roundIndex: 0, afterQuestion: 0, nickname: 'Тарас', points: 50, source: 'host' },
      { seq: 2, roundIndex: 0, afterQuestion: 0, nickname: 'Олена', points: -1000, source: 'undo', undoes: { question: 0 } },
      { seq: 3, roundIndex: 0, afterQuestion: 0, nickname: 'Тарас', points: -50, source: 'undo', undoes: { seq: 1 } },
    ]);
    const olena = detail?.standings.find((s) => s.nickname === 'Олена');
    expect(olena?.breakdown).toEqual({ parts: [{ source: 'answers', plus: 1000, minus: 0 }, { source: 'undo', plus: 0, minus: -1000 }], plus: 1000, minus: -1000 });
    expect(olena?.rounds).toEqual([0]);
  });

  it('a purchase row carries the kind and the target; other rows keep their keys', async () => {
    const host = await hostAccount();
    const { gameId } = await seedGame(db, {
      hostId: host.id,
      startedAt: new Date(2026, 2, 5),
      players: [
        {
          userId: null,
          nickname: 'Олена',
          score: 700,
          rank: 1,
          adjustments: [{ seq: 1, points: 900 }, { seq: 2, points: -200, source: 'debuff', debuff: 'fog', targetNickname: 'Тарас' }],
        },
        { userId: null, nickname: 'Тарас', score: 0, rank: 2 },
      ],
    });
    expect((await hostGame(db, host.id, gameId))?.adjustments).toEqual([
      { seq: 1, roundIndex: 0, afterQuestion: 0, nickname: 'Олена', points: 900, source: 'host' },
      { seq: 2, roundIndex: 0, afterQuestion: 0, nickname: 'Олена', points: -200, source: 'debuff', debuff: 'fog', target: 'Тарас' },
    ]);
  });

  it('history adjustments carry seq and source', async () => {
    const host = await hostAccount();
    const { gameId } = await seedGame(db, {
      hostId: host.id,
      startedAt: new Date(2026, 2, 4),
      players: [
        { userId: null, nickname: 'Олена', score: 200, rank: 1, adjustments: [{ seq: 1, points: 50 }, { seq: 2, points: 300, source: 'duel' }] },
        { userId: null, nickname: 'Тарас', score: -300, rank: 2, adjustments: [{ seq: 3, points: -300, source: 'duel' }] },
      ],
    });
    const detail = await hostGame(db, host.id, gameId);
    expect(detail?.adjustments.map((a) => [a.seq, a.nickname, a.points, a.source])).toEqual([
      [1, 'Олена', 50, 'host'],
      [2, 'Олена', 300, 'duel'],
      [3, 'Тарас', -300, 'duel'],
    ]);
  });

  it('the game detail orders adjustments of several players by seq', async () => {
    const host = await hostAccount();
    const { gameId } = await seedGame(db, {
      hostId: host.id,
      startedAt: new Date(2026, 2, 3),
      players: [
        { userId: null, nickname: 'Олена', score: -50, rank: 2, adjustments: [{ seq: 3, points: 50 }, { seq: 1, points: -100 }] },
        { userId: null, nickname: 'Тарас', score: 75, rank: 1, adjustments: [{ seq: 2, roundIndex: 1, afterQuestion: 1, points: 75 }] },
      ],
    });
    const detail = await hostGame(db, host.id, gameId);
    expect(detail?.adjustments.map((a) => [a.nickname, a.points, a.roundIndex, a.afterQuestion])).toEqual([
      ['Олена', -100, 0, 0],
      ['Тарас', 75, 1, 1],
      ['Олена', 50, 0, 0],
    ]);
  });

  it('gameTables adds adjustments as rows with ADJUSTMENT_ATTEMPT', async () => {
    const host = await hostAccount();
    const { gameId, participantIds } = await seedGame(db, {
      hostId: host.id,
      startedAt: new Date(2026, 2, 4),
      players: [{ userId: null, nickname: 'Олена', score: 900, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000 }], adjustments: [{ seq: 1, points: -100 }] }],
    });
    const [table] = await gameTables(db, [gameId]);
    expect(table.players[0].participantId).toBe(participantIds[0]);
    expect(table.players[0].rows).toEqual(
      expect.arrayContaining([
        { roundIndex: 0, attempt: 0, accepted: true, points: 1000, wager: null },
        { roundIndex: 0, attempt: ADJUSTMENT_ATTEMPT, accepted: false, points: -100, wager: null, source: 'host' },
      ]),
    );
    expect(table.players[0].rows).toHaveLength(2);
  });

  it('gameTables keeps where an adjustment came from: a duel stake is marked duel', async () => {
    const host = await hostAccount();
    const { gameId } = await seedGame(db, {
      hostId: host.id,
      startedAt: new Date(2026, 2, 5),
      players: [{ userId: null, nickname: 'Олена', score: 300, rank: 1, rows: [], adjustments: [{ seq: 1, points: 300, source: 'duel' }] }],
    });
    const [table] = await gameTables(db, [gameId]);
    expect(table.players[0].rows).toEqual([{ roundIndex: 0, attempt: ADJUSTMENT_ATTEMPT, accepted: false, points: 300, wager: null, source: 'duel' }]);
  });

  it('history and my games match the leaderboard with adjustments', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const olena = await signUp(ctx.app, 'Олена');
    const quizId = ((await post('/api/quizzes', makeQuiz([single, text], { speedBonus: false }), host.cookie)).json() as { id: string }).id;
    const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const joinAs = async (nickname: string, cookie?: string) =>
      ((await post(`/api/games/by-code/${created.code}/join`, { nickname }, cookie)).json() as { playerId: string }).playerId;
    const olenaId = await joinAs('Олена', olena.cookie);
    const tarasId = await joinAs('Тарас');
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    for (const playerId of [olenaId, tarasId]) ctx.manager.connect(room, { role: 'player', playerId });
    const step = (type: 'start' | 'lock' | 'next' | 'end') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });
    const adjust = (playerId: string, points: number) => expect(ctx.manager.host(room, { type: 'adjust', playerId, points })).toEqual({ ok: true });

    step('start');
    adjust(tarasId, 300);
    step('next');
    ctx.manager.answer(room, olenaId, { type: 'single', optionId: 'b' });
    ctx.manager.answer(room, tarasId, { type: 'single', optionId: 'a' });
    adjust(olenaId, -1000);
    adjust(tarasId, 25);
    step('end');
    await ctx.recorder.idle();
    const expected = rankPlayers(room.state.players);

    const detail = (await get(`/api/games/${created.gameId}`, host.cookie)).json() as { standings: { participantId: string; score: number; rank: number }[] };
    expect(detail.standings.map((row) => [row.participantId, row.score, row.rank])).toEqual(expected.map((row) => [row.participantId, row.score, row.rank]));
    expect(expected.map((row) => row.score)).toEqual([325, 0]);
    const mine = (await get('/api/me/history', olena.cookie)).json() as { score: number; rank: number }[];
    const olenaRow = expected.find((row) => row.participantId === olenaId)!;
    expect(mine[0]).toMatchObject({ score: olenaRow.score, rank: olenaRow.rank });
  });
});

describe('history: buffs', () => {
  it('responses carry the buff', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const { gameId } = await seedGame(db, {
      hostId: account.id,
      startedAt: new Date(2026, 1, 1),
      snapshot: makeQuiz([single]),
      players: [
        { userId: null, nickname: 'Олена', score: 2000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 2000, buff: 'double' }] },
        { userId: null, nickname: 'Тарас', score: 0, rank: 2, rows: [{ questionIndex: 0, accepted: false, points: 0 }] },
      ],
    });
    const detail = await hostGame(db, account.id, gameId);
    expect(detail?.questions[0].responses.map(({ nickname, buff }) => [nickname, buff])).toEqual([
      ['Олена', 'double'],
      ['Тарас', null],
    ]);
  });
});

describe('history: spare questions', () => {
  it('responses carry a spare of a board category', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const spare = { ...text, id: 'cs1', text: 'Запасне зі Спорту?' };
    const cells = (p: string) => [1, 2, 3].map((j) => withId(single, `${p}${j}`));
    const round = boardRound('g1', [
      { title: 'Спорт', cells: cells('s'), spares: [spare] },
      { title: 'Міста', cells: cells('m') },
      { title: 'Річки', cells: cells('r') },
    ]);
    const { gameId } = await seedGame(db, {
      hostId: account.id,
      startedAt: new Date(2026, 1, 1),
      snapshot: makeRoundsQuiz([round], { buffs: ['swap'] }),
      players: [{ userId: null, nickname: 'Олена', score: 100, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 100, buff: 'swap', spareId: 'cs1' }] }],
    });
    const detail = await hostGame(db, account.id, gameId);
    expect(detail?.questions[0].responses[0].spare?.text).toBe('Запасне зі Спорту?');
  });

  it('responses carry the spare question', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const spare = { ...text, id: 's1', text: 'Запасне?' };
    const { gameId } = await seedGame(db, {
      hostId: account.id,
      startedAt: new Date(2026, 1, 1),
      snapshot: { ...makeQuiz([single]), spares: [spare] },
      players: [
        { userId: null, nickname: 'Олена', score: 1000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000, buff: 'swap', spareId: 's1' }] },
        { userId: null, nickname: 'Тарас', score: 0, rank: 2, rows: [{ questionIndex: 0, accepted: false, points: 0 }] },
        { userId: null, nickname: 'Ліда', score: 0, rank: 3, rows: [{ questionIndex: 0, accepted: false, points: 0, buff: 'swap', spareId: 'gone' }] },
      ],
    });
    const detail = await hostGame(db, account.id, gameId);
    expect(detail?.questions[0].responses.map(({ nickname, buff, spare: s }) => [nickname, buff, s?.text ?? null])).toEqual([
      ['Олена', 'swap', 'Запасне?'],
      ['Тарас', null, null],
      ['Ліда', 'swap', null],
    ]);
  });

  it('per-question counts leave out spare answers, like the stage', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const spare = { ...text, id: 's1', text: 'Запасне?' };
    const { gameId } = await seedGame(db, {
      hostId: account.id,
      startedAt: new Date(2026, 1, 1),
      snapshot: { ...makeQuiz([single]), spares: [spare] },
      players: [
        { userId: null, nickname: 'Олена', score: 1000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000, buff: 'swap', spareId: 's1' }] },
        { userId: null, nickname: 'Тарас', score: 0, rank: 2, rows: [{ questionIndex: 0, accepted: false, points: 0 }] },
      ],
    });
    const detail = await hostGame(db, account.id, gameId);
    expect(detail?.questions[0]).toMatchObject({ answered: 1, accepted: 0 });
  });
});

describe('history: slider and revealing picture (10b)', () => {
  it('history shows slider answers and counts half price as correct', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const quiz = makeQuiz([slider, withReveal(text)], { speedBonus: false });
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const enter = async (nickname: string) => {
      const playerId = ((await send(`/api/games/by-code/${created.code}/join`, { nickname })).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId });
      return playerId;
    };
    const olena = await enter('Олена');
    const petro = await enter('Петро');
    const step = (type: 'start' | 'lock' | 'next') => expect(local.manager.host(room, { type })).toEqual({ ok: true });

    step('start');
    step('next');
    local.manager.answer(room, olena, { type: 'slider', value: 57 });
    local.manager.answer(room, petro, { type: 'slider', value: 58 });
    step('next');
    step('next');
    step('next');
    scheduler.advance(15_000);
    local.manager.answer(room, olena, { type: 'text', value: 'Одеса' });
    local.manager.answer(room, petro, { type: 'text', value: 'Київ' });
    step('next');
    step('next');
    await local.recorder.idle();

    const detail = (
      await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })
    ).json() as {
      questions: { responses: { nickname: string; answer: unknown; accepted: boolean }[] }[];
      standings: { nickname: string; correct: number }[];
    };
    expect(detail.questions[0].responses).toMatchObject([
      { nickname: 'Олена', answer: { type: 'slider', value: 57 }, accepted: true },
      { nickname: 'Петро', answer: { type: 'slider', value: 58 }, accepted: false },
    ]);
    // Правильний текст на картинці, що проявляється, завжди правильний, навіть за 475 балів.
    expect(detail.questions[1].responses.map((r) => [r.nickname, r.accepted])).toEqual([
      ['Олена', true],
      ['Петро', false],
    ]);
    expect(detail.standings.map((s) => [s.nickname, s.correct])).toEqual([
      ['Олена', 2],
      ['Петро', 0],
    ]);
    await local.app.close();
  });
});

describe('history: clues and pin (10c)', () => {
  it('history shows clue and pin answers; a correct clue answer is correct, a pin is correct from half the price', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const quiz = makeQuiz([clues, pin], { speedBonus: false });
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const enter = async (nickname: string) => {
      const playerId = ((await send(`/api/games/by-code/${created.code}/join`, { nickname })).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId });
      return playerId;
    };
    const olena = await enter('Олена');
    const petro = await enter('Петро');
    const step = (type: 'start' | 'lock' | 'next') => expect(local.manager.host(room, { type })).toEqual({ ok: true });

    step('start');
    step('next');
    // Третя підказка з п'яти (12 с при інтервалі 5 с): 3/5 ціни, але відповідь правильна.
    scheduler.advance(12_000);
    local.manager.answer(room, olena, { type: 'clues', value: 'Шевченко' });
    local.manager.answer(room, petro, { type: 'clues', value: 'Франко' });
    for (let i = 0; i < 4 && room.state.phase !== 'finished'; i += 1) {
      if (room.state.phase === 'question' && room.state.plays.length === 2) break;
      step('next');
    }
    local.manager.answer(room, olena, { type: 'pin', x: 0.59, y: 0.5 });
    local.manager.answer(room, petro, { type: 'pin', x: 0.62, y: 0.5 });
    for (let i = 0; i < 4 && room.state.phase !== 'finished'; i += 1) step('next');
    await local.recorder.idle();

    const detail = (
      await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })
    ).json() as {
      questions: { responses: { nickname: string; answer: unknown; accepted: boolean }[] }[];
      standings: { nickname: string; score: number; correct: number }[];
    };
    expect(detail.questions[0].responses).toMatchObject([
      { nickname: 'Олена', answer: { type: 'clues', value: 'Шевченко' }, accepted: true },
      { nickname: 'Петро', answer: { type: 'clues', value: 'Франко' }, accepted: false },
    ]);
    expect(detail.questions[1].responses).toMatchObject([
      { nickname: 'Олена', answer: { type: 'pin', x: 0.59, y: 0.5 }, accepted: true },
      { nickname: 'Петро', answer: { type: 'pin', x: 0.62, y: 0.5 }, accepted: false },
    ]);
    expect(detail.standings.map((p) => [p.nickname, p.score, p.correct])).toEqual([
      ['Олена', 1100, 2],
      ['Петро', 250, 0],
    ]);
    await local.app.close();
  });
});

describe('history: wall, poll and cloud (10d)', () => {
  it('history shows wall results, poll and cloud votes; votes do not count as answers', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const olenaAccount = await signUp(local.app, 'Оля');
    const petroAccount = await signUp(local.app, 'Петро');
    const quiz = makeQuiz([wall, poll, cloud, single], { speedBonus: false });
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const enter = async (nickname: string, cookie: string) => {
      const playerId = ((await send(`/api/games/by-code/${created.code}/join`, { nickname }, cookie)).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId });
      return playerId;
    };
    const olena = await enter('Оля', olenaAccount.cookie);
    const petro = await enter('Петро', petroAccount.cookie);
    const step = (type: 'start' | 'lock' | 'next') => expect(local.manager.host(room, { type })).toEqual({ ok: true });
    const toQuestion = () => {
      for (let i = 0; i < 4 && room.state.phase !== 'question'; i += 1) step('next');
    };
    const group = (id: string) => wall.groups.find((g) => g.id === id)?.tiles.map((t) => room.state.presented.indexOf(t.id)) ?? [];

    step('start');
    step('next');
    expect(local.manager.wall(room, olena, group('gr'))).toEqual({ ok: true });
    expect(local.manager.wall(room, olena, group('gm'))).toEqual({ ok: true });
    expect(local.manager.wall(room, petro, group('gr'))).toEqual({ ok: true });
    step('lock');
    toQuestion();
    local.manager.answer(room, olena, { type: 'poll', optionId: 'b' });
    local.manager.answer(room, petro, { type: 'poll', optionId: 'a' });
    toQuestion();
    local.manager.answer(room, olena, { type: 'wordcloud', words: ['каштани'] });
    local.manager.answer(room, petro, { type: 'wordcloud', words: ['Дніпро'] });
    toQuestion();
    local.manager.answer(room, olena, { type: 'single', optionId: 'b' });
    local.manager.answer(room, petro, { type: 'single', optionId: 'a' });
    for (let i = 0; i < 4 && room.state.phase !== 'finished'; i += 1) step('next');
    await local.recorder.idle();

    const detail = (
      await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })
    ).json() as {
      questionsPlayed: number;
      questions: { type: string; answered: number; accepted: number; responses: { nickname: string; answer: unknown; accepted: boolean }[] }[];
      standings: { nickname: string; score: number; correct: number }[];
    };
    expect(detail.questions.map((q) => [q.type, q.answered, q.accepted])).toEqual([
      ['wall', 2, 1],
      ['poll', 2, 0],
      ['wordcloud', 2, 0],
      ['single', 2, 1],
    ]);
    expect(detail.questions[0].responses).toMatchObject([
      { nickname: 'Оля', answer: { type: 'wall', found: 2, groups: 4, mistakes: 0 }, accepted: true },
      { nickname: 'Петро', answer: { type: 'wall', found: 1, groups: 4, mistakes: 0 }, accepted: false },
    ]);
    expect(detail.questions[1].responses).toMatchObject([
      { nickname: 'Оля', answer: { type: 'poll', optionId: 'b' }, accepted: false },
      { nickname: 'Петро', answer: { type: 'poll', optionId: 'a' }, accepted: false },
    ]);
    expect(detail.questions[2].responses).toMatchObject([
      { nickname: 'Оля', answer: { type: 'wordcloud', words: ['каштани'] } },
      { nickname: 'Петро', answer: { type: 'wordcloud', words: ['Дніпро'] } },
    ]);
    expect(detail.questionsPlayed).toBe(4);

    const rows = await localDb.select().from(answer);
    expect(rows.filter((row) => row.attempt === VOTE_ATTEMPT)).toHaveLength(4);

    const userId = async (email: string) => (await localDb.select({ id: user.id }).from(user).where(eq(user.email, email)))[0].id;
    const [olenaGame] = await playerGames(localDb, await userId(olenaAccount.email), null);
    expect(olenaGame.played).toMatchObject({ correct: 2, answered: 2, questionsPlayed: 2 });
    expect(olenaGame.marks.map((mark) => [mark.questionIndex, mark.attempt, mark.accepted])).toEqual([
      [0, 0, true],
      [3, 0, true],
    ]);
    const [petroGame] = await playerGames(localDb, await userId(petroAccount.email), null);
    expect(petroGame.played).toMatchObject({ correct: 0, answered: 2, questionsPlayed: 2 });
    expect(petroGame.marks.some((mark) => mark.attempt === VOTE_ATTEMPT)).toBe(false);

    // Рядки голосів не потрапляють у таблицю для досягнень.
    const [table] = await gameTables(localDb, [created.gameId]);
    expect(table.players.flatMap((p) => p.rows).some((row) => row.attempt === VOTE_ATTEMPT)).toBe(false);
    expect(table.players.map((p) => p.rows.length)).toEqual([2, 2]);
    await local.app.close();
  });
});

describe('history: survey (10e)', () => {
  type Mgr = Awaited<ReturnType<typeof buildApp>>['manager'];
  type RoomOf = NonNullable<ReturnType<Mgr['get']>>;

  /** Проходить класику до кінця: на кожному запитанні відповіді дає `act`, на reveal ведучий відкриває всі рядки. */
  async function playSurveyGame(questions: Question[], act: (manager: Mgr, room: RoomOf, olena: string, petro: string, index: number) => void) {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const olenaAccount = await signUp(local.app, 'Оля');
    const petroAccount = await signUp(local.app, 'Петро');
    const quiz = makeQuiz(questions, { speedBonus: false });
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const enter = async (nickname: string, cookie: string) => {
      const playerId = ((await send(`/api/games/by-code/${created.code}/join`, { nickname }, cookie)).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId });
      return playerId;
    };
    const olena = await enter('Оля', olenaAccount.cookie);
    const petro = await enter('Петро', petroAccount.cookie);
    const step = (type: 'start' | 'lock' | 'next' | 'survey-all') => local.manager.host(room, { type });
    step('start');
    for (let index = 0; index < questionsOfCount(quiz); index += 1) {
      for (let i = 0; i < 4 && room.state.phase !== 'question'; i += 1) step('next');
      // Запитання без дошки пропускаються: пульт не зависає на 'question', якщо дійшли до кінця.
      if (room.state.phase !== 'question') break;
      act(local.manager, room, olena, petro, index);
      if (room.state.phase === 'question') step('lock');
      step('next');
      step('survey-all');
      step('next');
    }
    for (let i = 0; i < 4 && room.state.phase !== 'finished'; i += 1) step('next');
    await local.recorder.idle();
    const userId = async (email: string) => (await localDb.select({ id: user.id }).from(user).where(eq(user.email, email)))[0].id;
    return { local, localDb, host, created, olenaAccount, petroAccount, userId, room };
  }
  const questionsOfCount = (quiz: ReturnType<typeof makeQuiz>) => quiz.rounds.reduce((sum, round) => sum + (round.type === 'classic' ? round.questions.length : 0), 0);

  const detailOf = async (played: Awaited<ReturnType<typeof playSurveyGame>>) =>
    (
      await played.local.app.inject({ method: 'GET', url: `/api/games/${played.created.gameId}`, headers: { cookie: played.host.cookie } })
    ).json() as {
      questionsPlayed: number;
      questions: {
        type: string;
        surveyFromCloud?: true;
        question: { rows?: { id: string; text: string }[] };
        responses: { nickname: string; answer: { rows?: unknown }; accepted: boolean }[];
      }[];
    };

  it('history shows the survey board, cloud boards from plays, and answers with hits', async () => {
    const played = await playSurveyGame([cloud, surveyCloud, survey], (manager, room, olena, petro, index) => {
      if (index === 0) {
        manager.answer(room, olena, { type: 'wordcloud', words: ['каштани', 'Дніпро'] });
        manager.answer(room, petro, { type: 'wordcloud', words: ['каштани'] });
      }
      if (index === 1) {
        manager.answer(room, olena, { type: 'survey', values: ['каштани'] });
        manager.answer(room, petro, { type: 'survey', values: ['Лавра'] });
      }
      if (index === 2) {
        manager.answer(room, olena, { type: 'survey', values: ['Яблуко', 'Банан'] });
        manager.answer(room, petro, { type: 'survey', values: ['Кавун'] });
      }
    });
    const detail = await detailOf(played);
    expect(detail.questions.map((q) => q.type)).toEqual(['wordcloud', 'survey', 'survey']);
    expect(detail.questions[1].surveyFromCloud).toBe(true);
    expect(detail.questions[1].question.rows?.map((r) => r.id)).toEqual(['cloud-1', 'cloud-2']);
    expect(detail.questions[1].question.rows?.map((r) => r.text)).toEqual(['каштани', 'Дніпро']);
    expect(detail.questions[2].surveyFromCloud).toBeUndefined();
    expect(detail.questions[2].question.rows?.map((r) => r.id)).toEqual(['sa', 'sb', 'sc', 'sd', 'se']);
    for (const question of detail.questions.slice(1)) {
      expect(question.responses.every((r) => Array.isArray(r.answer.rows))).toBe(true);
    }
    expect(detail.questions[1].responses.map((r) => [r.nickname, r.accepted])).toEqual([
      ['Оля', true],
      ['Петро', false],
    ]);
    expect(detail.questions[2].responses.map((r) => [r.nickname, r.accepted])).toEqual([
      ['Оля', true],
      ['Петро', false],
    ]);

    const [olenaGame] = await playerGames(played.localDb, await played.userId(played.olenaAccount.email), null);
    expect(olenaGame.played).toMatchObject({ correct: 2, answered: 2, questionsPlayed: 2 });
    await played.local.app.close();
  });

  it('a skipped survey is not a played question', async () => {
    const played = await playSurveyGame([cloud, surveyCloud, single], (manager, room, olena, petro, index) => {
      // Хмара без жодного слова: surveyCloud без запасних рядків пропускається.
      if (index === 1) {
        manager.answer(room, olena, { type: 'single', optionId: 'b' });
        manager.answer(room, petro, { type: 'single', optionId: 'a' });
      }
    });
    const detail = await detailOf(played);
    expect(detail.questionsPlayed).toBe(2);
    expect(detail.questions.map((q) => q.type)).toEqual(['wordcloud', 'single']);
    const [olenaGame] = await playerGames(played.localDb, await played.userId(played.olenaAccount.email), null);
    expect(olenaGame.played).toMatchObject({ questionsPlayed: 1, correct: 1, answered: 1 });
    await played.local.app.close();
  });
});

describe('history: bluff (10f)', () => {
  it('history shows the options in the order of the reveal with authors and picks; the answer rows carry the truth', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const quizId = ((await send('/api/quizzes', makeQuiz([bluff, single], { speedBonus: false }), host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const accounts: Record<string, Awaited<ReturnType<typeof signUp>>> = {};
    const ids: Record<string, string> = {};
    for (const name of ['Оля', 'Петро', 'Віра']) {
      accounts[name] = await signUp(local.app, name);
      ids[name] = ((await send(`/api/games/by-code/${created.code}/join`, { nickname: name }, accounts[name].cookie)).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId: ids[name] });
    }
    const step = (type: 'start' | 'lock' | 'next' | 'bluff-all') => local.manager.host(room, { type });
    step('start');
    step('next');
    expect(local.manager.lie(room, ids['Оля'], 'Рим')).toEqual({ ok: true });
    expect(local.manager.lie(room, ids['Петро'], 'РИМ')).toEqual({ ok: true });
    expect(local.manager.lie(room, ids['Віра'], 'Мілан')).toEqual({ ok: true });
    const options = room.state.plays[0].bluff?.options ?? [];
    const idOf = (text: string) => options.find((o) => o.text === text)?.id ?? '';
    expect(options).toHaveLength(5);
    expect(local.manager.bluff(room, ids['Оля'], idOf('Мілан'))).toEqual({ ok: true });
    expect(local.manager.bluff(room, ids['Петро'], idOf('Барселона'))).toEqual({ ok: true });
    expect(local.manager.bluff(room, ids['Віра'], idOf('Рим'))).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
    step('next');
    step('bluff-all');
    for (let i = 0; i < 6 && room.state.phase !== 'question'; i += 1) step('next');
    step('lock');
    for (let i = 0; i < 6 && room.state.phase !== 'finished'; i += 1) step('next');
    await local.recorder.idle();

    const detail = (
      await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })
    ).json() as {
      questions: {
        type: string;
        bluff?: { options: { text: string; kind: string; authors: string[]; pickedBy: string[]; removed: boolean }[] };
        responses: { nickname: string; answer: { type: string; truth?: boolean; fooled?: number } | null; accepted: boolean }[];
      }[];
    };
    const question = detail.questions[0];
    expect(question.type).toBe('bluff');
    const shown = question.bluff?.options ?? [];
    expect(shown).toHaveLength(5);
    expect(shown.at(-1)).toMatchObject({ text: 'Барселона', kind: 'truth', authors: [], pickedBy: ['Петро'] });
    expect(shown.find((o) => o.text === 'Рим')).toMatchObject({ kind: 'lie', authors: ['Оля', 'Петро'], pickedBy: ['Віра'] });
    expect(shown.find((o) => o.text === 'Мілан')).toMatchObject({ kind: 'lie', authors: ['Віра'], pickedBy: ['Оля'] });
    // Найменше вибраних — першими: запасні (0 виборів) перед вигадками (по 1), правда остання.
    expect(shown.slice(0, 2).map((o) => o.kind)).toEqual(['spare', 'spare']);
    expect(detail.questions[1].bluff).toBeUndefined();
    // Відповіді за турнірною таблицею: Петро 1500, Оля й Віра по 500.
    expect(question.responses.map((r) => [r.nickname, r.answer?.truth, r.answer?.fooled, r.accepted]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ['Віра', false, 1, false],
      ['Оля', false, 1, false],
      ['Петро', true, 1, true],
    ]);
    expect(question.responses[0].nickname).toBe('Петро');

    const correctOf = async (name: string) => (await playerGames(localDb, (await localDb.select({ id: user.id }).from(user).where(eq(user.email, accounts[name].email)))[0].id, null))[0].played.correct;
    expect(await correctOf('Петро')).toBe(1);
    expect(await correctOf('Оля')).toBe(0);
    expect(await correctOf('Віра')).toBe(0);
    await local.app.close();
  });
});

describe('history: wipeout (10g)', () => {
  it('shows the ladder state of every participant after every step', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const quizId = ((await send('/api/quizzes', makeRoundsQuiz([wipeoutRound('w', wipeoutLadder), classicRound('c', [single])]), host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const ids: Record<string, string> = {};
    for (const name of ['Оля', 'Петро', 'Віра']) {
      ids[name] = ((await send(`/api/games/by-code/${created.code}/join`, { nickname: name }, (await signUp(local.app, name)).cookie)).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId: ids[name] });
    }
    // Оля згорає на другій сходинці, Петро забирає після другої, Віра доносить до кінця.
    playWipeout(local.manager, room, { [ids['Оля']]: [0], [ids['Петро']]: [0, 1, 2, 3, 4], [ids['Віра']]: [0, 1, 2, 3, 4] }, { [ids['Петро']]: 1 });
    expect(room.state.phase).toBe('round_end');
    await local.recorder.idle();

    const detail = (
      await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })
    ).json() as {
      standings: { nickname: string; score: number; correct: number }[];
      questions: { index: number; wipeout?: { price: number; rows: { nickname: string; status: string; bank: number }[] } }[];
    };
    const at = (index: number) => {
      const step = detail.questions[index].wipeout;
      return { price: step?.price, rows: Object.fromEntries((step?.rows ?? []).map((r) => [r.nickname, [r.status, r.bank]])) };
    };
    expect(detail.questions).toHaveLength(5);
    expect(at(0)).toEqual({ price: 100, rows: { Оля: ['in', 100], Петро: ['in', 100], Віра: ['in', 100] } });
    expect(at(1)).toEqual({ price: 200, rows: { Оля: ['burned', 0], Петро: ['took', 300], Віра: ['in', 300] } });
    expect(at(2)).toEqual({ price: 300, rows: { Оля: ['burned', 0], Петро: ['took', 300], Віра: ['in', 600] } });
    expect(at(4)).toEqual({ price: 500, rows: { Оля: ['burned', 0], Петро: ['took', 300], Віра: ['survived', 1500] } });
    // Правильні (прийняті) відповіді рахуються як завжди: Оля 1, Петро 2 (потім не грав), Віра 5.
    expect(Object.fromEntries(detail.standings.map((s) => [s.nickname, [s.score, s.correct]]))).toEqual({ Оля: [0, 1], Петро: [300, 2], Віра: [1500, 5] });
    await local.app.close();
  });

  it('a removed participant does not appear in the rows', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const quizId = ((await send('/api/quizzes', makeRoundsQuiz([wipeoutRound('w', wipeoutLadder)]), host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const ids: Record<string, string> = {};
    for (const name of ['Оля', 'Петро']) {
      ids[name] = ((await send(`/api/games/by-code/${created.code}/join`, { nickname: name }, (await signUp(local.app, name)).cookie)).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId: ids[name] });
    }
    playWipeout(local.manager, room, { [ids['Оля']]: [0, 1], [ids['Петро']]: [0, 1] }, {}, 2);
    expect(local.manager.host(room, { type: 'kick', playerId: ids['Петро'] })).toEqual({ ok: true });
    await local.recorder.idle();
    const detail = (
      await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })
    ).json() as { questions: { wipeout?: { rows: { nickname: string }[] } }[] };
    expect(detail.questions.map((q) => q.wipeout?.rows.map((r) => r.nickname))).toEqual([['Оля'], ['Оля']]);
    await local.app.close();
  });
});

describe('history: survival (10h)', () => {
  it('shows the verdict, the trial rows, the ghosts, who is alive and the end for every question', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    // Одне питання на виживання: на третьому запитанні випробування стає удачею (fellBack).
    const quiz = makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials.slice(0, 1))]);
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const ids: Record<string, string> = {};
    for (const name of ['Оля', 'Петро', 'Віра', 'Гліб']) {
      ids[name] = ((await send(`/api/games/by-code/${created.code}/join`, { nickname: name }, (await signUp(local.app, name)).cookie)).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId: ids[name] });
    }
    const id = (...names: string[]) => names.map((name) => ids[name]);
    // s1: Оля помилилася й вибула на питанні.
    playSurvivalQuestion(local.manager, room, { right: id('Петро', 'Віра', 'Гліб'), trial: [] });
    // s2: помилилися всі живі, Оля-привид відгадала.
    playSurvivalQuestion(local.manager, room, { right: [], ghosts: { [ids['Оля']]: true } });
    // s3: Петро помилився, вибрав двері з пасткою і вибув; удача з fellBack.
    playSurvivalQuestion(local.manager, room, { right: id('Віра', 'Гліб'), ghosts: { [ids['Оля']]: false }, doors: { [ids['Петро']]: 'trap' } });
    // s4: Віра помилилася й вибрала двері з пасткою — вибула; лишився Гліб, раунд скінчився з бонусом.
    playSurvivalQuestion(local.manager, room, { right: id('Гліб'), doors: { [ids['Віра']]: 'trap' } });
    for (let guard = 0; guard < 4 && room.state.phase !== 'finished'; guard++) local.manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('finished');
    await local.recorder.idle();

    const detail = (
      await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })
    ).json() as {
      standings: { nickname: string; score: number }[];
      adjustments: { nickname: string; points: number; source: string }[];
      questions: { index: number; survival?: { verdict: string; ghosts: unknown; trial: { kind: string; fellBack: boolean; question: string | null; rows: unknown[] } | null; alive: string[]; end: boolean } }[];
    };
    expect(detail.questions).toHaveLength(4);
    const at = (index: number) => {
      const survival = detail.questions[index].survival;
      return survival === undefined ? undefined : { ...survival, alive: [...survival.alive].sort() };
    };
    expect(at(0)).toEqual({
      verdict: 'trial',
      ghosts: { answered: 0, right: 0 },
      trial: {
        kind: 'question',
        fellBack: false,
        question: survivalTrials[0].text,
        trialQuestion: survivalTrials[0],
        rows: [{ nickname: 'Оля', out: true, answer: { type: 'boolean', value: false }, door: null, auto: false, trap: null }],
      },
      alive: ['Віра', 'Гліб', 'Петро'],
      end: false,
    });
    expect(at(1)).toEqual({ verdict: 'all_wrong', ghosts: { answered: 1, right: 1 }, trial: null, alive: ['Віра', 'Гліб', 'Петро'], end: false });
    expect(at(2)).toEqual({
      verdict: 'trial',
      ghosts: { answered: 1, right: 0 },
      trial: { kind: 'luck', fellBack: true, question: null, rows: [{ nickname: 'Петро', out: true, answer: null, door: expect.any(Number), auto: false, trap: expect.any(Number) }] },
      alive: ['Віра', 'Гліб'],
      end: false,
    });
    // Вибув той, чиї двері збіглися з пасткою.
    const row = detail.questions[2].survival?.trial?.rows[0] as { door: number; trap: number };
    expect(row.door).toBe(row.trap);
    expect(at(3)).toMatchObject({ verdict: 'trial', alive: ['Гліб'], end: true, trial: { kind: 'luck', fellBack: true } });
    // Бонус виживання — коригування живому, рахунок його враховує: 100 + 0 + 100 + 100 + 500.
    expect(detail.adjustments).toMatchObject([{ nickname: 'Гліб', points: 500, source: 'survival' }]);
    expect(detail.standings.find((s) => s.nickname === 'Гліб')?.score).toBe(800);
    await local.app.close();
  });
});

describe('history: ladder (10i)', () => {
  it('shows the contestant, the step, the safe flag, the lifelines, the decision, the hall and the outcome for every question; the prize is a ladder adjustment', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const quizId = ((await send('/api/quizzes', makeRoundsQuiz([ladderRound('rl')]), host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const ids: Record<string, string> = {};
    for (const name of ['Оля', 'Петро', 'Віра']) {
      ids[name] = ((await send(`/api/games/by-code/${created.code}/join`, { nickname: name }, (await signUp(local.app, name)).cookie)).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId: ids[name] });
    }
    local.manager.host(room, { type: 'start' });
    expect(local.manager.hostLadderPick(room, ids['Оля'])).toEqual({ ok: true });
    // l1: 50/50; Петро відгадує, Віра ні. l2: зал; відповідають обоє правильно. l3: Петро відгадує, Віра мовчить; Оля забирає.
    playLadderQuestion(local.manager, room, { contestant: true, hall: { [ids['Петро']]: true, [ids['Віра']]: false }, lifelines: ['fifty'] });
    expect(local.manager.ladderDecide(room, ids['Оля'], false)).toEqual({ ok: true });
    playLadderQuestion(local.manager, room, { contestant: true, hall: { [ids['Петро']]: true, [ids['Віра']]: true }, lifelines: ['audience'] });
    expect(local.manager.ladderDecide(room, ids['Оля'], false)).toEqual({ ok: true });
    playLadderQuestion(local.manager, room, { contestant: true, hall: { [ids['Петро']]: true } });
    expect(local.manager.ladderDecide(room, ids['Оля'], true)).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && room.state.phase !== 'finished'; guard++) local.manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('finished');
    await local.recorder.idle();

    const detail = (
      await local.app.inject({ method: 'GET', url: `/api/games/${created.gameId}`, headers: { cookie: host.cookie } })
    ).json() as {
      standings: { nickname: string; score: number }[];
      adjustments: { nickname: string; points: number; source: string }[];
      questions: { index: number; ladder?: Record<string, unknown> }[];
    };
    expect(detail.questions).toHaveLength(3);
    const at = (index: number) => detail.questions[index].ladder;
    expect(at(0)).toMatchObject({
      contestant: 'Оля',
      step: 0,
      level: 100,
      safe: false,
      lifelines: [{ kind: 'fifty', removed: [expect.any(String), expect.any(String)], tally: null, hint: null, aloud: false }],
      decision: 'go',
      outcome: null,
      hall: { answered: 2, right: 1 },
    });
    expect(at(1)).toMatchObject({
      step: 1,
      level: 300,
      safe: false,
      lifelines: [{ kind: 'audience', removed: null, tally: { cast: 2, counts: { c: 2 } }, hint: null, aloud: false }],
      decision: 'go',
      hall: { answered: 2, right: 2 },
    });
    expect(at(2)).toMatchObject({
      step: 2,
      level: 1000,
      safe: true,
      lifelines: [],
      decision: 'take',
      outcome: { kind: 'took', passed: 3, points: 1000 },
      hall: { answered: 1, right: 1 },
    });
    expect(detail.adjustments).toMatchObject([{ nickname: 'Оля', points: 1000, source: 'ladder' }]);
    expect(detail.standings.find((s) => s.nickname === 'Оля')?.score).toBe(1000);
    await local.app.close();
  });
});

describe('history: teams (10j)', () => {
  it('the table is the teams with their members; scored answers come from the teams, cloud votes from the people', async () => {
    const t = await recordedTeamGame(
      makeRoundsQuiz([classicRound('r1', [single, cloud], { speedBonus: false }), blitzRound('b1', [text], { check: 'manual' })], { teams: defaultTeams(2) }),
    );
    const { manager, room, members } = t;
    toQuestion(manager, room);
    expect(manager.answer(room, members['Оля'], { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    expect(manager.answer(room, members['Віра'], { type: 'single', optionId: 'a' })).toEqual({ ok: true });
    toQuestion(manager, room);
    for (const [name, word] of [['Оля', 'каштани'], ['Петро', 'Дніпро'], ['Віра', 'Лавра'], ['Ігор', 'метро']]) {
      expect(manager.answer(room, members[name], { type: 'wordcloud', words: [word] })).toEqual({ ok: true });
    }
    toQuestion(manager, room);
    // Бліц: натискає Петро (не капітан) — і відповідає він; ведучий оцінює Червоних.
    expect(manager.buzz(room, members['Петро'])).toEqual({ ok: true });
    expect(manager.answer(room, members['Петро'], { type: 'text', value: 'Одеса' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'judge', playerId: t.teams[0], correct: true })).toEqual({ ok: true });
    toEnd(manager, room);
    await t.recorder.idle();
    expect(t.errors).toEqual([]);

    const detail = await hostGame(t.db, TEAM_HOST, room.id);
    expect(detail?.teams).toBe(true);
    expect(detail?.standings.map((s) => [s.nickname, s.members, s.rank, s.correct])).toEqual([
      ['Червоні', ['Оля', 'Петро'], 1, 2],
      ['Сині', ['Віра', 'Ігор'], 2, 0],
    ]);
    // 11f: рядки команд мають колонки раундів і розбивку; Σ колонок = рахунок.
    for (const s of detail?.standings ?? []) {
      expect(s.rounds).toHaveLength(2);
      expect(s.rounds.reduce((sum, n) => sum + n, 0)).toBe(s.score);
      expect(s.breakdown.plus + s.breakdown.minus).toBe(s.score);
    }
    expect(detail?.standings[0].breakdown.plus).toBeGreaterThan(0);
    const [classic, votes, blitz] = detail?.questions ?? [];
    expect(classic.responses.map((r) => [r.nickname, r.accepted])).toEqual([
      ['Червоні', true],
      ['Сині', false],
    ]);
    expect([classic.answered, classic.accepted]).toEqual([2, 1]);
    expect(votes.responses.map((r) => [r.nickname, r.answer])).toEqual([
      ['Оля', { type: 'wordcloud', words: ['каштани'] }],
      ['Петро', { type: 'wordcloud', words: ['Дніпро'] }],
      ['Віра', { type: 'wordcloud', words: ['Лавра'] }],
      ['Ігор', { type: 'wordcloud', words: ['метро'] }],
    ]);
    expect(votes.answered).toBe(4);
    expect(blitz.responses.map((r) => [r.nickname, r.accepted])).toEqual([['Червоні', true]]);
  });

  it('a team is the ladder contestant: the contestant is the team name, the other team is the hall', async () => {
    const t = await recordedTeamGame(makeRoundsQuiz([ladderRound('rl')], { teams: defaultTeams(2) }));
    const { manager, room, members, teams } = t;
    expect(manager.hostLadderPick(room, teams[0])).toEqual({ ok: true });
    toQuestion(manager, room);
    expect(manager.answer(room, members['Віра'], LADDER_WRONG[0])).toEqual({ ok: true });
    expect(manager.answer(room, members['Оля'], LADDER_RIGHT[0])).toEqual({ ok: true });
    if (room.state.phase === 'question') manager.host(room, { type: 'lock' });
    manager.host(room, { type: 'end' });
    await t.recorder.idle();
    expect(t.errors).toEqual([]);

    const detail = await hostGame(t.db, TEAM_HOST, room.id);
    expect(detail?.questions[0].ladder).toMatchObject({ contestant: 'Червоні', step: 0, hall: { answered: 1, right: 0 } });
  });

  it('a solo game is not a team game and its table has no members', async () => {
    const [account] = await db.insert(user).values({ id: 'solo-teams-host', name: 'Ведуча', email: 'solo-teams-host@example.com' }).returning();
    const { gameId } = await seedGame(db, { hostId: account.id, startedAt: new Date(), players: [{ userId: null, nickname: 'Тарас', score: 0, rank: 1 }] });
    const detail = await hostGame(db, account.id, gameId);
    expect(detail?.teams).toBe(false);
    expect(detail?.standings).toEqual([
      { participantId: expect.any(String), nickname: 'Тарас', score: 0, rank: 1, correct: 0, rounds: [0], breakdown: { parts: [], plus: 0, minus: 0 } },
    ]);
  });
});

describe('host history: points per round and plus / minus (11f)', () => {
  it('builds the columns and the breakdown from answer rows (no votes) and adjustments', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const snapshot = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')]), wipeoutRound('r2', wipeoutLadder), finalRound('r3', withId(single, 'f1'))]);
    const { gameId } = await seedGame(db, {
      hostId: account.id,
      startedAt: new Date(),
      snapshot,
      players: [
        {
          userId: null,
          nickname: 'Оля',
          score: 250,
          rank: 2,
          rows: [
            { questionIndex: 0, roundIndex: 0, accepted: true, points: 1000 },
            { questionIndex: 1, roundIndex: 0, accepted: false, points: -500 },
            { questionIndex: 2, roundIndex: 1, accepted: true, points: 300 },
            { questionIndex: 3, roundIndex: 2, attempt: PENALTY_ATTEMPT, accepted: false, points: -200 },
            { questionIndex: 1, roundIndex: 0, attempt: VOTE_ATTEMPT, accepted: false, points: 0 },
          ],
          adjustments: [
            { seq: 1, roundIndex: 0, points: 50, source: 'host' },
            { seq: 2, roundIndex: 1, points: -300, source: 'duel' },
            { seq: 3, roundIndex: 1, points: -100, source: 'debuff', debuff: 'fog' },
          ],
        },
        {
          userId: null,
          nickname: 'Тарас',
          score: 1300,
          rank: 1,
          rows: [{ questionIndex: 0, roundIndex: 0, accepted: true, points: 1000 }],
          adjustments: [{ seq: 4, roundIndex: 1, points: 300, source: 'duel' }],
        },
      ],
    });

    const detail = await hostGame(db, account.id, gameId);
    const standings = detail?.standings ?? [];
    expect(standings.map((s) => [s.nickname, s.rounds])).toEqual([
      ['Тарас', [1000, 300, 0]],
      ['Оля', [550, -100, -200]],
    ]);
    expect(standings.find((s) => s.nickname === 'Оля')?.breakdown).toEqual({
      parts: [
        { source: 'answers', plus: 1000, minus: -500 },
        { source: 'final', plus: 0, minus: -200 },
        { source: 'duel', plus: 0, minus: -300 },
        { source: 'debuff', plus: 0, minus: -100 },
        { source: 'host', plus: 50, minus: 0 },
        { source: 'wipeout', plus: 300, minus: 0 },
      ],
      plus: 1350,
      minus: -1100,
    });
    expect(standings.find((s) => s.nickname === 'Тарас')?.breakdown).toEqual({
      parts: [
        { source: 'answers', plus: 1000, minus: 0 },
        { source: 'duel', plus: 300, minus: 0 },
      ],
      plus: 1300,
      minus: 0,
    });
  });

  it('the breakdown of a recorded game equals the engine breakdown of its final state', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const [account] = await db.select().from(user).where(eq(user.email, host.email));
    const quiz = makeQuiz([single, text], { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' } });
    const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const joinAs = async (nickname: string) =>
      ((await post(`/api/games/by-code/${created.code}/join`, { nickname })).json() as { playerId: string }).playerId;
    const olenaId = await joinAs('Олена');
    const tarasId = await joinAs('Тарас');
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    for (const playerId of [olenaId, tarasId]) ctx.manager.connect(room, { role: 'player', playerId });
    const step = (type: 'start' | 'next') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });

    step('start');
    step('next');
    ctx.manager.answer(room, olenaId, { type: 'single', optionId: 'b' });
    ctx.manager.answer(room, tarasId, { type: 'single', optionId: 'a' });
    step('next');
    expect(ctx.manager.host(room, { type: 'adjust', playerId: tarasId, points: 75 })).toEqual({ ok: true });
    step('next');
    step('next');
    ctx.manager.answer(room, olenaId, { type: 'text', value: 'Одеса' });
    ctx.manager.answer(room, tarasId, { type: 'text', value: 'Львів' });
    step('next');
    step('next');
    expect(room.state.phase).toBe('finished');
    await ctx.recorder.idle();

    const detail = await hostGame(db, account.id, created.gameId);
    const standings = detail?.standings ?? [];
    expect(standings.map((s) => [s.nickname, s.rounds, s.breakdown])).toEqual([
      ['Олена', [2000], { parts: [{ source: 'answers', plus: 2000, minus: 0 }], plus: 2000, minus: 0 }],
      [
        'Тарас',
        [-1925],
        {
          parts: [
            { source: 'answers', plus: 0, minus: -2000 },
            { source: 'host', plus: 75, minus: 0 },
          ],
          plus: 75,
          minus: -2000,
        },
      ],
    ]);
    for (const s of standings) {
      expect(s.breakdown).toEqual(breakdownOf(scoreLines(room.state).filter((l) => l.playerId === s.participantId)));
      expect(s.rounds.reduce((sum, n) => sum + n, 0)).toBe(s.score);
    }
  });
});

describe('games without a host in the history (11h)', () => {
  it('the host list, the details and the played games carry the flag', async () => {
    const db = await createTestDb();
    await db.insert(user).values([{ id: 'author', name: 'Марта', email: 'author@example.com' }]);
    const bot = await seedGame(db, { hostId: 'author', autopilot: true, startedAt: new Date(2000), players: [{ userId: 'author', nickname: 'Марта', score: 3, rank: 1 }] });
    const plain = await seedGame(db, { hostId: 'author', startedAt: new Date(1000), players: [{ userId: null, nickname: 'Гість', score: 3, rank: 1 }] });
    const listed = await hostGames(db, 'author');
    expect(listed.map((g) => [g.id, g.autopilot])).toEqual([[bot.gameId, true], [plain.gameId, false]]);
    expect((await hostGame(db, 'author', bot.gameId))?.autopilot).toBe(true);
    expect((await hostGame(db, 'author', plain.gameId))?.autopilot).toBe(false);
    expect((await playerGames(db, 'author', null)).map((g) => [g.played.gameId, g.played.autopilot])).toEqual([[bot.gameId, true]]);
  });
});

describe('history: penalty rows in the responses (12h)', () => {
  it('a blitz or final penalty row stays hidden; only a silent «Ризик» penalty row shows, with its buff and no answer', async () => {
    const [account] = await db.insert(user).values({ id: 'penalty-rows-host', name: 'Ведуча', email: 'penalty-rows-host@example.com' }).returning();
    const snapshot = makeRoundsQuiz([blitzRound('r1', [single]), classicRound('r2', [withId(single, 'q2')]), finalRound('r3', withId(single, 'f1'))]);
    const { gameId } = await seedGame(db, {
      hostId: account.id,
      startedAt: new Date(),
      snapshot,
      questionsPlayed: 3,
      players: [
        {
          userId: null,
          nickname: 'Оля',
          score: -1300,
          rank: 2,
          rows: [
            { questionIndex: 0, roundIndex: 0, attempt: 0, accepted: false, points: 0 },
            { questionIndex: 0, roundIndex: 0, attempt: PENALTY_ATTEMPT, accepted: false, points: -100 },
            { questionIndex: 1, roundIndex: 1, attempt: PENALTY_ATTEMPT, accepted: false, points: -1000, buff: 'risk' },
            { questionIndex: 2, roundIndex: 2, attempt: PENALTY_ATTEMPT, accepted: false, points: -200, wager: 200 },
          ],
        },
        { userId: null, nickname: 'Тарас', score: 1000, rank: 1, rows: [{ questionIndex: 1, roundIndex: 1, accepted: true, points: 1000 }] },
      ],
    });
    const detail = await hostGame(db, account.id, gameId);
    const responses = (index: number) => detail?.questions[index]?.responses.map((r) => [r.nickname, r.answer, r.accepted, r.buff]);
    expect(responses(0)).toEqual([['Оля', null, false, null]]);
    expect(responses(1)).toEqual([
      ['Тарас', null, true, null],
      ['Оля', null, false, 'risk'],
    ]);
    expect(responses(2)).toEqual([]);
  });
});

describe('answeredTypes (12i)', () => {
  const host = 'types-host';
  const olya = 'types-olya';
  const petro = 'types-petro';
  const cell = withId(pin, 'types-pin');
  const typesQuiz = makeRoundsQuiz([
    classicRound('r1', [single, text, poll, bool]),
    // Схема вимагає поля щонайменше 3 × 3.
    boardRound(
      'b1',
      ['Дніпро', 'Чернівці', 'Буковина'].map((title, c) => ({
        title,
        cells: [0, 1, 2].map((i) => (c === 0 && i === 0 ? cell : withId(text, `types-${c}-${i}`))),
      })),
    ),
  ]);
  const typesPlays = [
    { roundIndex: 0, questionId: single.id },
    { roundIndex: 0, questionId: text.id },
    { roundIndex: 0, questionId: poll.id },
    { roundIndex: 0, questionId: bool.id },
    { roundIndex: 1, questionId: cell.id, cell: { cellId: cell.id, chooserId: 'chooser' } },
  ];

  beforeAll(async () => {
    await db.insert(user).values([
      { id: host, name: 'Ведуча', email: 'types-host@example.com' },
      { id: olya, name: 'Оля', email: 'types-olya@example.com' },
      { id: petro, name: 'Петро', email: 'types-petro@example.com' },
    ]);
  });

  it('counts main questions with own answers and own votes, not spares, and teams by answered_by', async () => {
    await seedGame(db, {
      hostId: host,
      startedAt: new Date('2026-10-01T18:00:00Z'),
      snapshot: typesQuiz,
      questionsPlayed: 5,
      plays: typesPlays,
      players: [
        {
          userId: olya,
          nickname: 'Оля',
          score: 0,
          rank: 1,
          rows: [
            { questionIndex: 0, accepted: true, points: 0 },
            { questionIndex: 1, accepted: false, points: 0 },
            { questionIndex: 2, attempt: VOTE_ATTEMPT, accepted: false, points: 0 },
            // Запасне замість bool: тип основного не рахується.
            { questionIndex: 3, accepted: true, points: 0, spareId: 'spare-1' },
            { questionIndex: 4, roundIndex: 1, accepted: true, points: 0 },
          ],
        },
      ],
    });
    expect(await answeredTypes(db, olya)).toEqual(new Set(['single', 'text', 'poll', 'pin']));

    // Командна гра: відповідь команди належить тому, хто відповідав.
    await seedGame(db, {
      hostId: host,
      startedAt: new Date('2026-10-02T18:00:00Z'),
      snapshot: typesQuiz,
      questionsPlayed: 4,
      plays: typesPlays,
      players: [
        { userId: null, nickname: 'Червоні', score: 0, rank: 1, isTeam: true, rows: [{ questionIndex: 3, accepted: true, points: 0, answeredBy: 2 }] },
        { userId: olya, nickname: 'Оля', score: 0, rank: 1, teamOf: 0 },
        { userId: petro, nickname: 'Петро', score: 0, rank: 1, teamOf: 0 },
      ],
    });
    expect(await answeredTypes(db, petro)).toEqual(new Set(['boolean']));
    expect(await answeredTypes(db, olya)).toEqual(new Set(['single', 'text', 'poll', 'pin']));
  });

  it('a penalty row is not an answer: its question type does not count', async () => {
    const [account] = await db.insert(user).values({ id: 'types-penalty', name: 'Ярина', email: 'types-penalty@example.com' }).returning();
    await seedGame(db, {
      hostId: host,
      startedAt: new Date('2026-10-03T18:00:00Z'),
      snapshot: typesQuiz,
      questionsPlayed: 2,
      plays: typesPlays,
      players: [
        {
          userId: account.id,
          nickname: 'Ярина',
          score: 0,
          rank: 1,
          rows: [
            { questionIndex: 0, accepted: true, points: 0 },
            { questionIndex: 1, attempt: PENALTY_ATTEMPT, accepted: false, points: -100 },
          ],
        },
      ],
    });
    expect(await answeredTypes(db, account.id)).toEqual(new Set(['single']));
  });

  it('an old game without plays gives no types', async () => {
    const [account] = await db.insert(user).values({ id: 'types-old', name: 'Віра', email: 'types-old@example.com' }).returning();
    await seedGame(db, {
      hostId: host,
      startedAt: new Date('2026-01-01T18:00:00Z'),
      players: [{ userId: account.id, nickname: 'Віра', score: 100, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 100 }] }],
    });
    expect(await answeredTypes(db, account.id)).toEqual(new Set());
  });
});
