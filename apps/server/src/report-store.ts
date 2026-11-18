import { ADMIN_PAGE_SIZE, LIBRARY_AUTO_HIDE, adminPages, pageOffset, type AdminActionKind, type AdminList, type AdminReportItem, type ReportReason, type ReportTarget } from '@quiz/shared';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { isBanned, logAction } from './bans';
import type { Db } from './db/client';
import { isUniqueViolation } from './db/unique';
import { libraryEntry, profile, user, userReport } from './db/schema';
import { visibleEntry } from './library-store';
import { ensureProfile } from './profiles';

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
      // Саме 'no key update', а не 'update': вставка скарги тримає FOR KEY SHARE на рядку запису (зовнішній ключ),
      // і два FOR UPDATE від двох паралельних скарг взаємно чекали б одне одного — deadlock (40P01), скарга втрачена.
      // 'no key update' із KEY SHARE сумісний, а між собою такі блокування конфліктують — підрахунки йдуть по черзі.
      await tx.select({ id: libraryEntry.id }).from(libraryEntry).where(eq(libraryEntry.id, entry.id)).for('no key update');
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

/** Скільки найновіших непорожніх текстів скарг бачить адмін біля об'єкта. */
const QUEUE_TEXTS = 5;

interface OpenReport {
  reason: ReportReason;
  text: string;
  createdAt: Date;
}

/** Підсумок відкритих скарг на один об'єкт; хто скаржився, тут не береться взагалі. */
function tally(rows: OpenReport[]): { reports: number; reasons: Partial<Record<ReportReason, number>>; texts: string[]; first: Date | null } {
  const reasons: Partial<Record<ReportReason, number>> = {};
  for (const row of rows) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
  const texts = rows
    .filter((row) => row.text !== '')
    .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
    .slice(0, QUEUE_TEXTS)
    .map((row) => row.text);
  const first = rows.reduce<Date | null>((min, row) => (min === null || row.createdAt < min ? row.createdAt : min), null);
  return { reports: rows.length, reasons, texts, first };
}

/**
 * Черга адміна: елемент на об'єкт, не на скаргу. Вікторини з відкритими скаргами чи відкритим оскарженням
 * і профілі з відкритими скаргами; найдавніше — першим (оскарження — за appealed_at). Обсяг малий: злиття й сторінка в пам'яті.
 */
export async function reportQueue(db: Db, page: number): Promise<AdminList<AdminReportItem>> {
  const open = await db
    .select({
      kind: userReport.targetKind,
      entryId: userReport.entryId,
      targetUserId: userReport.targetUserId,
      reason: userReport.reason,
      text: userReport.text,
      createdAt: userReport.createdAt,
    })
    .from(userReport)
    .where(eq(userReport.status, 'open'));

  const byEntry = new Map<string, OpenReport[]>();
  const byUser = new Map<string, OpenReport[]>();
  for (const row of open) {
    const key = row.kind === 'quiz' ? row.entryId : row.targetUserId;
    if (key === null) continue;
    const group = row.kind === 'quiz' ? byEntry : byUser;
    group.set(key, [...(group.get(key) ?? []), row]);
  }

  const entries = await db
    .select({
      id: libraryEntry.id,
      quizId: libraryEntry.quizId,
      title: libraryEntry.title,
      ownerId: libraryEntry.ownerId,
      moderation: libraryEntry.moderation,
      appealOpen: libraryEntry.appealOpen,
      appealedAt: libraryEntry.appealedAt,
      nickname: profile.nickname,
    })
    .from(libraryEntry)
    .leftJoin(profile, eq(profile.userId, libraryEntry.ownerId))
    .where(or(eq(libraryEntry.appealOpen, true), byEntry.size === 0 ? undefined : inArray(libraryEntry.id, [...byEntry.keys()])));

  const items: { at: Date; item: AdminReportItem }[] = [];
  for (const entry of entries) {
    const sum = tally(byEntry.get(entry.id) ?? []);
    const since = sum.first ?? entry.appealedAt ?? new Date(0);
    items.push({
      at: since,
      item: {
        kind: 'quiz',
        entryId: entry.id,
        quizId: entry.quizId,
        title: entry.title,
        author: { id: entry.ownerId, nickname: entry.nickname },
        moderation: entry.moderation,
        appeal: entry.appealOpen,
        reports: sum.reports,
        reasons: sum.reasons,
        texts: sum.texts,
        since: since.toISOString(),
      },
    });
  }

  if (byUser.size > 0) {
    const people = await db
      .select({ userId: profile.userId, nickname: profile.nickname, avatar: profile.avatar })
      .from(profile)
      .where(inArray(profile.userId, [...byUser.keys()]));
    const known = new Map(people.map((p) => [p.userId, p]));
    for (const [userId, rows] of byUser) {
      const sum = tally(rows);
      const since = sum.first ?? new Date(0);
      items.push({
        at: since,
        item: {
          kind: 'profile',
          userId,
          nickname: known.get(userId)?.nickname ?? null,
          avatar: known.get(userId)?.avatar ?? null,
          reports: sum.reports,
          reasons: sum.reasons,
          texts: sum.texts,
          since: since.toISOString(),
        },
      });
    }
  }

  items.sort((x, y) => x.at.getTime() - y.at.getTime());
  const offset = pageOffset(page, ADMIN_PAGE_SIZE);
  return { rows: items.slice(offset, offset + ADMIN_PAGE_SIZE).map((x) => x.item), total: items.length, page, pages: adminPages(items.length) };
}

/** Рішення адміна щодо вікторини; false — запису нема. Одна транзакція з журналом, запис під FOR UPDATE. */
export async function actOnQuiz(db: Db, input: { adminId: string; entryId: string; action: 'hide' | 'restore' | 'dismiss'; now: Date }): Promise<boolean> {
  const { adminId, entryId, action, now } = input;
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ ownerId: libraryEntry.ownerId, title: libraryEntry.title, moderation: libraryEntry.moderation, appealOpen: libraryEntry.appealOpen })
      .from(libraryEntry)
      .where(eq(libraryEntry.id, entryId))
      .for('update');
    if (entry === undefined) return false;
    const close = (status: 'resolved' | 'dismissed') =>
      tx
        .update(userReport)
        .set({ status, resolvedAt: now })
        .where(and(eq(userReport.entryId, entryId), eq(userReport.targetKind, 'quiz'), eq(userReport.status, 'open')));

    let kind: AdminActionKind;
    if (action === 'hide') {
      await close('resolved');
      await tx.update(libraryEntry).set({ moderation: 'hidden', appealOpen: false }).where(eq(libraryEntry.id, entryId));
      kind = 'library_hide';
    } else if (action === 'restore') {
      await close('dismissed');
      await tx.update(libraryEntry).set({ moderation: 'ok', appealOpen: false }).where(eq(libraryEntry.id, entryId));
      kind = 'library_restore';
    } else {
      await close('dismissed');
      // Відхилене оскарження лишає приховування; тимчасово приховане скаргами повертається.
      await tx
        .update(libraryEntry)
        .set({ moderation: entry.moderation === 'auto_hidden' ? 'ok' : entry.moderation, appealOpen: false })
        .where(eq(libraryEntry.id, entryId));
      kind = entry.appealOpen ? 'appeal_reject' : 'report_dismiss';
    }
    await logAction(tx, { adminId, kind, targetUserId: entry.ownerId, details: { title: entry.title }, now });
    return true;
  });
}

/** Рішення адміна щодо профілю; false — користувача нема. Файл аватара не видаляється. Не-адмінність цілі перевіряє маршрут. */
export async function actOnProfile(
  db: Db,
  input: { adminId: string; userId: string; action: 'reset_nickname' | 'reset_avatar' | 'dismiss'; now: Date },
): Promise<boolean> {
  const { adminId, userId, action, now } = input;
  return db.transaction(async (tx) => {
    const card = await ensureProfile(tx as Db, userId);
    if (card === null) return false;
    // Журнал першим: підпис цілі в ньому — нік до скидання.
    const kind: AdminActionKind = action === 'reset_nickname' ? 'nickname_reset' : action === 'reset_avatar' ? 'avatar_reset' : 'report_dismiss';
    const details = action === 'reset_nickname' && card.nickname !== null ? { text: card.nickname } : {};
    await logAction(tx, { adminId, kind, targetUserId: userId, details, now });
    if (action === 'reset_nickname') {
      await tx.update(profile).set({ nickname: null, nicknameKey: null, updatedAt: now }).where(eq(profile.userId, userId));
    } else if (action === 'reset_avatar') {
      await tx.update(profile).set({ avatar: null, updatedAt: now }).where(eq(profile.userId, userId));
    }
    await tx
      .update(userReport)
      .set({ status: action === 'dismiss' ? 'dismissed' : 'resolved', resolvedAt: now })
      .where(and(eq(userReport.targetUserId, userId), eq(userReport.targetKind, 'profile'), eq(userReport.status, 'open')));
    return true;
  });
}
