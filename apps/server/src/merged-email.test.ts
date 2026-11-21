import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { Db } from './db/client';
import { account, mergedEmail, user } from './db/schema';
import { isMergedEmail, loginBodyFor, loginEmailFor, rememberMergedEmail } from './merged-email';
import { TEST_AUTH, cookieOf } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let db: Db;
let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

const PASSWORD = 'correct horse battery';
const OTHER_PASSWORD = 'another long password';
let counter = 0;
const unique = (name: string) => `${name}${++counter}-${Date.now()}@example.com`;

const me = (cookie: string) => ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
const signIn = (email: string, password: string) =>
  ctx.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email, password } });
const signUpAs = (name: string, email: string, password = PASSWORD) =>
  ctx.app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { name, email, password } });

async function person(name: string, email: string, password = PASSWORD) {
  const made = await signUpAs(name, email, password);
  if (made.statusCode !== 200) throw new Error(`sign-up failed: ${made.statusCode} ${made.body}`);
  const id = (await me(cookieOf(made))).json().id as string;
  return { id, email, password };
}

const remember = (email: string, userId: string) => db.transaction((tx) => rememberMergedEmail(tx, { email, userId, now: new Date() }));

/** Те, що зробить об'єднання (задача 5) зі способами входу: пароль S стає паролем P, адреса S — псевдонімом P, рядок S зникає. */
async function mergeLogins(primary: { id: string }, secondary: { id: string; email: string }) {
  await db.delete(account).where(and(eq(account.userId, primary.id), eq(account.providerId, 'credential')));
  await db.update(account).set({ userId: primary.id, accountId: primary.id }).where(and(eq(account.userId, secondary.id), eq(account.providerId, 'credential')));
  await remember(secondary.email, primary.id);
  await db.delete(user).where(eq(user.id, secondary.id));
}

describe('merged_email', () => {
  it('signing in with a merged address and its password opens the primary account', async () => {
    const olya = await person('Оля', unique('olya'));
    const olga = await person('Ольга', unique('olga'), OTHER_PASSWORD);
    await mergeLogins(olya, olga);

    const signed = await signIn(`  ${olga.email.toUpperCase()} `, OTHER_PASSWORD);
    expect(signed.statusCode).toBe(200);
    const mine = await me(cookieOf(signed));
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toMatchObject({ id: olya.id, email: olya.email });

    // Чужий пароль зі старою адресою не відкриває нічого.
    const wrong = await signIn(olga.email, 'not the password at all');
    expect(wrong.statusCode).toBe(401);
    expect(cookieOf(wrong)).toBe('');
    // Старий пароль Олі, що зник при об'єднанні, більше не підходить.
    expect((await signIn(olya.email, PASSWORD)).statusCode).toBe(401);
  });

  it('an address that belongs to a live user is never rewritten', async () => {
    const owner = await person('Петро', unique('petro'));
    const other = await person('Іван', unique('ivan'), OTHER_PASSWORD);
    await remember(other.email, owner.id);

    expect(await loginEmailFor(db, other.email)).toBeNull();
    expect(await loginEmailFor(db, ` ${other.email.toUpperCase()}`)).toBeNull();
    // Вхід цією адресою веде в її власника, а не в акаунт псевдоніма.
    const signed = await signIn(other.email, OTHER_PASSWORD);
    expect(signed.statusCode).toBe(200);
    expect((await me(cookieOf(signed))).json().id).toBe(other.id);
    expect((await signIn(other.email, PASSWORD)).statusCode).toBe(401);
  });

  it('finds the primary address case-insensitively and with spaces trimmed; unknown addresses stay as they are', async () => {
    const primary = await person('Марта', unique('marta'));
    const gone = unique('gone');
    await remember(gone.toUpperCase(), primary.id);

    const [row] = await db.select().from(mergedEmail).where(eq(mergedEmail.email, gone));
    expect(row?.userId).toBe(primary.id);
    expect(await loginEmailFor(db, gone)).toBe(primary.email);
    expect(await loginEmailFor(db, `  ${gone.toUpperCase()}  `)).toBe(primary.email);
    expect(await loginEmailFor(db, unique('nobody'))).toBeNull();
    expect(await loginEmailFor(db, '   ')).toBeNull();
    expect(await isMergedEmail(db, ` ${gone.toUpperCase()} `)).toBe(true);
    expect(await isMergedEmail(db, unique('nobody'))).toBe(false);

    // Повторне об'єднання тієї самої адреси переносить псевдонім на новий головний.
    const next = await person('Ганна', unique('hanna'));
    await remember(gone, next.id);
    expect(await loginEmailFor(db, gone)).toBe(next.email);
    expect(await db.select().from(mergedEmail).where(eq(mergedEmail.email, gone))).toHaveLength(1);
  });

  it('rewrites only the email of a sign-in or password-reset body, and nothing on sign-up or other paths', async () => {
    const primary = await person('Софія', unique('sofia'));
    const gone = unique('old');
    await remember(gone, primary.id);
    const body = { email: ` ${gone.toUpperCase()}`, password: 'p4ssword-typed', rememberMe: true, callbackURL: '/x' };

    expect(await loginBodyFor(db, 'POST', '/api/auth/sign-in/email', body)).toEqual({ ...body, email: primary.email });
    expect(await loginBodyFor(db, 'POST', '/api/auth/request-password-reset', { email: gone, redirectTo: '/reset' })).toEqual({ email: primary.email, redirectTo: '/reset' });
    expect(await loginBodyFor(db, 'POST', '/api/auth/forget-password', { email: gone })).toEqual({ email: primary.email });
    // Тіло не змінюється на місці.
    expect(body.email).toBe(` ${gone.toUpperCase()}`);

    for (const path of ['/api/auth/sign-up/email', '/api/auth/sign-in/social', '/api/auth/change-email', '/api/auth/update-user', '/api/auth/sign-in/email/x', '/api/auth/x/sign-in/email']) {
      expect(await loginBodyFor(db, 'POST', path, body), path).toBe(body);
    }
    expect(await loginBodyFor(db, 'GET', '/api/auth/sign-in/email', body)).toBe(body);
    for (const odd of [undefined, null, 'email', [gone], { email: 42 }, { name: gone }]) {
      expect(await loginBodyFor(db, 'POST', '/api/auth/sign-in/email', odd)).toBe(odd);
    }
    // Адреса без псевдоніма лишається такою, як її ввели.
    const plain = { email: ` ${unique('plain').toUpperCase()}`, password: 'x' };
    expect(await loginBodyFor(db, 'POST', '/api/auth/sign-in/email', plain)).toBe(plain);
  });

  it('signing up with a merged address is refused with EMAIL_MERGED', async () => {
    const primary = await person('Леся', unique('lesia'));
    const gone = unique('lesia-old');
    await remember(gone, primary.id);
    const users = async () => Number((await db.select({ n: sql<number>`count(*)::int` }).from(user))[0]?.n);
    const before = await users();

    for (const email of [gone, gone.toUpperCase()]) {
      const refused = await signUpAs('Нова Леся', email);
      expect(refused.statusCode, email).toBe(400);
      expect(refused.json().code).toBe('EMAIL_MERGED');
      expect(cookieOf(refused)).toBe('');
    }
    expect(await users()).toBe(before);
    expect(await db.select().from(user).where(eq(user.email, gone))).toHaveLength(0);
    expect(await db.select().from(user).where(eq(user.name, 'Нова Леся'))).toHaveLength(0);
  });

  it('deleting the primary account frees its aliases', async () => {
    const primary = await person('Богдан', unique('bohdan'));
    const gone = unique('bohdan-old');
    await remember(gone, primary.id);
    await db.delete(user).where(eq(user.id, primary.id));
    expect(await isMergedEmail(db, gone)).toBe(false);
    expect((await signUpAs('Богдан', gone)).statusCode).toBe(200);
  });
});
