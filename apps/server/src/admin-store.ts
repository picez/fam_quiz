import {
  ONLINE_MS,
  adminPages,
  ADMIN_PAGE_SIZE,
  ADMIN_QUERY_MAX,
  questionsOf,
  type AdminList,
  type AdminLogEntry,
  type AdminQuizRow,
  type AdminQuizView,
  type AdminStats,
  type AdminUserDetail,
  type AdminUserRow,
} from '@quiz/shared';
import { and, desc, eq, inArray, gt, sql, type SQL } from 'drizzle-orm';
import { isAdminEmail } from './admin';
import type { Db } from './db/client';
import { adminAction, game, prize, prizeAward, profile, quiz, user, userBan, userTitle } from './db/schema';
import { ensureProfile } from './profiles';
import { quizOf } from './quizzes';
import { removalEffects } from './quiz-remove';
import { kyivDay } from './xp-rules';

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', timeZoneName: 'longOffset' });

/** Північ за Europe/Kyiv дня, у якому лежить now. */
export function kyivMidnight(now: Date): Date {
  const [y, m, d] = kyivDay(now).split('-').map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Зсув беремо за три години до UTC-півночі: це ще попередня доба Києва, тож перехід на літній чи зимовий час (він уночі, після півночі) не збиває його.
  const name = offsetFormat.formatToParts(new Date(utcMidnight - 3 * 3_600_000)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  const minutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 120;
  return new Date(utcMidnight - minutes * 60_000);
}

const iso = (date: Date) => date.toISOString();
const num = (value: unknown) => Number(value ?? 0);

export async function adminStats(db: Db, liveRooms: number, now: Date): Promise<AdminStats> {
  const since = (days: number) => iso(new Date(now.getTime() - days * DAY));
  const finishedSince = (from: string) =>
    sql<number>`(select count(*)::int from ${game} where ${game.status} = 'finished' and ${game.finishedAt} >= ${from})`;
  const [row] = await db
    .select({
      total: sql<number>`(select count(*)::int from ${user})`,
      new7: sql<number>`(select count(*)::int from ${user} where ${user.createdAt} >= ${since(7)})`,
      new30: sql<number>`(select count(*)::int from ${user} where ${user.createdAt} >= ${since(30)})`,
      online: sql<number>`(select count(*)::int from ${profile} where ${profile.lastSeenAt} >= ${iso(new Date(now.getTime() - ONLINE_MS))})`,
      today: finishedSince(iso(kyivMidnight(now))),
      days7: finishedSince(since(7)),
      days30: finishedSince(since(30)),
      quizzes: sql<number>`(select count(*)::int from ${quiz})`,
    })
    .from(sql`(select 1) as one`);
  const top = await db
    .select({ id: quiz.id, title: quiz.title, author: profile.nickname, games: sql<number>`count(${game.id})::int` })
    .from(game)
    .innerJoin(quiz, eq(game.quizId, quiz.id))
    .leftJoin(profile, eq(profile.userId, quiz.ownerId))
    .where(eq(game.status, 'finished'))
    .groupBy(quiz.id, quiz.title, profile.nickname)
    .orderBy(sql`count(${game.id}) desc`, quiz.title)
    .limit(10);
  return {
    users: { total: num(row?.total), new7: num(row?.new7), new30: num(row?.new30), online: num(row?.online) },
    games: { live: liveRooms, today: num(row?.today), days7: num(row?.days7), days30: num(row?.days30) },
    quizzes: { total: num(row?.quizzes) },
    topQuizzes: top.map((t) => ({ id: t.id, title: t.title, author: t.author ?? '', games: num(t.games) })),
  };
}

/** Пошуковий рядок для ilike: коротше двох символів — без фільтра; %, _ і \ екрануються. */
function pattern(q: string | undefined): string | null {
  const text = (q ?? '').trim().slice(0, ADMIN_QUERY_MAX);
  if (text.length < 2) return null;
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function userRows(db: Db, emails: ReadonlySet<string>, where: SQL | undefined, limit: number, offset: number): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      verified: user.emailVerified,
      createdAt: user.createdAt,
      nickname: profile.nickname,
      games: sql<number>`(select count(distinct p.game_id)::int from participant p join game g on g.id = p.game_id where p.user_id = ${user.id} and g.status = 'finished')`,
      quizzes: sql<number>`(select count(*)::int from ${quiz} where ${quiz.ownerId} = ${user.id})`,
      bannedAt: userBan.bannedAt,
      reason: userBan.reason,
    })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .leftJoin(userBan, eq(userBan.userId, user.id))
    .where(where)
    .orderBy(desc(user.createdAt), user.id)
    .limit(limit)
    .offset(offset);
  const result: AdminUserRow[] = [];
  for (const r of rows) {
    const nickname = r.nickname ?? (await ensureProfile(db, r.id))?.nickname ?? '';
    result.push({
      id: r.id,
      nickname,
      email: r.email,
      createdAt: iso(r.createdAt),
      games: num(r.games),
      quizzes: num(r.quizzes),
      admin: isAdminEmail(emails, r.email, r.verified),
      banned: r.bannedAt ? { at: iso(r.bannedAt), reason: r.reason } : null,
    });
  }
  return result;
}

export async function adminUsers(db: Db, emails: ReadonlySet<string>, query: { q?: string; page: number }): Promise<AdminList<AdminUserRow>> {
  const like = pattern(query.q);
  const where = like === null ? undefined : sql`(${profile.nickname} ilike ${like} or ${user.email} ilike ${like})`;
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .where(where);
  const total = num(n);
  const rows = await userRows(db, emails, where, ADMIN_PAGE_SIZE, (query.page - 1) * ADMIN_PAGE_SIZE);
  return { rows, total, page: query.page, pages: adminPages(total) };
}

export async function adminUser(db: Db, emails: ReadonlySet<string>, id: string, now: Date): Promise<AdminUserDetail | null> {
  const [row] = await userRows(db, emails, eq(user.id, id), 1, 0);
  if (row === undefined) return null;
  const stock = await db
    .select()
    .from(prize)
    .where(and(eq(prize.ownerId, id), inArray(prize.status, ['free', 'reserved'])))
    .orderBy(desc(prize.createdAt), desc(prize.id));
  const awards = await db.select().from(prizeAward).where(eq(prizeAward.userId, id)).orderBy(desc(prizeAward.awardedAt), desc(prizeAward.id));
  const [title] = await db.select().from(userTitle).where(and(eq(userTitle.userId, id), gt(userTitle.expiresAt, now)));
  return {
    user: row,
    stock: stock.map((p) => ({ id: p.id, content: p.content, status: p.status === 'reserved' ? ('reserved' as const) : ('free' as const), createdAt: iso(p.createdAt) })),
    awards: awards.map((a) => ({ id: a.id, place: a.place, content: a.content, quizTitle: a.quizTitle, awardedAt: iso(a.awardedAt) })),
    title: title ? { text: title.text, until: iso(title.expiresAt) } : null,
  };
}

export async function adminQuizzes(db: Db, query: { q?: string; page: number }): Promise<AdminList<AdminQuizRow>> {
  const like = pattern(query.q);
  const where = like === null ? undefined : sql`(${quiz.title} ilike ${like} or ${profile.nickname} ilike ${like})`;
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quiz)
    .leftJoin(profile, eq(profile.userId, quiz.ownerId))
    .where(where);
  const total = num(n);
  const rows = await db
    .select({
      row: quiz,
      nickname: profile.nickname,
      banned: sql<boolean>`exists (select 1 from ${userBan} where ${userBan.userId} = ${quiz.ownerId})`,
      games: sql<number>`(select count(*)::int from ${game} where ${game.quizId} = ${quiz.id} and ${game.status} = 'finished')`,
    })
    .from(quiz)
    .leftJoin(profile, eq(profile.userId, quiz.ownerId))
    .where(where)
    .orderBy(desc(quiz.updatedAt), quiz.id)
    .limit(ADMIN_PAGE_SIZE)
    .offset((query.page - 1) * ADMIN_PAGE_SIZE);
  const result: AdminQuizRow[] = [];
  for (const r of rows) {
    const nickname = r.nickname ?? (await ensureProfile(db, r.row.ownerId))?.nickname ?? '';
    result.push({
      id: r.row.id,
      title: r.row.title,
      author: { id: r.row.ownerId, nickname },
      authorBanned: r.banned === true,
      questionCount: questionsOf(r.row).length,
      games: num(r.games),
      updatedAt: iso(r.row.updatedAt),
    });
  }
  return { rows: result, total, page: query.page, pages: adminPages(total) };
}

export async function adminQuiz(db: Db, id: string): Promise<AdminQuizView | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db.select().from(quiz).where(eq(quiz.id, id));
  if (row === undefined) return null;
  const author = (await ensureProfile(db, row.ownerId))?.nickname ?? '';
  const data = quizOf(row);
  return { id: row.id, author: { id: row.ownerId, nickname: author }, quiz: data, updatedAt: iso(row.updatedAt), effects: removalEffects(data) };
}

export async function adminLog(db: Db, page: number): Promise<AdminList<AdminLogEntry>> {
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(adminAction);
  const total = num(n);
  const rows = await db
    .select()
    .from(adminAction)
    .orderBy(desc(adminAction.at), desc(adminAction.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset((page - 1) * ADMIN_PAGE_SIZE);
  return {
    rows: rows.map((r) => ({ id: r.id, at: iso(r.at), admin: r.adminLabel, kind: r.kind, target: r.targetLabel, details: r.details })),
    total,
    page,
    pages: adminPages(total),
  };
}
