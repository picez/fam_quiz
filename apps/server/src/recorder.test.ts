import { asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { bluff, blitzRound, boardRound, bool, chain, classicRound, duels, finalRound, makeQuiz, makeRoundsQuiz, numeric, poll, cloud, wall, single, survey, surveyCloud, text, survivalQuestions, survivalRound, survivalTrials, withId, wipeoutLadder, wipeoutRound, ladderRound } from '@quiz/engine/testing';
import { DEFAULT_RULES, defaultTeams, isUnscored, type Question, type Quiz } from '@quiz/shared';
import type { Db } from './db/client';
import { answer, appeal, game, participant, PENALTY_ATTEMPT, scoreAdjustment, user, VOTE_ATTEMPT } from './db/schema';
import { hostGame } from './history';
import { attachRecorder, markAborted, markInterrupted } from './recorder';
import { FINISHED_TTL_MS, RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { playToEnd } from './testing/final-game';
import { LADDER_RIGHT, playLadderQuestion } from './testing/ladder-game';
import { TRIAL_WRONG, playSurvivalQuestion } from './testing/survival-game';
import { playWipeout } from './testing/wipeout-game';
import { createTestDb } from './testing/test-db';
import { recordedTeamGame, toEnd, toQuestion } from './testing/team-game';

const HOST = 'host-user';
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

async function setup(database?: Db, retryMs = 5000, maxRetries = 30, quiz: Quiz = makeQuiz([single, text], { speedBonus: false })) {
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
  const room = manager.create(quiz, HOST, null);
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

  it('stores undo rows with what they undo; a participant score stays the sum of its rows', async () => {
    const ctx = await setup();
    const act = (action: Parameters<RoomManager['host']>[1]) => expect(ctx.manager.host(ctx.room, action)).toEqual({ ok: true });
    ctx.host('start');
    ctx.host('next');
    playFirstQuestion(ctx); // Олена +1000, Тарас 0 (штрафу немає)
    ctx.host('next'); // розкриття
    ctx.host('next'); // таблиця: перше запитання вже можна скасувати
    act({ type: 'adjust', playerId: ctx.taras, points: 50 });
    act({ type: 'undo', target: { question: 0, playerId: ctx.olena } });
    act({ type: 'undo', target: { seq: 1 } });
    act({ type: 'undo', target: { seq: 3 } }); // «Повернути» бали Тараса
    ctx.host('end');

    const { participants, answers } = await ctx.saved();
    const rows = await ctx.db.select().from(scoreAdjustment).orderBy(asc(scoreAdjustment.seq));
    expect(rows.map((r) => [r.participantId, r.seq, r.source, r.points, r.roundIndex, r.undoesQuestion, r.undoesSeq])).toEqual([
      [ctx.taras, 1, 'host', 50, 0, null, null],
      [ctx.olena, 2, 'undo', -1000, 0, 0, null],
      [ctx.taras, 3, 'undo', -50, 0, null, 1],
      [ctx.taras, 4, 'undo', 50, 0, null, 3],
    ]);
    for (const p of participants) {
      const sum = (list: { participantId: string; points: number }[]) => list.filter((r) => r.participantId === p.id).reduce((total, r) => total + r.points, 0);
      expect(p.score).toBe(sum(answers) + sum(rows));
    }
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([['Олена', 0], ['Тарас', 50]]);
    expect(ctx.errors).toEqual([]);
  });

  it('a penalty decided at the end is undone after the finish: scores, ranks and history standings follow (12e)', async () => {
    const ctx = await setup(undefined, 5000, 30, makeRoundsQuiz([classicRound('r1', [single, text], { speedBonus: false })], { awayPenalty: true }));
    ctx.host('start');
    ctx.host('next');
    // Олена виходить із гри на 3500 мс (player:away), потім відповідає.
    expect(ctx.manager.away(ctx.room, ctx.olena, true)).toEqual({ ok: true });
    ctx.scheduler.advance(3500);
    expect(ctx.manager.away(ctx.room, ctx.olena, false, { ms: 3500 })).toEqual({ ok: true });
    playFirstQuestion(ctx); // Олена +1000, Тарас 0
    // Штраф за вихід дописує годинник виходів у commit на переході до кінця гри.
    ctx.host('end');
    expect(ctx.room.state.adjustments).toEqual([expect.objectContaining({ seq: 1, source: 'away', playerId: ctx.olena, points: -1000 })]);
    ctx.manager.connect(ctx.room, { role: 'stage', playerId: null });
    let { participants } = await ctx.saved();
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([['Олена', 0], ['Тарас', 0]]);
    expect(ctx.manager.host(ctx.room, { type: 'undo', target: { question: 0, playerId: ctx.olena } })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(ctx.manager.host(ctx.room, { type: 'undo', target: { seq: 1 } })).toEqual({ ok: true });
    const saved = await ctx.saved();
    participants = saved.participants;
    const rows = await ctx.db.select().from(scoreAdjustment).orderBy(asc(scoreAdjustment.seq));
    expect(rows.map((r) => [r.participantId, r.seq, r.source, r.points, r.undoesSeq])).toEqual([
      [ctx.olena, 1, 'away', -1000, null],
      [ctx.olena, 2, 'undo', 1000, 1],
    ]);
    expect(participants.map((p) => [p.nickname, p.score, p.rank])).toEqual([['Олена', 1000, 1], ['Тарас', 0, 2]]);
    for (const p of participants) {
      const sum = (list: { participantId: string; points: number }[]) => list.filter((r) => r.participantId === p.id).reduce((total, r) => total + r.points, 0);
      expect(p.score).toBe(sum(saved.answers) + sum(rows));
    }
    expect(saved.games[0].status).toBe('finished');
    const standings = (await hostGame(ctx.db, HOST, ctx.room.id))?.standings ?? [];
    expect(standings.map((r) => [r.nickname, r.score, r.rank])).toEqual([['Олена', 1000, 1], ['Тарас', 0, 2]]);
    expect(ctx.errors).toEqual([]);
  });

  it('records a purchase with the kind and the target nickname; the participant score includes the price', async () => {
    const ctx = await setup();
    ctx.host('start');
    expect(ctx.manager.host(ctx.room, { type: 'adjust', playerId: ctx.olena, points: 300 })).toEqual({ ok: true });
    expect(ctx.manager.buyDebuff(ctx.room, ctx.olena, ctx.taras, 'fog')).toEqual({ ok: true });
    ctx.host('next');
    playFirstQuestion(ctx);
    ctx.host('end');

    const { participants } = await ctx.saved();
    const adjustments = await ctx.db.select().from(scoreAdjustment).orderBy(asc(scoreAdjustment.seq));
    expect(adjustments.map((a) => [a.participantId, a.seq, a.points, a.source, a.debuff, a.targetNickname])).toEqual([
      [ctx.olena, 1, 300, 'host', null, null],
      [ctx.olena, 2, -200, 'debuff', 'fog', 'Тарас'],
    ]);
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([
      ['Олена', 1100],
      ['Тарас', 0],
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

  it('forgets a room taken over by another process: back here, it is written again from the first question', async () => {
    const ctx = await setup();
    ctx.host('start');
    ctx.host('next');
    playFirstQuestion(ctx);
    ctx.host('next');
    ctx.host('next');
    ctx.host('next');
    ctx.manager.answer(ctx.room, ctx.olena, { type: 'text', value: 'одеса' });
    ctx.manager.answer(ctx.room, ctx.taras, { type: 'text', value: 'Львів' });
    ctx.host('next');
    expect(ctx.room.state.phase).toBe('reveal');
    expect((await ctx.saved()).answers.map((a) => a.questionIndex)).toEqual([0, 0, 1, 1]);

    const saved = ctx.manager.snapshot(ctx.room);
    ctx.manager.evict(ctx.room);
    await ctx.db.delete(answer);
    expect(ctx.manager.restore(saved)).not.toBeNull();
    expect((await ctx.saved()).answers.map((a) => a.questionIndex)).toEqual([0, 0, 1, 1]);
  });

  it('a finished room restored after a restart keeps the moment the game finished', async () => {
    const ctx = await setup();
    ctx.host('start');
    ctx.host('end');
    expect(ctx.room.state.phase).toBe('finished');
    await ctx.recorder.idle();
    const earlier = new Date('2026-01-01T10:00:00Z');
    await ctx.db.update(game).set({ finishedAt: earlier });

    // Новий процес: свіжий менеджер і записувач над тією самою базою.
    const saved = JSON.parse(JSON.stringify(ctx.manager.snapshot(ctx.room)));
    ctx.manager.freeze();
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const errors: unknown[] = [];
    const recorder = attachRecorder(manager, ctx.db, (error) => errors.push(error));
    expect(manager.restore(saved)).not.toBeNull();
    await recorder.idle();
    const games = await ctx.db.select().from(game);
    expect(games[0]).toMatchObject({ status: 'finished', finishedAt: earlier });
    expect(errors).toEqual([]);
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

  it('marks running games interrupted, except the rooms being restored', async () => {
    const g1 = await setup();
    g1.host('start');
    await g1.recorder.idle();
    const g2 = await setup(g1.db);
    g2.host('start');
    await g2.recorder.idle();
    const g3 = await setup(g1.db);
    g3.host('start');
    await g3.recorder.idle();
    const done = await setup(g1.db);
    done.host('start');
    done.host('end');
    await done.recorder.idle();

    await markInterrupted(g1.db, [g2.room.id]);
    const status = async (id: string) => (await g1.db.select().from(game).where(eq(game.id, id)))[0];
    expect((await status(g1.room.id)).status).toBe('aborted');
    expect((await status(g1.room.id)).finishedAt).toBeInstanceOf(Date);
    expect((await status(g3.room.id)).status).toBe('aborted');
    expect((await status(g2.room.id)).status).toBe('running');
    expect((await status(done.room.id)).status).toBe('finished');
  });
});

describe('markAborted', () => {
  it('aborts only the given running games', async () => {
    const g1 = await setup();
    g1.host('start');
    await g1.recorder.idle();
    const g2 = await setup(g1.db);
    g2.host('start');
    await g2.recorder.idle();

    await markAborted(g1.db, []);
    expect((await g1.db.select().from(game).where(eq(game.id, g1.room.id)))[0].status).toBe('running');
    await markAborted(g1.db, [g1.room.id]);
    const [a] = await g1.db.select().from(game).where(eq(game.id, g1.room.id));
    expect(a.status).toBe('aborted');
    expect(a.finishedAt).toBeInstanceOf(Date);
    expect((await g1.db.select().from(game).where(eq(game.id, g2.room.id)))[0].status).toBe('running');
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

  it('every attempt row of a blitz keeps the same away_ms; under the marker threshold it is null (12e)', async () => {
    const risky = { penalty: 'minus', partial: null, streak: null, multiplier: 1 } as const;
    const { manager, room, olena, taras, answers } = await blitzSetup({ attempts: 2, check: 'manual', rules: risky });
    const index = room.state.questionIndex;
    const play = room.state.plays[index];
    room.state = {
      ...room.state,
      plays: room.state.plays.map((p, i) => (i === index ? { ...play, away: { [olena]: { ms: 2500, count: 1, since: null }, [taras]: { ms: 1500, count: 1, since: null } } } : p)),
    };
    for (const [id, choice, ok] of [[taras, wrong, false], [olena, wrong, false], [olena, correct, true]] as const) {
      expect(manager.buzz(room, id)).toEqual({ ok: true });
      expect(manager.answer(room, id, choice)).toEqual({ ok: true });
      expect(manager.host(room, { type: 'judge', playerId: id, correct: ok })).toEqual({ ok: true });
    }
    const rows = await answers();
    expect(rows.filter((a) => a.participantId === olena).map((a) => [a.attempt, a.awayMs])).toEqual([[0, 2500], [1, 2500]]);
    expect(rows.filter((a) => a.participantId === taras).map((a) => a.awayMs)).toEqual([null]);
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

describe('recorder: buffs', () => {
  it('buffed points are saved as on the scoreboard, with the buff', async () => {
    const ctx = await setup();
    const room = ctx.manager.create(
      makeQuiz([single, text], { speedBonus: false, buffs: ['double', 'shield'], rules: { ...DEFAULT_RULES, penalty: 'minus' } }),
      HOST,
      null,
    );
    const enter = (nickname: string) => {
      const joined = ctx.manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      ctx.manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const olena = enter('Олена');
    const petro = enter('Петро');
    const ira = enter('Іра');
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(ctx.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(ctx.manager.buff(room, olena, 'double')).toEqual({ ok: true });
    expect(ctx.manager.buff(room, petro, 'shield')).toEqual({ ok: true });
    ctx.manager.answer(room, olena, correct);
    ctx.manager.answer(room, petro, wrong);
    ctx.manager.answer(room, ira, wrong);
    await ctx.recorder.idle();

    const rows = await ctx.db.select({ nickname: participant.nickname, points: answer.points, buff: answer.buff, accepted: answer.accepted }).from(answer).innerJoin(participant, eq(participant.id, answer.participantId));
    const by = (nickname: string) => rows.find((row) => row.nickname === nickname);
    expect(by('Олена')).toMatchObject({ points: 2000, buff: 'double' });
    expect(by('Петро')).toMatchObject({ points: 0, buff: 'shield', accepted: false });
    expect(by('Іра')).toMatchObject({ buff: null });
    const scores = await ctx.db.select().from(participant);
    for (const row of scores) expect(row.score).toBe(room.state.players.find((p) => p.id === row.id)?.score);
  });

  it('a spare answer is saved under the main question with the spare id', async () => {
    const ctx = await setup();
    const room = ctx.manager.create(
      { ...makeQuiz([single, text], { speedBonus: false, buffs: ['swap'] }), spares: [withId(single, 's1')] },
      HOST,
      null,
    );
    const enter = (nickname: string) => {
      const joined = ctx.manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      ctx.manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const olena = enter('Олена');
    const petro = enter('Петро');
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(ctx.manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(ctx.manager.buff(room, olena, 'swap')).toEqual({ ok: true });
    ctx.manager.answer(room, olena, correct);
    ctx.manager.answer(room, petro, wrong);
    await ctx.recorder.idle();

    const rows = await ctx.db
      .select({ nickname: participant.nickname, questionIndex: answer.questionIndex, points: answer.points, buff: answer.buff, spareId: answer.spareId })
      .from(answer)
      .innerJoin(participant, eq(participant.id, answer.participantId));
    const by = (nickname: string) => rows.find((row) => row.nickname === nickname);
    const points = room.state.players.find((p) => p.id === olena)?.score;
    expect(by('Олена')).toEqual({ nickname: 'Олена', questionIndex: 0, points, buff: 'swap', spareId: 's1' });
    expect(by('Петро')?.spareId).toBeNull();
  });

  it('a silent risk is a penalty row with its buff; a right and a wrong risk are answer rows; rows and adjustments sum to the score, also after the silent penalty is undone (12h)', async () => {
    const quiz = makeQuiz([single, withId(single, 'q2')], { speedBonus: false, buffs: ['risk'] });
    const ctx = await setup(undefined, 5000, 30, quiz);
    const ira = (() => {
      const joined = ctx.manager.join(ctx.room.code, 'Іра');
      if (!joined.ok) throw new Error(joined.error);
      ctx.manager.connect(ctx.room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    })();
    ctx.host('start');
    ctx.host('next');
    // Олена бере «Ризик» і мовчить; Тарас — «Ризик» і правильно; Іра — без бафу, правильно. Запитання закриває таймер.
    expect(ctx.manager.buff(ctx.room, ctx.olena, 'risk')).toEqual({ ok: true });
    expect(ctx.manager.buff(ctx.room, ctx.taras, 'risk')).toEqual({ ok: true });
    ctx.manager.answer(ctx.room, ctx.taras, correct);
    ctx.manager.answer(ctx.room, ira, correct);
    ctx.scheduler.advance(30_000);
    expect(ctx.room.state.phase).not.toBe('question');
    const scoreOf = (id: string) => ctx.room.state.players.find((p) => p.id === id)?.score;
    expect(scoreOf(ctx.olena)).toBe(-1000);
    expect(scoreOf(ctx.taras)).toBe(3000);
    let { answers } = await ctx.saved();
    const row = (id: string) => answers.find((a) => a.participantId === id && a.questionIndex === 0);
    expect(row(ctx.olena)).toMatchObject({ attempt: PENALTY_ATTEMPT, payload: null, points: -1000, accepted: false, buff: 'risk' });
    expect(row(ctx.taras)).toMatchObject({ attempt: 0, payload: correct, points: 3000, accepted: true, buff: 'risk' });
    expect(row(ira)).toMatchObject({ attempt: 0, points: 1000, buff: null });

    // Друге запитання: Іра бере «Ризик» і помиляється, Тарас помиляється без бафу, Олена відповідає правильно.
    while (ctx.room.state.phase !== 'question') ctx.host('next');
    expect(ctx.manager.buff(ctx.room, ira, 'risk')).toEqual({ ok: true });
    ctx.manager.answer(ctx.room, ira, wrong);
    ctx.manager.answer(ctx.room, ctx.taras, wrong);
    ctx.manager.answer(ctx.room, ctx.olena, correct);
    expect(ctx.room.state.phase).not.toBe('question');
    ({ answers } = await ctx.saved());
    expect(answers.find((a) => a.participantId === ira && a.questionIndex === 1)).toMatchObject({ attempt: 0, payload: wrong, points: -1000, buff: 'risk' });

    // Скасування 12a знімає мінус мовчання; сума рядків і коригувань — далі рахунок.
    ctx.host('next');
    expect(ctx.manager.host(ctx.room, { type: 'undo', target: { question: 0, playerId: ctx.olena } })).toEqual({ ok: true });
    ctx.host('end');
    const saved = await ctx.saved();
    const adjustments = await ctx.db.select().from(scoreAdjustment);
    expect(adjustments.map((a) => [a.participantId, a.source, a.points, a.undoesQuestion])).toEqual([[ctx.olena, 'undo', 1000, 0]]);
    for (const p of saved.participants) {
      const sum = (list: { participantId: string; points: number }[]) => list.filter((r) => r.participantId === p.id).reduce((total, r) => total + r.points, 0);
      expect(p.score).toBe(sum(saved.answers) + sum(adjustments));
      expect(p.score).toBe(scoreOf(p.id));
    }
    expect(saved.participants.map((p) => [p.nickname, p.score])).toEqual([['Іра', 0], ['Олена', 1000], ['Тарас', 3000]]);

    // Історія: штрафний рядок «Ризику» видно в відповідях зі значком бафу й без відповіді; у «відповіли» він не входить.
    const detail = await hostGame(ctx.db, HOST, ctx.room.id);
    const first = detail?.questions[0];
    expect(first?.responses.find((r) => r.nickname === 'Олена')).toMatchObject({ answer: null, accepted: false, buff: 'risk' });
    expect(first?.responses.find((r) => r.nickname === 'Тарас')).toMatchObject({ answer: correct, accepted: true, buff: 'risk' });
    expect(first?.answered).toBe(2);
    expect(ctx.errors).toEqual([]);
  });

  it('a game without buffs saves no buff', async () => {
    const ctx = await setup();
    ctx.host('start');
    ctx.host('next');
    playFirstQuestion(ctx);
    const { answers } = await ctx.saved();
    expect(answers.map((a) => a.buff)).toEqual([null, null]);
  });
});

describe('recorder: votes and walls (10d)', () => {
  it('poll and cloud votes are stored with attempt VOTE_ATTEMPT, zero points and the payload; a wall answer is an ordinary row', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db, (error) => {
      throw error;
    });
    const room = manager.create(makeQuiz([poll, cloud, wall], { speedBonus: false }), HOST, null);
    const joined = manager.join(room.code, 'Олена', null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    const host = (type: 'start' | 'lock' | 'next') => expect(manager.host(room, { type })).toEqual({ ok: true });

    const toQuestion = () => {
      for (let i = 0; i < 4 && room.state.phase !== 'question'; i += 1) host('next');
    };
    host('start');
    host('next');
    expect(manager.answer(room, joined.playerId, { type: 'poll', optionId: 'b' })).toEqual({ ok: true });
    toQuestion();
    expect(manager.answer(room, joined.playerId, { type: 'wordcloud', words: ['каштани', 'Дніпро'] })).toEqual({ ok: true });
    toQuestion();
    const at = (groupId: string) => wall.groups.find((g) => g.id === groupId)?.tiles.map((t) => room.state.presented.indexOf(t.id)) ?? [];
    for (const groupId of ['gr', 'gm', 'gl']) expect(manager.wall(room, joined.playerId, at(groupId))).toEqual({ ok: true });
    for (let i = 0; i < 4 && room.state.phase !== 'finished'; i += 1) host('next');
    await recorder.idle();

    const rows = await db.select().from(answer).orderBy(asc(answer.questionIndex), asc(answer.attempt));
    expect(rows.map((row) => [row.questionIndex, row.attempt, row.accepted, row.points])).toEqual([
      [0, VOTE_ATTEMPT, false, 0],
      [1, VOTE_ATTEMPT, false, 0],
      [2, 0, true, 750],
    ]);
    expect(rows[0].payload).toEqual({ type: 'poll', optionId: 'b' });
    expect(rows[1].payload).toEqual({ type: 'wordcloud', words: ['каштани', 'Дніпро'] });
    expect(rows[2].payload).toMatchObject({ type: 'wall', found: 4, groups: 4, mistakes: 0 });
    expect(VOTE_ATTEMPT).toBe(-3);
    expect([poll, cloud, wall].map(isUnscored)).toEqual([true, true, false]);
  });

  it('hidden cloud words are kept in the plays journal, also when hidden after the reveal', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db, (error) => {
      throw error;
    });
    const room = manager.create(makeQuiz([cloud], { speedBonus: false }), HOST, null);
    const joined = manager.join(room.code, 'Олена', null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    const host = (type: 'start' | 'lock' | 'next') => expect(manager.host(room, { type })).toEqual({ ok: true });
    host('start');
    for (let i = 0; i < 4 && room.state.phase !== 'question'; i += 1) host('next');
    expect(manager.answer(room, joined.playerId, { type: 'wordcloud', words: ['каштани', 'Дніпро'] })).toEqual({ ok: true });
    for (let i = 0; i < 4 && room.state.phase !== 'reveal'; i += 1) host(room.state.phase === 'question' ? 'lock' : 'next');
    expect(manager.host(room, { type: 'cloud-hide', key: 'каштани', hidden: true })).toEqual({ ok: true });
    await recorder.idle();
    const [saved] = await db.select().from(game);
    expect(saved.plays).toEqual([{ roundIndex: 0, questionId: cloud.id, cloudHidden: ['каштани'] }]);
  });
});

describe('recorder: survey (10e)', () => {
  async function playSurveys(questions: Question[], act: (manager: RoomManager, room: Room, playerId: string, index: number) => void) {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db, (error) => {
      throw error;
    });
    const room = manager.create(makeQuiz(questions, { speedBonus: false }), HOST, null);
    const joined = manager.join(room.code, 'Олена', null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    for (let index = 0; index < questions.length; index += 1) {
      for (let i = 0; i < 4 && room.state.phase !== 'question'; i += 1) manager.host(room, { type: 'next' });
      act(manager, room, joined.playerId, index);
      for (let i = 0; i < 4 && room.state.phase !== 'reveal' && room.state.phase !== 'finished'; i += 1) {
        manager.host(room, { type: room.state.phase === 'question' ? 'lock' : 'next' });
      }
      manager.host(room, { type: 'survey-all' });
      manager.host(room, { type: 'next' });
    }
    await recorder.idle();
    return { db };
  }

  it('a cloud survey stores its built rows in plays; a host board does not; the answer row carries values and hits', async () => {
    const { db } = await playSurveys([cloud, surveyCloud, survey], (manager, room, playerId, index) => {
      if (index === 0) manager.answer(room, playerId, { type: 'wordcloud', words: ['каштани', 'Дніпро'] });
      if (index === 1) manager.answer(room, playerId, { type: 'survey', values: ['каштани'] });
      if (index === 2) manager.answer(room, playerId, { type: 'survey', values: ['Яблуко', 'Банан'] });
    });
    const [saved] = await db.select().from(game);
    expect(saved.plays).toHaveLength(3);
    expect(saved.plays[0].surveyRows).toBeUndefined();
    expect(saved.plays[1].surveyRows).toEqual([
      { id: 'cloud-1', text: 'Дніпро', popularity: 100, accepted: [] },
      { id: 'cloud-2', text: 'каштани', popularity: 100, accepted: [] },
    ]);
    expect(saved.plays[2].surveyRows).toBeUndefined();
    const rows = (await db.select().from(answer).orderBy(asc(answer.questionIndex), asc(answer.attempt))).filter((row) => row.questionIndex > 0);
    expect(rows.map((row) => [row.questionIndex, row.attempt])).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(rows[1].payload).toEqual({ type: 'survey', values: ['Яблуко', 'Банан'], rows: ['sa', 'sb'] });
    expect(rows[0].payload).toMatchObject({ type: 'survey', values: ['каштани'], rows: ['cloud-2'] });
  });
});

describe('recorder: bluff (10f)', () => {
  async function start() {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db, (error) => {
      throw error;
    });
    const room = manager.create(makeQuiz([bluff, single], { speedBonus: false }), HOST, null);
    const joined = manager.join(room.code, 'Олена', null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    manager.host(room, { type: 'next' });
    return { db, manager, recorder, room, playerId: joined.playerId };
  }

  it('a bluff stores its options and picks in plays; the answer row is attempt 0 with the BluffAnswer', async () => {
    const { db, manager, recorder, room, playerId } = await start();
    expect(manager.lie(room, playerId, 'Рим')).toEqual({ ok: true });
    const options = room.state.plays[0].bluff?.options ?? [];
    const truth = options.find((o) => o.kind === 'truth');
    expect(manager.bluff(room, playerId, truth?.id ?? '')).toEqual({ ok: true });
    for (let i = 0; i < 4 && room.state.phase !== 'question'; i += 1) manager.host(room, { type: 'next' });
    manager.host(room, { type: 'lock' });
    manager.host(room, { type: 'next' });
    await recorder.idle();

    const [saved] = await db.select().from(game);
    expect(saved.plays[0].bluff?.options).toEqual(options);
    expect(saved.plays[0].bluff?.options.find((o) => o.text === 'Рим')?.authors).toEqual([playerId]);
    expect(Object.values(saved.plays[0].bluff?.picks ?? {})).toEqual([truth?.id]);
    expect(saved.plays[1]?.bluff).toBeUndefined();
    const rows = (await db.select().from(answer).orderBy(asc(answer.questionIndex), asc(answer.attempt))).filter((row) => row.questionIndex === 0);
    expect(rows.map((row) => [row.attempt, row.accepted, row.points])).toEqual([[0, true, 1000]]);
    expect(rows[0].payload).toEqual({ type: 'bluff', lie: 'Рим', pick: 'Барселона', truth: true, fooled: 0 });
  });

  it('a bluff that ended in the lies has no bluff in plays and no answer rows', async () => {
    const { db, manager, recorder, room } = await start();
    expect(room.state.plays[0].bluff?.stage).toBe('lies');
    // Гру завершено ще у фазі вигадок: вибору не було, рахувати нічого.
    expect(manager.host(room, { type: 'end' })).toEqual({ ok: true });
    await recorder.idle();

    const [saved] = await db.select().from(game);
    expect(saved.plays.every((play) => play.bluff === undefined)).toBe(true);
    expect(await db.select().from(answer)).toEqual([]);
  });
});

describe('recorder: wipeout (10g)', () => {
  it('stores the decisions and the end of the round in game.plays; the points rows are the banks', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const room = manager.create(makeRoundsQuiz([wipeoutRound('w', wipeoutLadder)]), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const p1 = enter('Олена');
    const p2 = enter('Тарас');
    // Олена забирає після другої сходинки (банк 300), Тарас доходить до кінця (банк 1500).
    playWipeout(manager, room, { [p1]: [0, 1, 2, 3, 4], [p2]: [0, 1, 2, 3, 4] }, { [p1]: 1 }, 2);
    await recorder.idle();
    const rows = (index: number) => db.select().from(answer).where(eq(answer.questionIndex, index)).orderBy(asc(answer.points));
    const [saved] = await db.select().from(game);
    expect(saved.plays.map((play) => play.wipeout)).toEqual([{ took: [] }, { took: [p1] }]);
    expect((await rows(1)).map((a) => [a.participantId === p1 ? 'p1' : 'p2', a.points])).toEqual([
      ['p2', 0],
      ['p1', 300],
    ]);
    expect((await rows(0)).map((a) => a.points)).toEqual([0, 0]);

    // Рішення без зміни фази: Тарас на третій сходинці забирає, не змінивши фази.
    for (let guard = 0; guard < 3 && room.state.phase !== 'question'; guard++) manager.host(room, { type: 'next' });
    manager.answer(room, p2, { type: 'numeric', value: 2100 });
    expect(room.state.phase).toBe('locked');
    manager.host(room, { type: 'next' });
    manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('leaderboard');
    await recorder.idle();
    expect((await db.select().from(game))[0].plays[2].wipeout).toEqual({ took: [] });
    expect(manager.wipeout(room, p2, true)).toEqual({ ok: true });
    expect(room.state.phase).toBe('leaderboard');
    await recorder.idle();
    expect((await db.select().from(game))[0].plays[2].wipeout).toEqual({ took: [p2] });
    const [taras] = await db.select().from(participant).where(eq(participant.id, p2));
    expect(taras.score).toBe(600);
    expect((await rows(2)).find((a) => a.participantId === p2)?.points).toBe(600);
  });

  it('marks the last step with end: true and moves the banks into the score', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const room = manager.create(makeRoundsQuiz([wipeoutRound('w', wipeoutLadder)]), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const p1 = enter('Олена');
    const p2 = enter('Тарас');
    playWipeout(manager, room, { [p1]: [0, 1, 2, 3, 4], [p2]: [0] }, {});
    // Єдиний раунд: після останньої сходинки гра скінчилася.
    expect(room.state.phase).toBe('finished');
    await recorder.idle();
    const [saved] = await db.select().from(game);
    expect(saved.plays).toHaveLength(5);
    expect(saved.plays.map((play) => play.wipeout?.end)).toEqual([undefined, undefined, undefined, undefined, true]);
    const [olena] = await db.select().from(participant).where(eq(participant.id, p1));
    const [taras] = await db.select().from(participant).where(eq(participant.id, p2));
    expect([olena.score, taras.score]).toEqual([1500, 0]);
    const last = await db.select().from(answer).where(eq(answer.questionIndex, 4));
    expect(last.find((a) => a.participantId === p1)?.points).toBe(1500);
  });
});

describe('recorder: survival (10h)', () => {
  it('stores the edge, the trials, the ghost counts and the end in game.plays; the bonus is survival adjustments and the ghost has no answer rows', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const room = manager.create(makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials)]), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const [a, b, c] = [enter('Олена'), enter('Тарас'), enter('Віра')];
    // s1: Олена помиляється й вибуває на питанні; s2: Олена-привид відгадує, Тарас помиляється й вибуває — лишилася Віра.
    playSurvivalQuestion(manager, room, { right: [b, c], trial: [] });
    await recorder.idle();
    expect((await db.select().from(game))[0].plays[0].survival).toEqual({
      edge: [a],
      trial: { kind: 'question', questionId: 't1', answers: { [a]: { answer: TRIAL_WRONG[0], correct: false } }, out: [a] },
    });
    playSurvivalQuestion(manager, room, { right: [c], ghosts: { [a]: true }, trial: [] });
    await recorder.idle();
    // Привид відповів, а випробування закрите — запис змінився без зміни фази.
    expect((await db.select().from(game))[0].plays[1].survival).toMatchObject({ edge: [b], ghosts: { answered: 1, right: 1 } });
    for (let guard = 0; guard < 4 && room.state.phase !== 'finished'; guard++) manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('finished');
    await recorder.idle();
    const [saved] = await db.select().from(game);
    expect(saved.plays).toHaveLength(2);
    expect(saved.plays[1].survival).toEqual({
      edge: [b],
      ghosts: { answered: 1, right: 1 },
      trial: { kind: 'question', questionId: 't2', answers: { [b]: { answer: TRIAL_WRONG[1], correct: false } }, out: [b] },
      end: true,
    });
    // Відповіді привида в рядки не потрапляють: у Олени лише рядок s1.
    const rows = await db.select().from(answer).where(eq(answer.participantId, a));
    expect(rows.map((r) => r.questionIndex)).toEqual([0]);
    // Бонус — одне коригування живій; рахунок = відповіді + коригування.
    const adjustments = await db.select().from(scoreAdjustment);
    expect(adjustments.map((x) => [x.participantId, x.source, x.points, x.roundIndex])).toEqual([[c, 'survival', 500, 0]]);
    const mine = await db.select().from(answer).where(eq(answer.participantId, c));
    const [vira] = await db.select().from(participant).where(eq(participant.id, c));
    expect(mine.reduce((sum, r) => sum + r.points, 0) + 500).toBe(vira.score);
    expect(vira.score).toBe(700);
  });

  it('stores no edge when the game ends before the verdict', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const room = manager.create(makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials)]), HOST, null);
    for (const nickname of ['Олена', 'Тарас']) {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
    }
    manager.host(room, { type: 'start' });
    for (let guard = 0; guard < 6 && room.state.phase !== 'question'; guard++) manager.host(room, { type: 'next' });
    manager.host(room, { type: 'end' });
    await recorder.idle();
    const [saved] = await db.select().from(game);
    expect(saved.plays.length).toBeGreaterThan(0);
    for (const play of saved.plays) expect(play.survival).not.toHaveProperty('edge');
  });
});

describe('recorder: ladder (10i)', () => {
  it('stores the contestant, the step, the lifelines, the decision and the outcome in game.plays; the prize is a ladder adjustment', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const room = manager.create(makeRoundsQuiz([ladderRound('rl')]), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const [p1, p2] = [enter('Олена'), enter('Тарас')];
    manager.host(room, { type: 'start' });
    expect(manager.hostLadderPick(room, p1)).toEqual({ ok: true });
    // l1: 50/50 і зал; Тарас відповідає правильно, Олена теж.
    playLadderQuestion(manager, room, { contestant: true, hall: { [p2]: true }, lifelines: ['fifty', 'audience'] });
    await recorder.idle();
    const first = (await db.select().from(game))[0].plays[0].ladder;
    expect(first).toMatchObject({ contestant: p1, step: 0, level: 100, lifelines: { audience: { cast: 1, counts: { b: 1 } } } });
    expect(first?.lifelines?.fifty).toHaveLength(2);
    expect(first?.decision).toBeUndefined();
    // Рішення без зміни фази теж записується.
    expect(manager.ladderDecide(room, p1, false)).toEqual({ ok: true });
    await recorder.idle();
    expect((await db.select().from(game))[0].plays[0].ladder?.decision).toBe('go');
    playLadderQuestion(manager, room, { contestant: true, hall: { [p2]: false } });
    expect(manager.ladderDecide(room, p1, false)).toEqual({ ok: true });
    playLadderQuestion(manager, room, { contestant: true });
    expect(manager.ladderDecide(room, p1, true)).toEqual({ ok: true });
    await recorder.idle();
    const [saved] = await db.select().from(game);
    expect(saved.plays.map((play) => [play.ladder?.step, play.ladder?.level, play.ladder?.decision])).toEqual([
      [0, 100, 'go'],
      [1, 300, 'go'],
      [2, 1000, 'take'],
    ]);
    expect(saved.plays[2].ladder?.outcome).toEqual({ kind: 'took', passed: 3, points: 1000 });
    expect(saved.plays[0].ladder?.outcome).toBeUndefined();
    // Учасник — 0 балів за відповіді, зал — 10 % рівня за правильну.
    const mine = await db.select().from(answer).where(eq(answer.participantId, p1));
    expect(mine.map((r) => r.points)).toEqual([0, 0, 0]);
    const hall = await db.select().from(answer).where(eq(answer.participantId, p2)).orderBy(asc(answer.questionIndex));
    expect(hall.map((r) => [r.questionIndex, r.points])).toEqual([
      [0, 10],
      [1, 0],
    ]);
    const adjustments = await db.select().from(scoreAdjustment);
    expect(adjustments.map((x) => [x.participantId, x.source, x.points])).toEqual([[p1, 'ladder', 1000]]);
    const [olena] = await db.select().from(participant).where(eq(participant.id, p1));
    expect(mine.reduce((sum, r) => sum + r.points, 0) + 1000).toBe(olena.score);
    expect(olena.score).toBe(1000);
  });

  it('an open hall vote is not in game.plays; ending the game mid-vote closes it into the history', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db);
    const room = manager.create(makeRoundsQuiz([ladderRound('rl')]), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const [p1, p2] = [enter('Олена'), enter('Тарас'), enter('Віра')];
    manager.host(room, { type: 'start' });
    expect(manager.hostLadderPick(room, p1)).toEqual({ ok: true });
    for (let guard = 0; guard < 6 && room.state.phase !== 'question'; guard++) manager.host(room, { type: 'next' });
    expect(manager.lifeline(room, p1, 'audience')).toEqual({ ok: true });
    // Тарас голосує, Віра ще ні — голосування відкрите.
    manager.answer(room, p2, LADDER_RIGHT[0]);
    await recorder.idle();
    expect((await db.select().from(game))[0].plays).toEqual([]);
    manager.host(room, { type: 'end' });
    await recorder.idle();
    const saved = (await db.select().from(game))[0].plays[0].ladder;
    expect(saved?.contestant).toBe(p1);
    expect(saved?.lifelines?.audience).toEqual({ cast: 1, counts: { b: 1 } });
  });
});

describe('recorder: teams (10j)', () => {
  /** Червоні (капітан Оля) відповідають правильно, Сині (капітан Віра) — ні; далі хмара. */
  async function teamGame() {
    const ctx = await recordedTeamGame(makeRoundsQuiz([classicRound('r1', [single, cloud], { speedBonus: false })], { teams: defaultTeams(2) }));
    const { manager, room, members } = ctx;
    toQuestion(manager, room);
    expect(manager.answer(room, members['Оля'], correct)).toEqual({ ok: true });
    expect(manager.answer(room, members['Віра'], wrong)).toEqual({ ok: true });
    const saved = async () => {
      await ctx.recorder.idle();
      return {
        // За абеткою: порядок бази (collation C) ставить «І» перед «В».
        participants: (await ctx.db.select().from(participant)).sort((x, y) => x.nickname.localeCompare(y.nickname, 'uk')),
        answers: await ctx.db.select().from(answer).orderBy(asc(answer.questionIndex), asc(answer.points)),
      };
    };
    return { ...ctx, saved, red: ctx.teams[0], blue: ctx.teams[1] };
  }

  it('a team row carries the answers and the score, a member row points to its team, copies the score and has no answers', async () => {
    const ctx = await teamGame();
    const { participants, answers } = await ctx.saved();
    expect(participants.map((p) => [p.nickname, p.isTeam, p.teamId, p.userId, p.score])).toEqual([
      ['Віра', false, ctx.blue, 'vira-user', 0],
      ['Ігор', false, ctx.blue, null, 0],
      ['Оля', false, ctx.red, 'olya-user', 1000],
      ['Петро', false, ctx.red, null, 1000],
      ['Сині', true, null, null, 0],
      ['Червоні', true, null, null, 1000],
    ]);
    expect(participants.find((p) => p.nickname === 'Червоні')?.id).toBe(ctx.red);
    expect(answers.map((a) => [a.participantId, a.questionIndex, a.accepted, a.points, a.payload])).toEqual([
      [ctx.blue, 0, false, 0, wrong],
      [ctx.red, 0, true, 1000, correct],
    ]);
    expect(ctx.errors).toEqual([]);
  });

  it('every member has their own cloud vote row; the teams have none', async () => {
    const ctx = await teamGame();
    toQuestion(ctx.manager, ctx.room);
    const words: Record<string, string[]> = { Оля: ['каштани'], Петро: ['Дніпро'], Віра: ['Лавра'], Ігор: ['каштани', 'метро'] };
    for (const [name, list] of Object.entries(words)) expect(ctx.manager.answer(ctx.room, ctx.members[name], { type: 'wordcloud', words: list })).toEqual({ ok: true });
    toQuestion(ctx.manager, ctx.room);
    const { answers } = await ctx.saved();
    const votes = answers.filter((a) => a.questionIndex === 1);
    expect(votes.every((a) => a.attempt === VOTE_ATTEMPT && a.points === 0)).toBe(true);
    expect(new Map(votes.map((a) => [a.participantId, a.payload]))).toEqual(
      new Map(Object.entries(words).map(([name, list]) => [ctx.members[name], { type: 'wordcloud', words: list }])),
    );
  });

  it('a member vote row keeps the person own away_ms, exactly the threshold counts (12e)', async () => {
    const ctx = await teamGame();
    toQuestion(ctx.manager, ctx.room);
    toQuestion(ctx.manager, ctx.room);
    const index = ctx.room.state.questionIndex;
    const play = ctx.room.state.plays[index];
    ctx.room.state = {
      ...ctx.room.state,
      plays: ctx.room.state.plays.map((p, i) => (i === index ? { ...play, away: { [ctx.members['Оля']]: { ms: 2000, count: 1, since: null }, [ctx.members['Петро']]: { ms: 1999, count: 1, since: null } } } : p)),
    };
    for (const name of ['Оля', 'Петро', 'Віра', 'Ігор']) expect(ctx.manager.answer(ctx.room, ctx.members[name], { type: 'wordcloud', words: ['каштани'] })).toEqual({ ok: true });
    toQuestion(ctx.manager, ctx.room);
    const { answers } = await ctx.saved();
    const votes = new Map(answers.filter((a) => a.questionIndex === index).map((a) => [a.participantId, a.awayMs]));
    expect(votes.get(ctx.members['Оля'])).toBe(2000);
    expect(votes.get(ctx.members['Петро'])).toBeNull();
    expect(votes.has(ctx.red)).toBe(false);
  });

  it('a solo poll vote row keeps the own away_ms (12e)', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, db, (error) => {
      throw error;
    });
    const room = manager.create(makeQuiz([poll], { speedBonus: false }), HOST, null);
    const joined = manager.join(room.code, 'Олена', null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    const play = room.state.plays[0];
    room.state = { ...room.state, plays: [{ ...play, away: { [joined.playerId]: { ms: 4200, count: 1, since: null } } }] };
    expect(manager.answer(room, joined.playerId, { type: 'poll', optionId: 'b' })).toEqual({ ok: true });
    await recorder.idle();
    const rows = await db.select().from(answer);
    expect(rows.map((a) => [a.attempt, a.awayMs])).toEqual([[VOTE_ATTEMPT, 4200]]);
  });

  it('a host adjustment of a team lands on the team row; at the finish the members get the rank of their team', async () => {
    const ctx = await teamGame();
    expect(ctx.manager.host(ctx.room, { type: 'adjust', playerId: ctx.blue, points: 2500 })).toEqual({ ok: true });
    toEnd(ctx.manager, ctx.room);
    const { participants } = await ctx.saved();
    const adjustments = await ctx.db.select().from(scoreAdjustment);
    expect(adjustments.map((a) => [a.participantId, a.points, a.source])).toEqual([[ctx.blue, 2500, 'host']]);
    expect(participants.map((p) => [p.nickname, p.score, p.rank])).toEqual([
      ['Віра', 2500, 1],
      ['Ігор', 2500, 1],
      ['Оля', 1000, 2],
      ['Петро', 1000, 2],
      ['Сині', 2500, 1],
      ['Червоні', 1000, 2],
    ]);
    expect(ctx.errors).toEqual([]);
  });

  it('undoing a team answer stores the undo row on the team; the members copy the team score (12a)', async () => {
    const ctx = await teamGame();
    toQuestion(ctx.manager, ctx.room); // перше запитання закрите й розкрите: його бали вже можна скасувати
    expect(ctx.manager.host(ctx.room, { type: 'undo', target: { question: 0, playerId: ctx.red } })).toEqual({ ok: true });
    const { participants, answers } = await ctx.saved();
    const rows = await ctx.db.select().from(scoreAdjustment);
    expect(rows.map((r) => [r.participantId, r.source, r.points, r.undoesQuestion, r.undoesSeq])).toEqual([[ctx.red, 'undo', -1000, 0, null]]);
    expect(participants.map((p) => [p.nickname, p.score])).toEqual([
      ['Віра', 0],
      ['Ігор', 0],
      ['Оля', 0],
      ['Петро', 0],
      ['Сині', 0],
      ['Червоні', 0],
    ]);
    const red = participants.find((p) => p.id === ctx.red)!;
    const sum = (list: { participantId: string; points: number }[]) => list.filter((r) => r.participantId === red.id).reduce((total, r) => total + r.points, 0);
    expect(red.score).toBe(sum(answers) + sum(rows));
    expect(ctx.errors).toEqual([]);
  });

  it('kicking a member drops their row; kicking the last members of a team drops the team row with all its member rows', async () => {
    const ctx = await teamGame();
    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.members['Петро'] })).toEqual({ ok: true });
    expect((await ctx.saved()).participants.map((p) => p.nickname)).toEqual(['Віра', 'Ігор', 'Оля', 'Сині', 'Червоні']);
    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.members['Віра'] })).toEqual({ ok: true });
    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.members['Ігор'] })).toEqual({ ok: true });
    const { participants, answers } = await ctx.saved();
    expect(participants.map((p) => p.nickname)).toEqual(['Оля', 'Червоні']);
    expect(answers.map((a) => a.participantId)).toEqual([ctx.red]);
    expect(ctx.errors).toEqual([]);
  });
});

describe('recorder: games without a host (11h)', () => {
  async function autopilotRoom() {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'author-user', name: 'Марта', email: 'marta@example.com' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const errors: unknown[] = [];
    const recorder = attachRecorder(manager, db, (error) => errors.push(error));
    const created = manager.createAutopilot(makeQuiz([single, text], { speedBonus: false }), 'author-user', null, 'Марта');
    if (!created.ok) throw new Error(created.error);
    manager.connect(created.room, { role: 'player', playerId: created.playerId });
    return { db, manager, recorder, room: created.room, authorId: created.playerId, errors };
  }

  it('marks a game the bot ran; the author is the host user and a player row', async () => {
    const ctx = await autopilotRoom();
    expect(ctx.manager.author(ctx.room, ctx.authorId, { type: 'start' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    const games = await ctx.db.select().from(game);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ hostId: 'author-user', autopilot: true });
    expect(ctx.errors).toEqual([]);
  });

  it('does not rewrite the mark when the game is saved again', async () => {
    const ctx = await autopilotRoom();
    expect(ctx.manager.author(ctx.room, ctx.authorId, { type: 'start' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    await ctx.db.update(game).set({ autopilot: false }).where(eq(game.id, ctx.room.id));
    expect(ctx.manager.author(ctx.room, ctx.authorId, { type: 'next' })).toMatchObject({});
    await ctx.recorder.idle();
    expect((await ctx.db.select().from(game))[0]!.autopilot).toBe(false);
  });

  it('a room restored after a restart saves again still marked as a bot game', async () => {
    const ctx = await autopilotRoom();
    expect(ctx.manager.author(ctx.room, ctx.authorId, { type: 'start' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    const saved = ctx.manager.snapshot(ctx.room);
    ctx.manager.evict(ctx.room);
    await ctx.db.delete(game);
    const restored = ctx.manager.restore(saved);
    expect(restored).not.toBeNull();
    expect(restored!.state.autopilot).toBeDefined();
    await ctx.recorder.idle();
    const games = await ctx.db.select().from(game);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ hostId: 'author-user', autopilot: true });
    expect(ctx.errors).toEqual([]);
  });

  it('a game with a host is not marked', async () => {
    const ctx = await setup();
    ctx.host('start');
    expect((await ctx.saved()).games[0]).toMatchObject({ autopilot: false });
  });
});

describe('recorder: appeals (12f)', () => {
  /** Тарас відповів неправильно й оскаржує на розкритті; Олена — єдина виборка. */
  async function appealing() {
    const ctx = await setup();
    ctx.host('start');
    toQuestion(ctx.manager, ctx.room);
    playFirstQuestion({ ...ctx });
    ctx.host('next');
    return { ...ctx, openIt: () => expect(ctx.manager.appeal(ctx.room, ctx.taras, 'grade')).toEqual({ ok: true }) };
  }

  it('an open appeal is not stored; a closed one is a single row even after several saves', async () => {
    const ctx = await appealing();
    ctx.openIt();
    await ctx.recorder.idle();
    expect(await ctx.db.select().from(appeal)).toEqual([]);
    expect(ctx.manager.appealVote(ctx.room, ctx.olena, 1, true)).toEqual({ ok: true });
    await ctx.recorder.idle();
    toEnd(ctx.manager, ctx.room);
    await ctx.recorder.idle();
    expect(ctx.errors).toEqual([]);
    expect(await ctx.db.select().from(appeal)).toEqual([expect.objectContaining({ seq: 1, participantId: ctx.taras, reason: 'grade', yes: 1, no: 0, outcome: 'yes' })]);
  });

  it('a decision with a different outcome only is still saved (the signature sees the outcome)', async () => {
    const ctx = await appealing();
    ctx.openIt();
    expect(ctx.manager.appealVote(ctx.room, ctx.olena, 1, false)).toEqual({ ok: true });
    await ctx.recorder.idle();
    expect(await ctx.db.select().from(appeal)).toEqual([expect.objectContaining({ yes: 0, no: 1, outcome: 'no', adjustmentSeq: null })]);
  });

  it('the appeal of a kicked participant does not break the save and goes with the participant', async () => {
    const ctx = await appealing();
    ctx.openIt();
    expect(ctx.manager.appealVote(ctx.room, ctx.olena, 1, true)).toEqual({ ok: true });
    await ctx.recorder.idle();
    expect(await ctx.db.select().from(appeal)).toHaveLength(1);
    expect(ctx.manager.host(ctx.room, { type: 'kick', playerId: ctx.taras })).toEqual({ ok: true });
    await ctx.recorder.idle();
    expect(ctx.errors).toEqual([]);
    expect(await ctx.db.select().from(appeal)).toEqual([]);
  });
});
