import { LIBRARY_AUTO_HIDE, type ReportReason, type ReportTarget } from '@quiz/shared';
import { and, eq, sql } from 'drizzle-orm';
import { isBanned } from './bans';
import type { Db } from './db/client';
import { isUniqueViolation } from './db/unique';
import { libraryEntry, user, userReport } from './db/schema';
import { visibleEntry } from './library-store';

export type ReportResult = 'ok' | 'not_found' | 'cannot_report_self' | 'already_reported';

/**
 * Скарга на вікторину з каталогу чи на профіль. Одна відкрита скарга на акаунт і об'єкт; на себе — ні.
 * Після вставки запис блокується (FOR UPDATE) перед підрахунком, тож дві паралельні треті скарги рахують одна одну
 * й дають рівно один перехід у auto_hidden.
 */
export async function fileReport(
  db: Db,
  reporterId: string,
  input: { target: ReportTarget; reason: ReportReason; text?: string },
  now: Date,
): Promise<ReportResult> {
  const { target, reason } = input;
  const text = input.text ?? '';
  try {
    return await db.transaction(async (tx): Promise<ReportResult> => {
      if (target.kind === 'profile') {
        if (target.userId === reporterId) return 'cannot_report_self';
        const [exists] = await tx.select({ id: user.id }).from(user).where(eq(user.id, target.userId));
        if (exists === undefined || (await isBanned(tx, target.userId))) return 'not_found';
        await tx.insert(userReport).values({ reporterId, targetKind: 'profile', targetUserId: target.userId, reason, text, createdAt: now });
        return 'ok';
      }

      const entry = await visibleEntry(tx, target.entryId);
      if (entry === null) return 'not_found';
      if (entry.ownerId === reporterId) return 'cannot_report_self';
      await tx.insert(userReport).values({ reporterId, targetKind: 'quiz', entryId: entry.id, targetUserId: entry.ownerId, reason, text, createdAt: now });
      // Блокуємо запис після вставки: паралельні скарги рахують по черзі, кожна бачить уже зафіксовані інші.
      await tx.select({ id: libraryEntry.id }).from(libraryEntry).where(eq(libraryEntry.id, entry.id)).for('update');
      const [row] = await tx
        .select({ reporters: sql<number>`count(distinct ${userReport.reporterId})::int` })
        .from(userReport)
        .where(and(eq(userReport.entryId, entry.id), eq(userReport.targetKind, 'quiz'), eq(userReport.status, 'open')));
      if (Number(row?.reporters ?? 0) >= LIBRARY_AUTO_HIDE) {
        await tx.update(libraryEntry).set({ moderation: 'auto_hidden' }).where(and(eq(libraryEntry.id, entry.id), eq(libraryEntry.moderation, 'ok')));
      }
      return 'ok';
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'already_reported';
    throw error;
  }
}
