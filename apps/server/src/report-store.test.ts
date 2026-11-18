import type { Quiz } from '@quiz/shared';
import { blitzRound, bool, classicRound, makeRoundsQuiz, multi, numeric, order, single, text } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { libraryEntry, user, userBan, userReport } from './db/schema';
import { catalog, closeEntry, openEntry } from './library-store';
import { ensureProfile } from './profiles';
import { createQuiz } from './quizzes';
import { fileReport } from './report-store';
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
    expect(await quizReport('u-maria')).toBe('not_found');
  });

  it('two parallel third reports switch once', async () => {
    const { quizReport, moderation, db } = await setup();
    await quizReport('u-taras');
    await quizReport('u-iryna');
    const results = await Promise.all([quizReport('u-petro'), quizReport('u-maria')]);
    // Тестова БД (PGlite) виконує транзакції по черзі: друга скарга або теж пройшла, або вже бачить приховану ціль.
    // Головне — без помилок, рівно один перехід, і кожна прийнята скарга збережена.
    expect(results[0]).toBe('ok');
    expect(['ok', 'not_found']).toContain(results[1]);
    expect(await moderation()).toBe('auto_hidden');
    expect(await db.select().from(userReport)).toHaveLength(2 + results.filter((r) => r === 'ok').length);
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
