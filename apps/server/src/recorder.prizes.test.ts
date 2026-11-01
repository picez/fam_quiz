import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { PrizeContent } from '@quiz/shared';
import * as achievements from './achievement-store';
import type { Db } from './db/client';
import { game, prize, prizeAward, savedGame, user } from './db/schema';
import * as prizes from './prizes';
import { createPrize, reservePlaces, showcaseOf } from './prizes';
import { attachRecorder, type Recorder } from './recorder';
import type { SavedGameData } from './rooms/continuation';
import { LOBBY_TTL_MS, RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import { toEnd, toQuestion } from './testing/team-game';

vi.mock('./achievement-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./achievement-store')>();
  return { ...original, awardGame: vi.fn(original.awardGame) };
});
vi.mock('./prizes', async (importOriginal) => {
  const original = await importOriginal<typeof import('./prizes')>();
  return { ...original, awardPrizes: vi.fn(original.awardPrizes) };
});

afterEach(() => {
  vi.mocked(prizes.awardPrizes).mockClear();
  vi.mocked(achievements.awardGame).mockClear();
});

const HOST = 'u1';
const OLA = 'u2';
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const content = (name: string): PrizeContent => ({ name, trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false });

async function world(db?: Db) {
  const base = db ?? (await createTestDb());
  if (db === undefined) {
    await base.insert(user).values([
      { id: HOST, name: 'Ведуча', email: 'host@example.com' },
      { id: OLA, name: 'Оля', email: 'ola@example.com' },
    ]);
  }
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, base, (error) => errors.push(error), 1);
  return { db: base, scheduler, manager, recorder, errors };
}

type World = Awaited<ReturnType<typeof world>>;

/** Кімната ведучого u1: Оля (u2) і гість Петро; кубок — на 1-ше місце, медаль — на 2-ге. */
async function lobby(w: World) {
  const room = w.manager.create(makeQuiz([single, text], { speedBonus: false }), HOST, null);
  w.manager.connect(room, { role: 'host', playerId: null });
  const enter = (nickname: string, userId: string | null) => {
    const joined = w.manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    w.manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const ola = enter('Оля', OLA);
  const petro = enter('Петро', null);
  const make = async (name: string) => {
    const made = await createPrize(w.db, HOST, content(name));
    if (!made.ok) throw new Error(made.error);
    return made.prize.id;
  };
  const cup = await make('Кубок');
  const medal = await make('Медаль');
  const reserved = await reservePlaces(w.db, HOST, room.id, [cup, medal, null]);
  if (!reserved.ok) throw new Error(reserved.error);
  expect(w.manager.setPrizes(room, reserved.placed)).toEqual({ ok: true });
  return { room, ola, petro, cup, medal };
}

/** Перше запитання: Оля права, Петро ні; далі до таблиці. */
function playFirst(w: World, g: { room: Room; ola: string; petro: string }) {
  expect(w.manager.host(g.room, { type: 'start' })).toEqual({ ok: true });
  toQuestion(w.manager, g.room);
  w.manager.answer(g.room, g.ola, right);
  w.manager.answer(g.room, g.petro, wrong);
  for (let i = 0; i < 4 && g.room.state.phase !== 'leaderboard'; i++) w.manager.host(g.room, { type: 'next' });
  expect(g.room.state.phase).toBe('leaderboard');
}

const statusOf = async (db: Db, id: string) => (await db.select().from(prize).where(eq(prize.id, id)))[0]?.status;
const gameStatus = async (db: Db, id: string) => (await db.select().from(game).where(eq(game.id, id)))[0]?.status;

describe('prizes in the recorder', () => {
  it('a finished game awards the cup to Оля after the history and achievements; the guest place goes back', async () => {
    const w = await world();
    const g = await lobby(w);
    playFirst(w, g);
    toEnd(w.manager, g.room);
    expect(g.room.state.phase).toBe('finished');
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await statusOf(w.db, g.cup)).toBe('awarded');
    expect(await statusOf(w.db, g.medal)).toBe('free');
    const { awards } = await showcaseOf(w.db, OLA);
    expect(awards).toHaveLength(1);
    expect(awards[0]).toMatchObject({ place: 1, nickname: 'Оля', quizTitle: g.room.state.quiz.title });
    expect(await gameStatus(w.db, g.room.id)).toBe('finished');
    const awardGame = vi.mocked(achievements.awardGame);
    const awardPrizes = vi.mocked(prizes.awardPrizes);
    expect(awardGame).toHaveBeenCalledTimes(1);
    expect(awardPrizes).toHaveBeenCalledTimes(1);
    expect(awardGame.mock.invocationCallOrder[0]).toBeLessThan(awardPrizes.mock.invocationCallOrder[0]);
  });

  it('a failed award is retried and awards the cup once', async () => {
    const w = await world();
    const g = await lobby(w);
    vi.mocked(prizes.awardPrizes).mockRejectedValueOnce(new Error('db down'));
    playFirst(w, g);
    toEnd(w.manager, g.room);
    await w.recorder.idle();
    expect(w.errors).toHaveLength(1);
    // Повтор чекає на таймер (retryMs 1).
    await vi.waitFor(async () => expect(await statusOf(w.db, g.cup)).toBe('awarded'));
    await w.recorder.idle();
    expect(await w.db.select().from(prizeAward)).toHaveLength(1);
    expect(await gameStatus(w.db, g.room.id)).toBe('finished');
    expect(vi.mocked(achievements.awardGame)).toHaveBeenCalledTimes(1);
  });

  it('a room restored already finished does not award again', async () => {
    const w = await world();
    const g = await lobby(w);
    playFirst(w, g);
    toEnd(w.manager, g.room);
    await w.recorder.idle();
    const saved = w.manager.snapshot(g.room);
    expect(saved.prizes).toHaveLength(2);

    const next = await world(w.db);
    expect(next.manager.restore(saved)).not.toBeNull();
    await next.recorder.idle();
    expect(next.errors).toEqual([]);
    expect(await w.db.select().from(prizeAward)).toHaveLength(1);
    expect(await statusOf(w.db, g.cup)).toBe('awarded');
  });

  it('a lobby that times out gives both prizes back', async () => {
    const w = await world();
    const g = await lobby(w);
    w.scheduler.advance(LOBBY_TTL_MS);
    expect(w.manager.get(g.room.code)).toBeUndefined();
    await w.recorder.idle();
    expect(await statusOf(w.db, g.cup)).toBe('free');
    expect(await statusOf(w.db, g.medal)).toBe('free');
  });

  it('«end the game» right after the start gives both prizes back and awards nothing', async () => {
    const w = await world();
    const g = await lobby(w);
    expect(w.manager.host(g.room, { type: 'start' })).toEqual({ ok: true });
    expect(w.manager.host(g.room, { type: 'end' })).toEqual({ ok: true });
    expect(g.room.state.phase).toBe('finished');
    expect(g.room.state.plays).toEqual([]);
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await statusOf(w.db, g.cup)).toBe('free');
    expect(await statusOf(w.db, g.medal)).toBe('free');
    expect(await w.db.select().from(prizeAward)).toEqual([]);
  });

  it('«save for later» keeps both prizes reserved for the saved game, and the saved data carries them', async () => {
    const w = await world();
    const g = await lobby(w);
    playFirst(w, g);
    w.manager.host(g.room, { type: 'next' });
    expect(g.room.state.phase).toBe('question');
    expect(w.manager.host(g.room, { type: 'save' })).toEqual({ ok: true });
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await gameStatus(w.db, g.room.id)).toBe('saved');
    expect(await statusOf(w.db, g.cup)).toBe('reserved');
    expect(await statusOf(w.db, g.medal)).toBe('reserved');
    const [row] = await w.db.select().from(savedGame).where(eq(savedGame.gameId, g.room.id));
    expect((row.data as SavedGameData).prizes?.map((p) => p.id)).toEqual([g.cup, g.medal]);
  });

  it('an exact continuation plays for the same prizes and awards them at the finish', async () => {
    const w = await world();
    const g = await lobby(w);
    playFirst(w, g);
    w.manager.host(g.room, { type: 'next' });
    expect(w.manager.host(g.room, { type: 'save' })).toEqual({ ok: true });
    await w.recorder.idle();
    const [row] = await w.db.select().from(savedGame).where(eq(savedGame.gameId, g.room.id));

    const continued = w.manager.continueSaved(g.room.id, HOST, row.data as SavedGameData);
    if (!continued.ok) throw new Error(continued.error);
    const room = continued.room;
    expect(room.prizes.map((p) => p.id)).toEqual([g.cup, g.medal]);
    expect(w.manager.view(room, { role: 'stage', playerId: null })?.prizes?.places).toHaveLength(2);
    w.manager.connect(room, { role: 'host', playerId: null });
    w.manager.host(room, { type: 'resume' });
    toEnd(w.manager, room);
    expect(room.state.phase).toBe('finished');
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await statusOf(w.db, g.cup)).toBe('awarded');
    expect(await statusOf(w.db, g.medal)).toBe('free');
    expect(await w.db.select().from(prizeAward)).toHaveLength(1);
  });

  it('a room purged by the day-old sweep without a saved record gives the prizes back; with one it keeps them', async () => {
    const { abandonRooms } = await import('./saved-games');
    const w = await world();
    const fresh = await lobby(w);
    const playing = await lobby(w);
    playFirst(w, playing);
    w.manager.host(playing.room, { type: 'next' });
    await w.recorder.idle();
    await abandonRooms(
      w.db,
      [fresh.room, playing.room].map((room) => ({ roomId: room.id, data: w.manager.snapshot(room) })),
      (error) => w.errors.push(error),
    );
    expect(w.errors).toEqual([]);
    expect(await statusOf(w.db, fresh.cup)).toBe('free');
    expect(await statusOf(w.db, fresh.medal)).toBe('free');
    expect(await gameStatus(w.db, playing.room.id)).toBe('saved');
    expect(await statusOf(w.db, playing.cup)).toBe('reserved');
    const [row] = await w.db.select().from(savedGame).where(eq(savedGame.gameId, playing.room.id));
    expect((row.data as SavedGameData).prizes?.map((p) => p.id)).toEqual([playing.cup, playing.medal]);
  });
});
