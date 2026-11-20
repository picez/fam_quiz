import {
  ADMIN_PAGE_SIZE,
  PROBLEM_GUESTS_PER_HOUR_ALL,
  PROBLEM_MINE_MAX,
  adminPages,
  pageOffset,
  type AdminList,
  type AdminProblemReport,
  type MyProblemReport,
  type ProblemAuthor,
  type ProblemReportInput,
} from '@quiz/shared';
import { and, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { logAction } from './bans';
import type { Db } from './db/client';
import { problemReport, profile, pushSubscription } from './db/schema';
import { truncateChars } from './error-mask';
import { ensureProfile } from './profiles';

/**
 * Скарги гравців (64). Текст і відомості про сторінку лежать як є й показуються лише як текст.
 * IP не зберігається: ні в рядку, ні в журналі.
 */
const HOUR_MS = 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOG_TEXT = 80;

/** Гість: спершу спільна стеля на годину (усі гості разом), потім рядок. */
export async function createProblemReport(
  db: Db,
  input: { userId: string | null; input: ProblemReportInput; now: Date },
): Promise<{ id: string } | { error: 'problem_busy' }> {
  if (input.userId === null) {
    const since = new Date(input.now.getTime() - HOUR_MS);
    const [{ n }] = await db
      .select({ n: count() })
      .from(problemReport)
      .where(and(isNull(problemReport.userId), eq(problemReport.fromAccount, false), gt(problemReport.createdAt, since)));
    if (Number(n) >= PROBLEM_GUESTS_PER_HOUR_ALL) return { error: 'problem_busy' };
  }
  const [row] = await db
    .insert(problemReport)
    .values({ userId: input.userId, fromAccount: input.userId !== null, text: input.input.text, page: input.input.page, createdAt: input.now })
    .returning({ id: problemReport.id });
  return { id: row.id };
}

/** «Мої повідомлення»: останні PROBLEM_MINE_MAX від нових до старих. */
export async function myProblemReports(db: Db, userId: string): Promise<MyProblemReport[]> {
  const rows = await db.select().from(problemReport).where(eq(problemReport.userId, userId)).orderBy(desc(problemReport.createdAt), problemReport.id).limit(PROBLEM_MINE_MAX);
  return rows.map((row) => ({
    id: row.id,
    at: row.createdAt.toISOString(),
    text: row.text,
    status: row.status,
    reply: row.reply,
    repliedAt: row.repliedAt === null ? null : row.repliedAt.toISOString(),
  }));
}

export async function listProblemReports(db: Db, query: { status: 'open' | 'resolved'; page: number }): Promise<AdminList<AdminProblemReport>> {
  const where = eq(problemReport.status, query.status);
  const [{ n }] = await db.select({ n: count() }).from(problemReport).where(where);
  const total = Number(n);
  const rows = await db
    .select({ row: problemReport, nickname: profile.nickname, hasProfile: profile.userId })
    .from(problemReport)
    .leftJoin(profile, eq(profile.userId, problemReport.userId))
    .where(where)
    .orderBy(desc(problemReport.createdAt), problemReport.id)
    .limit(ADMIN_PAGE_SIZE)
    .offset(pageOffset(query.page, ADMIN_PAGE_SIZE));
  const authors = rows.flatMap(({ row }) => (row.userId === null ? [] : [row.userId]));
  const subscribed = new Set<string>();
  if (authors.length > 0) {
    const subs = await db.selectDistinct({ userId: pushSubscription.userId }).from(pushSubscription).where(inArray(pushSubscription.userId, authors));
    for (const s of subs) subscribed.add(s.userId);
  }
  const resolvers = rows.flatMap(({ row }) => (row.resolvedBy === null ? [] : [row.resolvedBy]));
  const names = new Map<string, string>();
  if (resolvers.length > 0) {
    for (const r of await db.select({ id: profile.userId, nickname: profile.nickname }).from(profile).where(inArray(profile.userId, resolvers))) names.set(r.id, r.nickname ?? '');
  }
  // Автор — лише нікнейм (як в інших списках адмінки): без профілю — нік за замовчуванням з ensureProfile, ніколи не user.name.
  const nicknames = new Map<string, string>();
  for (const { row, nickname, hasProfile } of rows) {
    if (row.userId === null || nicknames.has(row.userId)) continue;
    nicknames.set(row.userId, hasProfile !== null ? (nickname ?? '') : ((await ensureProfile(db, row.userId))?.nickname ?? ''));
  }
  return {
    rows: rows.map(({ row }): AdminProblemReport => {
      const who: ProblemAuthor =
        row.userId !== null ? { kind: 'account', id: row.userId, nickname: nicknames.get(row.userId) ?? '', push: subscribed.has(row.userId) } : row.fromAccount ? { kind: 'deleted' } : { kind: 'guest' };
      return {
        id: row.id,
        at: row.createdAt.toISOString(),
        who,
        text: row.text,
        page: row.page,
        status: row.status,
        reply: row.reply,
        repliedAt: row.repliedAt === null ? null : row.repliedAt.toISOString(),
        resolvedBy: row.resolvedBy === null ? null : (names.get(row.resolvedBy) ?? ''),
        resolvedAt: row.resolvedAt === null ? null : row.resolvedAt.toISOString(),
      };
    }),
    total,
    page: query.page,
    pages: adminPages(total),
  };
}

export type ResolveProblem = { ok: true; userId: string | null; replied: boolean } | { ok: false; error: 'not_found' | 'problem_no_account' | 'problem_replied' };

/**
 * Закрити скаргу, за бажанням з відповіддю (лише акаунту, один раз). Усе в одній транзакції з рядком журналу;
 * закриття вже закритої без відповіді — ok без журналу.
 */
export async function resolveProblem(db: Db, input: { adminId: string; id: string; reply: string | null; now: Date }): Promise<ResolveProblem> {
  if (!UUID.test(input.id)) return { ok: false, error: 'not_found' };
  return db.transaction(async (tx): Promise<ResolveProblem> => {
    const [row] = await tx.select().from(problemReport).where(eq(problemReport.id, input.id)).for('update');
    if (row === undefined) return { ok: false, error: 'not_found' };
    if (input.reply !== null) {
      if (row.userId === null) return { ok: false, error: 'problem_no_account' };
      if (row.reply !== null) return { ok: false, error: 'problem_replied' };
      await tx
        .update(problemReport)
        .set({ status: 'resolved', reply: input.reply, repliedAt: input.now, resolvedBy: input.adminId, resolvedAt: input.now })
        .where(eq(problemReport.id, row.id));
      await logAction(tx, { adminId: input.adminId, kind: 'problem_reply', targetUserId: row.userId, details: { text: input.reply }, now: input.now });
      return { ok: true, userId: row.userId, replied: true };
    }
    if (row.status === 'resolved') return { ok: true, userId: row.userId, replied: false };
    await tx.update(problemReport).set({ status: 'resolved', resolvedBy: input.adminId, resolvedAt: input.now }).where(eq(problemReport.id, row.id));
    await logAction(tx, { adminId: input.adminId, kind: 'problem_resolve', targetUserId: null, details: { text: truncateChars(row.text, LOG_TEXT) }, now: input.now });
    return { ok: true, userId: row.userId, replied: false };
  });
}
