import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, withId } from '@quiz/engine/testing';
import * as achievements from './achievement-store';
import { game, user, userAchievement, xpEntry } from './db/schema';
import { attachRecorder } from './recorder';
import { LOBBY_TTL_MS, RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import { toQuestion } from './testing/team-game';
import * as xp from './xp-store';

vi.mock('./achievement-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./achievement-store')>();
  return { ...original, awardGame: vi.fn(original.awardGame) };
});
vi.mock('./xp-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./xp-store')>();
  return { ...original, creditGame: vi.fn(original.creditGame) };
});

afterEach(() => {
  vi.mocked(xp.creditGame).mockClear();
  vi.mocked(achievements.awardGame).mockClear();
});

const HOST = 'u1';
const USERS = { Оля: 'u2', Віра: 'u3', Іра: 'u4' } as const;
const right = { type: 'single', optionId: 'b' } as const;

async function world() {
  const db = await createTestDb();
  await db.insert(user).values([
    { id: HOST, name: 'Ведуча', email: 'host@example.com' },
    ...Object.entries(USERS).map(([name, id]) => ({ id, name, email: `${id}@example.com` })),
  ]);
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error), 1);
  return { db, scheduler, manager, recorder, errors };
}

type World = Awaited<ReturnType<typeof world>>;

/** Кімната ведучого u1 з п'яти запитань і трьома акаунтами. */
function lobby(w: World) {
  const questions = [1, 2, 3, 4, 5].map((n) => withId(single, `q${n}`));
  const room = w.manager.create(makeQuiz(questions, { speedBonus: false }), HOST, null);
  w.manager.connect(room, { role: 'host', playerId: null });
  const ids = Object.entries(USERS).map(([nickname, userId]) => {
    const joined = w.manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    w.manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  });
  return { room, ids };
}

/** Ведучий проходить усю гру: на кожному запитанні відповідає перший гравець. */
function playAll(w: World, g: { room: Room; ids: string[] }) {
  expect(w.manager.host(g.room, { type: 'start' })).toEqual({ ok: true });
  for (let guard = 0; guard < 80 && g.room.state.phase !== 'finished'; guard++) {
    if (g.room.state.phase === 'question') {
      w.manager.answer(g.room, g.ids[0], right);
      w.manager.host(g.room, { type: 'lock' });
    } else w.manager.host(g.room, { type: 'next' });
  }
  expect(g.room.state.phase).toBe('finished');
}

const gameRows = (w: World) => w.db.select().from(xpEntry).where(eq(xpEntry.source, 'game'));

describe('XP in the recorder', () => {
  it('a finished game credits every account of the table once', async () => {
    const w = await world();
    const g = lobby(w);
    playAll(w, g);
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    const rows = await gameRows(w);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.userId).sort()).toEqual(Object.values(USERS).sort());
    expect(rows.every((r) => r.gameId === g.room.id)).toBe(true);
    expect(vi.mocked(xp.creditGame)).toHaveBeenCalledTimes(1);
  });

  it('a failed credit is retried and leaves exactly three rows', async () => {
    const w = await world();
    const g = lobby(w);
    vi.mocked(xp.creditGame).mockRejectedValueOnce(new Error('db down'));
    playAll(w, g);
    await w.recorder.idle();
    expect(w.errors).toHaveLength(1);
    await vi.waitFor(async () => expect(await gameRows(w)).toHaveLength(3));
    await w.recorder.idle();
    expect(await gameRows(w)).toHaveLength(3);
    const [row] = await w.db.select().from(game).where(eq(game.id, g.room.id));
    expect(row.status).toBe('finished');
  });

  it('a game that never finished credits nothing', async () => {
    const w = await world();
    const g = lobby(w);
    toQuestion(w.manager, g.room);
    w.scheduler.advance(LOBBY_TTL_MS);
    await w.recorder.idle();
    expect(await w.db.select().from(xpEntry)).toEqual([]);
    expect(vi.mocked(xp.creditGame)).not.toHaveBeenCalled();
  });

  it('credits after the achievements: first_game is already earned and has its XP row', async () => {
    const w = await world();
    const g = lobby(w);
    playAll(w, g);
    await w.recorder.idle();
    const awardGame = vi.mocked(achievements.awardGame);
    const creditGame = vi.mocked(xp.creditGame);
    expect(awardGame.mock.invocationCallOrder[0]).toBeLessThan(creditGame.mock.invocationCallOrder[0]);
    const owned = await w.db.select().from(userAchievement).where(and(eq(userAchievement.userId, USERS.Оля), eq(userAchievement.achievementId, 'first_game')));
    expect(owned).toHaveLength(1);
    const credited = await w.db.select().from(xpEntry).where(and(eq(xpEntry.userId, USERS.Оля), eq(xpEntry.source, 'achievement'), eq(xpEntry.achievementId, 'first_game')));
    expect(credited).toHaveLength(1);
  });
});
