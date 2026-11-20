import { ADMIN_LOG_EXPORT_MAX, ADMIN_LOG_GROUP_KINDS, ADMIN_PAGE_SIZE, adminPages, pageOffset, type AdminLogEntry, type AdminLogExport, type AdminLogFilter, type AdminLogPage, type AdminLogQuery } from '@quiz/shared';
import { and, desc, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { adminAction } from './db/schema';
import { kyivDayStart } from './kyiv-time';

const iso = (d: Date): string => d.toISOString();
const num = (n: unknown): number => Number(n);

/** Пошуковий рядок для ilike: від одного символу; %, _ і \ екрануються. */
function likePattern(q: string): string {
  return `%${q.replace(/[\%_]/g, (c) => `\${c}`)}%`;
}

/** День після 'YYYY-MM-DD' (через Date.UTC на розібраних полях). */
function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** 63: умова вибірки журналу; «до» — включно за київським днем. */
export function logWhere(filter: AdminLogFilter): SQL | undefined {
  const parts: SQL[] = [];
  if (filter.admin !== undefined) parts.push(sql`${adminAction.adminId} = ${filter.admin}`);
  if (filter.groups !== undefined && filter.groups.length > 0) {
    parts.push(inArray(adminAction.kind, filter.groups.flatMap((group) => [...ADMIN_LOG_GROUP_KINDS[group]])));
  }
  if (filter.from !== undefined) parts.push(gte(adminAction.at, kyivDayStart(filter.from)));
  if (filter.to !== undefined) parts.push(lt(adminAction.at, kyivDayStart(nextDay(filter.to))));
  if (filter.q !== undefined && filter.q !== '') {
    const like = likePattern(filter.q);
    parts.push(sql`(${adminAction.adminLabel} ilike ${like} or ${adminAction.targetLabel} ilike ${like} or ${adminAction.details}::text ilike ${like})`);
  }
  return parts.length === 0 ? undefined : and(...parts);
}

const entryOf = (r: typeof adminAction.$inferSelect): AdminLogEntry => ({ id: r.id, at: iso(r.at), admin: r.adminLabel, kind: r.kind, target: r.targetLabel, details: r.details });

async function countWhere(db: Db, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(adminAction).where(where);
  return num(row?.n ?? 0);
}

/** Люди, що колись діяли: різні admin_id з найновішою міткою, за ніком. */
async function logAdmins(db: Db): Promise<AdminLogPage['admins']> {
  const rows = await db
    .selectDistinctOn([adminAction.adminId], { id: adminAction.adminId, nickname: adminAction.adminLabel })
    .from(adminAction)
    .where(sql`${adminAction.adminId} is not null`)
    .orderBy(adminAction.adminId, desc(adminAction.at), desc(adminAction.id));
  return rows.map((r) => ({ id: r.id!, nickname: r.nickname })).sort((a, b) => a.nickname.localeCompare(b.nickname, 'uk') || a.id.localeCompare(b.id));
}

export async function adminLogPage(db: Db, query: AdminLogQuery): Promise<AdminLogPage> {
  const where = logWhere(query);
  const total = await countWhere(db, where);
  const rows = await db
    .select()
    .from(adminAction)
    .where(where)
    .orderBy(desc(adminAction.at), desc(adminAction.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset(pageOffset(query.page, ADMIN_PAGE_SIZE));
  return { rows: rows.map(entryOf), total, page: query.page, pages: adminPages(total), admins: await logAdmins(db) };
}

/** Вибірка для CSV: не більше ADMIN_LOG_EXPORT_MAX рядків і повний підрахунок. */
export async function adminLogExport(db: Db, filter: AdminLogFilter): Promise<AdminLogExport> {
  const where = logWhere(filter);
  const total = await countWhere(db, where);
  const rows = await db.select().from(adminAction).where(where).orderBy(desc(adminAction.at), desc(adminAction.id)).limit(ADMIN_LOG_EXPORT_MAX);
  return { rows: rows.map(entryOf), total };
}
