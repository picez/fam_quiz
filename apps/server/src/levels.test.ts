import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import type { NickLevel } from '@quiz/shared';
import { user } from './db/schema';
import { attachLevels } from './levels';
import { RoomManager } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import * as xp from './xp-store';

vi.mock('./xp-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./xp-store')>();
  return { ...original, roomLevels: vi.fn(original.roomLevels) };
});

afterEach(() => {
  vi.mocked(xp.roomLevels).mockClear();
});

const STAGE = { role: 'stage', playerId: null } as const;

async function world() {
  const db = await createTestDb();
  await db.insert(user).values([
    { id: 'u1', name: 'Ведуча', email: 'host@example.com' },
    { id: 'u2', name: 'Оля', email: 'ola@example.com' },
  ]);
  const manager = new RoomManager(new FakeScheduler(), () => 0.5);
  const errors: unknown[] = [];
  const levels = attachLevels(manager, db, (error) => errors.push(error));
  const room = manager.create(makeQuiz([single]), 'u1', null);
  return { db, manager, levels, errors, room };
}

describe('levels of accounts in the room', () => {
  it('Оля comes in with her level; a later change does not ask the database again', async () => {
    const w = await world();
    const joined = w.manager.join(w.room.code, 'Оля', 'u2');
    if (!joined.ok) throw new Error(joined.error);
    await w.levels.idle();
    expect(w.errors).toEqual([]);
    expect(w.manager.view(w.room, STAGE)?.levels).toEqual({ Оля: { level: 1, color: null, frame: null } });
    const calls = vi.mocked(xp.roomLevels).mock.calls.length;
    w.manager.connect(w.room, { role: 'player', playerId: joined.playerId });
    w.manager.join(w.room.code, 'Петро', null);
    await w.levels.idle();
    expect(vi.mocked(xp.roomLevels).mock.calls.length).toBe(calls);
    expect(vi.mocked(xp.roomLevels).mock.calls.flatMap(([, ids]) => ids)).toEqual(['u2']);
  });

  it('a failed read is retried on the next change', async () => {
    const w = await world();
    vi.mocked(xp.roomLevels).mockRejectedValueOnce(new Error('db down'));
    const joined = w.manager.join(w.room.code, 'Оля', 'u2');
    if (!joined.ok) throw new Error(joined.error);
    await w.levels.idle();
    expect(w.errors).toHaveLength(1);
    expect(w.manager.view(w.room, STAGE)?.levels).toBeUndefined();
    w.manager.connect(w.room, { role: 'player', playerId: joined.playerId });
    await w.levels.idle();
    expect(w.manager.view(w.room, STAGE)?.levels).toEqual({ Оля: { level: 1, color: null, frame: null } });
  });

  it('a closed room does not get setLevels', async () => {
    const w = await world();
    let release: (levels: Map<string, NickLevel>) => void = () => {};
    vi.mocked(xp.roomLevels).mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const setLevels = vi.spyOn(w.manager, 'setLevels');
    const joined = w.manager.join(w.room.code, 'Оля', 'u2');
    if (!joined.ok) throw new Error(joined.error);
    w.manager.evict(w.room);
    release(new Map([['u2', { level: 7, color: 'mint', frame: null }]]));
    await w.levels.idle();
    expect(setLevels).not.toHaveBeenCalled();
    expect(w.errors).toEqual([]);
  });
});
