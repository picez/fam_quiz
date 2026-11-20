import { BOT_USER_ID } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { banUser } from './bans';
import { ensureBotAccount } from './bot-account';
import { audienceOf, createBroadcast, finishBroadcast, listBroadcasts } from './broadcast-store';
import type { Db } from './db/client';
import { adminAction, groupMember, profile, pushBroadcast, user } from './db/schema';
import { createGroup, deleteGroup } from './group-store';
import { ensureProfile } from './profiles';
import { saveSubscription } from './push-store';
import { createTestDb } from './testing/test-db';

let db: Db;
const NOW = new Date('2026-11-20T10:00:00.000Z');
// Порядок id задає очікуваний порядок аудиторії.
const OLYA = 'a-olya';
const PETRO = 'b-petro';
const TARAS = 'c-taras';
const HANNA = 'd-hanna';
const MYRON = 'e-myron';
const BARE = 'f-bare';
const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'BP', auth: 'a' } });

async function person(id: string, name: string, withProfile = true) {
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  if (withProfile) await ensureProfile(db, id);
}

beforeAll(async () => {
  db = await createTestDb();
  expect(await ensureBotAccount(db)).toBe(true);
  await person(OLYA, 'Оля');
  await person(PETRO, 'Петро');
  await person(TARAS, 'Тарас');
  await person(HANNA, 'Ганна');
  await person(MYRON, 'Мирон');
  await saveSubscription(db, OLYA, sub('o1'), NOW);
  await saveSubscription(db, OLYA, sub('o2'), NOW);
  await saveSubscription(db, PETRO, sub('p1'), NOW);
  await saveSubscription(db, HANNA, sub('h1'), NOW);
  await saveSubscription(db, MYRON, sub('m1'), NOW);
  await saveSubscription(db, BOT_USER_ID, sub('q1'), NOW);
  await db.update(profile).set({ adminPush: false }).where(eq(profile.userId, HANNA));
  await banUser(db, { adminId: OLYA, targetId: MYRON, reason: null, now: NOW });
});

describe('audienceOf', () => {
  it('audienceOf: only people with a subscription and admin announcements on, never the banned or the bot', async () => {
    expect(await audienceOf(db, { kind: 'all' })).toEqual([OLYA, PETRO]);

    const group = await createGroup(db, TARAS, { name: 'Родина 59', emoji: '🏡', description: '' }, NOW);
    if (!group.ok) throw new Error(group.error);
    await db.insert(groupMember).values([
      { groupId: group.id, userId: OLYA, role: 'member', joinedAt: NOW },
      { groupId: group.id, userId: HANNA, role: 'member', joinedAt: NOW },
    ]);
    expect(await audienceOf(db, { kind: 'group', groupId: group.id })).toEqual([OLYA]);
    expect(await audienceOf(db, { kind: 'group', groupId: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b' })).toEqual([]);

    expect(await audienceOf(db, { kind: 'people', userIds: [PETRO, HANNA, 'нема'] })).toEqual([PETRO]);
    expect(await audienceOf(db, { kind: 'people', userIds: [MYRON, BOT_USER_ID, TARAS] })).toEqual([]);
  });

  it('a person with a subscription and no profile row counts as switched on', async () => {
    await person(BARE, 'Без профілю', false);
    await saveSubscription(db, BARE, sub('f1'), NOW);
    expect(await db.select().from(profile).where(eq(profile.userId, BARE))).toEqual([]);
    expect(await audienceOf(db, { kind: 'all' })).toEqual([OLYA, PETRO, BARE]);
    expect(await audienceOf(db, { kind: 'people', userIds: [BARE] })).toEqual([BARE]);
  });
});

describe('createBroadcast and the history', () => {
  const input = { title: 'Нова вікторина', text: 'Заходьте грати', url: null, recipients: { kind: 'all' } as const };
  const T = new Date('2027-03-01T10:00:00.000Z');
  const MIN = 60_000;
  const at = (ms: number) => new Date(T.getTime() + ms);
  const go = (adminId: string, now: Date, people = [OLYA, PETRO]) => createBroadcast(db, { adminId, input, people, now });
  const counts = async () => ({
    rows: (await db.select().from(pushBroadcast)).length,
    logs: (await db.select().from(adminAction).where(eq(adminAction.kind, 'push_broadcast'))).length,
  });

  it('one broadcast per 10 minutes and 10 per day, shared by all admins', async () => {
    expect((await go(OLYA, T)).ok).toBe(true);
    const soon = await go(PETRO, at(9 * MIN));
    expect(soon).toEqual({ ok: false, error: 'broadcast_too_soon', nextAt: at(10 * MIN).toISOString() });
    expect((await go(PETRO, at(10 * MIN))).ok).toBe(true);
    for (let i = 2; i < 10; i += 1) expect((await go(i % 2 === 0 ? OLYA : PETRO, at(i * 10 * MIN))).ok, 'n' + i).toBe(true);
    expect(await counts()).toEqual({ rows: 10, logs: 10 });
    const day = await go(OLYA, at(100 * MIN));
    expect(day).toEqual({ ok: false, error: 'broadcast_day_limit', nextAt: at(24 * 60 * MIN).toISOString() });
    expect(await counts()).toEqual({ rows: 10, logs: 10 });
    // Обидва ліміти разом: причина — доба, і час теж її.
    expect(await go(OLYA, at(95 * MIN))).toEqual({ ok: false, error: 'broadcast_day_limit', nextAt: at(24 * 60 * MIN).toISOString() });
    expect((await go(OLYA, at(24 * 60 * MIN + 1))).ok).toBe(true);
  });

  it('two broadcasts at once: one passes', async () => {
    const now = new Date('2027-04-01T10:00:00.000Z');
    const results = await Promise.all([go(OLYA, now), go(PETRO, now)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === 'broadcast_too_soon')).toHaveLength(1);
  });

  it('a broadcast logs its title and count', async () => {
    const now = new Date('2027-05-01T10:00:00.000Z');
    const made = await go(OLYA, now);
    expect(made.ok).toBe(true);
    const logs = await db.select().from(adminAction).where(eq(adminAction.kind, 'push_broadcast'));
    const last = logs.find((l) => l.at.getTime() === now.getTime())!;
    expect(last.details).toEqual({ title: 'Нова вікторина', count: 2 });
    expect(last.targetUserId).toBeNull();
  });

  it('history: newest first, admin nickname, group from the snapshot, sending turns interrupted', async () => {
    await db.delete(pushBroadcast);
    const group = await createGroup(db, TARAS, { name: 'Малинські', emoji: '🏡', description: '' }, NOW);
    if (!group.ok) throw new Error(group.error);
    const t1 = new Date('2027-06-01T10:00:00.000Z');
    const t2 = new Date(t1.getTime() + 30 * MIN);
    const first = await createBroadcast(db, { adminId: OLYA, input: { ...input, title: 'Перша', recipients: { kind: 'group', groupId: group.id } }, people: [OLYA], now: t1 });
    const second = await createBroadcast(db, { adminId: PETRO, input: { ...input, title: 'Друга', recipients: { kind: 'people', userIds: [OLYA, 'нема'] } }, people: [OLYA], now: t2 });
    if (!first.ok || !second.ok) throw new Error('not ok');
    await deleteGroup(db, group.id);
    await finishBroadcast(db, second.row.id, { delivered: 2, failed: 1 }, new Date(t2.getTime() + 1000));

    const rows = await listBroadcasts(db, new Date(t2.getTime() + 20 * MIN));
    expect(rows.map((r) => r.title)).toEqual(['Друга', 'Перша']);
    expect(rows[0]).toMatchObject({ admin: 'Петро', status: 'sent', delivered: 2, failed: 1, people: 1, to: { kind: 'people', people: [{ id: OLYA, nickname: 'Оля' }] } });
    expect(rows[1]).toMatchObject({ status: 'interrupted', to: { kind: 'group', name: 'Малинські' } });
    const fresh = await listBroadcasts(db, new Date(t1.getTime() + 5 * MIN));
    expect(fresh.find((r) => r.title === 'Перша')!.status).toBe('sending');
  });
});
