import { beforeAll, describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import type { Db } from './db/client';
import { calendarEvent, calendarRequest, user } from './db/schema';
import { Invites } from './invites';
import { LobbyGate, gateStatus } from './lobby-access';
import { RoomManager } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  n += 1;
  const id = `lg${n}`;
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
  return id;
}

function setup() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const invites = new Invites(manager);
  const gate = new LobbyGate(db, invites, () => scheduler.now());
  return { scheduler, manager, invites, gate };
}

const GUEST = { userId: null, ip: '1.1.1.1', device: 'a' };

describe('lobby gate (24c)', () => {
  it('no password', async () => {
    const { manager, gate } = setup();
    const room = manager.create(makeQuiz([single]), await person());
    expect(await gate.check(room, { userId: null, ip: '1.1.1.1' })).toBe('ok');
  });

  it('asks for the password, refuses a wrong one, takes a trimmed right one', async () => {
    const { manager, gate } = setup();
    const room = manager.create(makeQuiz([single]), await person());
    manager.setLobby(room, { visibility: 'all', password: 'сова42' });
    expect(await gate.check(room, GUEST)).toBe('password_required');
    expect(await gate.check(room, { ...GUEST, password: 'хибний' })).toBe('password_wrong');
    expect(await gate.check(room, { ...GUEST, password: ' сова42 ' })).toBe('ok');
  });

  it('trusted: host, player, invitee and approved calendar guest need no password', async () => {
    const { manager, invites, gate } = setup();
    const [host, player, olya, approved, pending, stranger] = await Promise.all([person(), person(), person(), person(), person(), person()]);
    const room = manager.create(makeQuiz([single]), host);
    manager.setLobby(room, { visibility: 'friends', password: 'сова42' });
    const joined = manager.join(room.code, 'Гравець', player);
    if (!joined.ok) throw new Error(joined.error);
    invites.invite(room, [olya]);
    const [event] = await db
      .insert(calendarEvent)
      .values({ hostId: host, title: 'Вечір', startsAt: new Date(), gameId: room.id, gameCode: room.code, createdAt: new Date() })
      .returning({ id: calendarEvent.id });
    await db.insert(calendarRequest).values([
      { eventId: event.id, userId: approved, status: 'approved', requestedAt: new Date() },
      { eventId: event.id, userId: pending, status: 'pending', requestedAt: new Date() },
    ]);
    for (const userId of [host, player, olya, approved]) {
      expect(await gate.trusted(room, userId)).toBe(true);
      expect(await gate.check(room, { userId, ip: '1.1.1.1' })).toBe('ok');
    }
    for (const userId of [pending, stranger]) expect(await gate.check(room, { userId, ip: '1.1.1.1' })).toBe('password_required');
    expect(await gate.trusted(room, null)).toBe(false);
  });

  it('dismissed invite', async () => {
    const { manager, invites, gate } = setup();
    const [host, olya] = await Promise.all([person(), person()]);
    const room = manager.create(makeQuiz([single]), host);
    manager.setLobby(room, { visibility: 'friends', password: 'сова42' });
    invites.invite(room, [olya]);
    expect(await gate.check(room, { userId: olya, ip: '1.1.1.1' })).toBe('ok');
    invites.dismiss(olya, room.code);
    expect(await gate.check(room, { userId: olya, ip: '1.1.1.1' })).toBe('password_required');
  });

  it('limit', async () => {
    const { manager, scheduler, gate } = setup();
    const room = manager.create(makeQuiz([single]), await person());
    const other = manager.create(makeQuiz([single]), await person());
    manager.setLobby(room, { visibility: 'all', password: 'сова42' });
    manager.setLobby(other, { visibility: 'all', password: 'сова42' });
    for (let i = 0; i < 5; i += 1) expect(await gate.check(room, { ...GUEST, password: 'хибний' })).toBe('password_wrong');
    expect(await gate.check(room, { ...GUEST, password: 'сова42' })).toBe('password_limited');
    // Без пароля під час блоку — теж блок.
    expect(await gate.check(room, GUEST)).toBe('password_limited');
    expect(await gate.check(room, { ...GUEST, device: 'b', password: 'сова42' })).toBe('ok');
    expect(await gate.check(other, { ...GUEST, password: 'сова42' })).toBe('ok');
    scheduler.advance(60_001);
    expect(await gate.check(room, { ...GUEST, password: 'сова42' })).toBe('ok');

    const vira = await person();
    for (let i = 0; i < 5; i += 1) expect(await gate.check(room, { userId: vira, ip: `2.2.2.${i}`, password: 'хибний' })).toBe('password_wrong');
    expect(await gate.check(room, { userId: vira, ip: '9.9.9.9', device: 'z', password: 'сова42' })).toBe('password_limited');
  });

  it('a missing password does not count as an attempt, and the window restarts after a minute', async () => {
    const { manager, scheduler, gate } = setup();
    const room = manager.create(makeQuiz([single]), await person());
    manager.setLobby(room, { visibility: 'all', password: 'сова42' });
    for (let i = 0; i < 10; i += 1) expect(await gate.check(room, GUEST)).toBe('password_required');
    for (let i = 0; i < 4; i += 1) expect(await gate.check(room, { ...GUEST, password: 'хибний' })).toBe('password_wrong');
    scheduler.advance(60_001);
    for (let i = 0; i < 4; i += 1) expect(await gate.check(room, { ...GUEST, password: 'хибний' })).toBe('password_wrong');
    expect(await gate.check(room, { ...GUEST, password: 'сова42' })).toBe('ok');
  });

  it('maps failures to statuses', () => {
    expect(gateStatus('password_required')).toBe(403);
    expect(gateStatus('password_wrong')).toBe(403);
    expect(gateStatus('password_limited')).toBe(429);
  });
});
