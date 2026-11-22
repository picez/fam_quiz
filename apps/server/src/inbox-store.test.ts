import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { inboxItem, problemReport, pushBroadcast, user } from './db/schema';
import { addBroadcast, addProblemReply, inboxPage, inboxUnread, markInboxRead } from './inbox-store';
import { createTestDb } from './testing/test-db';

const BASE = Date.parse('2026-11-20T10:00:00.000Z');
const at = (minutes: number) => new Date(BASE + minutes * 60_000);

let db: Db;
let n = 0;

async function person(): Promise<string> {
  n += 1;
  const id = `inbox-${n}`;
  await db.insert(user).values({ id, name: `Людина ${n}`, email: `${id}@example.com` });
  return id;
}

async function broadcast(title: string, createdBy: string | null = null): Promise<string> {
  const [row] = await db.insert(pushBroadcast).values({ createdBy, title, text: `Текст: ${title}`, url: '/library', recipients: 'all', peopleCount: 1, createdAt: at(0) }).returning();
  return row.id;
}

beforeAll(async () => {
  db = await createTestDb();
});

describe('inbox store (70)', () => {
  it('lists the newest first, at most 50, and counts every unread', async () => {
    const olya = await person();
    for (let i = 0; i < 55; i += 1) {
      const id = await broadcast(`Розсилка ${i}`);
      await addBroadcast(db, { broadcastId: id, userIds: [olya], now: at(i) });
    }
    const page = await inboxPage(db, olya);
    expect(page.items).toHaveLength(50);
    expect(page.unread).toBe(55);
    expect(page.items[0]).toMatchObject({ kind: 'broadcast', title: 'Розсилка 54', text: 'Текст: Розсилка 54', url: '/library', read: false, at: at(54).toISOString() });
    expect(page.items[49]).toMatchObject({ title: 'Розсилка 5' });
    expect(await inboxUnread(db, olya)).toBe(55);
  });

  it('a reply quotes the first 200 characters of the report', async () => {
    const olya = await person();
    const [problem] = await db
      .insert(problemReport)
      .values({ userId: olya, fromAccount: true, text: 'я'.repeat(300), reply: 'Виправили', repliedAt: at(5), status: 'resolved', createdAt: at(1) })
      .returning();
    await db.transaction((tx) => addProblemReply(tx, { userId: olya, problemId: problem.id, now: at(5) }));
    await db.transaction((tx) => addProblemReply(tx, { userId: olya, problemId: problem.id, now: at(6) }));
    const page = await inboxPage(db, olya);
    expect(page.items).toHaveLength(1);
    const [item] = page.items;
    expect(item).toMatchObject({ kind: 'problem_reply', reply: 'Виправили', read: false, at: at(5).toISOString() });
    if (item!.kind !== 'problem_reply') throw new Error('kind');
    expect(item!.problem).toEqual({ id: problem.id, at: at(1).toISOString(), text: 'я'.repeat(200) });
  });

  it('a broadcast stays after its admin account is deleted', async () => {
    const admin = await person();
    const olya = await person();
    const id = await broadcast('Від адміна', admin);
    await addBroadcast(db, { broadcastId: id, userIds: [olya, olya], now: at(1) });
    await db.delete(user).where(eq(user.id, admin));
    const page = await inboxPage(db, olya);
    expect(page.items.map((item) => item.kind === 'broadcast' && item.title)).toEqual(['Від адміна']);
  });

  it('marks read up to a time, only own rows', async () => {
    const olya = await person();
    const taras = await person();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push(await broadcast(`Б${i}`));
    for (let i = 0; i < 5; i += 1) await addBroadcast(db, { broadcastId: ids[i]!, userIds: [olya, taras], now: at(i) });
    expect(await markInboxRead(db, { userId: olya, upTo: at(2), now: at(10) })).toBe(2);
    const page = await inboxPage(db, olya);
    expect(page.items.map((item) => item.read)).toEqual([false, false, true, true, true]);
    expect(page.unread).toBe(2);
    expect(await inboxUnread(db, taras)).toBe(5);
    const rows = await db.select().from(inboxItem).where(eq(inboxItem.userId, olya));
    expect(rows.filter((row) => row.readAt !== null).every((row) => row.readAt!.getTime() === at(10).getTime())).toBe(true);
    // Повторна позначка не зсуває час прочитання.
    expect(await markInboxRead(db, { userId: olya, upTo: at(4), now: at(20) })).toBe(0);
    const again = await db.select().from(inboxItem).where(eq(inboxItem.userId, olya));
    expect(again.filter((row) => row.readAt!.getTime() === at(10).getTime())).toHaveLength(3);
  });

  it('a large broadcast goes in batches without duplicates', async () => {
    // Понад дві пачки по 500.
    const people = Array.from({ length: 1001 }, (_, i) => `inbox-many-${i}`);
    await db.insert(user).values(people.map((id) => ({ id, name: id, email: `${id}@example.com` })));
    const id = await broadcast('Пачка');
    await db.transaction((tx) => addBroadcast(tx, { broadcastId: id, userIds: people, now: at(1) }));
    await db.transaction((tx) => addBroadcast(tx, { broadcastId: id, userIds: people, now: at(2) }));
    expect(await db.select().from(inboxItem).where(eq(inboxItem.broadcastId, id))).toHaveLength(1001);
  });
});
