import { BOT_EMAIL, BOT_USER_ID } from '@quiz/shared';
import { hashPassword, makeSignature } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { ensureBotAccount } from './bot-account';
import { account, profile, session, user } from './db/schema';
import { TEST_AUTH } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof createTestDb>>;

const PASSWORD = 'any-password-54';
const botSessions = async () => (await db.select({ id: session.id }).from(session).where(eq(session.userId, BOT_USER_ID))).length;
const setCookies = (headers: Record<string, unknown>): string[] => {
  const raw = headers['set-cookie'];
  return Array.isArray(raw) ? raw.map(String) : raw === undefined ? [] : [String(raw)];
};
const sessionCookie = (headers: Record<string, unknown>) =>
  setCookies(headers).some((c) => /session_token=[^;]+/.test(c) && !/session_token=;/.test(c));
const signIn = () => ctx.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: BOT_EMAIL, password: PASSWORD } });

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.shutdown();
});

describe('the bot account (54)', () => {
  it('a taken nickname gives the bot a numbered one', async () => {
    // Окрема база: у спільній бот створюється в наступному тесті без зайнятого ніка.
    const own = await createTestDb();
    const app = await buildApp({ db: own, auth: TEST_AUTH });
    try {
      const olya = await app.app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: { name: 'Квіз-бот', email: 'olya54@example.com', password: 'correct horse battery' },
      });
      expect(olya.statusCode).toBe(200);
      const [olyaRow] = await own.select({ id: user.id }).from(user).where(eq(user.email, 'olya54@example.com'));
      await app.app.inject({ method: 'GET', url: '/api/me/profile', headers: { cookie: setCookies(olya.headers).map((c) => c.split(';')[0]).join('; ') } });
      const [olyaProfile] = await own.select({ nickname: profile.nickname }).from(profile).where(eq(profile.userId, olyaRow!.id));
      expect(olyaProfile?.nickname).toBe('Квіз-бот');

      await ensureBotAccount(own);
      const [bot] = await own.select({ nickname: profile.nickname }).from(profile).where(eq(profile.userId, BOT_USER_ID));
      expect(bot?.nickname).toBe('Квіз-бот 2');
    } finally {
      await app.shutdown();
    }
  });

  it('ensureBotAccount makes one user and profile and no credentials, twice is the same', async () => {
    await ensureBotAccount(db);
    await ensureBotAccount(db);
    const users = await db.select().from(user).where(eq(user.id, BOT_USER_ID));
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ id: 'quiz-bot', email: BOT_EMAIL, emailVerified: false });
    const profiles = await db.select().from(profile).where(eq(profile.userId, BOT_USER_ID));
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.nickname).toBe('Квіз-бот');
    expect(await db.select().from(account).where(eq(account.userId, BOT_USER_ID))).toHaveLength(0);
  });

  it('nobody can sign in or sign up as the bot', async () => {
    await ensureBotAccount(db);
    const signedIn = await signIn();
    expect(signedIn.statusCode).not.toBe(200);
    expect(sessionCookie(signedIn.headers)).toBe(false);

    const signedUp = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Не бот', email: BOT_EMAIL, password: PASSWORD },
    });
    expect(signedUp.statusCode).not.toBe(200);
    expect(sessionCookie(signedUp.headers)).toBe(false);
    expect(await botSessions()).toBe(0);
    expect(await db.select().from(account).where(eq(account.userId, BOT_USER_ID))).toHaveLength(0);
  });

  it('the session hook refuses the bot even with credentials', async () => {
    await ensureBotAccount(db);
    await db.insert(account).values({
      id: 'bot-credential-54',
      accountId: BOT_USER_ID,
      providerId: 'credential',
      userId: BOT_USER_ID,
      password: await hashPassword(PASSWORD),
    });
    try {
      const response = await signIn();
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'BOT_ACCOUNT' });
      expect(sessionCookie(response.headers)).toBe(false);
      expect(await botSessions()).toBe(0);
    } finally {
      await db.delete(account).where(and(eq(account.userId, BOT_USER_ID), eq(account.id, 'bot-credential-54')));
    }
  });

  it('currentUser gives nobody for a session of the bot', async () => {
    await ensureBotAccount(db);
    // Сесія, що якось з'явилася в базі в обхід хука: /api/me однаково не бачить користувача.
    const forged = async (userId: string) => {
      const token = `forged-${userId}-54`;
      await db.insert(session).values({ id: token, token, userId, expiresAt: new Date(Date.now() + 86_400_000) });
      const signed = `${token}.${await makeSignature(token, TEST_AUTH.secret)}`;
      return ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: `better-auth.session_token=${encodeURIComponent(signed)}` } });
    };
    await db.insert(user).values({ id: 'plain-54', name: 'Звичайна', email: 'plain54@example.com' });
    // Контроль: так підроблена сесія звичайної людини працює — отже, 401 нижче дає саме перевірка бота.
    expect((await forged('plain-54')).statusCode).toBe(200);
    expect((await forged(BOT_USER_ID)).statusCode).toBe(401);
    await db.delete(session).where(eq(session.userId, BOT_USER_ID));
  });
});
