import { ADMIN_CHART_DAYS, type AdminChartDay, type AdminCharts } from '@quiz/shared';
import { sql } from 'drizzle-orm';
import { kyivMidnight } from './admin-store';
import type { Db } from './db/client';
import { game, participant } from './db/schema';
import { kyivDay } from './xp-rules';

/** Скільки днів назад від першого дня графіка потрібні гравці: тиждень для D−13…D−7 від D. */
const RETURN_LOOKBACK = 13;

/** Останні count днів за Києвом до now включно, старіші першими. */
export function kyivDayList(now: Date, count: number): string[] {
  const today = kyivDay(now);
  return Array.from({ length: count }, (_, i) => shiftDay(today, i - (count - 1)));
}

/** Календарна арифметика на Date.UTC без годин: перехід часу не збиває. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Яка частка акаунтів, що грали в дні D−13…D−7, грала й за D−6…D; null, коли тоді ніхто не грав. */
export function weeklyReturns(byDay: ReadonlyMap<string, ReadonlySet<string>>, day: string): number | null {
  const before = new Set<string>();
  const recent = new Set<string>();
  for (let back = 0; back <= RETURN_LOOKBACK; back += 1) {
    const ids = byDay.get(shiftDay(day, -back));
    if (ids === undefined) continue;
    for (const id of ids) (back <= 6 ? recent : before).add(id);
  }
  if (before.size === 0) return null;
  let both = 0;
  for (const id of before) if (recent.has(id)) both += 1;
  return Math.round((100 * both) / before.size);
}

const KYIV_DAY = sql`to_char(${game.startedAt} at time zone 'Europe/Kyiv', 'YYYY-MM-DD')`;

export async function adminCharts(db: Db, now: Date): Promise<AdminCharts> {
  const days = kyivDayList(now, ADMIN_CHART_DAYS);
  const first = days[0]!;
  const from = kyivMidnight(new Date(`${first}T12:00:00Z`));
  const fromWide = kyivMidnight(new Date(`${shiftDay(first, -RETURN_LOOKBACK)}T12:00:00Z`));

  const counts = await db
    .select({ day: sql<string>`${KYIV_DAY}`, games: sql<number>`count(*)`, finished: sql<number>`count(*) filter (where ${game.status} = 'finished')` })
    .from(game)
    .where(sql`${game.startedAt} >= ${from}`)
    .groupBy(KYIV_DAY);
  const pairs = await db
    .selectDistinct({ day: sql<string>`${KYIV_DAY}`, userId: participant.userId })
    .from(participant)
    .innerJoin(game, sql`${game.id} = ${participant.gameId}`)
    .where(sql`${game.startedAt} >= ${fromWide} and ${participant.userId} is not null`);

  const countOf = new Map(counts.map((row) => [row.day, row]));
  const byDay = new Map<string, Set<string>>();
  for (const { day, userId } of pairs) {
    if (userId === null) continue;
    const set = byDay.get(day) ?? new Set<string>();
    set.add(userId);
    byDay.set(day, set);
  }
  const rows: AdminChartDay[] = days.map((day) => {
    const games = Number(countOf.get(day)?.games ?? 0);
    const finished = Number(countOf.get(day)?.finished ?? 0);
    return {
      day,
      players: byDay.get(day)?.size ?? 0,
      games,
      finished,
      completion: games === 0 ? null : Math.round((100 * finished) / games),
      returns: weeklyReturns(byDay, day),
    };
  });
  return { days: rows, computedAt: now.toISOString() };
}
