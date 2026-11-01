import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { user, userTitle } from './db/schema';
import * as prizes from './prizes';
import { RoomManager } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import { attachTitles } from './titles';

vi.mock('./prizes', async (importOriginal) => {
  const original = await importOriginal<typeof import('./prizes')>();
  return { ...original, currentTitles: vi.fn(original.currentTitles) };
});

afterEach(() => {
  vi.mocked(prizes.currentTitles).mockClear();
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
  const titles = attachTitles(manager, db, (error) => errors.push(error));
  const room = manager.create(makeQuiz([single]), 'u1', null);
  return { db, manager, titles, errors, room };
}

const day = 24 * 60 * 60_000;

describe('titles of accounts in the room', () => {
  it('Оля comes in with her title; a later change does not ask the database again', async () => {
    const w = await world();
    const now = Date.now();
    await w.db.insert(userTitle).values({ userId: 'u2', text: '👑 Король', gameId: randomUUID(), awardedAt: new Date(now), expiresAt: new Date(now + day) });
    const joined = w.manager.join(w.room.code, 'Оля', 'u2');
    if (!joined.ok) throw new Error(joined.error);
    await w.titles.idle();
    expect(w.errors).toEqual([]);
    expect(w.manager.view(w.room, STAGE)?.titles).toEqual({ 'Оля': '👑 Король' });
    const calls = vi.mocked(prizes.currentTitles).mock.calls.length;
    w.manager.connect(w.room, { role: 'player', playerId: joined.playerId });
    w.manager.join(w.room.code, 'Петро', null);
    await w.titles.idle();
    expect(vi.mocked(prizes.currentTitles).mock.calls.length).toBe(calls);
    expect(vi.mocked(prizes.currentTitles).mock.calls.flatMap(([, ids]) => ids)).toEqual(['u2']);
  });

  it('an expired title is not shown', async () => {
    const w = await world();
    const now = Date.now();
    await w.db.insert(userTitle).values({ userId: 'u2', text: '👑 Король', gameId: randomUUID(), awardedAt: new Date(now - 8 * day), expiresAt: new Date(now - day) });
    const joined = w.manager.join(w.room.code, 'Оля', 'u2');
    if (!joined.ok) throw new Error(joined.error);
    await w.titles.idle();
    expect(w.manager.view(w.room, STAGE)?.titles).toBeUndefined();
  });

  it('a failed read is retried on the next change', async () => {
    const w = await world();
    const now = Date.now();
    await w.db.insert(userTitle).values({ userId: 'u2', text: '⭐ Зірка', gameId: randomUUID(), awardedAt: new Date(now), expiresAt: new Date(now + day) });
    vi.mocked(prizes.currentTitles).mockRejectedValueOnce(new Error('db down'));
    const joined = w.manager.join(w.room.code, 'Оля', 'u2');
    if (!joined.ok) throw new Error(joined.error);
    await w.titles.idle();
    expect(w.errors).toHaveLength(1);
    expect(w.manager.view(w.room, STAGE)?.titles).toBeUndefined();
    w.manager.connect(w.room, { role: 'player', playerId: joined.playerId });
    await w.titles.idle();
    expect(w.manager.view(w.room, STAGE)?.titles).toEqual({ 'Оля': '⭐ Зірка' });
  });
});
