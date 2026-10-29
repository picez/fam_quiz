import { normalizeText } from '@quiz/engine';
import {
  LIMITS,
  isWin,
  nicknameSchema,
  type Achievement,
  type OwnProfile,
  type ProfileCard,
  type ProfileStats,
  type PublicProfile,
  type ProfileUpdate,
  type ProfileWin,
} from '@quiz/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import type { CurrentUser } from './account-routes';
import { achievementList, careerInputs, syncAchievements } from './achievement-store';
import type { Db } from './db/client';
import { follow, profile, user } from './db/schema';
import { listQuizzes } from './quizzes';

export const DEFAULT_NICKNAME = 'Гравець';

/** Ключ унікальності: без різниці регістру, пробілів і апострофів. */
export const nicknameKey = (nickname: string) => normalizeText(nickname);

const UNIQUE_VIOLATION = '23505';

/** Скільки разів пробувати наступний номер, перш ніж здатися (захист від нескінченного циклу). */
const MAX_ATTEMPTS = 1000;

const card = (row: { userId: string; nickname: string; avatar: string | null }): ProfileCard => ({
  id: row.userId,
  nickname: row.nickname,
  avatar: row.avatar,
});

/**
 * Основа нікнейма за замовчуванням: перше слово імені акаунта (обрізане до межі). Якщо воно не проходить
 * перевірку нікнейма, береться стиснене повне ім'я, а якщо й воно не проходить, то DEFAULT_NICKNAME.
 */
function baseNickname(name: string): string {
  const squeezed = name.replace(/\s+/g, ' ').trim();
  const candidates = [
    squeezed.split(' ')[0]!.slice(0, LIMITS.nicknameMax),
    squeezed.slice(0, LIMITS.nicknameMax).trim(),
  ];
  return candidates.find((c) => nicknameSchema.safeParse(c).success) ?? DEFAULT_NICKNAME;
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

function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object'; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

export const WINS_SHOWN = 20;

/**
 * Статистика, ачівки (усі з позначками й датами) й останні перемоги (не більше WINS_SHOWN, найновіші першими).
 * own — профіль власника; чужий профіль не читає типів запитань (поступу там немає).
 */
export async function profileFacts(
  db: Db,
  userId: string,
  own = true,
): Promise<{ stats: ProfileStats; achievements: Achievement[]; wins: ProfileWin[] }> {
  const prepared = await careerInputs(db, userId);
  const { earned } = await syncAchievements(db, userId, null, { prepared, types: own });
  const wins = prepared.games
    .map((g) => g.played)
    .filter(isWin)
    .slice(0, WINS_SHOWN)
    // isWin гарантує rank === 1.
    .map((g) => ({ gameId: g.gameId, title: g.title, startedAt: g.startedAt, rank: g.rank ?? 1 }));
  return { stats: prepared.stats, achievements: achievementList(earned), wins };
}

/** Друзі (на кого підписаний), за нікнеймом. */
export async function friendsOf(db: Db, userId: string): Promise<ProfileCard[]> {
  const rows = await db
    .select({ id: follow.followeeId, nickname: profile.nickname, avatar: profile.avatar })
    .from(follow)
    .innerJoin(profile, eq(profile.userId, follow.followeeId))
    .where(eq(follow.followerId, userId))
    .orderBy(asc(profile.nickname));
  // Друг, якому профіль ще не створювали, теж має бути в списку.
  const withProfile = new Set(rows.map((row) => row.id));
  const all = await db.select({ id: follow.followeeId }).from(follow).where(eq(follow.followerId, userId));
  for (const { id } of all) {
    if (withProfile.has(id)) continue;
    const created = await ensureProfile(db, id);
    if (created) rows.push(created);
  }
  return rows.sort((a, b) => a.nickname.localeCompare(b.nickname));
}

/** Профіль за точним нікнеймом (через nickname_key); null — немає. */
export async function findByNickname(db: Db, nickname: string): Promise<ProfileCard | null> {
  const [row] = await db.select().from(profile).where(eq(profile.nicknameKey, nicknameKey(nickname)));
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

/** Повний профіль власника; лише для нього. */
export async function ownProfile(db: Db, current: CurrentUser): Promise<OwnProfile> {
  const base = await ensureProfile(db, current.id);
  if (!base) throw new Error('profile of a signed-in user must exist');
  const facts = await profileFacts(db, current.id);
  const quizzes = (await listQuizzes(db, current.id)).map(({ id, title }) => ({ id, title }));
  return {
    ...base,
    email: current.email,
    stats: facts.stats,
    achievements: facts.achievements,
    quizzes,
    wins: facts.wins,
    friends: await friendsOf(db, current.id),
  };
}

/** Публічна частина профілю; поля перелічено явно, щоб приватне не потрапило сюди випадково. null — такого користувача немає. */
export async function publicProfile(db: Db, id: string, viewerId: string | null): Promise<PublicProfile | null> {
  const base = await ensureProfile(db, id);
  if (!base) return null;
  const { stats, achievements } = await profileFacts(db, id, false);
  const following = viewerId === null || viewerId === id ? null : await isFollowing(db, viewerId, id);
  return { id: base.id, nickname: base.nickname, avatar: base.avatar, stats, achievements, following };
}
