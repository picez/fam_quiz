import { ADMIN_HEALTH_TABLES, BOT_USER_ID, isBotUser, type AdminHealth, type AdminHealthTable } from '@quiz/shared';
import { sql } from 'drizzle-orm';
import { liveStatus } from './admin-live';
import type { Db } from './db/client';
import type { Room } from './rooms/manager';

const DAY_MS = 86_400_000;
const num = (value: unknown): number => Number(value ?? 0);

type HealthDb = NonNullable<AdminHealth['db']>;
type HealthProblems = NonNullable<AdminHealth['problems']>;
type HealthLive = NonNullable<AdminHealth['live']>;

/** 71: рядки головних таблиць (акаунти — без бота), підписки на сповіщення й розмір бази. Розмір — окремо: збій → null. */
export async function healthDb(db: Db): Promise<HealthDb> {
  const counts = ADMIN_HEALTH_TABLES.map((table) => {
    const where = table === 'user' ? sql` where id <> ${BOT_USER_ID}` : sql``;
    return sql`(select count(*)::int from ${sql.identifier(table)}${where}) as ${sql.identifier(table)}`;
  });
  const result = (await db.execute(
    sql`select ${sql.join(counts, sql`, `)}, (select count(*)::int from "push_subscription") as push_subscriptions, (select count(distinct user_id)::int from "push_subscription") as push_people`,
  )) as { rows: Record<string, unknown>[] };
  const row = result.rows[0] ?? {};
  const rows = Object.fromEntries(ADMIN_HEALTH_TABLES.map((table) => [table, num(row[table])])) as Record<AdminHealthTable, number>;
  let bytes: number | null = null;
  try {
    const size = (await db.execute(sql`select pg_database_size(current_database())::bigint as bytes`)) as { rows: { bytes: unknown }[] };
    const value = Number(size.rows[0]?.bytes);
    bytes = Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    bytes = null;
  }
  return { bytes, rows, push: { subscriptions: num(row.push_subscriptions), people: num(row.push_people) } };
}

/** 71: збої за 24 год (сума day_count і різних), нерозібрані збої, відкриті скарги на проблеми й на вміст. */
export async function healthProblems(db: Db, now: Date): Promise<HealthProblems> {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const result = (await db.execute(sql`select
      (select coalesce(sum(day_count), 0)::int from "server_error" where day_start > ${since}) as errors24h,
      (select count(distinct fingerprint)::int from "server_error" where day_start > ${since}) as kinds24h,
      (select count(*)::int from "server_error" where status = 'new') as errors_new,
      (select count(*)::int from "problem_report" where status = 'open') as problems_open,
      (select count(*)::int from "user_report" where status = 'open') as reports_open`)) as { rows: Record<string, unknown>[] };
  const row = result.rows[0] ?? {};
  return { errors24h: num(row.errors24h), errorKinds24h: num(row.kinds24h), errorsNew: num(row.errors_new), problemsOpen: num(row.problems_open), reportsOpen: num(row.reports_open) };
}

/** 71: живі кімнати процесу за станом (завершені не рахуються): лобі / ідуть / пауза, бот, автопілот, гравці на зв'язку. */
export function liveBreakdown(rooms: Room[], maxRooms: number, frozen: boolean): HealthLive {
  const live: HealthLive = { lobby: 0, playing: 0, paused: 0, bot: 0, autopilot: 0, playersOnline: 0, playersTotal: 0, maxRooms, restarting: frozen };
  for (const room of rooms) {
    const { status } = liveStatus(room.state);
    if (status === 'finished') continue;
    if (status === 'lobby') live.lobby += 1;
    else if (status === 'paused') live.paused += 1;
    else live.playing += 1;
    if (isBotUser(room.hostUserId)) live.bot += 1;
    if (room.state.autopilot !== undefined) live.autopilot += 1;
    live.playersTotal += room.state.players.length;
    live.playersOnline += room.state.players.filter((p) => (room.connections.get(p.id) ?? 0) > 0).length;
  }
  return live;
}
