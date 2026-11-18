import {
  LEAGUE_MONTH,
  LEAGUE_TITLES_SHOWN,
  leagueOutcome,
  monthWinners,
  rankLeague,
  type LeagueChampionMonth,
  type LeagueEntry,
  type LeagueRow,
  type LeagueTable,
  type LeagueTitle,
} from '@quiz/shared';
import { and, asc, desc, eq, lt, notExists, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { familyGroup, game, groupMember, leagueChampion, leagueGame, leagueMonth, leaguePoint } from './db/schema';
import { profileCards } from './group-store';
import { kyivDay } from './xp-rules';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Місяць 'YYYY-MM' за Києвом. */
export function kyivMonth(date: Date): string {
  return kyivDay(date).slice(0, 7);
}

export interface LeagueRecordInput {
  gameId: string;
  groupId: string;
  entries: LeagueEntry[];
  /** userId → нік у грі. */
  nicknames: Map<string, string>;
}

export interface LeagueGameResult {
  counted: boolean;
  rows: { userId: string; nickname: string; points: number }[];
}

/** Підсумок гри з бази: null — гра в лізі не записана. */
export async function leagueResultOf(db: Db | Tx, gameId: string): Promise<LeagueGameResult | null> {
  const [row] = await db.select({ counted: leagueGame.counted }).from(leagueGame).where(eq(leagueGame.gameId, gameId));
  if (row === undefined) return null;
  const rows = await db
    .select({ userId: leaguePoint.userId, nickname: leaguePoint.nickname, points: leaguePoint.points })
    .from(leaguePoint)
    .where(eq(leaguePoint.gameId, gameId))
    .orderBy(desc(leaguePoint.points), asc(leaguePoint.userId));
  return { counted: row.counted, rows };
}

/**
 * Записує гру в лігу групи один раз: первинний ключ league_game — єдиний арбітр (повтор і паралельний виклик
 * нічого не перераховують). Члени — на мить виклику, місяць — за finishedAt гри. null — групи вже немає.
 */
export async function recordLeague(db: Db | Tx, input: LeagueRecordInput, now = new Date()): Promise<LeagueGameResult | null> {
  const [group] = await db.select({ id: familyGroup.id }).from(familyGroup).where(eq(familyGroup.id, input.groupId));
  if (group === undefined) return null;

  const memberRows = await db.select({ userId: groupMember.userId }).from(groupMember).where(eq(groupMember.groupId, input.groupId));
  const outcome = leagueOutcome(input.entries, new Set(memberRows.map((row) => row.userId)));
  const [finished] = await db.select({ finishedAt: game.finishedAt }).from(game).where(eq(game.id, input.gameId));
  const month = kyivMonth(finished?.finishedAt ?? now);

  const inserted = await db
    .insert(leagueGame)
    .values({ gameId: input.gameId, groupId: input.groupId, month, members: outcome.members, counted: outcome.counted })
    .onConflictDoNothing()
    .returning({ gameId: leagueGame.gameId });
  if (inserted.length > 0 && outcome.rows.length > 0) {
    await db.insert(leaguePoint).values(
      outcome.rows.map((row) => ({
        gameId: input.gameId,
        userId: row.userId,
        groupId: input.groupId,
        month,
        place: row.place,
        points: row.points,
        nickname: input.nicknames.get(row.userId) ?? '',
      })),
    );
  }
  return leagueResultOf(db, input.gameId);
}

interface Totals {
  userId: string;
  nickname: string;
  points: number;
  games: number;
  firsts: number;
}

async function totalsOf(db: Db | Tx, groupId: string, month: string): Promise<Totals[]> {
  const rows = await db
    .select({
      userId: leaguePoint.userId,
      nickname: sql<string>`min(${leaguePoint.nickname})`,
      points: sql<number>`sum(${leaguePoint.points})::int`,
      games: sql<number>`count(*)::int`,
      firsts: sql<number>`count(*) filter (where ${leaguePoint.place} = 1)::int`,
    })
    .from(leaguePoint)
    .where(and(eq(leaguePoint.groupId, groupId), eq(leaguePoint.month, month)))
    .groupBy(leaguePoint.userId);
  return rows;
}

/**
 * Підсумовує кожен минулий (за Києвом) місяць групи, що має бали й ще не підсумований. Рядок league_month
 * вставляється в тій самій транзакції, що й чемпіони: хто вставив, той і підсумовує, решта нічого не робить.
 */
export async function settleLeague(db: Db, groupId: string, now: Date): Promise<void> {
  const current = kyivMonth(now);
  const pending = await db
    .selectDistinct({ month: leaguePoint.month })
    .from(leaguePoint)
    .where(
      and(
        eq(leaguePoint.groupId, groupId),
        lt(leaguePoint.month, current),
        notExists(
          db
            .select({ one: sql`1` })
            .from(leagueMonth)
            .where(and(eq(leagueMonth.groupId, groupId), eq(leagueMonth.month, leaguePoint.month))),
        ),
      ),
    )
    .orderBy(asc(leaguePoint.month));
  for (const { month } of pending) {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(leagueMonth)
        .values({ groupId, month, settledAt: now })
        .onConflictDoNothing()
        .returning({ month: leagueMonth.month });
      if (claimed.length === 0) return;
      const [group] = await tx.select({ name: familyGroup.name }).from(familyGroup).where(eq(familyGroup.id, groupId));
      if (group === undefined) return;
      const winners = monthWinners(await totalsOf(tx, groupId, month));
      if (winners.length === 0) return;
      await tx
        .insert(leagueChampion)
        .values(winners.map((row) => ({ groupId, groupName: group.name, month, userId: row.userId, points: row.points })))
        .onConflictDoNothing();
    });
  }
}

/** Таблиця місяця групи (спершу підсумовує минулі місяці); поганий чи майбутній month → поточний. */
export async function leagueTable(db: Db, groupId: string, month: string | null, now: Date): Promise<LeagueTable> {
  await settleLeague(db, groupId, now);
  const current = kyivMonth(now);
  const shown = month !== null && LEAGUE_MONTH.test(month) && month <= current ? month : current;

  const played = await db
    .selectDistinct({ month: leagueGame.month })
    .from(leagueGame)
    .where(eq(leagueGame.groupId, groupId))
    .orderBy(desc(leagueGame.month));
  const months = [current, ...played.map((row) => row.month).filter((m) => m !== current)];

  const memberRows = await db.select({ userId: groupMember.userId }).from(groupMember).where(eq(groupMember.groupId, groupId));
  const present = new Set(memberRows.map((row) => row.userId));
  const isCurrent = shown === current;
  const totals = (await totalsOf(db, groupId, shown)).filter((row) => !isCurrent || present.has(row.userId));

  const championRows = await db
    .select({ month: leagueChampion.month, userId: leagueChampion.userId })
    .from(leagueChampion)
    .where(eq(leagueChampion.groupId, groupId))
    .orderBy(desc(leagueChampion.month), asc(leagueChampion.userId));
  const cards = await profileCards(db, [...totals.map((row) => row.userId), ...championRows.map((row) => row.userId)]);

  const rows: LeagueRow[] = [];
  for (const row of rankLeague(totals.map((t) => ({ ...t, nickname: cards.get(t.userId)?.nickname ?? t.nickname })))) {
    const user = cards.get(row.userId);
    if (user === undefined) continue;
    rows.push({ place: row.place, user, points: row.points, games: row.games, firsts: row.firsts, former: !present.has(row.userId) });
  }

  const champions: LeagueChampionMonth[] = [];
  for (const row of championRows) {
    const user = cards.get(row.userId);
    if (user === undefined) continue;
    const last = champions[champions.length - 1];
    if (last !== undefined && last.month === row.month) last.users.push(user);
    else champions.push({ month: row.month, users: [user] });
  }
  return { month: shown, current: isCurrent, months, rows, champions };
}

/** Титули акаунта; спершу підсумовує групи, де в нього є бали за минулі непідсумовані місяці. */
export async function leagueTitlesOf(db: Db, userId: string, now: Date): Promise<LeagueTitle[]> {
  const unsettled = await db
    .selectDistinct({ groupId: leaguePoint.groupId })
    .from(leaguePoint)
    .where(
      and(
        eq(leaguePoint.userId, userId),
        lt(leaguePoint.month, kyivMonth(now)),
        notExists(
          db
            .select({ one: sql`1` })
            .from(leagueMonth)
            .where(and(eq(leagueMonth.groupId, leaguePoint.groupId), eq(leagueMonth.month, leaguePoint.month))),
        ),
      ),
    );
  for (const { groupId } of unsettled) await settleLeague(db, groupId, now);
  const rows = await db
    .select({ group: leagueChampion.groupName, month: leagueChampion.month })
    .from(leagueChampion)
    .where(eq(leagueChampion.userId, userId))
    .orderBy(desc(leagueChampion.month), asc(leagueChampion.groupName))
    .limit(LEAGUE_TITLES_SHOWN);
  return rows;
}
