import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { factInput, hostView } from '@quiz/engine';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { defaultTeams, gameAwards, type ResumeOption, type ResumeSetup } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { answer, game, participant, scoreAdjustment, user } from './db/schema';
import { hostGame, hostGameWithFacts, resumeOptions, resumeRound } from './history';
import type { PlayRef } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { TEAM_HOST, recordedTeamGame, toQuestion } from './testing/team-game';

/** Три класичні раунди по два запитання. */
const threeRounds = () =>
  makeRoundsQuiz(
    [
      classicRound('r0', [single, withId(single, 'q2')], { speedBonus: false }),
      classicRound('r1', [withId(single, 'q3'), withId(single, 'q4')], { speedBonus: false }),
      classicRound('r2', [withId(single, 'q5'), withId(single, 'q6')], { speedBonus: false }),
    ],
  );
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const ref = (roundIndex: number, questionId: string): PlayRef => ({ roundIndex, questionId });

describe('resumeRound (12r)', () => {
  const quiz = threeRounds();
  it('starts from the round after the last finished one, or the unfinished one itself', () => {
    expect(resumeRound(quiz, [], 0)).toBe(0);
    expect(resumeRound(quiz, [ref(0, 'q1'), ref(0, 'q2')], 2)).toBe(1);
    expect(resumeRound(quiz, [ref(0, 'q1'), ref(0, 'q2'), ref(1, 'q3')], 3)).toBe(1);
  });

  it('stops at the last round, falls back to the last round without a snapshot and counts only the closed questions', () => {
    const all = [ref(0, 'q1'), ref(0, 'q2'), ref(1, 'q3'), ref(1, 'q4'), ref(2, 'q5'), ref(2, 'q6')];
    expect(resumeRound(quiz, all, 6)).toBe(2);
    expect(resumeRound(null, [ref(0, 'q1'), ref(0, 'q2'), ref(1, 'q3')], 3)).toBe(1);
    // Відкрите, але не закрите запитання раунду 1 не рахується: раунд 0 завершено.
    expect(resumeRound(quiz, [ref(0, 'q1'), ref(0, 'q2'), ref(1, 'q3')], 2)).toBe(1);
    expect(resumeRound(quiz, [ref(0, 'q1'), ref(0, 'q2')], 1)).toBe(0);
  });

  it('a round ended early stays the round to go on from; a round missing in the snapshot falls back to the last one', () => {
    // Ведучий завершив раунд 0 після одного запитання з двох і зіграв одне запитання раунду 1: далі — раунд 1, він сам незавершений.
    expect(resumeRound(quiz, [ref(0, 'q1'), ref(1, 'q3')], 2)).toBe(1);
    // Завершений достроково останній закритий раунд — продовжуємо його ж.
    expect(resumeRound(quiz, [ref(0, 'q1'), ref(0, 'q2'), ref(1, 'q3')], 3)).toBe(1);
    // Раунду 5 у знімку немає: останній раунд знімка.
    expect(resumeRound(quiz, [ref(5, 'q9')], 1)).toBe(2);
    expect(resumeRound(quiz, [ref(0, 'q1'), ref(3, 'q9')], 2)).toBe(2);
  });
});

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

type Method = 'GET' | 'POST';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function host() {
  const account = await signUp(ctx.app, 'Ведуча');
  const [row] = await db.select().from(user).where(eq(user.email, account.email));
  return { ...account, id: row.id };
}

async function saveQuiz(cookie: string) {
  return ((await call('POST', '/api/quizzes', cookie, threeRounds())).json() as { id: string }).id;
}

async function openRoom(cookie: string, quizId: string) {
  const created = (await call('POST', '/api/games', cookie, { quizId })).json() as { gameId: string; code: string };
  const room = ctx.manager.get(created.code);
  if (room === undefined) throw new Error('room missing');
  return { ...created, room };
}

/** Оля й Петро входять і на зв'язку; повертає їхні id. */
async function enter(code: string, names = ['Оля', 'Петро']) {
  const room = ctx.manager.get(code)!;
  const ids: string[] = [];
  for (const nickname of names) {
    const { playerId } = (await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname })).json() as { playerId: string };
    ctx.manager.connect(room, { role: 'player', playerId });
    ids.push(playerId);
  }
  return ids;
}

/**
 * Гра з ведучим: старт (з resume, якщо дано), questions запитань (Оля правильно, Петро ні), потім «Завершити».
 * startedAt у базі ставиться явно, щоб порядок «найновіша перша» не залежав від мілісекунд.
 */
async function playGame(cookie: string, quizId: string, options: { questions: number; startedAt: Date; resume?: (ids: string[]) => ResumeSetup }) {
  const opened = await openRoom(cookie, quizId);
  const { room } = opened;
  const ids = await enter(opened.code);
  const resume = options.resume?.(ids);
  expect(ctx.manager.host(room, resume === undefined ? { type: 'start' } : { type: 'start', resume })).toEqual({ ok: true });
  for (let i = 0; i < options.questions; i++) {
    toQuestion(ctx.manager, room);
    ctx.manager.answer(room, ids[0], right);
    ctx.manager.answer(room, ids[1], wrong);
    if (room.state.phase === 'question') ctx.manager.host(room, { type: 'lock' });
    expect(ctx.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
  }
  await ctx.recorder.idle();
  const live = factInput(room.state);
  expect(ctx.manager.host(room, { type: 'end' })).toEqual({ ok: true });
  await ctx.recorder.idle();
  await db.update(game).set({ startedAt: options.startedAt }).where(eq(game.id, opened.gameId));
  return { ...opened, ids, live };
}

describe('GET /api/games/by-code/:code/resume (12r)', () => {
  it('lists the own games of this quiz with a closed question, newest first, without the current room and other quizzes', async () => {
    const owner = await host();
    const quizA = await saveQuiz(owner.cookie);
    const quizB = await saveQuiz(owner.cookie);
    const older = await playGame(owner.cookie, quizA, { questions: 2, startedAt: new Date('2026-10-01T10:00:00Z') });
    const newer = await playGame(owner.cookie, quizA, { questions: 3, startedAt: new Date('2026-10-02T10:00:00Z') });
    await playGame(owner.cookie, quizB, { questions: 1, startedAt: new Date('2026-10-03T10:00:00Z') });
    // Гра без жодного закритого запитання не пропонується.
    await playGame(owner.cookie, quizA, { questions: 0, startedAt: new Date('2026-10-04T10:00:00Z') });

    // Статус будь-який: обірвана гра теж пропонується.
    await db.update(game).set({ status: 'aborted' }).where(eq(game.id, older.gameId));

    const current = await openRoom(owner.cookie, quizA);
    const response = await call('GET', `/api/games/by-code/${current.code}/resume`, owner.cookie);
    expect(response.statusCode).toBe(200);
    const options = response.json() as ResumeOption[];
    expect(options.map((o) => o.gameId)).toEqual([newer.gameId, older.gameId]);
    expect(options[0]).toEqual({
      gameId: newer.gameId,
      startedAt: '2026-10-02T10:00:00.000Z',
      status: 'finished',
      questionsPlayed: 3,
      questionCount: 6,
      autopilot: false,
      roundIndex: 1,
      scores: [
        { nickname: 'Оля', score: 3000 },
        { nickname: 'Петро', score: 0 },
      ],
    });
    expect(options[1]).toMatchObject({ status: 'aborted', questionsPlayed: 2, roundIndex: 1, scores: [{ nickname: 'Оля', score: 2000 }, { nickname: 'Петро', score: 0 }] });
  });

  it('answers 404 to a stranger and without a session, 409 once the game has started', async () => {
    const owner = await host();
    const quizId = await saveQuiz(owner.cookie);
    const current = await openRoom(owner.cookie, quizId);
    const url = `/api/games/by-code/${current.code}/resume`;
    const stranger = await signUp(ctx.app, 'Тарас');
    expect((await call('GET', url, stranger.cookie)).statusCode).toBe(404);
    expect((await call('GET', url)).json()).toEqual({ error: 'game_not_found' });
    expect((await call('GET', '/api/games/by-code/000000/resume', owner.cookie)).statusCode).toBe(404);
    expect((await call('GET', url, owner.cookie)).json()).toEqual([]);
    await enter(current.code, ['Оля']);
    expect(ctx.manager.host(current.room, { type: 'start' })).toEqual({ ok: true });
    const started = await call('GET', url, owner.cookie);
    expect(started.statusCode).toBe(409);
    expect(started.json()).toEqual({ error: 'wrong_phase' });
  });

  it('the autopilot author sees the same games of the own quiz', async () => {
    const owner = await host();
    const quizId = await saveQuiz(owner.cookie);
    const played = await playGame(owner.cookie, quizId, { questions: 2, startedAt: new Date('2026-10-05T10:00:00Z') });
    const created = await call('POST', '/api/games', owner.cookie, { quizId, autopilot: true, nickname: 'Марта' });
    expect(created.statusCode).toBe(201);
    const { code } = created.json() as { code: string };
    const response = await call('GET', `/api/games/by-code/${code}/resume`, owner.cookie);
    expect(response.statusCode).toBe(200);
    expect((response.json() as ResumeOption[]).map((o) => o.gameId)).toEqual([played.gameId]);
  });

  it('resumeOptions leaves out the excluded game only', async () => {
    const owner = await host();
    const quizId = await saveQuiz(owner.cookie);
    const older = await playGame(owner.cookie, quizId, { questions: 1, startedAt: new Date('2026-10-09T10:00:00Z') });
    const newer = await playGame(owner.cookie, quizId, { questions: 1, startedAt: new Date('2026-10-10T10:00:00Z') });
    expect((await resumeOptions(db, owner.id, quizId, '00000000-0000-4000-8000-000000000000')).map((o) => o.gameId)).toEqual([newer.gameId, older.gameId]);
    expect((await resumeOptions(db, owner.id, quizId, newer.gameId)).map((o) => o.gameId)).toEqual([older.gameId]);
    expect((await resumeOptions(db, owner.id, quizId, older.gameId)).map((o) => o.gameId)).toEqual([newer.gameId]);
  });
});

describe('a resumed game in the history (12r)', () => {
  it('stores the carry rows, the rows sum to the score, the history keeps carry out of the rounds and the facts match the live game', async () => {
    const owner = await host();
    const quizId = await saveQuiz(owner.cookie);
    const resumed = await playGame(owner.cookie, quizId, {
      questions: 1,
      startedAt: new Date('2026-10-06T10:00:00Z'),
      resume: ([olya, petro]) => ({ roundIndex: 1, points: { [olya]: 42_434, [petro]: -50 } }),
    });
    const [olya, petro] = resumed.ids;

    const people = await db.select().from(participant).where(eq(participant.gameId, resumed.gameId));
    const ids = people.map((p) => p.id);
    const adjustments = (await db.select().from(scoreAdjustment)).filter((a) => ids.includes(a.participantId));
    expect(adjustments.filter((a) => a.source === 'carry').map((a) => [a.participantId, a.points, a.roundIndex, a.afterQuestion])).toEqual([
      [olya, 42_434, 1, 0],
      [petro, -50, 1, 0],
    ]);
    const rows = (await db.select().from(answer)).filter((a) => ids.includes(a.participantId));
    for (const p of people) {
      const sum = rows.filter((r) => r.participantId === p.id).reduce((s, r) => s + r.points, 0) + adjustments.filter((a) => a.participantId === p.id).reduce((s, a) => s + a.points, 0);
      expect(sum).toBe(p.score);
    }
    expect(people.find((p) => p.id === olya)?.score).toBe(43_434);

    const detail = await hostGame(db, owner.id, resumed.gameId);
    const olyaRow = detail?.standings.find((s) => s.nickname === 'Оля');
    expect(olyaRow?.rounds).toEqual([0, 1000]);
    expect(olyaRow?.breakdown.parts[0]).toEqual({ source: 'carry', plus: 42_434, minus: 0 });
    expect(detail?.standings.find((s) => s.nickname === 'Петро')?.breakdown.parts[0]).toEqual({ source: 'carry', plus: 0, minus: -50 });
    expect(detail?.adjustments.filter((a) => a.source === 'carry')).toEqual([
      expect.objectContaining({ nickname: 'Оля', points: 42_434, roundIndex: 1, afterQuestion: 0 }),
      expect.objectContaining({ nickname: 'Петро', points: -50, roundIndex: 1, afterQuestion: 0 }),
    ]);
    // Пропущений раунд 0 не має запитань.
    expect(detail?.questions.map((q) => q.roundIndex)).toEqual([1]);

    // Звірка рушій ↔ історія (12d) з перенесеним.
    const found = await hostGameWithFacts(db, owner.id, resumed.gameId);
    const live = resumed.live;
    expect(live.players.find((p) => p.id === olya)?.carry).toBe(42_434);
    const byKey = (list: typeof live.rows) => [...list].sort((a, b) => a.questionIndex - b.questionIndex || a.playerId.localeCompare(b.playerId) || a.attempt - b.attempt);
    expect(found?.factInput.players).toEqual(live.players);
    expect(found?.factInput.questions).toEqual(live.questions);
    expect(byKey(found?.factInput.rows ?? [])).toEqual(byKey(live.rows));
    expect(found?.factInput.debuffs).toEqual(live.debuffs);
    expect(found?.factInput.away).toEqual(live.away);
    expect(found?.factInput.appeals).toEqual(live.appeals);
    // Колонки таблиці історії — від першого зіграного раунду.
    expect(detail?.firstRound).toBe(1);
  });

  it('a chain: the game resumed from the first offers its scores with the carried points to the third', async () => {
    const owner = await host();
    const quizId = await saveQuiz(owner.cookie);
    const plain = await playGame(owner.cookie, quizId, { questions: 2, startedAt: new Date('2026-10-07T10:00:00Z') });
    expect((await hostGame(db, owner.id, plain.gameId))?.firstRound).toBe(0);
    const current = await openRoom(owner.cookie, quizId);
    const [first] = (await call('GET', `/api/games/by-code/${current.code}/resume`, owner.cookie)).json() as ResumeOption[];
    expect(first.roundIndex).toBe(1);
    const carried = Object.fromEntries(first.scores.map((s) => [s.nickname, s.score]));
    const ids = await enter(current.code);
    expect(ctx.manager.host(current.room, { type: 'start', resume: { roundIndex: first.roundIndex, points: { [ids[0]]: carried['Оля'], [ids[1]]: carried['Петро'] } } })).toEqual({ ok: true });
    toQuestion(ctx.manager, current.room);
    ctx.manager.answer(current.room, ids[0], right);
    ctx.manager.answer(current.room, ids[1], wrong);
    if (current.room.state.phase === 'question') ctx.manager.host(current.room, { type: 'lock' });
    ctx.manager.host(current.room, { type: 'next' });
    ctx.manager.host(current.room, { type: 'end' });
    await ctx.recorder.idle();
    await db.update(game).set({ startedAt: new Date('2026-10-08T10:00:00Z') }).where(eq(game.id, current.gameId));

    const third = await openRoom(owner.cookie, quizId);
    const options = (await call('GET', `/api/games/by-code/${third.code}/resume`, owner.cookie)).json() as ResumeOption[];
    expect(options[0]).toMatchObject({ gameId: current.gameId, roundIndex: 1, questionsPlayed: 1 });
    expect(options[0].scores).toEqual([
      { nickname: 'Оля', score: 3000 },
      { nickname: 'Петро', score: 0 },
    ]);
  });
});

describe('a plain game with an empty first round (12r)', () => {
  it('keeps the Р1 column live and in the history, and the facts match', async () => {
    const owner = await host();
    const quizId = await saveQuiz(owner.cookie);
    const { room, gameId, code } = await openRoom(owner.cookie, quizId);
    const ids = await enter(code);
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    // Раунд 0 завершено ще на заставці: у ньому немає жодного запитання.
    expect(ctx.manager.host(room, { type: 'end-round' })).toEqual({ ok: true });
    toQuestion(ctx.manager, room);
    expect(room.state.roundIndex).toBe(1);
    ctx.manager.answer(room, ids[0], right);
    ctx.manager.answer(room, ids[1], wrong);
    if (room.state.phase === 'question') ctx.manager.host(room, { type: 'lock' });
    expect(ctx.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(hostView(room.state).firstRound).toBe(0);
    await ctx.recorder.idle();
    const live = factInput(room.state);
    expect(ctx.manager.host(room, { type: 'end' })).toEqual({ ok: true });
    await ctx.recorder.idle();

    const found = await hostGameWithFacts(db, owner.id, gameId);
    expect(found?.detail.firstRound).toBe(0);
    expect(found?.detail.standings.find((st) => st.nickname === 'Оля')?.rounds).toEqual([0, 1000]);
    expect(found?.factInput.players).toEqual(live.players);
    expect(found?.factInput.questions).toEqual(live.questions);
    expect(found?.detail.facts.awards).toEqual(gameAwards(live));
  });
});

describe('a resumed team game in the history (12r)', () => {
  it('carries per team: carry rows on the team rows only, out of the rounds, columns from the first played round', async () => {
    const quiz = makeRoundsQuiz(
      [classicRound('r0', [single], { speedBonus: false }), classicRound('r1', [withId(single, 'q2')], { speedBonus: false })],
      { teams: defaultTeams(2) },
    );
    const t = await recordedTeamGame(quiz, undefined, ([red, blue]) => ({ roundIndex: 1, points: { [red]: 42_434, [blue]: -50 } }));
    const [red, blue] = t.teams;
    expect(t.room.state.roundIndex).toBe(1);
    toQuestion(t.manager, t.room);
    expect(t.manager.answer(t.room, t.members['Оля'], right)).toEqual({ ok: true });
    expect(t.manager.answer(t.room, t.members['Віра'], wrong)).toEqual({ ok: true });
    if (t.room.state.phase === 'question') t.manager.host(t.room, { type: 'lock' });
    t.manager.host(t.room, { type: 'next' });
    t.manager.host(t.room, { type: 'end' });
    await t.recorder.idle();
    expect(t.errors).toEqual([]);

    const carry = (await t.db.select().from(scoreAdjustment)).filter((a) => a.source === 'carry');
    expect(carry.map((a) => [a.participantId, a.points, a.roundIndex])).toEqual([
      [red, 42_434, 1],
      [blue, -50, 1],
    ]);
    const [row] = await t.db.select().from(game);
    const detail = await hostGame(t.db, TEAM_HOST, row.id);
    expect(detail?.teams).toBe(true);
    expect(detail?.firstRound).toBe(1);
    expect(detail?.standings.map((s) => [s.nickname, s.score, s.rounds, s.members])).toEqual([
      ['Червоні', 43_434, [0, 1000], ['Оля', 'Петро']],
      ['Сині', -50, [0, 0], ['Віра', 'Ігор']],
    ]);
    expect(detail?.standings[0].breakdown.parts[0]).toEqual({ source: 'carry', plus: 42_434, minus: 0 });
    expect(detail?.adjustments.filter((a) => a.source === 'carry').map((a) => [a.nickname, a.points])).toEqual([
      ['Червоні', 42_434],
      ['Сині', -50],
    ]);
  });
});
