import { asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { blitzRound, boardRound, bool, chain, classicRound, duels, finalRound, makeQuiz, makeRoundsQuiz, numeric, single, text, withId } from '@quiz/engine/testing';
import type { Db } from './db/client';
import { answer, game, participant, scoreAdjustment, user } from './db/schema';
import { attachRecorder, markInterrupted } from './recorder';
import { FINISHED_TTL_MS, RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { playToEnd } from './testing/final-game';
import { createTestDb } from './testing/test-db';

const HOST = 'host-user';
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

async function setup(database?: Db, retryMs = 5000, maxRetries = 30) {
  const db = database ?? (await createTestDb());
  if (database === undefined) {
    await db.insert(user).values([
      { id: HOST, name: 'Ведуча', email: 'host@example.com' },
      { id: 'olena-user', name: 'Олена', email: 'olena@example.com' },
    ]);
  }
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error), retryMs, maxRetries);
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
  return { db, scheduler, manager, recorder, room, olena, taras, host, saved, errors };
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
    expect(games[0].quizSnapshot).toEqual(ctx.room.state.quiz);
    expect(games[0].plays).toEqual([]);
    expect(participants.map((p) => [p.nickname, p.userId, p.score, p.rank])).toEqual([
      ['Олена', 'olena-user', 0, null],
      ['Тарас', null, 0, null],
    ]);
    expect(answers).toEqual([]);
  });

  it('records a game ended on the first intro without answers', async () => {
    const ctx = await setup();
    ctx.host('start');
    ctx.host('end');
    const { games, answers } = await ctx.saved();
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ status: 'finished', questionsPlayed: 0, plays: [] });
    expect(answers).toEqual([]);
  });

  it('saves answers and scores once a question is closed, not on every answer', async () => {
    const ctx = await setup();
    ctx.host('start');
    ctx.host('next');
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

  it('saves a chain summary as the answer, finished as accepted', async () => {
    const ctx = await setup();
    const room = ctx.manager.create(makeQuiz([chain], { speedBonus: false }), HOST, null);
    const enter = (nickname: string, userId: string | null = null) => {
      const joined = ctx.manager.join(room.code, nickname, userId);
      if (!joined.ok) throw new Error(joined.error);
      ctx.manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const olena = enter('Олена', 'olena-user');
    const taras = enter('Тарас');
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(ctx.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    for (const word of ['Риба', 'Океан', 'Корабель']) ctx.manager.guess(room, olena, word);
    ctx.manager.guess(room, taras, 'Риба');
    expect(ctx.manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    await ctx.recorder.idle();

    const rows = await ctx.db.select().from(answer).orderBy(asc(answer.points));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ accepted: false, points: 0, payload: { type: 'chain', solved: 1, hints: 0 } });
    expect(rows[1]).toMatchObject({ accepted: true, points: 1000, payload: { type: 'chain', solved: 3, hints: 0 } });
    expect((rows[1].payload as { timeMs: number }).timeMs).toEqual(expect.any(Number));
    expect(ctx.errors).toEqual([]);
  });

  it('saves a manual change of a grade', async () => {
    const ctx = await setup();
    ctx.host('start');
    ctx.host('next');
    playFirstQuestion(ctx);
    ctx.host('next');
    expect(ctx.manager.host(ctx.room, { type: 'override', playerId: ctx.taras, grade: 'correct' })).toEqual({ ok: true });

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
    ctx.host('next');
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
    ctx.host('next');
    playFirstQuestion(ctx);
    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.taras })).toEqual({ ok: true });

    const { participants, answers } = await ctx.saved();
    expect(participants.map((p) => p.nickname)).toEqual(['Олена']);
    expect(answers.map((a) => a.participantId)).toEqual([ctx.olena]);
  });

  it('stores host adjustments and keeps the participant score equal to the leaderboard', async () => {
    const ctx = await setup();
    const adjust = (playerId: string, points: number) =>
      expect(ctx.manager.host(ctx.room, { type: 'adjust', playerId, points })).toEqual({ ok: true });
    ctx.host('start');
    adjust(ctx.olena, -100);
    ctx.host('next');
    playFirstQuestion(ctx);
    adjust(ctx.taras, 50);
    ctx.host('end');

    const { participants, answers } = await ctx.saved();
    const adjustments = await ctx.db.select().from(scoreAdjustment).orderBy(asc(scoreAdjustment.seq));
    expect(adjustments.map((a) => [a.participantId, a.seq, a.roundIndex, a.afterQuestion, a.points, a.source])).toEqual([
      [ctx.olena, 1, 0, 0, -100, 'host'],
      [ctx.taras, 2, 0, 1, 50, 'host'],
    ]);
    for (const p of participants) {
      expect(p.score).toBe(ctx.room.state.players.find((player) => player.id === p.id)!.score);
      const sum = (rows: { participantId: string; points: number }[]) =>
        rows.filter((row) => row.participantId === p.id).reduce((total, row) => total + row.points, 0);
      expect(p.score).toBe(sum(answers) + sum(adjustments));
    }
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([
      ['Олена', 900],
      ['Тарас', 50],
    ]);
    expect(ctx.errors).toEqual([]);
  });

  it("a kicked player's adjustments go with the participant", async () => {
    const ctx = await setup();
    ctx.host('start');
    expect(ctx.manager.host(ctx.room, { type: 'adjust', playerId: ctx.olena, points: -100 })).toEqual({ ok: true });
    expect(ctx.manager.host(ctx.room, { type: 'adjust', playerId: ctx.taras, points: 75 })).toEqual({ ok: true });
    await ctx.saved();
    expect(await ctx.db.select().from(scoreAdjustment)).toHaveLength(2);

    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.olena })).toEqual({ ok: true });
    await ctx.saved();
    const rows = await ctx.db.select().from(scoreAdjustment);
    expect(rows.map((row) => [row.participantId, row.points])).toEqual([[ctx.taras, 75]]);
  });

  it('later saves add only the new adjustments, also after the kicked player held the highest seq', async () => {
    const ctx = await setup();
    const adjust = (playerId: string, points: number) =>
      expect(ctx.manager.host(ctx.room, { type: 'adjust', playerId, points })).toEqual({ ok: true });
    ctx.host('start');
    adjust(ctx.olena, -100);
    adjust(ctx.taras, 75);
    await ctx.saved();
    // Тарас мав найбільший seq; після вилучення його рядки зникають, а новий seq 3 Олени все одно записується.
    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.taras })).toEqual({ ok: true });
    adjust(ctx.olena, 40);
    await ctx.saved();
    adjust(ctx.olena, 10);
    ctx.host('next');
    await ctx.saved();
    const rows = await ctx.db.select().from(scoreAdjustment).orderBy(asc(scoreAdjustment.seq));
    expect(rows.map((row) => [row.participantId, row.seq, row.points])).toEqual([
      [ctx.olena, 1, -100],
      [ctx.olena, 3, 40],
      [ctx.olena, 4, 10],
    ]);
    expect(ctx.errors).toEqual([]);
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
    ctx.host('next');
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

describe('recorder: when saving fails', () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const down = (db: Db) => vi.spyOn(db, 'transaction');

  it('writes every missed question once the database is back after a longer outage', async () => {
    const ctx = await setup();
    ctx.host('start');
    ctx.host('next');
    await ctx.recorder.idle();

    const outage = down(ctx.db).mockRejectedValue(new Error('database is down'));
    playFirstQuestion(ctx);
    ctx.host('next');
    ctx.host('next');
    ctx.host('next');
    ctx.manager.answer(ctx.room, ctx.olena, { type: 'text', value: 'одеса' });
    ctx.host('lock');
    await ctx.recorder.idle();
    expect(ctx.errors.length).toBeGreaterThan(0);
    outage.mockRestore();

    ctx.host('next');
    const { games, answers } = await ctx.saved();
    expect(games[0].questionsPlayed).toBe(2);
    expect(answers.map((a) => [a.questionIndex, a.points])).toEqual([
      [0, 0],
      [0, 1000],
      [1, 1000],
    ]);
  });

  it('tries again by itself when nothing else happens in the room', async () => {
    const ctx = await setup(undefined, 10);
    ctx.host('start');
    ctx.host('next');
    await ctx.recorder.idle();

    down(ctx.db).mockRejectedValueOnce(new Error('database is down'));
    playFirstQuestion(ctx);
    await ctx.recorder.idle();
    expect(ctx.errors).toHaveLength(1);
    expect((await ctx.saved()).answers).toEqual([]);

    await wait(80);
    const { games, answers } = await ctx.saved();
    expect(games[0].questionsPlayed).toBe(1);
    expect(answers).toHaveLength(2);
  });

  it('still saves the final result when the last save failed and the room has since closed', async () => {
    const ctx = await setup(undefined, 10);
    ctx.host('start');
    ctx.host('next');
    playFirstQuestion(ctx);
    ctx.host('next');
    await ctx.recorder.idle();

    down(ctx.db).mockRejectedValueOnce(new Error('database is down'));
    ctx.host('end');
    await ctx.recorder.idle();
    ctx.scheduler.advance(FINISHED_TTL_MS);
    expect(ctx.manager.get(ctx.room.code)).toBeUndefined();

    await wait(80);
    const { games, participants } = await ctx.saved();
    expect(games[0].status).toBe('finished');
    expect(games[0].finishedAt).toBeInstanceOf(Date);
    expect(participants.map((p) => [p.nickname, p.rank])).toEqual([
      ['Олена', 1],
      ['Тарас', 2],
    ]);
  });

  it('gives up quietly after repeated failures instead of retrying forever', async () => {
    const ctx = await setup(undefined, 1, 4);
    ctx.host('start');
    ctx.host('next');
    await ctx.recorder.idle();
    const outage = down(ctx.db).mockRejectedValue(new Error('database is down'));
    playFirstQuestion(ctx);
    await wait(200);
    await ctx.recorder.idle();
    // Перша спроба й чотири повтори; далі рекордер здається.
    expect(outage.mock.calls.length).toBe(5);
    expect(ctx.room.state.phase).toBe('locked');
  });
});

describe('recorder: manual decisions', () => {
  it('saves a decision that leaves the score unchanged', async () => {
    const ctx = await setup();
    ctx.host('start');
    ctx.host('next');
    playFirstQuestion(ctx);
    ctx.host('next');
    await ctx.recorder.idle();

    expect(ctx.manager.host(ctx.room, { type: 'override', playerId: ctx.taras, grade: 'wrong' })).toEqual({ ok: true });
    const { answers } = await ctx.saved();
    expect(answers.filter((a) => a.participantId === ctx.taras)).toMatchObject([
      { accepted: false, points: 0, overridden: true },
    ]);
  });
});

describe('recorder: rounds', () => {
  it('saves only the questions played, with their rounds, streak bonuses and penalties', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const risky = { penalty: 'minus', partial: null, streak: { length: 2, bonus: { kind: 'fixed', value: 100 } }, multiplier: 1 } as const;
    const quiz = makeRoundsQuiz([
      classicRound('r1', [single, text], { speedBonus: false }),
      classicRound('r2', [bool, numeric], { speedBonus: false, rules: risky }),
    ]);
    const room = manager.create(quiz, HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const olena = enter('Олена');
    const taras = enter('Тарас');
    const host = (type: 'start' | 'next' | 'end-round') => expect(manager.host(room, { type })).toEqual({ ok: true });

    host('start');
    host('next');
    manager.answer(room, olena, correct);
    manager.answer(room, taras, wrong);
    // Друге запитання першого раунду так і не зіграно.
    host('end-round');
    host('next');
    host('next');
    manager.answer(room, olena, { type: 'boolean', value: true });
    manager.answer(room, taras, { type: 'boolean', value: false });
    host('next');
    host('next');
    host('next');
    manager.answer(room, olena, { type: 'numeric', value: 2061 });
    manager.answer(room, taras, { type: 'numeric', value: 1 });
    host('next');
    host('next');
    expect(room.state.phase).toBe('finished');
    await recorder.idle();

    const [saved] = await db.select().from(game);
    expect(saved).toMatchObject({ status: 'finished', questionsPlayed: 3 });
    expect(saved.plays).toEqual([
      { roundIndex: 0, questionId: single.id },
      { roundIndex: 1, questionId: bool.id },
      { roundIndex: 1, questionId: numeric.id },
    ]);
    const participants = await db.select().from(participant).orderBy(asc(participant.nickname));
    expect(participants.map((p) => [p.nickname, p.score, p.rank])).toEqual([
      ['Олена', 3100, 1],
      ['Тарас', -2000, 2],
    ]);
    const answers = await db.select().from(answer).orderBy(asc(answer.questionIndex), asc(answer.points));
    expect(answers.map((a) => [a.questionIndex, a.roundIndex, a.points, a.streakBonus])).toEqual([
      [0, 0, 0, 0],
      [0, 0, 1000, 0],
      [1, 1, -1000, 0],
      [1, 1, 1000, 0],
      [2, 1, -1000, 0],
      [2, 1, 1100, 100],
    ]);
  });
});

describe('recorder: blitz', () => {
  async function blitzSetup(options: Parameters<typeof blitzRound>[2]) {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const recorder = attachRecorder(manager, db);
    const room = manager.create(makeRoundsQuiz([blitzRound('b1', [single, text], options)]), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const olena = enter('Олена');
    const taras = enter('Тарас');
    const ira = enter('Іра');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    const answers = async () => {
      await recorder.idle();
      return db.select().from(answer).orderBy(asc(answer.questionIndex), asc(answer.attempt), asc(answer.timeMs));
    };
    const participants = async () => {
      await recorder.idle();
      return db.select().from(participant);
    };
    return { scheduler, manager, room, olena, taras, ira, answers, participants };
  }

  it('an instant blitz records one row per checked answer with its own time; unchecked answers are not recorded', async () => {
    const { scheduler, manager, room, olena, taras, ira, answers, participants } = await blitzSetup({});
    scheduler.advance(1000);
    expect(manager.answer(room, olena, wrong)).toEqual({ ok: true });
    scheduler.advance(1000);
    expect(manager.answer(room, taras, correct)).toEqual({ ok: true });
    scheduler.advance(500);
    expect(manager.answer(room, ira, correct)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'accept', playerId: olena })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'accept', playerId: taras })).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');

    const rows = await answers();
    expect(rows.map((a) => [a.participantId, a.attempt, a.timeMs, a.accepted])).toEqual([
      [olena, 0, 1000, false],
      [taras, 0, 2000, true],
    ]);
    const scores = Object.fromEntries((await participants()).map((p) => [p.nickname, p.score]));
    expect(scores).toEqual({ Олена: 0, Тарас: 1000, Іра: 0 });
    expect(rows.find((a) => a.participantId === taras)?.points).toBe(scores['Тарас']);
  });

  it('each blitz attempt is stored as its own row', async () => {
    const risky = { penalty: 'minus', partial: null, streak: null, multiplier: 1 } as const;
    const { manager, room, olena, answers } = await blitzSetup({ attempts: 2, check: 'manual', rules: risky });
    expect(manager.buzz(room, olena)).toEqual({ ok: true });
    expect(manager.answer(room, olena, wrong)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'judge', playerId: olena, correct: false })).toEqual({ ok: true });
    expect(manager.buzz(room, olena)).toEqual({ ok: true });
    expect(manager.answer(room, olena, correct)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'judge', playerId: olena, correct: true })).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');

    const rows = await answers();
    expect(rows.map((a) => [a.participantId, a.questionIndex, a.attempt, a.payload, a.accepted, a.points, a.streakBonus, a.overridden])).toEqual([
      [olena, 0, 0, wrong, false, -1000, 0, false],
      [olena, 0, 1, correct, true, 1000, 0, false],
    ]);
  });

  it('a missed blitz window is stored with an empty payload', async () => {
    const { scheduler, manager, room, olena, answers } = await blitzSetup({ answerWindow: 5, check: 'manual' });
    expect(manager.buzz(room, olena)).toEqual({ ok: true });
    scheduler.advance(5000);
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });

    const rows = await answers();
    expect(rows.map((a) => [a.participantId, a.attempt, a.payload, a.accepted, a.points])).toEqual([[olena, 0, null, false, 0]]);
  });

  it('adds the streak bonus to the winning attempt only', async () => {
    const streaky = { penalty: 'minus', partial: null, streak: { length: 2, bonus: { kind: 'fixed', value: 100 } }, multiplier: 1 } as const;
    const { manager, room, olena, answers } = await blitzSetup({ attempts: 2, check: 'manual', rules: streaky });
    manager.buzz(room, olena);
    manager.answer(room, olena, correct);
    manager.host(room, { type: 'judge', playerId: olena, correct: true });
    while (room.state.phase !== 'question') expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    manager.buzz(room, olena);
    manager.answer(room, olena, { type: 'text', value: 'Львів' });
    manager.host(room, { type: 'judge', playerId: olena, correct: false });
    manager.buzz(room, olena);
    manager.answer(room, olena, { type: 'text', value: 'Одеса' });
    manager.host(room, { type: 'judge', playerId: olena, correct: true });
    expect(room.state.phase).toBe('locked');

    const rows = await answers();
    expect(rows.map((a) => [a.questionIndex, a.attempt, a.accepted, a.points, a.streakBonus])).toEqual([
      [0, 0, true, 1000, 0],
      [1, 0, false, -1000, 0],
      [1, 1, true, 1100, 100],
    ]);
  });
});

describe('recorder: board', () => {
  const cell = (id: string, points: number, timeLimit = 30) => ({ ...withId(single, id), points, timeLimit });

  async function boardSetup(round: ReturnType<typeof boardRound>) {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const recorder = attachRecorder(manager, db);
    const room = manager.create(makeRoundsQuiz([round]), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const olena = enter('Олена');
    const taras = enter('Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    const saved = async () => {
      await recorder.idle();
      return { games: await db.select().from(game), answers: await db.select().from(answer).orderBy(asc(answer.questionIndex)) };
    };
    return { scheduler, manager, room, olena, taras, saved };
  }

  it('a board question is stored with its cell and chooser', async () => {
    const round = boardRound('g1', [{ title: 'Міста', cells: [{ mark: 'x2', question: cell('c11', 100) }, cell('c12', 200)] }]);
    const { manager, room, olena, saved } = await boardSetup(round);
    expect(manager.pick(room, olena, 'c11')).toEqual({ ok: true });
    expect(manager.answer(room, olena, correct)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'accept', playerId: olena })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');

    const { games, answers } = await saved();
    expect(games[0].plays).toEqual([{ roundIndex: 0, questionId: 'c11', cell: { cellId: 'c11', chooserId: olena } }]);
    expect(answers.map((a) => [a.participantId, a.questionIndex, a.attempt, a.accepted, a.points])).toEqual([[olena, 0, 0, true, 200]]);
  });

  it('a grade given at the reveal of a board question is saved', async () => {
    const minus = { penalty: 'minus', partial: null, streak: null, multiplier: 1 } as const;
    const round = boardRound('g1', [{ title: 'Міста', cells: [cell('c11', 100, 10), cell('c12', 200)] }], { rules: minus });
    const { scheduler, manager, room, olena, saved } = await boardSetup(round);
    expect(manager.pick(room, olena, 'c11')).toEqual({ ok: true });
    scheduler.advance(10_000);
    expect(room.state.phase).toBe('locked');
    expect((await saved()).answers).toEqual([]);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');

    const { answers } = await saved();
    expect(answers.map((a) => [a.participantId, a.accepted, a.points])).toEqual([[olena, false, -100]]);
  });

  it('a blitz cell records every attempt and one penalty row', async () => {
    const cells = [{ question: cell('c11', 100), kind: 'blitz' as const, mark: 'x2' as const, penalty: 'all' as const }, cell('c12', 200)];
    // Ручна перевірка: бліц з кнопкою дає кілька спроб одному гравцеві.
    const round = boardRound('g1', [{ title: 'Міста', cells }], { check: 'manual' });
    const { manager, room, olena, taras, saved } = await boardSetup(round);
    expect(manager.pick(room, olena, 'c11')).toEqual({ ok: true });
    // Тарас відповідає неправильно, потім правильно; Олена, що вибрала, лише платить.
    for (const answerGiven of [wrong, correct]) {
      expect(manager.buzz(room, taras)).toEqual({ ok: true });
      expect(manager.answer(room, taras, answerGiven)).toEqual({ ok: true });
      expect(manager.host(room, { type: 'judge', playerId: taras, correct: answerGiven === correct })).toEqual({ ok: true });
    }
    expect(room.state.phase).toBe('locked');

    const { answers } = await saved();
    expect(answers.map((a) => [a.participantId === taras ? 'taras' : 'olena', a.attempt, a.accepted, a.points])).toEqual(
      expect.arrayContaining([
        ['taras', 0, false, 0],
        ['taras', 1, true, 200],
        ['olena', -1, false, -200],
      ]),
    );
    expect(answers).toHaveLength(3);
  });
  it('a final answer is stored with its signed wager and silence as a points row', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const quiz = makeRoundsQuiz([classicRound('r1', [single], { speedBonus: false }), finalRound('f', withId(single, 'f1'))]);
    const room = manager.create(quiz, HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const p1 = enter('Олена');
    const p2 = enter('Тарас');
    const host = (type: 'start' | 'lock' | 'next') => expect(manager.host(room, { type })).toEqual({ ok: true });
    host('start');
    host('next');
    manager.answer(room, p1, correct);
    manager.answer(room, p2, correct);
    for (const phase of ['reveal', 'round_end', 'intro', 'wager']) {
      host('next');
      expect(room.state.phase).toBe(phase);
    }
    expect(manager.wager(room, p1, 300)).toEqual({ ok: true });
    expect(manager.wager(room, p2, 200)).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    expect(manager.wager(room, p1, 5)).toEqual({ ok: false, error: 'wrong_phase' });
    manager.answer(room, p1, correct);
    host('lock');
    host('next');
    expect(room.state.phase).toBe('reveal');

    await recorder.idle();
    const rows = () => db.select().from(answer).where(eq(answer.questionIndex, 1)).orderBy(asc(answer.points));
    expect((await rows()).map((a) => [a.participantId === p1 ? 'p1' : 'p2', a.attempt, a.payload, a.points, a.accepted])).toEqual([
      ['p2', -1, null, -200, false],
      ['p1', 0, correct, 300, true],
    ]);

    expect(manager.host(room, { type: 'override', playerId: p1, grade: 'wrong' })).toEqual({ ok: true });
    await recorder.idle();
    const after = await rows();
    expect(after.find((a) => a.participantId === p1)).toMatchObject({ points: -300, accepted: false, overridden: true });
    const [saved] = await db.select().from(participant).where(eq(participant.id, p1));
    expect(saved.score).toBe(1000 - 300);
  });

  it('the final rows keep the wager, the bank shares are the points', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const quiz = makeRoundsQuiz([classicRound('r1', [single], { speedBonus: false }), finalRound('f', withId(single, 'f1'), { wagerMode: 'bank' })]);
    const room = manager.create(quiz, HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const [olena, hanna, taras, vira] = ['Олена', 'Ганна', 'Тарас', 'Віра'].map(enter);
    const stakes = new Map([[olena, 1000], [hanna, 100], [taras, 400], [vira, 200]]);
    // Олена помиляється, Ганна мовчить: банк 1100 ділиться 400 : 200, залишок — найбільшій ставці.
    playToEnd(manager, room, [olena, hanna, taras, vira], [taras, vira], (id) => stakes.get(id) ?? 0, undefined, [olena]);
    expect(room.state.phase).toBe('finished');
    await recorder.idle();

    const rows = await db.select().from(answer);
    const name = new Map([[olena, 'Олена'], [hanna, 'Ганна'], [taras, 'Тарас'], [vira, 'Віра']]);
    const final = rows.filter((a) => a.questionIndex === 1).map((a) => [name.get(a.participantId), a.wager, a.points]);
    expect(final).toEqual(
      expect.arrayContaining([
        ['Олена', 1000, -1000],
        ['Ганна', 100, -100],
        ['Тарас', 400, 734],
        ['Віра', 200, 366],
      ]),
    );
    expect(final).toHaveLength(4);
    expect(rows.filter((a) => a.questionIndex === 0).map((a) => a.wager)).toEqual([null, null, null, null]);
    for (const saved of await db.select().from(participant)) {
      const sum = rows.filter((a) => a.participantId === saved.id).reduce((total, a) => total + a.points, 0);
      expect(sum).toBe(saved.score);
    }
  });
});

describe('recorder: duels', () => {
  it('duel adjustments are saved with their source', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0);
    const recorder = attachRecorder(manager, db, () => {}, 5000, 30);
    const quiz = {
      ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1'), withId(single, 'q2')]), finalRound('rf', withId(single, 'qf'))]),
      duels,
    };
    const room = manager.create(quiz, HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname, null);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const olena = enter('Олена');
    const taras = enter('Тарас');
    const host = (type: 'start' | 'next') => expect(manager.host(room, { type })).toEqual({ ok: true });
    host('start');
    host('next');
    manager.answer(room, olena, correct);
    manager.answer(room, taras, correct);
    host('next');
    expect(manager.declareDuel(room, olena, taras)).toEqual({ ok: true });
    host('next');
    expect(manager.duelCategory(room, olena, 'dc1')).toEqual({ ok: true });
    // Олена виграє обидва запитання дуелі.
    for (let i = 0; i < 2; i++) {
      const play = room.state.duel?.questions.at(-1);
      const asked = duels.categories[0].questions.find((q) => q.id === play?.questionId);
      expect(manager.duelAnswer(room, olena, asked?.accepted[0] ?? '')).toEqual({ ok: true });
      host('next');
    }
    expect(room.state.duel?.stage).toBe('result');

    await recorder.idle();
    const people = await db.select().from(participant).orderBy(asc(participant.nickname));
    const idOf = (nickname: string) => people.find((p) => p.nickname === nickname)?.id;
    const rows = await db.select().from(scoreAdjustment).orderBy(asc(scoreAdjustment.seq));
    expect(rows.map((a) => [a.participantId, a.points, a.source])).toEqual([
      [idOf('Олена'), 300, 'duel'],
      [idOf('Тарас'), -300, 'duel'],
    ]);
    expect(rows[1].seq).toBe(rows[0].seq + 1);
    for (const p of people) {
      const own = room.state.players.find((q) => q.nickname === p.nickname);
      expect(p.score).toBe(own?.score);
    }
  });
});
