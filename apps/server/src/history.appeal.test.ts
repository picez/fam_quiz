import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { castAppealVote, factInput, openAppeal } from '@quiz/engine';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { factTable, gameAwards, gameCard } from '@quiz/shared';
import { answer, appeal, participant, scoreAdjustment, user } from './db/schema';
import { hostGame, hostGameWithFacts } from './history';
import { attachRecorder } from './recorder';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';
import { toEnd, toQuestion } from './testing/team-game';

const HOST = 'appeal-host';
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

async function soloGame() {
  const db = await createTestDb();
  await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'appeal-host@example.com' });
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error));
  const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false })]);
  const room = manager.create(quiz, HOST, null);
  const enter = (nickname: string) => {
    const joined = manager.join(room.code, nickname, null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olya = enter('Оля');
  const petro = enter('Петро');
  const ira = enter('Іра');
  const host = (action: Parameters<RoomManager['host']>[1]) => expect(manager.host(room, action)).toEqual({ ok: true });
  return { db, scheduler, manager, recorder, errors, room, olya, petro, ira, host };
}

/** Людина оскаржує на розкритті, виборці голосують; рушій сам ухвалює рішення, коли проголосували всі (менеджерного методу ще немає). */
function appealWith(manager: RoomManager, room: Room, by: string, reason: 'grade' | 'away', votes: [string, boolean][]): void {
  const commit = (state: Room['state']) => (manager as unknown as { commit(room: Room, state: Room['state']): void }).commit(room, state);
  const opened = openAppeal(room.state, by, reason, 0);
  if (!opened.ok) throw new Error(opened.error);
  commit(opened.state);
  const id = room.state.appeals?.at(-1)?.id ?? -1;
  for (const [voter, yes] of votes) {
    const cast = castAppealVote(room.state, voter, id, yes, 0);
    if (!cast.ok) throw new Error(cast.error);
    commit(cast.state);
  }
}

/** Σ answer.points + Σ score_adjustment.points = participant.score у кожного учасника. */
async function expectRowsSumToScore(db: Awaited<ReturnType<typeof soloGame>>['db']) {
  const rows = await db.select().from(answer);
  const adjustments = await db.select().from(scoreAdjustment);
  const people = await db.select().from(participant);
  expect(people.length).toBeGreaterThan(0);
  for (const p of people) {
    const sum = rows.filter((r) => r.participantId === p.id).reduce((s, r) => s + r.points, 0) + adjustments.filter((a) => a.participantId === p.id).reduce((s, a) => s + a.points, 0);
    expect(sum).toBe(p.score);
  }
}

describe('history: appeal (12f)', () => {
  it('stores the counts and the decision, never a voter; the history shows the appeal beside the answer and the adjustment gets its breakdown line', async () => {
    const { db, manager, recorder, errors, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    manager.answer(room, olya, wrong);
    manager.answer(room, petro, right);
    manager.answer(room, ira, right);
    host({ type: 'next' }); // reveal
    appealWith(manager, room, olya, 'grade', [[petro, true], [ira, true]]);
    expect(room.state.appeals?.[0]).toMatchObject({ outcome: 'yes' });
    toEnd(manager, room);
    await recorder.idle();
    expect(errors).toEqual([]);

    const stored = await db.select().from(appeal);
    expect(stored).toEqual([{ gameId: room.id, seq: 1, participantId: olya, questionIndex: 0, reason: 'grade', yes: 2, no: 0, outcome: 'yes', adjustmentSeq: expect.any(Number) }]);
    expect(Object.keys(stored[0]).sort()).toEqual(['adjustmentSeq', 'gameId', 'no', 'outcome', 'participantId', 'questionIndex', 'reason', 'seq', 'yes']);

    const detail = await hostGame(db, HOST, room.id);
    const first = detail?.questions[0].responses ?? [];
    expect(first.find((r) => r.nickname === 'Оля')?.appeal).toEqual({ reason: 'grade', yes: 2, no: 0, outcome: 'yes' });
    expect(first.find((r) => r.nickname === 'Петро')?.appeal).toBeNull();
    expect(detail?.questions[1].responses.every((r) => r.appeal === null)).toBe(true);
    const adjustment = detail?.adjustments.find((a) => a.source === 'appeal');
    expect(adjustment).toMatchObject({ nickname: 'Оля', points: 1000 });
    expect(detail?.standings.find((s) => s.nickname === 'Оля')?.breakdown.parts.find((p) => p.source === 'appeal')).toEqual({ source: 'appeal', plus: 1000, minus: 0 });
    await expectRowsSumToScore(db);
  });

  it('a tie keeps the result: the history shows it and there is no adjustment', async () => {
    const { db, manager, recorder, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    manager.answer(room, olya, wrong);
    manager.answer(room, petro, right);
    manager.answer(room, ira, right);
    host({ type: 'next' });
    appealWith(manager, room, olya, 'grade', [[petro, true], [ira, false]]);
    toEnd(manager, room);
    await recorder.idle();
    const detail = await hostGame(db, HOST, room.id);
    expect(detail?.questions[0].responses.find((r) => r.nickname === 'Оля')?.appeal).toEqual({ reason: 'grade', yes: 1, no: 1, outcome: 'tie' });
    expect(detail?.adjustments.filter((a) => a.source === 'appeal')).toEqual([]);
    expect((await db.select().from(appeal))[0]).toMatchObject({ outcome: 'tie', adjustmentSeq: null });
    await expectRowsSumToScore(db);
  });

  it('the stored rows still sum to the score after an appeal and after its undo', async () => {
    const { db, manager, recorder, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    manager.answer(room, olya, wrong);
    manager.answer(room, petro, right);
    manager.answer(room, ira, right);
    host({ type: 'next' });
    appealWith(manager, room, olya, 'grade', [[petro, true], [ira, true]]);
    await recorder.idle();
    await expectRowsSumToScore(db);
    const row = room.state.adjustments.find((a) => a.source === 'appeal');
    expect(row).toBeDefined();
    host({ type: 'next' }); // the question is closed: the appeal row is visible and can be undone
    expect(manager.host(room, { type: 'undo', target: { seq: row?.seq ?? -1 } })).toEqual({ ok: true });
    await recorder.idle();
    await expectRowsSumToScore(db);
    const adjustments = await db.select().from(scoreAdjustment);
    expect(adjustments.map((a) => a.source).sort()).toEqual(['appeal', 'undo']);
    expect(room.state.players.find((p) => p.id === olya)?.score).toBe(0);
  });

  it('the awards and the table of the history equal those of the game, with won and lost appeals', async () => {
    const { db, manager, recorder, room, olya, petro, ira, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    for (const id of [olya, petro, ira]) manager.answer(room, id, id === olya ? wrong : right);
    host({ type: 'next' });
    appealWith(manager, room, olya, 'grade', [[petro, true], [ira, true]]);
    host({ type: 'next' });
    toQuestion(manager, room);
    for (const id of [olya, petro, ira]) manager.answer(room, id, id === olya ? wrong : right);
    host({ type: 'next' });
    appealWith(manager, room, olya, 'grade', [[petro, false], [ira, false]]);
    toEnd(manager, room);
    await recorder.idle();
    const live = factInput(room.state);
    expect(live.appeals).toEqual([
      { playerId: olya, outcome: 'yes' },
      { playerId: olya, outcome: 'no' },
    ]);
    const stored = await hostGameWithFacts(db, HOST, room.id);
    expect(stored?.factInput.appeals).toEqual(live.appeals);
    expect(stored?.detail.facts.awards).toEqual(gameAwards(live));
    expect(stored?.detail.facts.table).toEqual(factTable(live));
    expect(gameCard(stored?.factInput ?? live, olya)?.appeals).toEqual({ won: 1, lost: 1 });
  });

  it('an old game without appeals reads appeal as null everywhere', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'appeal-host@example.com' });
    const { gameId } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date(2026, 0, 3),
      players: [{ userId: null, nickname: 'Тарас', score: 1000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000 }] }],
    });
    const detail = await hostGame(db, HOST, gameId);
    expect(detail?.questions[0].responses.map((r) => r.appeal)).toEqual([null]);
    expect(await db.select().from(appeal).where(eq(appeal.gameId, gameId))).toEqual([]);
  });
});
