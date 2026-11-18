import type { Quiz } from '@quiz/shared';
import { blitzRound, bool, classicRound, makeRoundsQuiz, multi, numeric, order, single, text } from '@quiz/engine/testing';
import { desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { adminAction, libraryEntry, profile, user, userBan, userReport } from './db/schema';
import { appealEntry, catalog, closeEntry, openEntry } from './library-store';
import { ensureProfile, saveProfile } from './profiles';
import { createQuiz } from './quizzes';
import { actOnProfile, actOnQuiz, fileReport, reportQueue } from './report-store';
import { createTestDb } from './testing/test-db';

const T0 = new Date('2026-11-18T10:00:00Z');

function riversQuiz(): Quiz {
  const questions = [single, multi, bool, text, numeric, order];
  return { ...makeRoundsQuiz([classicRound('r1', questions.slice(0, 4), { title: 'Міста' }), blitzRound('r2', questions.slice(4), { title: 'Річки' })]), title: 'Річки й міста', description: 'Про Дніпро' };
}

async function setup() {
  const db = await createTestDb();
  const ids = ['u-olena', 'u-taras', 'u-iryna', 'u-petro', 'u-maria'];
  await db.insert(user).values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })));
  for (const id of ids) await ensureProfile(db, id);
  const quizId = await createQuiz(db, 'u-olena', riversQuiz());
  const opened = await openEntry(db, 'u-olena', quizId, 'uk', T0);
  if (!opened.ok) throw new Error(opened.error);
  const entryId = opened.entryId;
  const quizReport = (who: string, reason: 'spam' | 'other' = 'spam') => fileReport(db, who, { target: { kind: 'quiz', entryId }, reason }, T0);
  const moderation = async () => (await db.select().from(libraryEntry).where(eq(libraryEntry.id, entryId)))[0]!.moderation;
  return { db, entryId, quizReport, moderation };
}

describe('reports (39-A2)', () => {
  it('a report on a quiz and on a profile', async () => {
    const { db, entryId, quizReport } = await setup();
    expect(await quizReport('u-taras')).toBe('ok');
    expect(await fileReport(db, 'u-taras', { target: { kind: 'profile', userId: 'u-iryna' }, reason: 'offensive', text: 'погана назва' }, T0)).toBe('ok');
    const rows = await db.select().from(userReport);
    const quizRow = rows.find((r) => r.targetKind === 'quiz')!;
    expect(quizRow).toMatchObject({ reporterId: 'u-taras', entryId, targetUserId: 'u-olena', reason: 'spam', text: '', status: 'open' });
    expect(rows.find((r) => r.targetKind === 'profile')).toMatchObject({ targetUserId: 'u-iryna', entryId: null, text: 'погана назва' });
  });

  it('not on yourself, not twice, not on what is not there', async () => {
    const { db, entryId, quizReport } = await setup();
    expect(await quizReport('u-olena')).toBe('cannot_report_self');
    expect(await fileReport(db, 'u-olena', { target: { kind: 'profile', userId: 'u-olena' }, reason: 'spam' }, T0)).toBe('cannot_report_self');

    expect(await quizReport('u-taras')).toBe('ok');
    expect(await quizReport('u-taras', 'other')).toBe('already_reported');
    const profileReport = () => fileReport(db, 'u-taras', { target: { kind: 'profile', userId: 'u-iryna' }, reason: 'spam' }, T0);
    expect(await profileReport()).toBe('ok');
    expect(await profileReport()).toBe('already_reported');

    await db.update(userReport).set({ status: 'dismissed' }).where(eq(userReport.reporterId, 'u-taras'));
    expect(await quizReport('u-taras')).toBe('ok');
    expect(await profileReport()).toBe('ok');

    expect(await fileReport(db, 'u-iryna', { target: { kind: 'quiz', entryId: '99999999-9999-4999-8999-999999999999' }, reason: 'spam' }, T0)).toBe('not_found');
    expect(await fileReport(db, 'u-iryna', { target: { kind: 'quiz', entryId: 'not-a-uuid' }, reason: 'spam' }, T0)).toBe('not_found');
    expect(await fileReport(db, 'u-iryna', { target: { kind: 'profile', userId: 'nobody' }, reason: 'spam' }, T0)).toBe('not_found');
    await db.insert(userBan).values({ userId: 'u-petro', reason: null, bannedBy: null, bannedAt: T0 });
    expect(await fileReport(db, 'u-iryna', { target: { kind: 'profile', userId: 'u-petro' }, reason: 'spam' }, T0)).toBe('not_found');

    await db.update(libraryEntry).set({ moderation: 'hidden' }).where(eq(libraryEntry.id, entryId));
    expect(await quizReport('u-maria')).toBe('not_found');
    await db.update(libraryEntry).set({ moderation: 'ok', listed: false }).where(eq(libraryEntry.id, entryId));
    expect(await quizReport('u-maria')).toBe('not_found');
  });

  it('closed entry is not reportable', async () => {
    const { db, quizReport } = await setup();
    expect(await closeEntry(db, 'u-olena', (await db.select().from(libraryEntry))[0]!.quizId)).toBe(true);
    expect(await quizReport('u-taras')).toBe('not_found');
  });

  it('three different accounts hide the quiz until a decision', async () => {
    const { db, quizReport, moderation } = await setup();
    expect(await quizReport('u-taras')).toBe('ok');
    expect(await quizReport('u-taras')).toBe('already_reported');
    expect(await quizReport('u-iryna')).toBe('ok');
    expect(await moderation()).toBe('ok');
    expect(await quizReport('u-petro')).toBe('ok');
    expect(await moderation()).toBe('auto_hidden');
    expect((await catalog(db, { sort: 'popular', offset: 0 }, null)).items).toEqual([]);
    // Щойно авто-приховану вікторину ще можна поскаржитись (скаржник бачив її секунди тому).
    expect(await quizReport('u-maria')).toBe('ok');
    expect(await moderation()).toBe('auto_hidden');
  });

  it('two third reports in a row switch once (serial path)', async () => {
    const { quizReport, moderation, db } = await setup();
    await quizReport('u-taras');
    await quizReport('u-iryna');
    const results = await Promise.all([quizReport('u-petro'), quizReport('u-maria')]);
    // PGlite виконує транзакції по черзі (послідовний шлях): друга скарга приходить уже на авто-приховану вікторину
    // і теж проходить. Справжню паралельність (блокування, deadlock) тут не перевірити — потрібен справжній Postgres.
    expect(results).toEqual(['ok', 'ok']);
    expect(await moderation()).toBe('auto_hidden');
    expect(await db.select().from(userReport)).toHaveLength(4);
  });

  it('dismissed reports do not count', async () => {
    const { db, quizReport, moderation } = await setup();
    await quizReport('u-taras');
    await quizReport('u-iryna');
    await db.update(userReport).set({ status: 'dismissed' }).where(eq(userReport.reporterId, 'u-taras'));
    expect(await quizReport('u-petro')).toBe('ok');
    expect(await moderation()).toBe('ok');
    expect(await quizReport('u-taras')).toBe('ok');
    expect(await moderation()).toBe('auto_hidden');
  });
});

describe('the admin report queue (39-A2)', () => {
  const T1 = new Date('2026-11-18T11:00:00Z');
  const T2 = new Date('2026-11-18T12:00:00Z');
  const file = (db: Awaited<ReturnType<typeof createTestDb>>, who: string, target: Parameters<typeof fileReport>[2]['target'], reason: 'spam' | 'personal' | 'offensive', text: string | undefined, at: Date) =>
    fileReport(db, who, { target, reason, text }, at);
  let clock = T2.getTime();
  const tick = () => new Date((clock += 1000));
  const lastLog = async (db: Awaited<ReturnType<typeof createTestDb>>) => (await db.select().from(adminAction).orderBy(desc(adminAction.at)))[0]!;

  it('the queue groups reports by object', async () => {
    const { db, entryId } = await setup();
    const quiz = { kind: 'quiz' as const, entryId };
    await file(db, 'u-taras', quiz, 'spam', undefined, T0);
    await file(db, 'u-iryna', quiz, 'spam', 'реклама', T1);
    await file(db, 'u-petro', quiz, 'personal', 'номер телефону', T2);
    await file(db, 'u-taras', { kind: 'profile', userId: 'u-maria' }, 'offensive', 'образливий нік', new Date('2026-11-18T09:00:00Z'));
    const queue = await reportQueue(db, 1);
    expect(queue).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(queue.rows[0]).toMatchObject({ kind: 'profile', userId: 'u-maria', reports: 1, reasons: { offensive: 1 }, texts: ['образливий нік'] });
    expect(queue.rows[1]).toMatchObject({
      kind: 'quiz', entryId, title: 'Річки й міста', author: { id: 'u-olena' }, moderation: 'auto_hidden', appeal: false, reports: 3,
      reasons: { spam: 2, personal: 1 }, texts: ['номер телефону', 'реклама'], since: T0.toISOString(),
    });
    // Хто скаржився — не в черзі.
    expect(JSON.stringify(queue)).not.toContain('u-taras');
    expect(JSON.stringify(queue)).not.toContain('u-iryna');

    await db.update(userReport).set({ status: 'dismissed' }).where(eq(userReport.reporterId, 'u-taras'));
    await db.update(userReport).set({ status: 'resolved' }).where(eq(userReport.reporterId, 'u-iryna'));
    const smaller = await reportQueue(db, 1);
    expect(smaller.rows).toHaveLength(1);
    expect(smaller.rows[0]).toMatchObject({ kind: 'quiz', reports: 1, reasons: { personal: 1 } });

    expect((await reportQueue(db, 2)).rows).toEqual([]);
  });

  it('texts keep five newest non-empty', async () => {
    const { db } = await setup();
    const ids = ['u-taras', 'u-iryna', 'u-petro', 'u-maria'];
    await db.insert(user).values(['u-a1', 'u-a2', 'u-a3'].map((id) => ({ id, name: id, email: `${id}@example.com` })));
    const all = [...ids, 'u-a1', 'u-a2', 'u-a3'];
    for (const [i, who] of all.entries()) await file(db, who, { kind: 'profile', userId: 'u-olena' }, 'spam', i === 0 ? '' : `t${i}`, new Date(T0.getTime() + i * 1000));
    const [item] = (await reportQueue(db, 1)).rows;
    expect(item).toMatchObject({ kind: 'profile', reports: 7 });
    expect(item!.texts).toEqual(['t6', 't5', 't4', 't3', 't2']);
  });

  it('an open appeal without reports is an item with appeal true', async () => {
    const { db, entryId } = await setup();
    await actOnQuiz(db, { adminId: 'u-petro', entryId, action: 'hide', now: tick() });
    const quizId = (await db.select().from(libraryEntry))[0]!.quizId;
    expect(await appealEntry(db, 'u-olena', quizId, T2)).toBe('ok');
    const queue = await reportQueue(db, 1);
    expect(queue.rows).toEqual([expect.objectContaining({ kind: 'quiz', entryId, moderation: 'hidden', appeal: true, reports: 0, reasons: {}, texts: [], since: T2.toISOString() })]);
  });

  it('hide, restore, dismiss', async () => {
    const { db, entryId, quizReport, moderation } = await setup();
    const quizId = (await db.select().from(libraryEntry))[0]!.quizId;
    const statuses = async () => (await db.select().from(userReport)).map((r) => r.status);

    await quizReport('u-taras');
    expect(await actOnQuiz(db, { adminId: 'u-petro', entryId, action: 'hide', now: tick() })).toBe(true);
    expect(await moderation()).toBe('hidden');
    expect(await statuses()).toEqual(['resolved']);
    expect(await lastLog(db)).toMatchObject({ kind: 'library_hide', adminId: 'u-petro', targetUserId: 'u-olena', details: { title: 'Річки й міста' } });
    expect(await reportQueue(db, 1)).toMatchObject({ rows: [], total: 0 });

    expect(await appealEntry(db, 'u-olena', quizId, T2)).toBe('ok');
    expect(await actOnQuiz(db, { adminId: 'u-petro', entryId, action: 'restore', now: tick() })).toBe(true);
    expect(await moderation()).toBe('ok');
    expect((await db.select().from(libraryEntry))[0]!.appealOpen).toBe(false);
    expect(await lastLog(db)).toMatchObject({ kind: 'library_restore', targetUserId: 'u-olena' });

    // Три відкриті скарги → auto_hidden → відхилення повертає й не рахується надалі.
    await db.update(userReport).set({ status: 'dismissed' });
    for (const who of ['u-taras', 'u-iryna', 'u-petro']) await quizReport(who);
    expect(await moderation()).toBe('auto_hidden');
    expect(await actOnQuiz(db, { adminId: 'u-maria', entryId, action: 'dismiss', now: tick() })).toBe(true);
    expect(await moderation()).toBe('ok');
    expect(await statuses()).toEqual(['dismissed', 'dismissed', 'dismissed', 'dismissed']);
    expect(await lastLog(db)).toMatchObject({ kind: 'report_dismiss', adminId: 'u-maria', targetUserId: 'u-olena' });
    expect(await quizReport('u-taras')).toBe('ok');

    // Відхилене оскарження: приховане лишається, оскарження використано.
    await actOnQuiz(db, { adminId: 'u-petro', entryId, action: 'hide', now: tick() });
    await db.update(libraryEntry).set({ appealedAt: null, appealOpen: false });
    expect(await appealEntry(db, 'u-olena', quizId, T2)).toBe('ok');
    expect(await actOnQuiz(db, { adminId: 'u-petro', entryId, action: 'dismiss', now: tick() })).toBe(true);
    expect(await moderation()).toBe('hidden');
    expect((await db.select().from(libraryEntry))[0]!.appealOpen).toBe(false);
    expect(await lastLog(db)).toMatchObject({ kind: 'appeal_reject' });
    expect(await appealEntry(db, 'u-olena', quizId, T2)).toBe('library_appeal_used');

    expect(await actOnQuiz(db, { adminId: 'u-petro', entryId: '99999999-9999-4999-8999-999999999999', action: 'hide', now: tick() })).toBe(false);
  });

  it('reset nickname and avatar', async () => {
    const { db } = await setup();
    await saveProfile(db, 'u-iryna', { nickname: 'Ірися', avatar: '/uploads/a.png' });
    await file(db, 'u-taras', { kind: 'profile', userId: 'u-iryna' }, 'offensive', undefined, T0);
    expect(await actOnProfile(db, { adminId: 'u-petro', userId: 'u-iryna', action: 'reset_nickname', now: tick() })).toBe(true);
    const [row] = await db.select().from(profile).where(eq(profile.userId, 'u-iryna'));
    expect(row).toMatchObject({ nickname: null, nicknameKey: null, avatar: '/uploads/a.png' });
    expect(await lastLog(db)).toMatchObject({ kind: 'nickname_reset', targetUserId: 'u-iryna', details: { text: 'Ірися' } });
    expect((await db.select().from(userReport))[0]!.status).toBe('resolved');
    expect((await saveProfile(db, 'u-maria', { nickname: 'Ірися', avatar: null })).ok).toBe(true);

    expect(await actOnProfile(db, { adminId: 'u-petro', userId: 'u-iryna', action: 'reset_avatar', now: tick() })).toBe(true);
    expect((await db.select().from(profile).where(eq(profile.userId, 'u-iryna')))[0]!.avatar).toBeNull();
    expect(await lastLog(db)).toMatchObject({ kind: 'avatar_reset', targetUserId: 'u-iryna' });

    await file(db, 'u-taras', { kind: 'profile', userId: 'u-iryna' }, 'spam', undefined, T2);
    expect(await actOnProfile(db, { adminId: 'u-petro', userId: 'u-iryna', action: 'dismiss', now: tick() })).toBe(true);
    expect((await db.select().from(userReport)).map((r) => r.status).sort()).toEqual(['dismissed', 'resolved']);
    expect(await lastLog(db)).toMatchObject({ kind: 'report_dismiss' });
    expect(await actOnProfile(db, { adminId: 'u-petro', userId: 'nobody', action: 'dismiss', now: tick() })).toBe(false);
  });
});
