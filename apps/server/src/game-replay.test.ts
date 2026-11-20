import { boardRound, classicRound, finalRound, makeQuiz, makeRoundsQuiz, poll, single, text, withId } from '@quiz/engine/testing';
import { defaultTeams, type GameReplay, type Quiz, type ReplayEvent } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { game, gameEvent, participant, scoreAdjustment, user } from './db/schema';
import { gameReplay } from './game-replay';
import { attachRecorder } from './recorder';
import type { SavedGameData } from './rooms/continuation';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { seedGame } from './testing/history-rows';
import { recordedTeamGame, toEnd, toQuestion } from './testing/team-game';
import { createTestDb } from './testing/test-db';

const HOST = 'replay-host';
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const odesa = { type: 'text', value: 'Одеса' } as const;
const lviv = { type: 'text', value: 'Львів' } as const;

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'replay-host@example.com' });
});

/** Записувана соло-гра на спільній базі: свої менеджер і записувач; гравці входять за іменами. */
function soloGame(quiz: Quiz, names: string[]) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error));
  const saves: SavedGameData[] = [];
  manager.onEvent((_room, event) => {
    if (event.type === 'closed' && event.saved !== undefined) saves.push(event.saved);
  });
  const room = manager.create(quiz, HOST, null);
  const enter = (target: Room, nickname: string) => {
    const joined = manager.join(target.code, nickname, null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(target, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const ids: Record<string, string> = {};
  for (const name of names) ids[name] = enter(room, name);
  const host = (action: Parameters<RoomManager['host']>[1], target: Room = room) => expect(manager.host(target, action)).toEqual({ ok: true });
  const replay = async (id = room.id) => {
    await recorder.idle();
    expect(errors).toEqual([]);
    const found = await gameReplay(db, id);
    if (found === null || found === 'running') throw new Error(`replay: ${String(found)}`);
    return found;
  };
  return { scheduler, manager, recorder, errors, saves, room, ids, host, enter, replay };
}

/** Ведучий закриває відкрите запитання й доходить до розкриття. */
function toReveal(manager: RoomManager, room: Room): void {
  if (room.state.phase === 'question') manager.host(room, { type: 'lock' });
  if (room.state.phase === 'locked') manager.host(room, { type: 'next' });
  expect(room.state.phase).toBe('reveal');
}

/** Ведучий тисне «Далі», доки не стане таблиця (місце відпочинку між запитаннями). */
function toLeaderboard(manager: RoomManager, room: Room): void {
  for (let guard = 0; guard < 6 && room.state.phase !== 'leaderboard'; guard++) manager.host(room, { type: 'next' });
  expect(room.state.phase).toBe('leaderboard');
}

/** Людина оскаржує на розкритті, виборці голосують; рушій вирішує, коли проголосували всі. */
function appealWith(manager: RoomManager, room: Room, by: string, votes: [string, boolean][]): void {
  expect(manager.appeal(room, by, 'grade')).toEqual({ ok: true });
  const id = room.state.appeals?.at(-1)?.id ?? -1;
  for (const [voter, yes] of votes) expect(manager.appealVote(room, voter, id, yes)).toEqual({ ok: true });
}

const kinds = (events: ReplayEvent[]) => events.map((e) => e.kind);
const scoresOf = (replay: GameReplay, step: number) => replay.steps[step].scores.map((s) => [s.nickname, s.score]);

/** Учасники рушія гри з рахунком у базі. */
async function storedScores(id: string): Promise<Map<string, number>> {
  const rows = await db.select().from(participant).where(eq(participant.gameId, id));
  return new Map(rows.filter((p) => p.teamId === null).map((p) => [p.nickname, p.score]));
}

/**
 * Продовжена гра з приєднанням, паузою, ручним рішенням і вилученням: запитання 1 і 2 зіграно, «Зберегти» й точне продовження;
 * Марко приходить на таблиці після запитання 2, пауза 30 с там само; на запитанні 3 ведучий зараховує Петрові вручну й вилучає Марка.
 */
async function eventfulGame() {
  const g = soloGame(makeQuiz([text, single, withId(single, 'q3')], { speedBonus: false }), ['Оля', 'Петро']);
  const { manager, scheduler, room, ids, host } = g;
  host({ type: 'start' });
  toQuestion(manager, room);
  manager.answer(room, ids['Оля'], odesa);
  manager.answer(room, ids['Петро'], lviv);
  toReveal(manager, room);
  toLeaderboard(manager, room);
  toQuestion(manager, room);
  manager.answer(room, ids['Оля'], right);
  manager.answer(room, ids['Петро'], wrong);
  toReveal(manager, room);
  toLeaderboard(manager, room);
  scheduler.advance(60_000);
  await g.recorder.idle();
  host({ type: 'save' });
  scheduler.advance(60_000);
  const result = manager.continueSaved(room.id, HOST, JSON.parse(JSON.stringify(g.saves.at(-1))) as SavedGameData);
  if (!result.ok) throw new Error(result.error);
  const next = result.room;
  scheduler.advance(100);
  const marko = g.enter(next, 'Марко');
  scheduler.advance(100);
  // Продовження відкривається на паузі: зняття без пари.
  host({ type: 'resume' }, next);
  scheduler.advance(100);
  host({ type: 'pause' }, next);
  scheduler.advance(30_000);
  host({ type: 'resume' }, next);
  toQuestion(manager, next);
  manager.answer(next, ids['Оля'], right);
  manager.answer(next, ids['Петро'], wrong);
  manager.answer(next, marko, right);
  toReveal(manager, next);
  host({ type: 'override', playerId: ids['Петро'], grade: 'correct' }, next);
  const markoScore = next.state.players.find((p) => p.id === marko)!.score;
  scheduler.advance(100);
  host({ type: 'kick', playerId: marko }, next);
  scheduler.advance(100);
  host({ type: 'end' }, next);
  expect(next.state.phase).toBe('finished');
  return { ...g, markoScore };
}

describe('gameReplay (65)', () => {
  it('each step has the question, the price, the rows with time and verdict, and the running score', async () => {
    const g = soloGame(makeQuiz([text, single, withId(single, 'q3')], { speedBonus: false }), ['Оля', 'Петро']);
    g.host({ type: 'start' });
    toQuestion(g.manager, g.room);
    g.scheduler.advance(4000);
    expect(g.manager.answer(g.room, g.ids['Оля'], odesa)).toEqual({ ok: true });
    toEnd(g.manager, g.room);
    const replay = await g.replay();

    expect(replay).toMatchObject({ id: g.room.id, title: expect.any(String), code: g.room.code, status: 'finished', autopilot: false, teams: false, recorded: true });
    expect(replay.rounds).toEqual([{ title: '', type: 'classic' }]);
    expect(replay.steps).toHaveLength(3);
    const [first] = replay.steps;
    expect(first).toMatchObject({ index: 0, roundIndex: 0, price: text.points, multiplier: 1 });
    expect(first.question?.id).toBe(text.id);
    expect(first.rows).toEqual([
      { nickname: 'Оля', answeredBy: null, attempt: 0, answer: odesa, spare: null, timeMs: 4000, verdict: 'correct', manual: false, points: text.points, wager: null, awayMs: null },
      { nickname: 'Петро', answeredBy: null, attempt: 0, answer: null, spare: null, timeMs: null, verdict: 'none', manual: false, points: 0, wager: null, awayMs: null },
    ]);
    expect(scoresOf(replay, 0)).toEqual([
      ['Оля', text.points],
      ['Петро', 0],
    ]);
    expect(replay.start).toEqual({ scores: [{ nickname: 'Оля', score: 0 }, { nickname: 'Петро', score: 0 }], events: [] });
  });

  it('manual decisions, undo, appeal, buff and debuff are events of their step', async () => {
    const quiz = makeQuiz([text, single, withId(single, 'q3')], { speedBonus: false, buffs: ['double'], debuffs: ['fog'] });
    const g = soloGame(quiz, ['Оля', 'Петро', 'Іра']);
    const { manager, room, ids, host } = g;
    host({ type: 'start' });
    toQuestion(manager, room);
    expect(manager.buff(room, ids['Оля'], 'double')).toEqual({ ok: true });
    manager.answer(room, ids['Оля'], odesa);
    manager.answer(room, ids['Петро'], lviv);
    manager.answer(room, ids['Іра'], odesa);
    toReveal(manager, room);
    host({ type: 'override', playerId: ids['Петро'], grade: 'correct' });
    toLeaderboard(manager, room);
    host({ type: 'undo', target: { question: 0, playerId: ids['Оля'] } });
    host({ type: 'debuff', playerId: ids['Петро'], kind: 'fog' });
    toQuestion(manager, room);
    manager.answer(room, ids['Оля'], right);
    manager.answer(room, ids['Петро'], wrong);
    manager.answer(room, ids['Іра'], right);
    toReveal(manager, room);
    appealWith(manager, room, ids['Петро'], [[ids['Оля'], true], [ids['Іра'], true]]);
    toEnd(manager, room);
    const replay = await g.replay();

    const [first, second] = replay.steps;
    expect(first.rows.find((r) => r.nickname === 'Петро')).toMatchObject({ manual: true, verdict: 'correct' });
    expect(first.rows.find((r) => r.nickname === 'Оля')).toMatchObject({ manual: false, verdict: 'correct' });
    expect(kinds(first.events)).toEqual(['manual', 'buff', 'adjustment']);
    expect(first.events).toEqual([
      { kind: 'manual', nickname: 'Петро', from: 'wrong', to: 'correct' },
      { kind: 'buff', nickname: 'Оля', buff: 'double' },
      { kind: 'adjustment', nickname: 'Оля', source: 'undo', points: -2 * text.points, undoes: { question: 0 } },
    ]);
    expect(kinds(second.events)).toEqual(['debuff', 'appeal', 'adjustment']);
    expect(second.events[0]).toEqual({ kind: 'debuff', nickname: 'Петро', debuff: 'fog' });
    expect(second.events[1]).toEqual({ kind: 'appeal', nickname: 'Петро', appeal: { reason: 'grade', yes: 2, no: 0, outcome: 'yes' } });
    expect(second.events[2]).toMatchObject({ kind: 'adjustment', nickname: 'Петро', source: 'appeal', points: single.points });
    // Після «↶ Бали» Оля на кроці 1 має 0.
    expect(scoresOf(replay, 0)).toEqual(expect.arrayContaining([['Оля', 0], ['Петро', text.points], ['Іра', text.points]]));
    const stored = await storedScores(room.id);
    for (const s of replay.steps.at(-1)!.scores) expect(s.score).toBe(stored.get(s.nickname));
  });

  it('joins, kicks and pauses land on the step they happened', async () => {
    const g = await eventfulGame();
    const replay = await g.replay();
    expect(replay.recorded).toBe(true);
    expect(replay.start.events).toEqual([]);
    expect(kinds(replay.steps[0].events)).toEqual([]);
    const second = replay.steps[1].events;
    expect(kinds(second)).toEqual(['join', 'pause']);
    expect(second[0]).toMatchObject({ kind: 'join', nickname: 'Марко', at: expect.any(String) });
    expect(second[1]).toMatchObject({ kind: 'pause', ms: 30_000 });
    const third = replay.steps[2].events;
    expect(kinds(third)).toEqual(['manual', 'leave']);
    expect(third[0]).toEqual({ kind: 'manual', nickname: 'Петро', from: 'wrong', to: 'correct' });
    expect(third[1]).toMatchObject({ kind: 'leave', nickname: 'Марко', score: g.markoScore });
    // Вилученого немає в таблиці кроків.
    expect(replay.steps[2].rows.map((r) => r.nickname)).toEqual(['Оля', 'Петро']);
  });

  it('the last running score equals the stored score', async () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false }), finalRound('fin', withId(single, 'f1'))], { awayPenalty: true });
    const g = soloGame(quiz, ['Оля', 'Петро', 'Іра']);
    const { manager, room, ids, scheduler } = g;
    g.host({ type: 'start', resume: { roundIndex: 0, points: { [ids['Оля']]: 500, [ids['Петро']]: -50 } } });
    toQuestion(manager, room);
    expect(manager.away(room, ids['Оля'], true)).toEqual({ ok: true });
    scheduler.advance(3500);
    expect(manager.away(room, ids['Оля'], false, { ms: 3500 })).toEqual({ ok: true });
    manager.answer(room, ids['Оля'], right);
    manager.answer(room, ids['Петро'], right);
    manager.answer(room, ids['Іра'], wrong);
    toReveal(manager, room);
    appealWith(manager, room, ids['Іра'], [[ids['Оля'], true], [ids['Петро'], true]]);
    toLeaderboard(manager, room);
    g.host({ type: 'undo', target: { question: 0, playerId: ids['Петро'] } });
    g.host({ type: 'adjust', playerId: ids['Іра'], points: 70 });
    toQuestion(manager, room);
    for (const id of Object.values(ids)) manager.answer(room, id, right);
    for (let guard = 0; guard < 10 && room.state.phase !== 'wager'; guard++) manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('wager');
    manager.wager(room, ids['Оля'], 300);
    manager.wager(room, ids['Петро'], 200);
    manager.wager(room, ids['Іра'], 100);
    toQuestion(manager, room);
    manager.answer(room, ids['Оля'], right);
    manager.answer(room, ids['Петро'], wrong);
    toEnd(manager, room);
    const replay = await g.replay();

    const sources = new Set((await db.select().from(scoreAdjustment)).filter((a) => Object.values(ids).includes(a.participantId)).map((a) => a.source));
    expect([...sources].sort()).toEqual(['appeal', 'away', 'carry', 'host', 'undo']);
    expect(replay.steps.find((s) => s.roundIndex === 1)?.rows.find((r) => r.nickname === 'Оля')?.wager).toBe(300);
    expect(replay.start.scores).toEqual(expect.arrayContaining([{ nickname: 'Оля', score: 500 }, { nickname: 'Петро', score: -50 }]));
    const stored = await storedScores(room.id);
    expect(stored.size).toBe(3);
    const last = replay.steps.at(-1)!.scores;
    expect(last).toHaveLength(3);
    for (const s of last) expect(s.score).toBe(stored.get(s.nickname));
  });

  it('an old game shows what was stored and nothing else', async () => {
    const g = await eventfulGame();
    const before = await g.replay();
    await db.delete(gameEvent).where(eq(gameEvent.gameId, g.room.id));
    const after = await g.replay();
    expect(after.recorded).toBe(false);
    const all = [...after.start.events, ...after.steps.flatMap((s) => s.events)];
    expect(all.filter((e) => e.kind === 'join' || e.kind === 'leave' || e.kind === 'pause')).toEqual([]);
    expect(after.steps[2].events).toEqual([{ kind: 'manual', nickname: 'Петро', from: null, to: 'correct' }]);
    expect(after.steps.map((s) => s.rows.map((r) => r.timeMs))).toEqual(before.steps.map((s) => s.rows.map((r) => r.timeMs)));
    expect(after.steps.map((s) => s.scores)).toEqual(before.steps.map((s) => s.scores));
  });

  it('a team game shows team rows with who answered and people votes on polls', async () => {
    const t = await recordedTeamGame(makeRoundsQuiz([classicRound('r1', [single, poll], { speedBonus: false })], { teams: defaultTeams(2) }));
    toQuestion(t.manager, t.room);
    expect(t.manager.answer(t.room, t.members['Оля'], right)).toEqual({ ok: true });
    expect(t.manager.answer(t.room, t.members['Віра'], wrong)).toEqual({ ok: true });
    toQuestion(t.manager, t.room);
    for (const name of ['Оля', 'Петро', 'Віра', 'Ігор']) expect(t.manager.answer(t.room, t.members[name], { type: 'poll', optionId: 'a' })).toEqual({ ok: true });
    toEnd(t.manager, t.room);
    await t.recorder.idle();
    expect(t.errors).toEqual([]);
    const replay = await gameReplay(t.db, t.room.id);
    if (replay === null || replay === 'running') throw new Error('no replay');
    expect(replay.teams).toBe(true);
    const red = t.room.state.players.find((p) => p.id === t.teams[0])!.nickname;
    const blue = t.room.state.players.find((p) => p.id === t.teams[1])!.nickname;
    expect(replay.steps[0].rows.map((r) => [r.nickname, r.answeredBy, r.verdict])).toEqual([
      [red, 'Оля', 'correct'],
      [blue, 'Віра', 'wrong'],
    ]);
    const votes = replay.steps[1].rows;
    expect(votes.map((r) => r.nickname).sort()).toEqual(['Віра', 'Ігор', 'Оля', 'Петро'].sort());
    expect(votes.every((r) => r.verdict === 'none' && r.answer?.type === 'poll')).toBe(true);
    expect(replay.steps[1].price).toBe(0);
  });

  it('a board cell carries its price and mark', async () => {
    const cellQuestion = withId(single, 'c1');
    const snapshot = makeRoundsQuiz([
      boardRound('b1', [
        { title: 'Міста', cells: [{ mark: 'x2', question: cellQuestion }, withId(single, 'c2'), withId(single, 'c3')] },
        { title: 'Річки', cells: [withId(single, 'c4'), withId(single, 'c5'), withId(single, 'c6')] },
        { title: 'Гори', cells: [withId(single, 'c7'), withId(single, 'c8'), withId(single, 'c9')] },
      ]),
    ]);
    const { gameId, participantIds } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2026-11-01T10:00:00Z'),
      snapshot,
      players: [{ userId: null, nickname: 'Анна', score: 2000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 2000, payload: right, timeMs: 3000 }] }],
    });
    await db.update(game).set({ plays: [{ roundIndex: 0, questionId: 'c1', cell: { cellId: 'c1', chooserId: participantIds[0]! } }] }).where(eq(game.id, gameId));
    const replay = await gameReplay(db, gameId);
    if (replay === null || replay === 'running') throw new Error('no replay');
    expect(replay.rounds).toEqual([{ title: '', type: 'board' }]);
    expect(replay.steps[0]).toMatchObject({ price: single.points, multiplier: 2 });
    expect(replay.steps[0].rows[0]).toMatchObject({ nickname: 'Анна', timeMs: 3000, verdict: 'correct', points: 2000 });
    expect(scoresOf(replay, 0)).toEqual([['Анна', 2000]]);
  });

  it('a broken snapshot still gives steps', async () => {
    const { gameId } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2026-11-02T10:00:00Z'),
      snapshot: {},
      questionsPlayed: 2,
      plays: [
        { roundIndex: 0, questionId: 'q1' },
        { roundIndex: 0, questionId: 'q2' },
      ],
      players: [{ userId: null, nickname: 'Богдан', score: 1000, rank: 1, rows: [{ questionIndex: 1, accepted: true, points: 1000, payload: right, timeMs: 2500 }] }],
    });
    const replay = await gameReplay(db, gameId);
    if (replay === null || replay === 'running') throw new Error('no replay');
    expect(replay.rounds).toEqual([]);
    expect(replay.steps.map((s) => [s.question, s.price])).toEqual([
      [null, 0],
      [null, 0],
    ]);
    expect(replay.steps[0].rows).toMatchObject([{ nickname: 'Богдан', verdict: 'none', timeMs: null }]);
    expect(replay.steps[1].rows).toMatchObject([{ nickname: 'Богдан', verdict: 'correct', timeMs: 2500, points: 1000 }]);
    expect(scoresOf(replay, 1)).toEqual([['Богдан', 1000]]);
  });

  it('a running game is not replayed', async () => {
    const { gameId } = await seedGame(db, { hostId: HOST, status: 'running', startedAt: new Date('2026-11-03T10:00:00Z'), players: [] });
    expect(await gameReplay(db, gameId)).toBe('running');
    expect(await gameReplay(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await gameReplay(db, 'abc')).toBeNull();
  });
});
