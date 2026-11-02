import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bannedRedirect } from './account-routes';
import { buildApp } from './app';
import { createAuth } from './auth';
import { banNotice, banUser, unbanUser } from './bans';
import { adminEmails } from './config';
import type { Db } from './db/client';
import { user, userBan } from './db/schema';
import { TEST_AUTH, cookieOf, signUp } from './testing/accounts';
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

const me = (cookie: string, app = ctx.app) => app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
const signIn = (email: string, password: string) =>
  ctx.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email, password } });

async function account(name: string, app = ctx.app) {
  const made = await signUp(app, name);
  const id = (await me(made.cookie, app)).json().id as string;
  return { ...made, id };
}

describe('a ban closes every way in', () => {
  it('drops the old session, refuses password sign-in with ACCOUNT_BANNED and lets back in after unban', async () => {
    const a = await account('Адмін');
    const o = await account('Оксана');

    const before = await me(o.cookie);
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({ id: o.id, name: 'Оксана', email: o.email, admin: false });

    await banUser(db, { adminId: a.id, targetId: o.id, reason: null, now: new Date() });
    const after = await me(o.cookie);
    expect(after.statusCode).toBe(401);
    expect(after.json()).toEqual({ error: 'unauthorized' });

    const refused = await signIn(o.email, o.password);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('ACCOUNT_BANNED');
    expect(cookieOf(refused)).toBe('');

    await unbanUser(db, { adminId: a.id, targetId: o.id, now: new Date() });
    const back = await signIn(o.email, o.password);
    expect(back.statusCode).toBe(200);
    expect((await me(cookieOf(back))).statusCode).toBe(200);
  });

  it('rejects a session that outlived the ban (row inserted directly, session left in place)', async () => {
    const p = await account('Петро');
    await db.insert(userBan).values({ userId: p.id, reason: null, bannedBy: null, bannedAt: new Date() });
    expect((await me(p.cookie)).statusCode).toBe(401);
    const quizzes = await ctx.app.inject({ method: 'GET', url: '/api/quizzes', headers: { cookie: p.cookie } });
    expect(quizzes.statusCode).toBe(401);
  });

  it('bannedRedirect rewrites only redirects of a banned sign-in', () => {
    expect(bannedRedirect(302, true)).toBe('/login?error=account_banned');
    expect(bannedRedirect(302, false)).toBeNull();
    expect(bannedRedirect(200, true)).toBeNull();
    expect(bannedRedirect(403, true)).toBeNull();
  });

  it('the session hook raises the ban notice for a banned sign-in only', async () => {
    // Проксі обгортає auth.handler власним banNotice.run, тож зовнішній прапорець через inject не дійшов би:
    // хук перевіряється на окремому екземплярі Better Auth над тією самою базою.
    const auth = createAuth(db, TEST_AUTH);
    const a = await account('Адмін');
    const b = await account('Богдан');
    const c = await account('Христина');
    await banUser(db, { adminId: a.id, targetId: b.id, reason: 'спам', now: new Date() });

    const request = (email: string, password: string) =>
      new Request(new URL('/api/auth/sign-in/email', TEST_AUTH.baseURL), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

    const banned = { banned: false };
    const refused = await banNotice.run(banned, () => auth.handler(request(b.email, b.password)));
    expect(refused.status).toBe(403);
    expect(banned.banned).toBe(true);

    const fine = { banned: false };
    const ok = await banNotice.run(fine, () => auth.handler(request(c.email, c.password)));
    expect(ok.status).toBe(200);
    expect(fine.banned).toBe(false);
  });
});

describe('/api/me.admin', () => {
  it('is true only for a verified address from ADMIN_EMAILS, whatever its case and spaces', async () => {
    const plain = await account('Без адмінів');
    const email = `admin${Date.now()}@example.com`;
    const withAdmins = await buildApp({
      db,
      auth: TEST_AUTH,
      adminEmails: adminEmails({ ADMIN_EMAILS: ` ${email.toUpperCase()} ` }),
    });
    try {
      const signed = await withAdmins.app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: { name: 'Адмінка', email, password: 'correct horse battery' },
      });
      expect(signed.statusCode).toBe(200);
      const cookie = cookieOf(signed);
      expect((await me(cookie, withAdmins.app)).json().admin).toBe(false);

      await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
      expect((await me(cookie, withAdmins.app)).json().admin).toBe(true);
      // Застосунок без ADMIN_EMAILS не знає адмінів.
      expect((await me(cookie)).json().admin).toBe(false);
      expect((await me(plain.cookie, withAdmins.app)).json().admin).toBe(false);
    } finally {
      await withAdmins.app.close();
    }
  });
});
