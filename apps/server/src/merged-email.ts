import { eq, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { mergedEmail, user } from './db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Адреса так, як її зберігає merged_email: без пробілів по краях, у нижньому регістрі. */
const emailKey = (email: string) => email.trim().toLowerCase();

/** 66: чи ця адреса — псевдонім акаунта, що зник при об'єднанні (реєстрація на неї заборонена). */
export async function isMergedEmail(db: Db, email: string): Promise<boolean> {
  const key = emailKey(email);
  if (key === '') return false;
  const rows = await db.select({ email: mergedEmail.email }).from(mergedEmail).where(eq(mergedEmail.email, key)).limit(1);
  return rows.length > 0;
}

/**
 * 66: адреса головного акаунта, якщо введена адреса — псевдонім і жоден наявний акаунт її не має; інакше null.
 * Наявний акаунт з цією адресою завжди важливіший за псевдонім: вхід нею веде лише в нього.
 */
export async function loginEmailFor(db: Db, email: string): Promise<string | null> {
  const key = emailKey(email);
  if (key === '') return null;
  const [alias] = await db
    .select({ email: user.email })
    .from(mergedEmail)
    .innerJoin(user, eq(user.id, mergedEmail.userId))
    .where(eq(mergedEmail.email, key))
    .limit(1);
  if (alias === undefined) return null;
  const live = await db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${key}`).limit(1);
  return live.length > 0 ? null : alias.email;
}

/** 66: запам'ятати адресу другорядного акаунта як псевдонім головного (повторне об'єднання переносить псевдонім). */
export async function rememberMergedEmail(tx: Tx, input: { email: string; userId: string; now: Date }): Promise<void> {
  await tx
    .insert(mergedEmail)
    .values({ email: emailKey(input.email), userId: input.userId, mergedAt: input.now })
    .onConflictDoUpdate({ target: mergedEmail.email, set: { userId: input.userId, mergedAt: input.now } });
}

/**
 * Шляхи Better Auth, де людина вводить адресу свого акаунта: вхід паролем і відновлення пароля (лист піде на адресу
 * головного акаунта — його власникові). Реєстрації тут немає й не буде: на псевдонім її відхиляє хук EMAIL_MERGED.
 */
const LOGIN_EMAIL_PATHS: ReadonlySet<string> = new Set(['/api/auth/sign-in/email', '/api/auth/request-password-reset', '/api/auth/forget-password']);

/**
 * 66: тіло запиту до /api/auth/*, у якому адреса-псевдонім замінена адресою головного акаунта. Змінюється лише поле
 * email і лише для POST на LOGIN_EMAIL_PATHS; в усіх інших випадках повертається те саме тіло без змін.
 */
export async function loginBodyFor(db: Db, method: string, pathname: string, body: unknown): Promise<unknown> {
  if (method !== 'POST' || !LOGIN_EMAIL_PATHS.has(pathname)) return body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  const { email } = body as { email?: unknown };
  if (typeof email !== 'string') return body;
  const target = await loginEmailFor(db, email);
  return target === null ? body : { ...body, email: target };
}
