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
  type QuestionType,
} from '@quiz/shared';
import { and, asc, count, eq, gt, isNull, ne, notExists, sql } from 'drizzle-orm';
import { loadAchievementGames, whoIn, type AchievementGame } from './achievement-games';
import { bestStreak, careerEarned, careerProgress, friendsPlayedWith, hitFinal, isComeback, isPerfect, winStreak, wonBlitzRound, type CareerFacts } from './achievements';
import type { Db } from './db/client';
import { ADJUSTMENT_ATTEMPT, follow, game, participant, PENALTY_ATTEMPT, profile, quiz, scoreAdjustment, userAchievement } from './db/schema';
import { gameAchievements } from './game-achievements';
import { answeredTypes, answeredTypesAround, gameTables, playerGames, type GameTable } from './history';
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

/** Те саме без гри gameId, у пам'яті (без нових запитів); hostedThere — гру вів сам користувач (і вона рахувалась у hosted). */
function inputsWithout(inputs: CareerInputs, gameId: string, hostedThere: number): CareerInputs {
  const games = inputs.games.filter((g) => g.played.gameId !== gameId);
  const played = games.map((g) => g.played);
  return {
    games,
    tables: inputs.tables.filter((table) => table.gameId !== gameId),
    stats: { ...gameStats(played), ...podiumStats(played), quizzes: inputs.stats.quizzes, hosted: inputs.stats.hosted - hostedThere },
  };
}

/** Лічильники кар'єри поза іграми профілю; *InGame — частка гри split (для фактів «до» неї), без split — 0. */
interface CareerCounts {
  friends: Set<string>;
  debuffs: number;
  debuffsInGame: number;
  authored: number;
  authoredInGame: number;
  hostedInGame: number;
  /** Типи запитань: усі й без гри split; null — не читали (тоді questionTypes = 0, а all_types цим читанням не дається). */
  types: { all: Set<QuestionType>; without: Set<QuestionType> } | null;
}

/** Один набір запитів на лічильники: і «зараз», і «до гри split» (умовні count, а не другий набір запитів). */
async function careerCounts(db: Db, userId: string, split: string | null, withTypes: boolean): Promise<CareerCounts> {
  const inSplit = (column: typeof game.id | typeof participant.gameId) =>
    (split === null ? sql`0` : sql`count(*) filter (where ${column} = ${split})`).mapWith(Number);
  const friendRows = await db.select({ id: follow.followeeId }).from(follow).where(eq(follow.followerId, userId));
  // Купівлі дебафів власних соло-учасників: у командній грі покупку записано на команду без людини.
  const [debuffs] = await db
    .select({ n: count(), inGame: inSplit(participant.gameId) })
    .from(scoreAdjustment)
    .innerJoin(participant, eq(participant.id, scoreAdjustment.participantId))
    .where(and(eq(participant.userId, userId), isNull(participant.teamId), eq(scoreAdjustment.source, 'debuff')));
  // Ігри вікторин користувача, хоч хто їх вів; ігри видалених вікторин не рахуються.
  const [authored] = await db
    .select({ n: count(), inGame: inSplit(game.id) })
    .from(game)
    .innerJoin(quiz, eq(quiz.id, game.quizId))
    .where(and(eq(quiz.ownerId, userId), eq(game.status, 'finished')));
  let hostedInGame = 0;
  if (split !== null) {
    const [hosted] = await db
      .select({ n: count() })
      .from(game)
      .where(and(eq(game.id, split), eq(game.hostId, userId), eq(game.status, 'finished'), eq(game.autopilot, false)));
    hostedInGame = hosted.n;
  }
  let types: CareerCounts['types'] = null;
  if (withTypes) {
    if (split === null) {
      const all = await answeredTypes(db, userId);
      types = { all, without: all };
    } else types = await answeredTypesAround(db, userId, split);
  }
  return {
    friends: new Set(friendRows.map((r) => r.id)),
    debuffs: debuffs.n,
    debuffsInGame: debuffs.inGame,
    authored: authored.n,
    authoredInGame: authored.inGame,
    hostedInGame,
    types,
  };
}

/** Кар'єрні факти з уже прочитаного; without — без цієї гри (вона мусить бути split у counts). Без запитів. */
function factsOf(userId: string, inputs: CareerInputs, counts: CareerCounts, without: string | null): CareerFacts {
  const { games, tables, stats } = without === null ? inputs : inputsWithout(inputs, without, counts.hostedInGame);
  // Свій учасник у грі (сам гравець або команда, де він грав): з кількох береться той, що з кращим місцем, а без місця останній.
  const mine = tables.flatMap((table) => {
    const own = table.players.filter((p) => p.userId === userId || p.memberUserIds.includes(userId)).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    return own[0] === undefined ? [] : [{ table, player: own[0] }];
  });
  // Типи раундів, де є свій рядок-відповідь (голоси й позначки виходу таблиця не містить; штрафи й коригування — не відповідь).
  const roundTypes = new Set(
    mine.flatMap(({ table, player }) =>
      player.rows.flatMap((row) => {
        const type = row.attempt === ADJUSTMENT_ATTEMPT || row.attempt === PENALTY_ATTEMPT ? undefined : table.roundTypes[row.roundIndex];
        return type === undefined ? [] : [type];
      }),
    ),
  );
  const played = games.map((g) => g.played);
  const types = counts.types === null ? null : without === null ? counts.types.all : counts.types.without;
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
    friendsPlayedWith: friendsPlayedWith(tables, userId, counts.friends),
    podium: stats.podium.first + stats.podium.second + stats.podium.third,
    debuffsBought: counts.debuffs - (without === null ? 0 : counts.debuffsInGame),
    authorGames: counts.authored - (without === null ? 0 : counts.authoredInGame),
    roundTypes: roundTypes.size,
    questionTypes: types?.size ?? 0,
  };
}

/**
 * Кар'єрні факти користувача (те, що profileFacts рахував для ачівок, + 12i): prepared — уже прочитане профілем (усі ігри);
 * exceptGameId — без цієї гри (відфільтровано в пам'яті).
 */
export async function careerFacts(db: Db, userId: string, prepared?: CareerInputs, exceptGameId: string | null = null): Promise<CareerFacts> {
  const inputs = prepared ?? (await careerInputs(db, userId));
  return factsOf(userId, inputs, await careerCounts(db, userId, exceptGameId, true), exceptGameId);
}

/** Рядки user_achievement у мапу; ачівку колись можуть прибрати з каталогу: її рядок лишається, але не показується. */
function earnedOf(rows: { id: AchievementId | null; earnedAt: Date | null; gameId: string | null }[]): EarnedAchievements {
  const earned: EarnedAchievements = new Map();
  for (const row of rows) if (row.id !== null && KNOWN.has(row.id)) earned.set(row.id, { earnedAt: row.earnedAt, gameId: row.gameId });
  return earned;
}

/** Записані ачівки користувача і мітка доповнення історії — одним запитом; без профілю — порожньо й мітки немає. */
async function storedOf(db: Db, userId: string): Promise<{ earned: EarnedAchievements; syncedAt: Date | null }> {
  const rows = await db
    .select({ syncedAt: profile.achievementsSyncedAt, id: userAchievement.achievementId, earnedAt: userAchievement.earnedAt, gameId: userAchievement.gameId })
    .from(profile)
    .leftJoin(userAchievement, eq(userAchievement.userId, profile.userId))
    .where(eq(profile.userId, userId));
  return { earned: earnedOf(rows), syncedAt: rows[0]?.syncedAt ?? null };
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
 * Ігри користувача — зіграні, проведені чи за його вікториною (awardGame нагороджує всіх трьох), — що закінчились після мітки
 * й не дали йому жодного рядка user_achievement: нагородження могло загубитись (збій, вичерпані повтори рекордера).
 * Від найранішої. Зазвичай порожньо: три запити за індексами (participant_user_idx, game_host_idx, quiz_owner_idx).
 */
async function missedGames(db: Db, userId: string, since: Date): Promise<{ gameId: string; earnedAt: Date }[]> {
  const fresh = and(
    eq(game.status, 'finished'),
    gt(game.finishedAt, since),
    notExists(
      db
        .select({ one: sql`1` })
        .from(userAchievement)
        .where(and(eq(userAchievement.userId, userId), eq(userAchievement.gameId, game.id))),
    ),
  );
  const columns = { id: game.id, finishedAt: game.finishedAt };
  const played = await db.select(columns).from(participant).innerJoin(game, eq(game.id, participant.gameId)).where(and(eq(participant.userId, userId), fresh));
  const hosted = await db.select(columns).from(game).where(and(eq(game.hostId, userId), fresh));
  const authored = await db.select(columns).from(game).innerJoin(quiz, eq(quiz.id, game.quizId)).where(and(eq(quiz.ownerId, userId), fresh));
  // Одна гра — один раз, хоч користувач у ній і грав, і вів, і автор.
  const byGame = new Map<string, Date>();
  for (const row of [...played, ...hosted, ...authored]) if (row.finishedAt !== null) byGame.set(row.id, row.finishedAt);
  return [...byGame]
    .map(([gameId, earnedAt]) => ({ gameId, earnedAt }))
    .sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime() || (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
}

/** Ігрові ачівки пропущених ігор (з їхньою датою й id); збій перевірки партії — у журнал, а не збій читання. */
async function missedAchievements(
  db: Db,
  userId: string,
  missed: { gameId: string; earnedAt: Date }[],
  want: (id: AchievementId, earnedAt: Date | null, gameId: string | null) => void,
  onError: (error: unknown) => void,
): Promise<void> {
  const dates = new Map(missed.map((m) => [m.gameId, m.earnedAt]));
  for (let i = 0; i < missed.length; i += BATCH) {
    try {
      const found: [AchievementId, string][] = [];
      for (const loaded of await loadAchievementGames(db, missed.slice(i, i + BATCH).map((m) => m.gameId))) {
        const who = whoIn(loaded, userId);
        if (who !== null) for (const id of gameAchievements(loaded, who)) found.push([id, loaded.gameId]);
      }
      for (const [id, gameId] of found) want(id, dates.get(gameId) ?? null, gameId);
    } catch (error) {
      onError(error);
    }
  }
}

export interface SyncOptions {
  /** Уже прочитані ігри профілю (усі). */
  prepared?: CareerInputs;
  /** false — не читати типи запитань (чужа сторінка й профіль); доповнення історії читає їх усе одно. */
  types?: boolean;
  /** Куди віддати збій наздоганяння пропущених ігор (читання від нього не падає). */
  onError?: (error: unknown) => void;
}

/**
 * Дописує пропущені ачівки й повертає всі отримані (лише відомі id), щойно вставлені цим викликом (fresh) і кар'єрні факти.
 * Історію доповнює раз (earned_at null): ігрові — з першою грою, що дала ачівку, кар'єрні — за фактами «до» гри at.
 * at — гра, що щойно закінчилась: її ігрові й нові кар'єрні — з її датою й id; без at — нові кар'єрні з now().
 * Читання без at ще й наздоганяє ігри після мітки profile.achievements_synced_at без жодного свого рядка (missedGames):
 * ігрові — з датою й id гри, нові кар'єрні — з найпізнішою з них; мітка переходить на неї, тож гра без ачівок перевіряється раз.
 * Отримане не забирається; паралельні виклики нешкідливі (ключ (user_id, achievement_id)).
 * Рідкісна гонка: якщо перше читання (доповнення) збігається з фінішем гри, ця гра вже finished у historyAchievements —
 * її ачівки запишуться як «давно» з її id, і датований запис awardGame нічого не змінить (onConflictDoNothing).
 */
export async function syncAchievements(
  db: Db,
  userId: string,
  at: FinishedAt | null,
  options: SyncOptions = {},
): Promise<{ earned: EarnedAchievements; fresh: AchievementId[]; facts: CareerFacts }> {
  const { earned, syncedAt } = await storedOf(db, userId);
  const synced = syncedAt !== null;
  const pending: EarnedAchievements = new Map();
  const want = (id: AchievementId, earnedAt: Date | null, gameId: string | null) => {
    if (!earned.has(id) && !pending.has(id)) pending.set(id, { earnedAt, gameId });
  };

  // Доповнення з грою at: факти «до» неї — з тих самих рядків, у пам'яті.
  const split = !synced && at !== null ? at.gameId : null;
  const inputs = options.prepared ?? (await careerInputs(db, userId));
  const counts = await careerCounts(db, userId, split, !synced || (options.types !== false && !earned.has('all_types')));
  const facts = factsOf(userId, inputs, counts, null);

  if (!synced) {
    for (const [id, gameId] of await historyAchievements(db, userId, at?.gameId ?? null)) want(id, null, gameId);
    // Кар'єра «до» щойно завершеної гри: те, що дала саме вона, отримає її дату нижче.
    const before = split === null ? facts : factsOf(userId, inputs, counts, split);
    for (const id of careerEarned(before)) want(id, null, null);
  }
  if (at !== null) {
    const loaded = at.game ?? (await loadAchievementGames(db, [at.gameId]))[0];
    const who = loaded === undefined ? null : whoIn(loaded, userId);
    if (loaded !== undefined && who !== null) for (const id of gameAchievements(loaded, who)) want(id, at.earnedAt, at.gameId);
  }
  // Наздоганяння ніколи не ламає читання: збій — у журнал, а мітка все одно переходить за ці ігри (інакше вічні повтори).
  const onError = options.onError ?? ((error: unknown) => console.error('Не вдалося наздогнати ачівки:', error));
  let missed: { gameId: string; earnedAt: Date }[] = [];
  if (synced && at === null) {
    try {
      missed = await missedGames(db, userId, syncedAt);
    } catch (error) {
      onError(error);
    }
    await missedAchievements(db, userId, missed, want, onError);
  }
  const now = new Date();
  const careerAt = at ?? missed.at(-1) ?? null;
  for (const id of careerEarned(facts)) want(id, careerAt?.earnedAt ?? now, careerAt?.gameId ?? null);

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
  } else if (missed.length > 0) {
    const last = missed[missed.length - 1].earnedAt;
    await db
      .update(profile)
      .set({ achievementsSyncedAt: sql`greatest(${profile.achievementsSyncedAt}, ${last})` })
      .where(eq(profile.userId, userId));
  }
  return { earned, fresh, facts };
}

/**
 * Після фінішу гри: учасники з акаунтами (гравці соло й люди команд), ведучий і власник вікторини.
 * Повертає щойно отримані з датою гри (для 12j; доповнена історія «давно» — не нове). Незавершена гра — порожньо.
 * Збій для одного користувача не зупиняє інших: він іде в onError, а його ачівки наздожене наступне читання (missedGames).
 */
export async function awardGame(
  db: Db,
  gameId: string,
  onError: (error: unknown) => void = (error) => console.error('Не вдалося видати ачівки:', error),
): Promise<Map<string, AchievementId[]>> {
  const awarded = new Map<string, AchievementId[]>();
  const [loaded] = await loadAchievementGames(db, [gameId]);
  if (loaded === undefined) return awarded;
  const [roles] = await db.select({ hostId: game.hostId, ownerId: quiz.ownerId }).from(game).leftJoin(quiz, eq(quiz.id, game.quizId)).where(eq(game.id, gameId));
  const users = new Set<string>();
  for (const player of loaded.players) for (const id of [player.userId, ...player.members.map((m) => m.userId)]) if (id !== null) users.add(id);
  if (roles !== undefined) for (const id of [roles.hostId, roles.ownerId]) if (id !== null) users.add(id);

  const at = { gameId, earnedAt: loaded.finishedAt ?? new Date(), game: loaded };
  for (const userId of users) {
    try {
      const { earned, fresh } = await syncAchievements(db, userId, at);
      awarded.set(
        userId,
        fresh.filter((id) => earned.get(id)?.earnedAt != null),
      );
    } catch (error) {
      onError(error);
    }
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
  // Чужа сторінка не показує поступу: типи запитань для неї не читаються.
  const { earned, facts } = await syncAchievements(db, userId, null, { types: own });
  const progress = careerProgress(facts);
  const items = achievementList(earned).flatMap((achievement): AchievementCard[] => {
    if (!own && !achievement.earned) return [];
    const goal = ACHIEVEMENT_INFO[achievement.id].goal;
    const counting = own && !achievement.earned && goal !== null;
    return [{ ...achievement, progress: counting ? { current: progress[achievement.id] ?? 0, goal } : null }];
  });
  return { profile: card, own, earned: earned.size, total: ACHIEVEMENTS.length, items };
}
