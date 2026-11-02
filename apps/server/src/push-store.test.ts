import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { calendarEvent, pushSubscription, user } from './db/schema';
import { deleteOwnSubscription, dropEndpoint, saveSubscription, subscriptionsOf } from './push-store';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const NOW = new Date('2026-11-07T15:00:00.000Z');
const URL = 'https://fcm.googleapis.com/fcm/send/';

beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  n += 1;
  const id = `pu${n}`;
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
  return id;
}

const sub = (k: number) => ({ endpoint: URL + k, keys: { p256dh: 'BP' + k, auth: 'au' + k } });
const rowsOf = (userId: string) => db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));

describe('push store', () => {
  it('saves a subscription and replaces keys on repeat', async () => {
    const o = await person();
    await saveSubscription(db, o, sub(1), NOW);
    expect(await subscriptionsOf(db, [o])).toEqual([
      { endpoint: URL + '1', userId: o, keys: { p256dh: 'BP1', auth: 'au1' } },
    ]);
    await saveSubscription(db, o, { ...sub(1), keys: { p256dh: 'NEW', auth: 'newauth' } }, NOW);
    expect(await subscriptionsOf(db, [o])).toEqual([
      { endpoint: URL + '1', userId: o, keys: { p256dh: 'NEW', auth: 'newauth' } },
    ]);
  });

  it('moves a device to whoever subscribes it last', async () => {
    const o = await person();
    const p = await person();
    await saveSubscription(db, o, sub(100), NOW);
    await saveSubscription(db, p, sub(100), NOW);
    expect(await subscriptionsOf(db, [o])).toEqual([]);
    expect((await subscriptionsOf(db, [p])).map((s) => s.endpoint)).toEqual([URL + '100']);
  });

  it('keeps the ten newest per person', async () => {
    const o = await person();
    for (let i = 0; i <= 10; i += 1) await saveSubscription(db, o, sub(200 + i), new Date(NOW.getTime() + i * 60_000));
    const endpoints = (await rowsOf(o)).map((r) => r.endpoint);
    expect(endpoints).toHaveLength(10);
    expect(endpoints).not.toContain(URL + '200');
    expect(endpoints).toContain(URL + '210');
  });

  it('deletes only own subscriptions', async () => {
    const o = await person();
    const p = await person();
    await saveSubscription(db, o, sub(2), NOW);
    expect(await deleteOwnSubscription(db, p, URL + '2')).toBe(false);
    expect(await rowsOf(o)).toHaveLength(1);
    expect(await deleteOwnSubscription(db, o, URL + '2')).toBe(true);
    expect(await rowsOf(o)).toHaveLength(0);
  });

  it('drops an endpoint, and an unknown one is fine', async () => {
    const o = await person();
    await saveSubscription(db, o, sub(3), NOW);
    await dropEndpoint(db, URL + '3');
    expect(await rowsOf(o)).toHaveLength(0);
    await expect(dropEndpoint(db, URL + 'nope')).resolves.toBeUndefined();
  });

  it('returns nothing for no people', async () => {
    expect(await subscriptionsOf(db, [])).toEqual([]);
  });

  it('cascades on user delete', async () => {
    const o = await person();
    await saveSubscription(db, o, sub(4), NOW);
    await db.delete(user).where(eq(user.id, o));
    expect(await rowsOf(o)).toHaveLength(0);
  });

  it('has null sent marks on calendar events', async () => {
    const hostId = await person();
    const [row] = await db.insert(calendarEvent).values({ hostId, title: 'Вечір', startsAt: NOW, createdAt: NOW }).returning();
    expect(row.remindedAt).toBeNull();
    expect(row.openedPushedAt).toBeNull();
  });
});
