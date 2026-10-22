import { normalizeText } from '@quiz/engine';
import { LIMITS, nicknameSchema, type ProfileCard, type ProfileUpdate } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { profile, user } from './db/schema';

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

/** Основа нікнейма за замовчуванням: ім'я акаунта, стиснуте й обрізане до межі; або DEFAULT_NICKNAME. */
function baseNickname(name: string): string {
  const squeezed = name.replace(/\s+/g, ' ').trim().slice(0, LIMITS.nicknameMax).trim();
  return nicknameSchema.safeParse(squeezed).success ? squeezed : DEFAULT_NICKNAME;
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
): Promise<{ ok: true; profile: ProfileCard } | { ok: false; error: 'nickname_taken' }> {
  await ensureProfile(db, userId);
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
