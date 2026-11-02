import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { banUser, isBanned, unbanUser } from './bans';
import type { Db } from './db/client';
import { adminAction, profile, session, user } from './db/schema';
import { notHidden } from './feed-store';
import { ensureProfile } from './profiles';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const NOW = new Date('2026-11-07T15:00:00.000Z');

beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  n += 1;
  const id = `bu${n}`;
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
  const card = await ensureProfile(db, id);
  return { id, nick: card!.nickname };
}
const logOf = (targetId: string) => db.select().from(adminAction).where(eq(adminAction.targetUserId, targetId));
const sessionsOf = (id: string) => db.select().from(session).where(eq(session.userId, id));
const visible = async (id: string) =>
  (await db.select({ id: profile.userId }).from(profile).where(sql`${profile.userId} = ${id} and ${notHidden(profile.userId)}`)).length === 1;

describe('bans', () => {
  it('bans, ends sessions and writes one log row', async () => {
    const a = await person();
    const b = await person();
    for (const k of [1, 2]) await db.insert(session).values({ id: `${b.id}s${k}`, token: `${b.id}t${k}`, userId: b.id, expiresAt: new Date('2027-01-01') });
    expect((await sessionsOf(b.id)).length).toBe(2);

    expect(await banUser(db, { adminId: a.id, targetId: b.id, reason: 'спам', now: NOW })).toEqual({ ok: true, changed: true });
    expect(await isBanned(db, b.id)).toBe(true);
    expect((await sessionsOf(b.id)).length).toBe(0);
    const log = await logOf(b.id);
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ kind: 'ban', adminId: a.id, adminLabel: a.nick, targetUserId: b.id, targetLabel: b.nick, details: { reason: 'спам' }, at: NOW });

    expect(await banUser(db, { adminId: a.id, targetId: b.id, reason: 'ще', now: NOW })).toEqual({ ok: true, changed: false });
    expect((await logOf(b.id)).length).toBe(1);
  });

  it('refuses an unknown user', async () => {
    const a = await person();
    expect(await banUser(db, { adminId: a.id, targetId: 'ghost', reason: null, now: NOW })).toEqual({ ok: false, error: 'not_found' });
  });

  it('unbans once and hides only while banned', async () => {
    const a = await person();
    const b = await person();
    expect(await visible(b.id)).toBe(true);
    await banUser(db, { adminId: a.id, targetId: b.id, reason: null, now: NOW });
    expect(await visible(b.id)).toBe(false);
    expect(await unbanUser(db, { adminId: a.id, targetId: b.id, now: NOW })).toEqual({ changed: true });
    expect(await isBanned(db, b.id)).toBe(false);
    expect(await visible(b.id)).toBe(true);
    expect((await logOf(b.id)).map((r) => r.kind).sort()).toEqual(['ban', 'unban']);
    expect(await unbanUser(db, { adminId: a.id, targetId: b.id, now: NOW })).toEqual({ changed: false });
    expect((await logOf(b.id)).length).toBe(2);
  });

  it('cascades the ban with the user and keeps the log label when the admin goes', async () => {
    const a = await person();
    const b = await person();
    await banUser(db, { adminId: a.id, targetId: b.id, reason: null, now: NOW });
    await db.delete(user).where(eq(user.id, a.id));
    const [row] = await logOf(b.id);
    expect(row.adminId).toBeNull();
    expect(row.adminLabel).toBe(a.nick);
    await db.delete(user).where(eq(user.id, b.id));
    expect(await isBanned(db, b.id)).toBe(false);
  });
});
