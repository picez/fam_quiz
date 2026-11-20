import { normalizeText } from '@quiz/engine';
import {
  LIMITS,
  isAnti,
  isWin,
  nicknameSchema,
  normalizeFavorites,
  publicForm,
  recentForm,
  type Achievement,
  type FriendCard,
  type LeagueTitle,
  type Locale,
  type OwnProfile,
  type ProfileCard,
  type ProfileStats,
  type PublicProfile,
  type RecentForm,
  type ProfileUpdate,
  type ProfileWin,
} from '@quiz/shared';
import { and, asc, count, eq, inArray, isNull, like, lt, ne, or } from 'drizzle-orm';
import type { CurrentUser } from './account-routes';
import { achievementList, antiHidden, syncAchievements } from './achievement-store';
import { isHidden } from './bans';
import type { Db } from './db/client';
import { follow, game, profile, user } from './db/schema';
import { isUniqueViolation } from './db/unique';
import { notHidden } from './feed-store';
import { leagueTitlesOf } from './league-store';
import { likeTotals } from './like-store';
import { reportError } from './log';
import { showcaseOf } from './prizes';
import { listQuizzes } from './quizzes';
import { ownLevel, publicLevel } from './xp-store';

/** Ключ унікальності: без різниці регістру, пробілів і апострофів. */
export const nicknameKey = (nickname: string) => normalizeText(nickname);

/** Скільки разів пробувати наступний номер, перш ніж здатися (захист від нескінченного циклу). */
const MAX_ATTEMPTS = 1000;

const card = (row: { userId: string; nickname: string | null; avatar: string | null }): ProfileCard => ({
  id: row.userId,
  nickname: row.nickname,
  avatar: row.avatar,
});

/**
 * Основа нікнейма за замовчуванням: перше слово імені акаунта (обрізане до межі). Якщо воно не проходить
 * перевірку нікнейма, береться стиснене повне ім'я, а якщо й воно не проходить, то null (нік порожній, веб показує підставку).
 */
function baseNickname(name: string): string | null {
  const squeezed = name.replace(/\s+/g, ' ').trim();
  const candidates = [
    squeezed.split(' ')[0]!.slice(0, LIMITS.nicknameMax),
    squeezed.slice(0, LIMITS.nicknameMax).trim(),
  ];
  return candidates.find((c) => nicknameSchema.safeParse(c).success) ?? null;
}

function candidate(base: string, n: number): string {
  if (n === 1) return base;
  const suffix = ` ${n}`;
  return `${base.slice(0, LIMITS.nicknameMax - suffix.length).trim()}${suffix}`;
}

async function findProfile(db: Db, userId: string): Promise<ProfileCard | null> {
  const [row] = await db.select().from(profile).where(eq(profile.userId, userId));
  return row ? card(row) : null;
}

/** Профіль користувача; створює його з нікнеймом за замовчуванням, якщо ще немає. null — такого користувача немає. */
export async function ensureProfile(db: Db, userId: string): Promise<ProfileCard | null> {
  const existing = await findProfile(db, userId);
  if (existing) return existing;

  const [account] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  if (!account) return null;

  const base = baseNickname(account.name);
  if (base === null) {
    // Без ніка: ключ теж null, тож унікальність не заважає і нумерувати нічого.
    await db.insert(profile).values({ userId: userId, nickname: null, nicknameKey: null }).onConflictDoNothing();
    return findProfile(db, userId);
  }
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const nickname = candidate(base, n);
    // Без цілі: спрацьовує і на user_id (паралельний виклик), і на nickname_key (зайнятий нікнейм).
    await db.insert(profile).values({ userId, nickname, nicknameKey: nicknameKey(nickname) }).onConflictDoNothing();
    const created = await findProfile(db, userId);
    if (created) return created;
  }
  throw new Error('no free default nickname');
}

/** Зберігає нікнейм і аватар; зайнятий іншим нікнейм — помилка. */
export async function saveProfile(
  db: Db,
  userId: string,
  update: ProfileUpdate,
): Promise<{ ok: true; profile: ProfileCard } | { ok: false; error: 'nickname_taken' | 'not_found' }> {
  if ((await ensureProfile(db, userId)) === null) return { ok: false, error: 'not_found' };
  try {
    const [row] = await db
      .update(profile)
      .set({ nickname: update.nickname, nicknameKey: nicknameKey(update.nickname), avatar: update.avatar, updatedAt: new Date() })
      .where(eq(profile.userId, userId))
      .returning();
    return { ok: true, profile: card(row) };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'nickname_taken' };
    throw error;
  }
}

export const WINS_SHOWN = 20;

/**
 * Статистика, ачівки (усі з позначками й датами), останні перемоги (не більше WINS_SHOWN, найновіші першими) й остання форма (49).
 * own — профіль власника; чужий профіль не читає типів запитань (поступу там немає).
 */
export async function profileFacts(
  db: Db,
  userId: string,
  own = true,
): Promise<{ stats: ProfileStats; achievements: Achievement[]; wins: ProfileWin[]; form: RecentForm }> {
  // Кар'єру читає сама синхронізація ачівок (раз) і віддає її в inputs.
  const { earned, inputs } = await syncAchievements(db, userId, null, { types: own });
  const played = inputs.games.map((g) => g.played);
  const wins = played
    .filter(isWin)
    .slice(0, WINS_SHOWN)
    // isWin гарантує rank === 1.
    .map((g) => ({ gameId: g.gameId, title: g.title, startedAt: g.startedAt, rank: g.rank ?? 1 }));
  // Форма — з тих самих уже прочитаних ігор: жодного нового запиту.
  return { stats: inputs.stats, achievements: achievementList(earned), wins, form: recentForm(played) };
}

/** Друзі (на кого підписаний), за нікнеймом. */
export async function friendsOf(db: Db, userId: string): Promise<FriendCard[]> {
  const found = await db
    .select({ id: follow.followeeId, nickname: profile.nickname, avatar: profile.avatar, lastSeenAt: profile.lastSeenAt })
    .from(follow)
    .innerJoin(profile, eq(profile.userId, follow.followeeId))
    .where(and(eq(follow.followerId, userId), notHidden(follow.followeeId)))
    .orderBy(asc(profile.nickname));
  const rows: FriendCard[] = found.map((row) => ({ ...row, lastSeenAt: row.lastSeenAt?.toISOString() ?? null }));
  // Друг, якому профіль ще не створювали, теж має бути в списку.
  const withProfile = new Set(rows.map((row) => row.id));
  const all = await db
    .select({ id: follow.followeeId })
    .from(follow)
    .where(and(eq(follow.followerId, userId), notHidden(follow.followeeId)));
  for (const { id } of all) {
    if (withProfile.has(id)) continue;
    const created = await ensureProfile(db, id);
    if (created) rows.push({ ...created, lastSeenAt: null });
  }
  return rows.sort((a, b) => (a.nickname ?? '').localeCompare(b.nickname ?? ''));
}

/** Людина щойно була на сайті (беклог 9): мітка оновлюється не частіше ніж раз на хвилину; без профілю — нічого. */
export async function touchSeen(db: Db, userId: string): Promise<void> {
  await db
    .update(profile)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(profile.userId, userId), or(isNull(profile.lastSeenAt), lt(profile.lastSeenAt, new Date(Date.now() - 60_000)))));
}

/** Підказки пошуку друга (беклог 9): до SEARCH_LIMIT профілів, чий нікнейм починається з query (за nickname_key), крім себе. */
export const SEARCH_LIMIT = 8;
export async function searchProfiles(db: Db, query: string, viewerId: string): Promise<ProfileCard[]> {
  const key = nicknameKey(query);
  if (key.length < 2) return [];
  const escaped = key.replace(/[\\%_]/g, (char) => `\\${char}`);
  return db
    .select({ id: profile.userId, nickname: profile.nickname, avatar: profile.avatar })
    .from(profile)
    .where(and(like(profile.nicknameKey, `${escaped}%`), ne(profile.userId, viewerId), notHidden(profile.userId)))
    .orderBy(asc(profile.nickname))
    .limit(SEARCH_LIMIT);
}

/** Профіль за точним нікнеймом (через nickname_key); null — немає або людину заблоковано. */
export async function findByNickname(db: Db, nickname: string): Promise<ProfileCard | null> {
  const [row] = await db
    .select()
    .from(profile)
    .where(and(eq(profile.nicknameKey, nicknameKey(nickname)), notHidden(profile.userId)));
  return row ? card(row) : null;
}

/** Підписує або відписує; повторна дія нічого не змінює. */
export async function setFollow(db: Db, followerId: string, followeeId: string, on: boolean): Promise<void> {
  if (on) {
    await db.insert(follow).values({ followerId, followeeId }).onConflictDoNothing();
  } else {
    await db.delete(follow).where(and(eq(follow.followerId, followerId), eq(follow.followeeId, followeeId)));
  }
}

export async function isFollowing(db: Db, followerId: string, followeeId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(follow)
    .where(and(eq(follow.followerId, followerId), eq(follow.followeeId, followeeId)));
  return row.n > 0;
}

/** Вікторини власника з числом завершених ігор (plays), найзіграніші першими; за рівності — новіші (порядок listQuizzes). */
export async function popularQuizzes(db: Db, ownerId: string): Promise<OwnProfile['quizzes']> {
  const list = await listQuizzes(db, ownerId);
  if (list.length === 0) return [];
  const counted = await db
    .select({ quizId: game.quizId, n: count() })
    .from(game)
    .where(and(inArray(game.quizId, list.map(({ id }) => id)), eq(game.status, 'finished')))
    .groupBy(game.quizId);
  const plays = new Map(counted.map((row) => [row.quizId, row.n]));
  // sort стабільний: за рівності лишається порядок listQuizzes (новіші першими).
  return list.map(({ id, title }) => ({ id, title, plays: plays.get(id) ?? 0 })).sort((a, b) => b.plays - a.plays);
}

/** Титули ліги, що профіль не ламають: збій читання чи підсумовування — порожній список і запис у журнал. */
async function safeLeagueTitles(db: Db, userId: string): Promise<LeagueTitle[]> {
  try {
    return await leagueTitlesOf(db, userId, new Date());
  } catch (error) {
    reportError(error, { where: 'league-titles' });
    return [];
  }
}

/** Повний профіль власника; лише для нього. */
export async function ownProfile(db: Db, current: CurrentUser): Promise<OwnProfile> {
  const base = await ensureProfile(db, current.id);
  if (!base) throw new Error('profile of a signed-in user must exist');
  const facts = await profileFacts(db, current.id);
  // Решта — поруч, але після ачівок: рівень і «щойно відкрите» рахують XP за щойно записані ачівки.
  const [quizzes, level, likes, leagueTitles, friends, showcase] = await Promise.all([
    popularQuizzes(db, current.id),
    ownLevel(db, current.id),
    likeTotals(db, current.id),
    safeLeagueTitles(db, current.id),
    friendsOf(db, current.id),
    showcaseOf(db, current.id),
  ]);
  return {
    ...base,
    email: current.email,
    stats: facts.stats,
    achievements: facts.achievements,
    quizzes,
    wins: facts.wins,
    form: facts.form,
    friends,
    showcase,
    // Ретро й наздоганяння досвіду (15a) — усередині ownLevel, раз і перед читанням рівня; збій профіль не ламає.
    level,
    likes,
    leagueTitles,
  };
}

/** Публічна частина профілю; поля перелічено явно, щоб приватне не потрапило сюди випадково. null — такого користувача немає або його заблоковано. */
export async function publicProfile(db: Db, id: string, viewerId: string | null): Promise<PublicProfile | null> {
  if (await isHidden(db, id)) return null;
  const base = await ensureProfile(db, id);
  if (!base) return null;
  const { stats, achievements, form } = await profileFacts(db, id, false);
  // Решта — поруч, але після ачівок (рівень рахує XP за щойно записані).
  const [following, showcase, hidden, level, likes, leagueTitles] = await Promise.all([
    viewerId === null || viewerId === id ? null : isFollowing(db, viewerId, id),
    showcaseOf(db, id),
    antiHidden(db, [id]),
    publicLevel(db, id),
    likeTotals(db, id),
    safeLeagueTitles(db, id),
  ]);
  // Антидосягнення, які власник ховає (12j): ні в списку, ні закріплених на вітрині.
  const hide = hidden.has(id);
  return {
    id: base.id,
    nickname: base.nickname,
    avatar: base.avatar,
    stats,
    achievements: hide ? achievements.filter((a) => !isAnti(a.id)) : achievements,
    following,
    showcase: hide ? { ...showcase, pins: { ...showcase.pins, achievements: showcase.pins.achievements.filter((a) => !isAnti(a)) } } : showcase,
    level,
    likes,
    leagueTitles,
    // Чужому — лише місця й дати, без назв ігор.
    form: publicForm(form),
  };
}

/** Улюблені користувача: лише відомі маніфесту id (normalizeFavorites); профілю ще немає — його створює ensureProfile. */
export async function favoriteStickers(db: Db, userId: string): Promise<string[]> {
  await ensureProfile(db, userId);
  const [row] = await db.select({ ids: profile.favoriteStickers }).from(profile).where(eq(profile.userId, userId));
  return normalizeFavorites(row?.ids ?? []);
}

/** Записує normalizeFavorites(ids) і повертає записане. */
export async function saveFavoriteStickers(db: Db, userId: string, ids: string[]): Promise<string[]> {
  await ensureProfile(db, userId);
  const favorites = normalizeFavorites(ids);
  await db.update(profile).set({ favoriteStickers: favorites }).where(eq(profile.userId, userId));
  return favorites;
}

/** Мова профілю або null, якщо не обрана (чи профілю немає). */
export async function profileLocale(db: Db, userId: string): Promise<Locale | null> {
  const [row] = await db.select({ locale: profile.locale }).from(profile).where(eq(profile.userId, userId));
  return row?.locale ?? null;
}

/** Легкий режим (31) з профілю; немає профілю — вимкнено. */
export async function profileEasy(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ easyMode: profile.easyMode }).from(profile).where(eq(profile.userId, userId));
  return row?.easyMode ?? false;
}

/** Зберігає легкий режим (31); профілю ще немає — його створює ensureProfile. null — профілю не створити (немає користувача). */
export async function saveEasy(db: Db, userId: string, on: boolean): Promise<boolean | null> {
  if ((await ensureProfile(db, userId)) === null) return null;
  const [row] = await db.update(profile).set({ easyMode: on }).where(eq(profile.userId, userId)).returning({ easyMode: profile.easyMode });
  return row?.easyMode ?? null;
}

/** «Оголошення від адміністраторів» (59) з профілю; немає профілю — увімкнено. */
export async function profileAdminPush(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ adminPush: profile.adminPush }).from(profile).where(eq(profile.userId, userId));
  return row?.adminPush ?? true;
}

/** Зберігає «Оголошення від адміністраторів» (59), як saveEasy; null — профілю не створити (немає користувача). */
export async function saveAdminPush(db: Db, userId: string, on: boolean): Promise<boolean | null> {
  if ((await ensureProfile(db, userId)) === null) return null;
  const [row] = await db.update(profile).set({ adminPush: on }).where(eq(profile.userId, userId)).returning({ adminPush: profile.adminPush });
  return row?.adminPush ?? null;
}

/** Зберігає мову; профілю ще немає — його створює ensureProfile. false — профілю не створити (немає користувача). */
export async function saveLocale(db: Db, userId: string, locale: Locale): Promise<boolean> {
  if ((await ensureProfile(db, userId)) === null) return false;
  await db.update(profile).set({ locale }).where(eq(profile.userId, userId));
  return true;
}
