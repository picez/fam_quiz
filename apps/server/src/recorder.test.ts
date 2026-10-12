import { asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { Db } from './db/client';
import { answer, game, participant, user } from './db/schema';
import { attachRecorder, markInterrupted } from './recorder';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

const HOST = 'host-user';
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

async function setup(database?: Db) {
  const db = database ?? (await createTestDb());
  if (database === undefined) {
    await db.insert(user).values([
      { id: HOST, name: 'Ведуча', email: 'host@example.com' },
      { id: 'olena-user', name: 'Олена', email: 'olena@example.com' },
    ]);
  }
  const manager = new RoomManager(new FakeScheduler(), () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error));
  const room = manager.create(makeQuiz([single, text], { speedBonus: false }), HOST, null);
  const enter = (nickname: string, userId: string | null = null) => {
    const joined = manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olena = enter('Олена', 'olena-user');
  const taras = enter('Тарас');
  const host = (type: 'start' | 'lock' | 'next' | 'end') => expect(manager.host(room, { type })).toEqual({ ok: true });
  const saved = async () => {
    await recorder.idle();
    return {
      games: await db.select().from(game),
      participants: await db.select().from(participant).orderBy(asc(participant.nickname)),
      answers: await db.select().from(answer).orderBy(asc(answer.questionIndex), asc(answer.points)),
    };
  };
  return { db, manager, recorder, room, olena, taras, host, saved, errors };
}

/** Перше запитання: Олена відповідає правильно, Тарас ні; запитання закривається само. */
function playFirstQuestion(ctx: { manager: RoomManager; room: Room; olena: string; taras: string }) {
  ctx.manager.answer(ctx.room, ctx.olena, correct);
  ctx.manager.answer(ctx.room, ctx.taras, wrong);
}

describe('recorder', () => {
  it('saves nothing while the game is in the lobby', async () => {
    const ctx = await setup();
    expect((await ctx.saved()).games).toEqual([]);
  });

  it('saves the game and its players when it starts', async () => {
    const ctx = await setup();
    ctx.host('start');
    const { games, participants, answers } = await ctx.saved();
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      id: ctx.room.id,
      hostId: HOST,
      code: ctx.room.code,
      status: 'running',
      title: 'Тестова вікторина',
      questionsPlayed: 0,
      finishedAt: null,
    });
    expect(games[0].quizSnapshot.questions).toHaveLength(2);
    expect(participants.map((p) => [p.nickname, p.userId, p.score, p.rank])).toEqual([
      ['Олена', 'olena-user', 0, null],
      ['Тарас', null, 0, null],
    ]);
    expect(answers).toEqual([]);
  });

  it('saves answers and scores once a question is closed, not on every answer', async () => {
    const ctx = await setup();
    ctx.host('start');
    await ctx.recorder.idle();
    const writes = vi.spyOn(ctx.db, 'transaction');

    ctx.manager.answer(ctx.room, ctx.olena, correct);
    await ctx.recorder.idle();
    expect(writes).not.toHaveBeenCalled();

    ctx.manager.answer(ctx.room, ctx.taras, wrong);
    const { games, participants, answers } = await ctx.saved();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(games[0].questionsPlayed).toBe(1);
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([
      ['Олена', 1000],
      ['Тарас', 0],
    ]);
    expect(answers.map((a) => [a.questionIndex, a.accepted, a.points, a.overridden, a.payload])).toEqual([
      [0, false, 0, false, wrong],
      [0, true, 1000, false, correct],
    ]);
  });

  it('saves a manual change of a grade', async () => {
    const ctx = await setup();
    ctx.host('start');
    playFirstQuestion(ctx);
    ctx.host('next');
    expect(ctx.manager.host(ctx.room, { type: 'override', playerId: ctx.taras, accepted: true })).toEqual({ ok: true });

    const { participants, answers } = await ctx.saved();
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([
      ['Олена', 1000],
      ['Тарас', 1000],
    ]);
    expect(answers.filter((a) => a.participantId === ctx.taras)).toMatchObject([{ accepted: true, points: 1000, overridden: true }]);
  });

  it('saves the final places when the game ends', async () => {
    const ctx = await setup();
    ctx.host('start');
    playFirstQuestion(ctx);
    ctx.host('next');
    ctx.host('next');
    ctx.host('next');
    ctx.manager.answer(ctx.room, ctx.olena, { type: 'text', value: 'одеса' });
    ctx.host('lock');
    ctx.host('next');
    ctx.host('next');

    const { games, participants, answers } = await ctx.saved();
    expect(games[0]).toMatchObject({ status: 'finished', questionsPlayed: 2 });
    expect(games[0].finishedAt).toBeInstanceOf(Date);
    expect(participants.map((p) => [p.nickname, p.score, p.rank])).toEqual([
      ['Олена', 2000, 1],
      ['Тарас', 0, 2],
    ]);
    expect(answers.map((a) => a.questionIndex)).toEqual([0, 0, 1]);
  });

  it('drops a removed player and their answers from the saved game', async () => {
    const ctx = await setup();
    ctx.host('start');
    playFirstQuestion(ctx);
    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.taras })).toEqual({ ok: true });

    const { participants, answers } = await ctx.saved();
    expect(participants.map((p) => p.nickname)).toEqual(['Олена']);
    expect(answers.map((a) => a.participantId)).toEqual([ctx.olena]);
  });

  it('does not record a game that has no host account', async () => {
    const ctx = await setup();
    const anonymous = ctx.manager.create(makeQuiz([single]));
    ctx.manager.join(anonymous.code, 'Гість');
    expect(ctx.manager.host(anonymous, { type: 'start' })).toEqual({ ok: true });
    expect((await ctx.saved()).games).toEqual([]);
  });

  it('keeps the game going when the database fails and catches up on the next save', async () => {
    const ctx = await setup();
    ctx.host('start');
    await ctx.recorder.idle();

    const transaction = vi.spyOn(ctx.db, 'transaction').mockRejectedValueOnce(new Error('database is down'));
    playFirstQuestion(ctx);
    await ctx.recorder.idle();
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.room.state.phase).toBe('locked');
    transaction.mockRestore();

    ctx.host('next');
    const { games, answers } = await ctx.saved();
    expect(games[0].questionsPlayed).toBe(1);
    expect(answers).toHaveLength(2);
    expect(ctx.errors).toHaveLength(1);
  });
});

describe('markInterrupted', () => {
  it('marks games left running by a previous server process as aborted', async () => {
    const ctx = await setup();
    ctx.host('start');
    await ctx.recorder.idle();

    const finished = await setup(ctx.db);
    finished.host('start');
    finished.host('end');
    await finished.recorder.idle();

    await markInterrupted(ctx.db);
    const [running] = await ctx.db.select().from(game).where(eq(game.id, ctx.room.id));
    const [done] = await ctx.db.select().from(game).where(eq(game.id, finished.room.id));
    expect(running.status).toBe('aborted');
    expect(running.finishedAt).toBeInstanceOf(Date);
    expect(done.status).toBe('finished');
  });
});
