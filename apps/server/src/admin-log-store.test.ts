import { ADMIN_LOG_EXPORT_MAX, type AdminActionKind, type AdminLogFilter, type AdminLogQuery } from '@quiz/shared';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminLogExport as rawExport, adminLogPage as rawPage } from './admin-log-store';
import { logAction } from './bans';
import type { Db } from './db/client';
import { adminAction, profile, user } from './db/schema';
import { createTestDb } from './testing/test-db';

let db: Db;
// Схема дає q як обов'язкове (undefined) у виході — у тестах його можна не писати.
const adminLogPage = (d: Db, f: Partial<AdminLogQuery>) => rawPage(d, { page: 1, q: undefined, ...f });
const adminLogExport = (d: Db, f: Partial<AdminLogFilter>) => rawExport(d, { q: undefined, ...f });
const when = (s: string) => new Date(s);

async function person(id: string, name: string) {
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await db.insert(profile).values({ userId: id, nickname: name, nicknameKey: name.toLowerCase() });
}

const log = (adminId: string, kind: AdminActionKind, targetUserId: string | null, details: object, at: string) =>
  logAction(db, { adminId, kind, targetUserId, details, now: when(at) });

beforeAll(async () => {
  db = await createTestDb();
  await person('hanna', 'Ганна');
  await person('iryna', 'Ірина');
  await person('myron', 'Мирон');
  await log('hanna', 'ban', 'myron', { reason: 'спам' }, '2026-11-19T10:00:00Z');
  await log('hanna', 'group_hide', null, { title: 'Поліські вечори' }, '2026-11-20T21:30:00Z');
  await log('iryna', 'push_broadcast', null, { title: 'Нова вікторина' }, '2026-11-20T09:00:00Z');
  await log('hanna', 'bot_plan_run', null, {}, '2026-11-18T08:00:00Z');
});

const kinds = async (filter: Partial<AdminLogQuery>) => (await adminLogPage(db, filter)).rows.map((r) => r.kind);

describe('the log filters', () => {
  it('reads the action log newest first, 50 per page', async () => {
    const own = await createTestDb();
    await own.insert(user).values({ id: 'ad', name: 'Адмін', email: 'ad@example.com' });
    await own.insert(user).values({ id: 'tg', name: 'Ціль', email: 'tg@example.com' });
    const base = when('2026-11-07T10:00:00Z').getTime();
    await logAction(own, { adminId: 'ad', kind: 'ban', targetUserId: 'tg', details: { reason: 'спам' }, now: new Date(base) });
    await logAction(own, { adminId: 'ad', kind: 'unban', targetUserId: 'tg', details: {}, now: new Date(base + 1000) });
    await logAction(own, { adminId: 'ad', kind: 'quiz_delete', targetUserId: 'tg', details: { title: 'Q' }, now: new Date(base + 2000) });
    const first = await adminLogPage(own, { page: 1 });
    expect(first.rows.map((r) => r.kind)).toEqual(['quiz_delete', 'unban', 'ban']);
    expect(first.rows[2]).toMatchObject({ admin: 'Адмін', target: 'Ціль', details: { reason: 'спам' }, at: new Date(base).toISOString() });
    expect([first.total, first.pages]).toEqual([3, 1]);
    for (let i = 0; i < 50; i += 1) await logAction(own, { adminId: 'ad', kind: 'ban', targetUserId: 'tg', details: {}, now: new Date(base + 10_000 + i) });
    const page1 = await adminLogPage(own, { page: 1 });
    expect([page1.rows.length, page1.total, page1.pages]).toEqual([50, 53, 2]);
    expect((await adminLogPage(own, { page: 2 })).rows.length).toBe(3);
  });

  it('filters by admin, kind groups, a Kyiv day range and text', async () => {
    expect((await adminLogPage(db, { page: 1 })).total).toBe(4);
    expect((await adminLogPage(db, { page: 1, admin: 'hanna' })).total).toBe(3);
    expect(await kinds({ page: 1, admin: 'iryna' })).toEqual(['push_broadcast']);
    expect((await adminLogPage(db, { page: 1, groups: ['announcements', 'bot'] })).total).toBe(2);
    // 23:30 за Києвом 2026-11-20 (21:30 UTC) — ще в цьому дні, а в наступному — ні.
    expect(await kinds({ page: 1, from: '2026-11-20', to: '2026-11-20' })).toEqual(['group_hide', 'push_broadcast']);
    expect((await adminLogPage(db, { page: 1, from: '2026-11-21' })).total).toBe(0);
    expect(await kinds({ page: 1, to: '2026-11-19' })).toEqual(['ban', 'bot_plan_run']);
    expect(await kinds({ page: 1, q: 'полісь' })).toEqual(['group_hide']);
    expect(await kinds({ page: 1, q: 'мирон' })).toEqual(['ban']);
    expect((await adminLogPage(db, { page: 1, q: '%' })).total).toBe(0);
    expect((await adminLogPage(db, { page: 1, q: '_' })).total).toBe(0);
    expect(await kinds({ page: 1, admin: 'hanna', groups: ['moderation'], from: '2026-11-20', q: 'вечори' })).toEqual(['group_hide']);
    expect((await adminLogPage(db, { page: 1, admin: 'iryna', groups: ['moderation'] })).total).toBe(0);
  });

  it('lists admins once each by nickname, with the newest label', async () => {
    await db.insert(adminAction).values({ at: when('2026-11-21T08:00:00Z'), adminId: 'hanna', adminLabel: 'Ганна Нова', kind: 'unban', targetUserId: null, targetLabel: '', details: {} });
    const { admins } = await adminLogPage(db, { page: 1 });
    expect(admins).toEqual([
      { id: 'hanna', nickname: 'Ганна Нова' },
      { id: 'iryna', nickname: 'Ірина' },
    ]);
    await db.delete(adminAction).where(eq(adminAction.kind, 'unban'));
  });
});

describe('the export', () => {
  it('the export returns at most 10 000 rows and the full total', async () => {
    const own = await createTestDb();
    await own.insert(user).values({ id: 'ad', name: 'Адмін', email: 'ad@example.com' });
    const base = when('2026-01-01T00:00:00Z').getTime();
    // Один пакетний insert; через generate_series, бо 10 002 рядків параметрами перевищують межу протоколу.
    await own.execute(sql`insert into admin_action (at, admin_id, admin_label, kind, target_label, details)
      select ${new Date(base).toISOString()}::timestamptz + (i || ' seconds')::interval, 'ad', 'Адмін', 'ban', '', '{}'::jsonb
      from generate_series(0, ${ADMIN_LOG_EXPORT_MAX + 1}) as i`);
    const out = await adminLogExport(own, {});
    expect(out.rows.length).toBe(ADMIN_LOG_EXPORT_MAX);
    expect(out.total).toBe(ADMIN_LOG_EXPORT_MAX + 2);
    expect(out.rows[0]!.at).toBe(new Date(base + (ADMIN_LOG_EXPORT_MAX + 1) * 1000).toISOString());
  });
});
