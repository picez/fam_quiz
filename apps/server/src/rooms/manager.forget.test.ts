import { DELETED_NICKNAME } from '@quiz/shared';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { deleteAccount } from '../account-delete';
import { game, participant, profile, user } from '../db/schema';
import { attachRecorder } from '../recorder';
import { FakeScheduler } from '../testing/fake-scheduler';
import { createTestDb } from '../testing/test-db';
import { RoomManager, type Room } from './manager';

const quiz = () => makeQuiz([single, text], { speedBonus: false });

function enter(manager: RoomManager, room: Room, nickname: string, userId: string | null): string {
  const joined = manager.join(room.code, nickname, userId);
  if (!joined.ok) throw new Error(joined.error);
  manager.connect(room, { role: 'player', playerId: joined.playerId });
  return joined.playerId;
}

describe('forgetUser (58, account deletion)', () => {
  it('unbinds the account in every live room and in continued.bound, other accounts stay', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const first = manager.create(quiz(), 'host-1', null);
    const second = manager.create(quiz(), 'host-2', null);
    const taras1 = enter(manager, first, 'Тарас', 'taras');
    const olia = enter(manager, first, 'Оля', 'olia');
    const taras2 = enter(manager, second, 'Тарас', 'taras');
    second.continued = { bound: new Set([taras2]), carry: null, replaces: null };

    expect(manager.forgetUser('taras')).toBe(2);

    expect(first.playerUsers.has(taras1)).toBe(false);
    expect(first.playerUsers.get(olia)).toBe('olia');
    expect(second.playerUsers.has(taras2)).toBe(false);
    expect(second.continued.bound.has(taras2)).toBe(false);
    expect(first.state.players.some((p) => p.id === taras1)).toBe(true);
    expect(manager.forgetUser('taras')).toBe(0);
  });

  it('forgetUser unbinds the account in live rooms and the game still records', async () => {
    const db = await createTestDb();
    await db.insert(user).values([
      { id: 'admin', name: 'Адмін', email: 'admin@example.com' },
      { id: 'olia', name: 'Оля', email: 'olia@example.com' },
      { id: 'taras', name: 'Тарас', email: 'taras@example.com' },
    ]);
    await db.insert(profile).values({ userId: 'taras', nickname: 'Тарас', nicknameKey: 'тарас' });
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const errors: unknown[] = [];
    const recorder = attachRecorder(manager, db, (error) => errors.push(error));
    const room = manager.create(quiz(), 'olia', null);
    const guest = enter(manager, room, 'Олена', null);
    const taras = enter(manager, room, 'Тарас', 'taras');
    const host = (command: Parameters<RoomManager['host']>[1]) => expect(manager.host(room, command)).toEqual({ ok: true });
    host({ type: 'start' });
    host({ type: 'next' });
    manager.answer(room, guest, { type: 'single', optionId: 'b' });
    manager.answer(room, taras, { type: 'single', optionId: 'a' });
    host({ type: 'next' });
    await recorder.idle();
    expect((await db.select().from(participant).where(eq(participant.id, taras)))[0]?.userId).toBe('taras');

    expect(manager.forgetUser('taras')).toBe(1);
    expect(room.playerUsers.has(taras)).toBe(false);
    expect(await deleteAccount(db, { adminId: 'admin', userId: 'taras', now: new Date() })).toBe(true);

    host({ type: 'end' });
    expect(room.state.phase).toBe('finished');
    await recorder.idle();
    expect(errors).toEqual([]);
    expect((await db.select().from(game).where(eq(game.id, room.id)))[0]).toMatchObject({ status: 'finished', hostId: 'olia' });
    const [row] = await db.select().from(participant).where(eq(participant.id, taras));
    expect(row).toMatchObject({ userId: null, nickname: DELETED_NICKNAME });
  });
});
