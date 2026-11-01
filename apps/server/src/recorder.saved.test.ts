import { asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { GAME_STATE_VERSION, type GameState } from '@quiz/engine';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import * as store from './achievement-store';
import { answer, appeal, game, participant, savedGame, scoreAdjustment, user } from './db/schema';
import { attachRecorder, saveSavedGame, trimToCheckpoint, type SavedWrite } from './recorder';
import { exactSaved, isSavedGameData, SAVED_GAME_VERSION, type SavedGameData } from './rooms/continuation';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

vi.mock('./achievement-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./achievement-store')>();
  return { ...original, awardGame: vi.fn(original.awardGame) };
});

const HOST = 'u1';
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

async function setup() {
  const db = await createTestDb();
  await db.insert(user).values([
    { id: HOST, name: 'Ведуча', email: 'host@example.com' },
    { id: 'u2', name: 'Тарас', email: 'taras@example.com' },
  ]);
  const manager = new RoomManager(new FakeScheduler(), () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error));
  const open = () => {
    const room = manager.create(makeQuiz([single, text], { speedBonus: false }), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname, null);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const olena = enter('Олена');
    const taras = enter('Тарас');
    const host = (command: Parameters<RoomManager['host']>[1]) => expect(manager.host(room, command)).toEqual({ ok: true });
    return { room, olena, taras, host };
  };
  return { db, manager, recorder, errors, open };
}

type Opened = ReturnType<Awaited<ReturnType<typeof setup>>['open']>;

/** Запитання 1 зіграно, +20 Олені на розкритті; повертає стан на таблиці після нього (контрольна точка). */
function toCheckpoint(ctx: { manager: RoomManager }, g: Opened): GameState {
  g.host({ type: 'start' });
  g.host({ type: 'next' });
  ctx.manager.answer(g.room, g.olena, correct);
  ctx.manager.answer(g.room, g.taras, wrong);
  g.host({ type: 'next' });
  expect(g.room.state.phase).toBe('reveal');
  g.host({ type: 'adjust', playerId: g.olena, points: 20 });
  g.host({ type: 'next' });
  expect(g.room.state.phase).toBe('leaderboard');
  return g.room.state;
}

function savedData(state: GameState, stateVersion = GAME_STATE_VERSION): SavedGameData {
  return { v: SAVED_GAME_VERSION, stateVersion, state, at: 0, playerUsers: [], quizId: null };
}

function writeOf(room: Room, state: GameState, replaces: string | null = null): SavedWrite {
  return { id: room.id, code: room.code, hostId: HOST, quizId: null, playerUsers: new Map(room.playerUsers), saved: savedData(state), replaces };
}

describe('saved games in the database', () => {
  it('a checkpoint on the leaderboard after question 1 drops the rows of question 2 written while it was locked', async () => {
    const ctx = await setup();
    const g = ctx.open();
    const checkpoint = toCheckpoint(ctx, g);
    g.host({ type: 'next' });
    expect(g.room.state.phase).toBe('question');
    g.host({ type: 'adjust', playerId: g.taras, points: 50 });
    ctx.manager.answer(g.room, g.olena, { type: 'text', value: 'Київ' });
    ctx.manager.answer(g.room, g.taras, { type: 'text', value: 'Львів' });
    expect(g.room.state.phase).toBe('locked');
    await ctx.recorder.idle();
    expect((await ctx.db.select().from(answer)).some((a) => a.questionIndex === 1)).toBe(true);
    // Апеляція після контрольної точки (у стані точки апеляцій немає).
    await ctx.db.insert(appeal).values({ gameId: g.room.id, seq: 1, participantId: g.olena, questionIndex: 1, reason: 'grade', yes: 1, no: 0, outcome: 'yes', adjustmentSeq: null });

    await saveSavedGame(ctx.db, writeOf(g.room, checkpoint));

    const [row] = await ctx.db.select().from(game);
    expect(row).toMatchObject({ status: 'saved', questionsPlayed: 1, finishedAt: null });
    expect(row.plays).toHaveLength(1);
    const answers = await ctx.db.select().from(answer);
    expect(answers.filter((a) => a.questionIndex === 1)).toEqual([]);
    expect(answers.filter((a) => a.questionIndex === 0)).toHaveLength(2);
    const adjustments = await ctx.db.select().from(scoreAdjustment).orderBy(asc(scoreAdjustment.seq));
    expect(checkpoint.adjustmentSeq).toBe(1);
    expect(adjustments.map((a) => [a.participantId, a.seq, a.points])).toEqual([[g.olena, 1, 20]]);
    expect(await ctx.db.select().from(appeal)).toEqual([]);
    const participants = await ctx.db.select().from(participant);
    for (const p of participants) expect(p.score).toBe(checkpoint.players.find((player) => player.id === p.id)!.score);
    const [saved] = await ctx.db.select().from(savedGame);
    expect(saved.gameId).toBe(g.room.id);
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);
    expect((saved.data as SavedGameData).state.questionIndex).toBe(0);
    expect(ctx.errors).toEqual([]);
  });

  it('a second save of the same game updates its one saved_game row', async () => {
    const ctx = await setup();
    const g = ctx.open();
    const checkpoint = toCheckpoint(ctx, g);
    await ctx.recorder.idle();
    await saveSavedGame(ctx.db, writeOf(g.room, checkpoint));
    const [first] = await ctx.db.select().from(savedGame);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveSavedGame(ctx.db, writeOf(g.room, checkpoint));
    const rows = await ctx.db.select().from(savedGame);
    expect(rows).toHaveLength(1);
    expect(rows[0].savedAt.getTime()).toBeGreaterThan(first.savedAt.getTime());
  });

  it('a saved game stays «saved» while the room goes on, and the finish makes it finished, removes saved_game and awards once', async () => {
    const ctx = await setup();
    const g = ctx.open();
    const checkpoint = toCheckpoint(ctx, g);
    await ctx.recorder.idle();
    await saveSavedGame(ctx.db, writeOf(g.room, checkpoint));
    vi.mocked(store.awardGame).mockClear();

    g.host({ type: 'next' });
    await ctx.recorder.idle();
    expect((await ctx.db.select().from(game))[0].status).toBe('saved');

    g.host({ type: 'end' });
    expect(g.room.state.phase).toBe('finished');
    await ctx.recorder.idle();
    expect((await ctx.db.select().from(game))[0].status).toBe('finished');
    expect(await ctx.db.select().from(savedGame)).toEqual([]);
    expect(vi.mocked(store.awardGame)).toHaveBeenCalledTimes(1);
    expect(ctx.errors).toEqual([]);
  });

  it('a participant gets the account the room bound to it on the next write', async () => {
    const ctx = await setup();
    const g = ctx.open();
    g.host({ type: 'start' });
    await ctx.recorder.idle();
    const taras = async () => (await ctx.db.select().from(participant).where(eq(participant.id, g.taras)))[0];
    expect((await taras()).userId).toBeNull();
    g.room.playerUsers.set(g.taras, 'u2');
    g.host({ type: 'next' });
    await ctx.recorder.idle();
    expect((await taras()).userId).toBe('u2');
  });

  it('replaces removes the old saved game with its participants, but never a finished one', async () => {
    const ctx = await setup();
    const old = ctx.open();
    const oldCheckpoint = toCheckpoint(ctx, old);
    await ctx.recorder.idle();
    await saveSavedGame(ctx.db, writeOf(old.room, oldCheckpoint));

    const next = ctx.open();
    const nextCheckpoint = toCheckpoint(ctx, next);
    await ctx.recorder.idle();
    await saveSavedGame(ctx.db, writeOf(next.room, nextCheckpoint, old.room.id));
    expect((await ctx.db.select().from(game)).map((row) => row.id)).toEqual([next.room.id]);
    expect((await ctx.db.select().from(participant)).every((p) => p.gameId === next.room.id)).toBe(true);
    expect((await ctx.db.select().from(savedGame)).map((row) => row.gameId)).toEqual([next.room.id]);

    const third = ctx.open();
    const thirdCheckpoint = toCheckpoint(ctx, third);
    await ctx.recorder.idle();
    await ctx.db.update(game).set({ status: 'finished' }).where(eq(game.id, next.room.id));
    await saveSavedGame(ctx.db, writeOf(third.room, thirdCheckpoint, next.room.id));
    expect((await ctx.db.select().from(game)).map((row) => row.id).sort()).toEqual([next.room.id, third.room.id].sort());
  });

  it('a player removed after the checkpoint and before the save comes back with the adjustments of the checkpoint', async () => {
    const ctx = await setup();
    const g = ctx.open();
    const checkpoint = toCheckpoint(ctx, g);
    g.host({ type: 'next' });
    expect(g.room.state.phase).toBe('question');
    g.host({ type: 'adjust', playerId: g.taras, points: 50 });
    g.host({ type: 'kick', playerId: g.olena });
    await ctx.recorder.idle();
    expect((await ctx.db.select().from(participant)).map((p) => p.id)).toEqual([g.taras]);

    await saveSavedGame(ctx.db, writeOf(g.room, checkpoint));

    const adjustments = await ctx.db.select().from(scoreAdjustment).orderBy(asc(scoreAdjustment.seq));
    expect(adjustments.map((a) => [a.participantId, a.seq, a.points])).toEqual([[g.olena, 1, 20]]);
    const [olena] = await ctx.db.select().from(participant).where(eq(participant.id, g.olena));
    expect(olena.score).toBe(checkpoint.players.find((p) => p.id === g.olena)!.score);
    expect((await ctx.db.select().from(answer).where(eq(answer.participantId, g.olena))).map((a) => a.questionIndex)).toEqual([0]);
    expect(ctx.errors).toEqual([]);
  });

  it('trimToCheckpoint keeps the rows of the closed questions', async () => {
    const ctx = await setup();
    const g = ctx.open();
    const checkpoint = toCheckpoint(ctx, g);
    await ctx.recorder.idle();
    await trimToCheckpoint(ctx.db, g.room.id, checkpoint);
    expect(await ctx.db.select().from(answer)).toHaveLength(2);
    expect(await ctx.db.select().from(scoreAdjustment)).toHaveLength(1);
  });

  it('saving by hand in the middle of question 2 writes the game as saved with question 1 only (manager + recorder)', async () => {
    const ctx = await setup();
    const g = ctx.open();
    toCheckpoint(ctx, g);
    g.host({ type: 'next' });
    ctx.manager.answer(g.room, g.olena, { type: 'text', value: 'Київ' });
    g.host({ type: 'adjust', playerId: g.taras, points: 50 });
    await ctx.recorder.idle();
    g.host({ type: 'save' });
    expect(ctx.manager.get(g.room.code)).toBeUndefined();
    await ctx.recorder.idle();

    const [row] = await ctx.db.select().from(game);
    expect(row).toMatchObject({ id: g.room.id, status: 'saved', questionsPlayed: 1, finishedAt: null });
    expect((await ctx.db.select().from(answer)).filter((a) => a.questionIndex === 1)).toEqual([]);
    expect((await ctx.db.select().from(scoreAdjustment)).map((a) => a.points)).toEqual([20]);
    const [saved] = await ctx.db.select().from(savedGame);
    expect(saved.gameId).toBe(g.room.id);
    expect((saved.data as SavedGameData).state.phase).toBe('leaderboard');
    expect(ctx.errors).toEqual([]);
  });

  it('a failed save is retried in the same queue', async () => {
    const ctx = await setup();
    const db = ctx.db;
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const errors: unknown[] = [];
    const original = db.transaction.bind(db);
    let failNext = false;
    const flaky = new Proxy(db, {
      get(target, key, receiver) {
        if (key === 'transaction') {
          return (...args: Parameters<typeof db.transaction>) => {
            if (failNext) {
              failNext = false;
              return Promise.reject(new Error('db down'));
            }
            return original(...args);
          };
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const recorder = attachRecorder(manager, flaky, (error) => errors.push(error), 1);
    const room = manager.create(makeQuiz([single, text], { speedBonus: false }), HOST, null);
    const joined = manager.join(room.code, 'Олена');
    if (!joined.ok) throw new Error(joined.error);
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    await recorder.idle();
    failNext = true;
    expect(manager.host(room, { type: 'save' })).toEqual({ ok: true });
    await recorder.idle();
    for (let i = 0; i < 50 && (await db.select().from(savedGame)).length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await recorder.idle();
    }
    expect(errors).toHaveLength(1);
    expect((await db.select().from(game))[0].status).toBe('saved');
    expect(await db.select().from(savedGame)).toHaveLength(1);
  });

  it('exactSaved reads only a known state version; isSavedGameData does not check it', async () => {
    const ctx = await setup();
    const g = ctx.open();
    const state = toCheckpoint(ctx, g);
    expect(exactSaved(savedData(state))).toBe(true);
    expect(isSavedGameData(savedData(state))).toBe(true);
    expect(exactSaved(savedData(state, 999))).toBe(false);
    expect(isSavedGameData(savedData(state, 999))).toBe(true);
    for (const raw of [null, {}, { v: 2 }]) {
      expect(exactSaved(raw)).toBe(false);
      expect(isSavedGameData(raw)).toBe(false);
    }
  });
});

describe('continuations in the database (13b)', () => {
  /** Ведуча зберігає гру руками; повертає те, що пішло в saved_game. */
  function saveByHand(ctx: { manager: RoomManager }, g: Opened): SavedGameData {
    let saved: SavedGameData | undefined;
    const off = ctx.manager.onEvent((_room, event) => {
      if (event.type === 'closed' && event.saved !== undefined) saved = event.saved;
    });
    g.host({ type: 'save' });
    off();
    if (saved === undefined) throw new Error('not saved');
    return saved;
  }

  /** Обидва місця зайняті й на зв'язку, «Продовжити», запитання 2; adjust — коригування Тарасу на запитанні; до блокування. */
  function playQuestion2(manager: RoomManager, room: Room, ids: { olena: string; taras: string }, adjust = false) {
    for (const id of [ids.olena, ids.taras]) {
      expect(manager.claim(room.code, id, null)).toMatchObject({ ok: true });
      manager.connect(room, { role: 'player', playerId: id });
    }
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    if (adjust) expect(manager.host(room, { type: 'adjust', playerId: ids.taras, points: 50 })).toEqual({ ok: true });
    manager.answer(room, ids.olena, { type: 'text', value: 'Одеса' });
    manager.answer(room, ids.taras, { type: 'text', value: 'Львів' });
    expect(room.state.phase).toBe('locked');
  }

  it('an exact continuation starts with fresh recorder memory: a stale retry of the old save does not trim the new rows', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: HOST, name: 'Ведуча', email: 'host@example.com' });
    const original = db.transaction.bind(db);
    let failNext = false;
    const flaky = new Proxy(db, {
      get(target, key, receiver) {
        if (key === 'transaction') {
          return (...args: Parameters<typeof db.transaction>) => {
            if (failNext) {
              failNext = false;
              return Promise.reject(new Error('db down'));
            }
            return original(...args);
          };
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const errors: unknown[] = [];
    const recorder = attachRecorder(manager, flaky, (error) => errors.push(error), 20);
    const ctx = { manager };
    const room = manager.create(makeQuiz([single, text], { speedBonus: false }), HOST, null);
    const enter = (nickname: string) => {
      const joined = manager.join(room.code, nickname, null);
      if (!joined.ok) throw new Error(joined.error);
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    };
    const g: Opened = { room, olena: enter('Олена'), taras: enter('Тарас'), host: (command) => expect(manager.host(room, command)).toEqual({ ok: true }) };
    toCheckpoint(ctx, g);
    await recorder.idle();
    failNext = true;
    const saved = saveByHand(ctx, g);
    const result = manager.continueSaved(room.id, HOST, saved);
    if (!result.ok) throw new Error(result.error);
    playQuestion2(manager, result.room, g);
    await recorder.idle();
    // Повтор старого збереження мав би спрацювати за 20 мс.
    await new Promise((resolve) => setTimeout(resolve, 80));
    await recorder.idle();
    expect(errors).toHaveLength(1);
    expect((await db.select().from(answer)).filter((a) => a.questionIndex === 1)).toHaveLength(2);
    expect((await db.select().from(game))[0].questionsPlayed).toBe(2);
  });

  it('an exact continuation trims the rows a crashed continuation left past the stored checkpoint', async () => {
    const ctx = await setup();
    const g = ctx.open();
    toCheckpoint(ctx, g);
    const saved = saveByHand(ctx, g);
    await ctx.recorder.idle();

    // Перше продовження грає запитання 2 (з коригуванням) і «падає» без live_room: рядки лишаються в базі.
    const first = ctx.manager.continueSaved(g.room.id, HOST, saved);
    if (!first.ok) throw new Error(first.error);
    playQuestion2(ctx.manager, first.room, g, true);
    await ctx.recorder.idle();
    expect((await ctx.db.select().from(answer)).some((a) => a.questionIndex === 1)).toBe(true);
    expect((await ctx.db.select().from(game))[0].questionsPlayed).toBe(2);

    // Новий процес: та сама база, продовження із saved_game.
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const recorder = attachRecorder(manager, ctx.db, (error) => ctx.errors.push(error));
    const [row] = await ctx.db.select().from(savedGame);
    const again = manager.continueSaved(g.room.id, HOST, row.data as SavedGameData);
    if (!again.ok) throw new Error(again.error);
    await recorder.idle();
    expect((await ctx.db.select().from(answer)).filter((a) => a.questionIndex === 1)).toEqual([]);
    expect((await ctx.db.select().from(answer)).filter((a) => a.questionIndex === 0)).toHaveLength(2);
    expect((await ctx.db.select().from(scoreAdjustment)).map((a) => a.points)).toEqual([20]);
    const [gameRow] = await ctx.db.select().from(game);
    expect(gameRow).toMatchObject({ status: 'saved', questionsPlayed: 1 });
    expect(ctx.errors).toEqual([]);
  });

  it('a 12r restart replaces the old saved game on its first closed question, but never a finished one', async () => {
    const ctx = await setup();
    const g = ctx.open();
    toCheckpoint(ctx, g);
    saveByHand(ctx, g);
    const done = ctx.open();
    toCheckpoint(ctx, done);
    // Кімната завершеної гри вже закрита (у пам'яті її немає), а гра в історії — finished.
    saveByHand(ctx, done);
    await ctx.recorder.idle();
    await ctx.db.update(game).set({ status: 'finished' }).where(eq(game.id, done.room.id));
    expect((await ctx.db.select().from(game)).map((r) => [r.id, r.status]).sort()).toEqual([[g.room.id, 'saved'], [done.room.id, 'finished']].sort());

    const restart = (gameId: string) => {
      const result = ctx.manager.restartSaved({
        gameId,
        quiz: makeQuiz([single, text], { speedBonus: false }),
        quizId: null,
        hostUserId: HOST,
        autopilot: false,
        roundIndex: 0,
        participants: [{ id: 'old', nickname: 'Олена', userId: null, score: 100, isTeam: false, teamId: null }],
      });
      if (!result.ok) throw new Error(result.error);
      const { room } = result;
      const olena = room.state.players[0].id;
      expect(ctx.manager.claim(room.code, olena, null)).toMatchObject({ ok: true });
      ctx.manager.connect(room, { role: 'player', playerId: olena });
      expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
      return { room, olena };
    };

    const fresh = restart(g.room.id);
    await ctx.recorder.idle();
    // Заставка — ще не закрите запитання: старий запис на місці.
    expect((await ctx.db.select().from(game)).some((r) => r.id === g.room.id)).toBe(true);
    expect(ctx.manager.host(fresh.room, { type: 'next' })).toEqual({ ok: true });
    ctx.manager.answer(fresh.room, fresh.olena, correct);
    expect(fresh.room.state.phase).toBe('locked');
    await ctx.recorder.idle();
    expect((await ctx.db.select().from(game)).some((r) => r.id === g.room.id)).toBe(false);
    expect((await ctx.db.select().from(participant)).some((p) => p.gameId === g.room.id)).toBe(false);

    const overFinished = restart(done.room.id);
    expect(ctx.manager.host(overFinished.room, { type: 'next' })).toEqual({ ok: true });
    ctx.manager.answer(overFinished.room, overFinished.olena, correct);
    await ctx.recorder.idle();
    expect((await ctx.db.select().from(game)).find((r) => r.id === done.room.id)?.status).toBe('finished');
    expect(ctx.errors).toEqual([]);
  });
});
