import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { announcementCache, activeAnnouncement, clearAnnouncement, setAnnouncement } from './announcement-store';
import type { Db } from './db/client';
import { adminAction, announcement, user } from './db/schema';
import { createTestDb } from './testing/test-db';

let db: Db;
const T = new Date('2026-11-19T10:00:00.000Z');
const at = (ms: number) => new Date(T.getTime() + ms);
const input = (text: string, extra: { url?: string | null; expiresAt?: string | null } = {}) => ({ text, url: extra.url ?? null, expiresAt: extra.expiresAt ?? null });
const logKinds = async (kind: string) => (await db.select().from(adminAction).where(eq(adminAction.kind, kind as never))).length;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: 'adm', name: 'Адмін', email: 'adm@example.com' });
});

async function reset() {
  await db.delete(announcement);
  await db.delete(adminAction);
}

describe('announcement store', () => {
  it('one active announcement at a time, the newest wins and a change gets a new id', async () => {
    await reset();
    expect(await activeAnnouncement(db, T)).toBeNull();
    const first = await setAnnouncement(db, { adminId: 'adm', input: input('Перше', { url: '/library' }), now: T });
    expect(first).toMatchObject({ text: 'Перше', url: '/library', expiresAt: null, createdAt: T.toISOString() });
    expect(await activeAnnouncement(db, at(1000))).toEqual(first);
    const second = await setAnnouncement(db, { adminId: 'adm', input: input('Друге'), now: at(2000) });
    expect(second.id).not.toBe(first.id);
    expect(await activeAnnouncement(db, at(3000))).toEqual(second);
    const rows = await db.select().from(announcement);
    expect(rows.filter((row) => row.clearedAt === null)).toHaveLength(1);
    expect(await logKinds('announcement_set')).toBe(2);
  });

  it('an expired one is not active, one without a limit stays', async () => {
    await reset();
    const limited = await setAnnouncement(db, { adminId: 'adm', input: input('Тимчасове', { expiresAt: at(60_000).toISOString() }), now: T });
    expect(await activeAnnouncement(db, at(59_000))).toEqual(limited);
    expect(await activeAnnouncement(db, at(60_000))).toBeNull();
    const open = await setAnnouncement(db, { adminId: 'adm', input: input('Безстрокове'), now: at(1000) });
    expect(await activeAnnouncement(db, at(400 * 86_400_000))).toEqual(open);
  });

  it('clear takes it away for everyone and logs once; clearing nothing logs nothing', async () => {
    await reset();
    expect(await clearAnnouncement(db, { adminId: 'adm', now: T })).toBe(false);
    expect(await logKinds('announcement_clear')).toBe(0);
    await setAnnouncement(db, { adminId: 'adm', input: input('Тут'), now: T });
    expect(await clearAnnouncement(db, { adminId: 'adm', now: at(1000) })).toBe(true);
    expect(await activeAnnouncement(db, at(2000))).toBeNull();
    expect(await logKinds('announcement_clear')).toBe(1);
    expect(await clearAnnouncement(db, { adminId: 'adm', now: at(3000) })).toBe(false);
    expect(await logKinds('announcement_clear')).toBe(1);
    const [entry] = await db.select().from(adminAction).where(eq(adminAction.kind, 'announcement_clear'));
    expect(entry.details).toEqual({ text: 'Тут' });
  });

  it('the cache serves for a minute, drops an expired one at once and forgets on clear', async () => {
    await reset();
    let clock = T.getTime();
    const cache = announcementCache(db, () => clock);
    expect(await cache.get()).toBeNull();
    // Новий рядок «за спиною» кешу: поки не мине хвилина, його не видно.
    const sneaky = await setAnnouncement(db, { adminId: 'adm', input: input('Нове'), now: T });
    clock += 30_000;
    expect(await cache.get()).toBeNull();
    clock += 31_000;
    expect(await cache.get()).toEqual(sneaky);

    const short = await setAnnouncement(db, { adminId: 'adm', input: input('Коротке', { expiresAt: new Date(clock + 30_000).toISOString() }), now: new Date(clock) });
    cache.clear();
    expect(await cache.get()).toEqual(short);
    clock += 31_000;
    expect(await cache.get()).toBeNull();

    await setAnnouncement(db, { adminId: 'adm', input: input('Ще'), now: new Date(clock) });
    cache.clear();
    expect((await cache.get())?.text).toBe('Ще');
  });
});
