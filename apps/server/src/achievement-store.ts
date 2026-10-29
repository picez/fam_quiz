import {
  ACHIEVEMENT_INFO,
  ACHIEVEMENTS,
  gameStats,
  podiumStats,
  type Achievement,
  type AchievementCard,
  type AchievementId,
  type AchievementsPage,
  type ProfileStats,
} from '@quiz/shared';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import { loadAchievementGames, whoIn, type AchievementGame } from './achievement-games';
import { bestStreak, careerEarned, careerProgress, friendsPlayedWith, hitFinal, isComeback, isPerfect, winStreak, wonBlitzRound, type CareerFacts } from './achievements';
import type { Db } from './db/client';
import { ADJUSTMENT_ATTEMPT, follow, game, participant, profile, quiz, scoreAdjustment, userAchievement } from './db/schema';
import { gameAchievements } from './game-achievements';
import { answeredTypes, gameTables, playerGames, type GameTable } from './history';
import { ensureProfile } from './profiles';

/** Скільки ігор доповнення історії читає за раз. */
const BATCH = 20;

const KNOWN: ReadonlySet<string> = new Set(ACHIEVEMENTS);

/** Отримані ачівки: коли (null — «давно», до 12i) і за яку гру (null — кар'єрна чи невідома). */
export type EarnedAchievements = Map<AchievementId, { earnedAt: Date | null; gameId: string | null }>;

/** Те, що профіль уже читає: ігри гравця, таблиці цих ігор і статистика. */
export interface CareerInputs {
  games: Awaited<ReturnType<typeof playerGames>>;
  tables: GameTable[];
  stats: ProfileStats;
}

/** Гра, що щойно закінчилась: її ачівки — з її датою й id; game — уже завантажена (щоб не читати її для кожного користувача). */
export interface FinishedAt {
  gameId: string;
  earnedAt: Date;
  game?: AchievementGame;
}

/** Ігри, таблиці й статистика профілю користувача; exceptGameId — без цієї гри (кар'єра «до неї»). */
export async function careerInputs(db: Db, userId: string, exceptGameId: string | null = null): Promise<CareerInputs> {
  const games = (await playerGames(db, userId, null)).filter((g) => g.played.gameId !== exceptGameId);
  const [quizzes] = await db.select({ n: count() }).from(quiz).where(eq(quiz.ownerId, userId));
  const [hosted] = await db
    .select({ n: count() })
    .from(game)
    .where(and(eq(game.hostId, userId), eq(game.status, 'finished'), eq(game.autopilot, false), exceptGameId === null ? undefined : ne(game.id, exceptGameId)));
  const played = games.map((g) => g.played);
  const stats = { ...gameStats(played), ...podiumStats(played), quizzes: quizzes.n, hosted: hosted.n };
  const tables = await gameTables(
    db,
    played.map((g) => g.gameId),
  );
  return { games, tables, stats };
}

/**
 * Кар'єрні факти користувача (те, що profileFacts рахував для ачівок, + 12i): prepared — уже прочитане профілем;
 * exceptGameId — без цієї гри (тоді prepared не передають).
 */
export async function careerFacts(db: Db, userId: string, prepared?: CareerInputs, exceptGameId: string | null = null): Promise<CareerFacts> {
  const { games, tables, stats } = prepared ?? (await careerInputs(db, userId, exceptGameId));
  const except = (column: typeof game.id | typeof participant.gameId) => (exceptGameId === null ? undefined : ne(column, exceptGameId));
  const friendRows = await db.select({ id: follow.followeeId }).from(follow).where(eq(follow.followerId, userId));
  // Купівлі дебафів власних соло-учасників: у командній грі покупку записано на команду без людини.
  const [debuffs] = await db
    .select({ n: count() })
    .from(scoreAdjustment)
    .innerJoin(participant, eq(participant.id, scoreAdjustment.participantId))
    .where(and(eq(participant.userId, userId), isNull(participant.teamId), eq(scoreAdjustment.source, 'debuff'), except(participant.gameId)));
  // Ігри вікторин користувача, хоч хто їх вів; ігри видалених вікторин не рахуються.
  const [authored] = await db
    .select({ n: count() })
    .from(game)
    .innerJoin(quiz, eq(quiz.id, game.quizId))
    .where(and(eq(quiz.ownerId, userId), eq(game.status, 'finished'), except(game.id)));
  const questionTypes = await answeredTypes(db, userId, exceptGameId);

  // Свій учасник у грі (сам гравець або команда, де він грав): з кількох береться той, що з кращим місцем, а без місця останній.
  const mine = tables.flatMap((table) => {
    const own = table.players.filter((p) => p.userId === userId || p.memberUserIds.includes(userId)).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    return own[0] === undefined ? [] : [{ table, player: own[0] }];
  });
  // Типи раундів, де є свій рядок-відповідь чи штраф (коригування раунду не грають).
  const roundTypes = new Set(
    mine.flatMap(({ table, player }) =>
      player.rows.flatMap((row) => {
        const type = row.attempt === ADJUSTMENT_ATTEMPT ? undefined : table.roundTypes[row.roundIndex];
        return type === undefined ? [] : [type];
      }),
    ),
  );
  const played = games.map((g) => g.played);
  return {
    games: stats.games,
    wins: stats.wins,
    hosted: stats.hosted,
    bestStreak: games.reduce((best, g) => Math.max(best, bestStreak(g.marks)), 0),
    perfectGames: games.filter(isPerfect).length,
    winStreak: winStreak(played),
    blitzWins: mine.filter(({ table, player }) => wonBlitzRound(table, player.participantId)).length,
    finalHits: mine.filter(({ table, player }) => hitFinal(table, player.participantId)).length,
    comebacks: mine.filter(({ table, player }) => isComeback(table, player.participantId)).length,
    friendsPlayedWith: friendsPlayedWith(tables, userId, new Set(friendRows.map((r) => r.id))),
    podium: stats.podium.first + stats.podium.second + stats.podium.third,
    debuffsBought: debuffs.n,
    authorGames: authored.n,
    roundTypes: roundTypes.size,
    questionTypes: questionTypes.size,
  };
}

/** Рядки user_achievement у мапу; ачівку колись можуть прибрати з каталогу: її рядок лишається, але не показується. */
function earnedOf(rows: { id: AchievementId | null; earnedAt: Date | null; gameId: string | null }[]): EarnedAchievements {
  const earned: EarnedAchievements = new Map();
  for (const row of rows) if (row.id !== null && KNOWN.has(row.id)) earned.set(row.id, { earnedAt: row.earnedAt, gameId: row.gameId });
  return earned;
}

/** Записані ачівки користувача і позначка «історію доповнено» — одним запитом; без профілю — порожньо й не доповнено. */
async function storedOf(db: Db, userId: string): Promise<{ earned: EarnedAchievements; synced: boolean }> {
  const rows = await db
    .select({ syncedAt: profile.achievementsSyncedAt, id: userAchievement.achievementId, earnedAt: userAchievement.earnedAt, gameId: userAchievement.gameId })
    .from(profile)
    .leftJoin(userAchievement, eq(userAchievement.userId, profile.userId))
    .where(eq(profile.userId, userId));
  return { earned: earnedOf(rows), synced: rows[0]?.syncedAt != null };
}

/** Ігрові ачівки користувача з усіх його завершених ігор (крім exceptGameId), від найстарішої: id → перша гра, що її дала. */
async function historyAchievements(db: Db, userId: string, exceptGameId: string | null): Promise<Map<AchievementId, string>> {
  const rows = await db
    .select({ id: game.id })
    .from(participant)
    .innerJoin(game, eq(game.id, participant.gameId))
    .where(and(eq(participant.userId, userId), eq(game.status, 'finished'), exceptGameId === null ? undefined : ne(game.id, exceptGameId)))
    .orderBy(asc(game.startedAt), asc(game.id));
  const gameIds = [...new Set(rows.map((row) => row.id))];
  const found = new Map<AchievementId, string>();
  for (let i = 0; i < gameIds.length; i += BATCH) {
    for (const loaded of await loadAchievementGames(db, gameIds.slice(i, i + BATCH))) {
      const who = whoIn(loaded, userId);
      if (who === null) continue;
      for (const id of gameAchievements(loaded, who)) if (!found.has(id)) found.set(id, loaded.gameId);
    }
  }
  return found;
}

/**
 * Дописує пропущені ачівки й повертає всі отримані (лише відомі id) і щойно вставлені цим викликом (fresh).
 * Історію доповнює раз (earned_at null): ігрові — з першою грою, що дала ачівку, кар'єрні — за фактами «до» гри at.
 * at — гра, що щойно закінчилась: її ігрові й нові кар'єрні — з її датою й id; без at — нові кар'єрні з now().
 * Отримане не забирається; паралельні виклики нешкідливі (ключ (user_id, achievement_id)).
 */
export async function syncAchievements(
  db: Db,
  userId: string,
  facts: CareerFacts,
  at: FinishedAt | null,
): Promise<{ earned: EarnedAchievements; fresh: AchievementId[] }> {
  const { earned, synced } = await storedOf(db, userId);
  const pending: EarnedAchievements = new Map();
  const want = (id: AchievementId, earnedAt: Date | null, gameId: string | null) => {
    if (!earned.has(id) && !pending.has(id)) pending.set(id, { earnedAt, gameId });
  };

  if (!synced) {
    for (const [id, gameId] of await historyAchievements(db, userId, at?.gameId ?? null)) want(id, null, gameId);
    // Кар'єра «до» щойно завершеної гри: те, що дала саме вона, отримає її дату нижче.
    const before = at === null ? facts : await careerFacts(db, userId, undefined, at.gameId);
    for (const id of careerEarned(before)) want(id, null, null);
  }
  if (at !== null) {
    const loaded = at.game ?? (await loadAchievementGames(db, [at.gameId]))[0];
    const who = loaded === undefined ? null : whoIn(loaded, userId);
    if (loaded !== undefined && who !== null) for (const id of gameAchievements(loaded, who)) want(id, at.earnedAt, at.gameId);
  }
  const now = new Date();
  for (const id of careerEarned(facts)) want(id, at?.earnedAt ?? now, at?.gameId ?? null);

  let fresh: AchievementId[] = [];
  if (pending.size > 0) {
    const inserted = await db
      .insert(userAchievement)
      .values([...pending].map(([achievementId, { earnedAt, gameId }]) => ({ userId, achievementId, earnedAt, gameId })))
      .onConflictDoNothing()
      .returning({ id: userAchievement.achievementId });
    const ids = new Set(inserted.map((row) => row.id));
    fresh = ACHIEVEMENTS.filter((id) => ids.has(id));
    for (const id of fresh) earned.set(id, pending.get(id)!);
    // Частину вже записав паралельний виклик: беремо його дати.
    if (ids.size < pending.size) {
      const stored = await db
        .select({ id: userAchievement.achievementId, earnedAt: userAchievement.earnedAt, gameId: userAchievement.gameId })
        .from(userAchievement)
        .where(eq(userAchievement.userId, userId));
      for (const [id, row] of earnedOf(stored)) if (!earned.has(id)) earned.set(id, row);
    }
  }
  if (!synced) {
    await ensureProfile(db, userId);
    await db.update(profile).set({ achievementsSyncedAt: now }).where(eq(profile.userId, userId));
  }
  return { earned, fresh };
}

/**
 * Після фінішу гри: учасники з акаунтами (гравці соло й люди команд), ведучий і власник вікторини.
 * Повертає щойно отримані з датою гри (для 12j; доповнена історія «давно» — не нове). Незавершена гра — порожньо.
 */
export async function awardGame(db: Db, gameId: string): Promise<Map<string, AchievementId[]>> {
  const awarded = new Map<string, AchievementId[]>();
  const [loaded] = await loadAchievementGames(db, [gameId]);
  if (loaded === undefined) return awarded;
  const [roles] = await db.select({ hostId: game.hostId, ownerId: quiz.ownerId }).from(game).leftJoin(quiz, eq(quiz.id, game.quizId)).where(eq(game.id, gameId));
  const users = new Set<string>();
  for (const player of loaded.players) for (const id of [player.userId, ...player.members.map((m) => m.userId)]) if (id !== null) users.add(id);
  if (roles !== undefined) for (const id of [roles.hostId, roles.ownerId]) if (id !== null) users.add(id);

  const at = { gameId, earnedAt: loaded.finishedAt ?? new Date(), game: loaded };
  for (const userId of users) {
    const { earned, fresh } = await syncAchievements(db, userId, await careerFacts(db, userId), at);
    awarded.set(
      userId,
      fresh.filter((id) => earned.get(id)?.earnedAt != null),
    );
  }
  return awarded;
}

/** Усі ачівки каталогу з позначками отримання (профіль). */
export function achievementList(earned: EarnedAchievements): Achievement[] {
  return ACHIEVEMENTS.map((id) => {
    const got = earned.get(id);
    return { id, earned: got !== undefined, earnedAt: got?.earnedAt?.toISOString() ?? null };
  });
}

/** Сторінка ачівок: own — усі з поступом лічильних неотриманих; інакше лише отримані без поступу. null — немає такого користувача. */
export async function achievementsPage(db: Db, userId: string, own: boolean): Promise<AchievementsPage | null> {
  const card = await ensureProfile(db, userId);
  if (card === null) return null;
  const facts = await careerFacts(db, userId);
  const { earned } = await syncAchievements(db, userId, facts, null);
  const progress = careerProgress(facts);
  const items = achievementList(earned).flatMap((achievement): AchievementCard[] => {
    if (!own && !achievement.earned) return [];
    const goal = ACHIEVEMENT_INFO[achievement.id].goal;
    const counting = own && !achievement.earned && goal !== null;
    return [{ ...achievement, progress: counting ? { current: progress[achievement.id] ?? 0, goal } : null }];
  });
  return { profile: card, own, earned: earned.size, total: ACHIEVEMENTS.length, items };
}
