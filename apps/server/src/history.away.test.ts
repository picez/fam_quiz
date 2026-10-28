import { describe, expect, it } from 'vitest';
import { defaultTeams } from '@quiz/shared';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { answer, participant, scoreAdjustment, user } from './db/schema';
import { hostGame } from './history';
import { attachRecorder } from './recorder';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import { seedGame } from './testing/history-rows';
import { recordedTeamGame, toEnd, toQuestion } from './testing/team-game';

const HOST = 'away-host';
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

/** Людина виходить із гри на ms мс через player:away (годинник менеджера). */
function leave(manager: RoomManager, scheduler: FakeScheduler, room: Room, personId: string, ms: number): void {
  expect(manager.away(room, personId, true)).toEqual({ ok: true });
  scheduler.advance(ms);
  expect(manager.away(room, personId, false, { ms })).toEqual({ ok: true });
}

async function soloGame() {
  const db = await createTestDb();
  await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'away-host@example.com' });
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error));
  const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false })], { awayPenalty: true });
  const room = manager.create(quiz, HOST, null);
  const enter = (nickname: string) => {
    const joined = manager.join(room.code, nickname, null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olya = enter('Оля');
  const petro = enter('Петро');
  const host = (action: Parameters<RoomManager['host']>[1]) => expect(manager.host(room, action)).toEqual({ ok: true });
  return { db, scheduler, manager, recorder, errors, room, olya, petro, host };
}

describe('history: away (12e)', () => {
  it('stores the time away from the marker threshold, shows it in the history, and the penalty is a stored adjustment that sums with the rows', async () => {
    const { db, scheduler, manager, recorder, errors, room, olya, petro, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    leave(manager, scheduler, room, olya, 3500);
    leave(manager, scheduler, room, petro, 1500);
    manager.answer(room, olya, right);
    manager.answer(room, petro, right);
    expect(room.state.phase).toBe('locked');
    host({ type: 'next' }); // reveal
    host({ type: 'next' }); // the penalty is final on leaving the reveal
    await recorder.idle();
    expect(errors).toEqual([]);

    const penalty = room.state.adjustments.find((a) => a.source === 'away');
    expect(penalty).toMatchObject({ playerId: olya, points: -1000 });
    const rows = await db.select().from(answer);
    expect(rows.find((r) => r.participantId === olya)?.awayMs).toBe(3500);
    expect(rows.find((r) => r.participantId === petro)?.awayMs).toBeNull();

    const sums = async () => {
      const people = await db.select().from(participant);
      const adjustments = await db.select().from(scoreAdjustment);
      return people.map((p) => [p.id, rows.filter((r) => r.participantId === p.id).reduce((s, r) => s + r.points, 0) + adjustments.filter((a) => a.participantId === p.id).reduce((s, a) => s + a.points, 0), p.score]);
    };
    for (const [, sum, score] of await sums()) expect(sum).toBe(score);

    toEnd(manager, room);
    await recorder.idle();
    const detail = await hostGame(db, HOST, room.id);
    const first = detail?.questions[0].responses ?? [];
    expect(first.find((r) => r.nickname === 'Оля')?.awayMs).toBe(3500);
    expect(first.find((r) => r.nickname === 'Петро')?.awayMs).toBeNull();
    expect(detail?.adjustments).toEqual([expect.objectContaining({ nickname: 'Оля', points: -1000, source: 'away' })]);
    expect(detail?.standings.find((s) => s.nickname === 'Оля')?.breakdown.parts.find((p) => p.source === 'away')).toEqual({ source: 'away', plus: 0, minus: -1000 });
  });

  it('undoing the away penalty keeps the stored rows summing to the score', async () => {
    const { db, scheduler, manager, recorder, room, olya, petro, host } = await soloGame();
    host({ type: 'start' });
    toQuestion(manager, room);
    leave(manager, scheduler, room, olya, 4000);
    manager.answer(room, olya, right);
    manager.answer(room, petro, wrong);
    host({ type: 'next' });
    host({ type: 'next' });
    const penalty = room.state.adjustments.find((a) => a.source === 'away');
    expect(penalty).toBeDefined();
    expect(manager.host(room, { type: 'undo', target: { seq: penalty?.seq ?? -1 } })).toEqual({ ok: true });
    await recorder.idle();
    const rows = await db.select().from(answer);
    const adjustments = await db.select().from(scoreAdjustment);
    for (const p of await db.select().from(participant)) {
      const sum = rows.filter((r) => r.participantId === p.id).reduce((s, r) => s + r.points, 0) + adjustments.filter((a) => a.participantId === p.id).reduce((s, a) => s + a.points, 0);
      expect(sum).toBe(p.score);
    }
    expect(adjustments.map((a) => a.source).sort()).toEqual(['away', 'undo']);
  });

  it('a team row keeps the longest time among its people', async () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single], { speedBonus: false })], { teams: defaultTeams(2) });
    const ctx = await recordedTeamGame(quiz);
    ctx.manager.host(ctx.room, { type: 'start' });
    toQuestion(ctx.manager, ctx.room);
    // Обоє з Червоних виходять разом: Оля на 2500 мс, Петро на 6100 мс.
    expect(ctx.manager.away(ctx.room, ctx.members.Оля, true)).toEqual({ ok: true });
    expect(ctx.manager.away(ctx.room, ctx.members.Петро, true)).toEqual({ ok: true });
    ctx.scheduler.advance(2500);
    expect(ctx.manager.away(ctx.room, ctx.members.Оля, false, { ms: 2500 })).toEqual({ ok: true });
    ctx.scheduler.advance(3600);
    expect(ctx.manager.away(ctx.room, ctx.members.Петро, false, { ms: 6100 })).toEqual({ ok: true });
    ctx.manager.answer(ctx.room, ctx.members.Оля, right);
    ctx.manager.answer(ctx.room, ctx.members.Віра, right);
    toEnd(ctx.manager, ctx.room);
    await ctx.recorder.idle();
    expect(ctx.errors).toEqual([]);
    const rows = await ctx.db.select().from(answer);
    const byParticipant = new Map(rows.map((r) => [r.participantId, r.awayMs]));
    expect(byParticipant.get(ctx.teams[0])).toBe(6100);
    expect(byParticipant.get(ctx.teams[1])).toBeNull();
  });

  it('an old game without away_ms reads as null', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'away-host@example.com' });
    const { gameId } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date(2026, 0, 3),
      players: [{ userId: null, nickname: 'Тарас', score: 1000, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 1000 }] }],
    });
    const detail = await hostGame(db, HOST, gameId);
    expect(detail?.questions[0].responses.map((r) => r.awayMs)).toEqual([null]);
  });
});
