import { BOT_USER_ID } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { banUser } from './bans';
import { ensureBotAccount } from './bot-account';
import { audienceOf } from './broadcast-store';
import type { Db } from './db/client';
import { groupMember, profile, user } from './db/schema';
import { createGroup } from './group-store';
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
