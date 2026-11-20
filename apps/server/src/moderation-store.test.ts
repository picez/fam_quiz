import { randomUUID } from 'node:crypto';
import { ADMIN_PAGE_SIZE, type FeedData } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { adminAction, feedEvent, profile, user, userBan, userLike } from './db/schema';
import { adminFeed, setFeedHidden } from './moderation-store';
import { createTestDb } from './testing/test-db';

const NOW = new Date('2026-11-20T12:00:00.000Z');

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: 'adm', name: 'Адмін', email: 'adm@example.com' });
  await db.insert(profile).values({ userId: 'adm', nickname: 'Адмін', nicknameKey: 'адмін' });
});

async function person(nickname: string) {
  n += 1;
  const id = `u${n}`;
  await db.insert(user).values({ id, name: nickname, email: `${id}@example.com` });
  await db.insert(profile).values({ userId: id, nickname, nicknameKey: `${nickname.toLowerCase()}${n}` });
  return id;
}

let keys = 0;
async function event(userId: string, data: FeedData, at: Date, gameId: string | null = null) {
  keys += 1;
  const [row] = await db
    .insert(feedEvent)
    .values({ key: `${data.kind}:m:${keys}`, userId, kind: data.kind as never, gameId, data, at, createdAt: at })
    .returning();
  return row;
}

const level: FeedData = { kind: 'level', level: 3 };
const prize: FeedData = { kind: 'prize', place: 1 as never, name: 'Кубок', title: 'Писанки', nickTitle: null };

describe('moderation store: feed (63)', () => {
  it('adminFeed lists every event 50 a page, by person and kind, hidden included', async () => {
    const olya = await person('Оля');
    const petro = await person('Петро');
    for (let i = 0; i < 49; i++) await event(olya, level, new Date(NOW.getTime() - (i + 10) * 60_000));
    const p1 = await event(olya, prize, new Date(NOW.getTime() - 5 * 60_000));
    const p2 = await event(olya, prize, new Date(NOW.getTime() - 6 * 60_000));
    const ep = await event(petro, level, new Date(NOW.getTime() - 100 * 60_000));
    await db.insert(userBan).values({ userId: petro, reason: null, bannedBy: 'adm', bannedAt: NOW });
    await db.insert(userLike).values({ userId: petro, kind: 'event', targetUserId: olya, eventKey: p1.key, createdAt: NOW });
    await db.insert(userLike).values({ userId: petro, kind: 'event', targetUserId: olya, eventKey: p2.key, createdAt: NOW });
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: p2.id, hidden: true, now: NOW })).toEqual({ ok: true, changed: true });

    const first = await adminFeed(db, { page: 1 });
    expect(first.rows).toHaveLength(ADMIN_PAGE_SIZE);
    expect(first).toMatchObject({ total: 52, page: 1, pages: 2 });
    expect(first.rows[0]).toEqual({ id: p1.id, at: p1.at.toISOString(), who: { id: olya, nickname: 'Оля' }, data: prize, likes: 1, hidden: null });
    expect(first.rows[1]).toEqual({ id: p2.id, at: p2.at.toISOString(), who: { id: olya, nickname: 'Оля' }, data: prize, likes: 0, hidden: { at: NOW.toISOString() } });
    const second = await adminFeed(db, { page: 2 });
    expect(second.rows).toHaveLength(2);
    expect(second.rows[1].id).toBe(ep.id);
    expect(JSON.stringify(first)).not.toContain('@');

    const byPetro = await adminFeed(db, { page: 1, user: petro });
    expect(byPetro).toMatchObject({ total: 1, rows: [{ id: ep.id, who: { id: petro, nickname: 'Петро' } }] });
    const prizes = await adminFeed(db, { page: 1, kind: 'prize' });
    expect(prizes.rows.map((r) => r.id)).toEqual([p1.id, p2.id]);
    expect(prizes.rows.every((r) => r.data.kind === 'prize')).toBe(true);
  });

  it('setFeedHidden twice changes once and logs once', async () => {
    const olya = await person('Оля');
    const ev = await event(olya, level, new Date(NOW.getTime() - 60_000), randomUUID());
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: ev.id, hidden: true, now: NOW })).toEqual({ ok: true, changed: true });
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: ev.id, hidden: true, now: NOW })).toEqual({ ok: true, changed: false });
    const [row] = await db.select().from(feedEvent).where(eq(feedEvent.id, ev.id));
    expect(row.hiddenAt).toEqual(NOW);
    const logged = (await db.select().from(adminAction).where(eq(adminAction.targetUserId, olya))).filter((a) => a.kind === 'feed_hide');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ adminId: 'adm', adminLabel: 'Адмін', targetLabel: 'Оля', details: { feed: { kind: 'level', level: 3 } } });

    expect(await setFeedHidden(db, { adminId: 'adm', eventId: ev.id, hidden: false, now: NOW })).toEqual({ ok: true, changed: true });
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: ev.id, hidden: false, now: NOW })).toEqual({ ok: true, changed: false });
    const [shown] = await db.select().from(feedEvent).where(eq(feedEvent.id, ev.id));
    expect(shown.hiddenAt).toBeNull();
    const shows = (await db.select().from(adminAction).where(eq(adminAction.targetUserId, olya))).filter((a) => a.kind === 'feed_show');
    expect(shows).toHaveLength(1);

    expect(await setFeedHidden(db, { adminId: 'adm', eventId: randomUUID(), hidden: true, now: NOW })).toEqual({ ok: false, error: 'not_found' });
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: 'not-a-uuid', hidden: true, now: NOW })).toEqual({ ok: false, error: 'not_found' });
  });
});
