import { z } from 'zod';
import type { GroupEmoji } from './groups';
import type { ProfileCard } from './profile';

/** Бали ліги (45) за місце 1–5 серед членів групи; далі 0. */
export const LEAGUE_POINTS = [10, 7, 5, 3, 1] as const;
/** Гра рахується в лізі від стількох членів групи (на щонайменше двох рядках таблиці гри). */
export const LEAGUE_MIN_MEMBERS = 3;
/** Скільки титулів ліги показує профіль. */
export const LEAGUE_TITLES_SHOWN = 12;
/** Місяць ліги: 'YYYY-MM'. */
export const LEAGUE_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Вибір групи для гри в лобі; null — гра не для ліги. */
export const leaguePickSchema = z.object({ groupId: z.string().uuid().nullable() }).strict();

/** Рядок таблиці гри: місце за rankPlayers і акаунти людей (соло — один, команда — її члени; гості відкинуті). */
export interface LeagueEntry {
  rank: number;
  userIds: string[];
}

export interface LeagueOutcome {
  counted: boolean;
  /** Скільки різних членів групи грало. */
  members: number;
  rows: { userId: string; place: number; points: number }[];
}

/**
 * Хто й скільки отримує за гру. Рядки з принаймні одним членом групи — «рядки ліги»; їхнє місце = 1 + кількість
 * рядків ліги з меншим rank (нічия ділить місце й пропускає наступне). Член у двох рядках бере краще місце один раз.
 * Рахується, коли членів ≥ LEAGUE_MIN_MEMBERS і рядків ліги ≥ 2; інакше балів немає.
 */
export function leagueOutcome(entries: readonly LeagueEntry[], members: ReadonlySet<string>): LeagueOutcome {
  const leagueRows = entries
    .map((entry) => ({ rank: entry.rank, userIds: [...new Set(entry.userIds.filter((id) => members.has(id)))] }))
    .filter((row) => row.userIds.length > 0);
  const best = new Map<string, number>();
  for (const row of leagueRows) {
    const place = 1 + leagueRows.filter((other) => other.rank < row.rank).length;
    for (const userId of row.userIds) {
      const had = best.get(userId);
      if (had === undefined || place < had) best.set(userId, place);
    }
  }
  const counted = best.size >= LEAGUE_MIN_MEMBERS && leagueRows.length >= 2;
  if (!counted) return { counted: false, members: best.size, rows: [] };
  return {
    counted: true,
    members: best.size,
    rows: [...best].map(([userId, place]) => ({ userId, place, points: LEAGUE_POINTS[place - 1] ?? 0 })),
  };
}

export interface LeagueTotals {
  userId: string;
  nickname: string;
  points: number;
  games: number;
  firsts: number;
}

/** Порядок таблиці: бали ↓, перші місця ↓, ігри ↓, далі нік. */
export function leagueOrder(a: LeagueTotals, b: LeagueTotals): number {
  return b.points - a.points || b.firsts - a.firsts || b.games - a.games || a.nickname.localeCompare(b.nickname);
}

/** Рядки в порядку таблиці з місцем; рівна трійка (бали, перші, ігри) ділить місце. */
export function rankLeague<T extends LeagueTotals>(rows: readonly T[]): (T & { place: number })[] {
  const better = (a: LeagueTotals, b: LeagueTotals) => a.points - b.points ? a.points > b.points : a.firsts - b.firsts ? a.firsts > b.firsts : a.games > b.games;
  return [...rows].sort(leagueOrder).map((row) => ({ ...row, place: 1 + rows.filter((other) => better(other, row)).length }));
}

/** Переможці місяця: усі рівні за трійкою (бали, перші, ігри) на першому місці. */
export function monthWinners<T extends LeagueTotals>(rows: readonly T[]): T[] {
  return rankLeague(rows)
    .filter((row) => row.place === 1)
    .map((row) => row as T);
}

/** Попередній місяць: '2026-01' → '2025-12'. */
export function previousMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
}

export interface LeaguePickInfo {
  groupId: string | null;
  groups: { id: string; name: string; emoji: GroupEmoji; people: number }[];
}

export interface LeagueRow {
  place: number;
  user: ProfileCard;
  points: number;
  games: number;
  firsts: number;
  /** Уже не в групі (лише в минулих місяцях). */
  former: boolean;
}

export interface LeagueChampionMonth {
  month: string;
  users: ProfileCard[];
}

export interface LeagueTable {
  month: string;
  current: boolean;
  months: string[];
  rows: LeagueRow[];
  champions: LeagueChampionMonth[];
}

/** Титул ліги в профілі: лише назва групи й місяць, без посилання на групу. */
export interface LeagueTitle {
  group: string;
  month: string;
}

/** Зріз гри для гравця; ставить сервер, рушій ключа не ставить. */
export interface PlayerLeagueView {
  group: string;
  points?: number;
  tooFew?: true;
}

/** Зріз гри для ведучого; ставить сервер, рушій ключа не ставить. */
export interface HostLeagueView {
  group: string;
  rows?: { nickname: string; points: number }[];
  tooFew?: true;
}
