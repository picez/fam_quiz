import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { BOT_PLANS_MAX, BOT_USER_ID, type AdminBot, type AdminBotPerson, type AdminBotPlan, type AdminList, type AdminLogEntry, type BotPlanInput, type Quiz } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { banUser } from './bans';
import { ensureBotAccount } from './bot-account';
import { botPlan, groupMember, user } from './db/schema';
import { createGroup } from './group-store';
import { ensureProfile } from './profiles';
import { createQuiz } from './quizzes';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST' | 'PUT';

let db: Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let admin: Awaited<ReturnType<typeof signUp>>;
let olya: Awaited<ReturnType<typeof signUp>>;
let adminId: string;
let olyaId: string;
let olesyaId: string;
let quizId: string;
let groupId: string;
const emails = new Set<string>();

const DAY = 86_400_000;
const TITLE = 'Поліські озера 56';
const lakes = (): Quiz => ({
  ...makeRoundsQuiz([classicRound('r0', [single, { ...single, id: 'q2' }].map((q) => ({ ...q, timeLimit: 30 })))]),
  title: TITLE,
});
const inDays = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3_600_000).toISOString();
const input = (extra: Partial<BotPlanInput> = {}): BotPlanInput => ({
  quizId,
  startsAt: inDays(1),
  recipients: { kind: 'none' },
  autoStartMin: null,
  weekly: false,
  listed: true,
  ...extra,
});

const call = (method: Method, url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
const asAdmin = (method: Method, url: string, payload?: unknown) => call(method, url, admin.cookie, payload);
const idOf = async (email: string) => (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0]!.id;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
  admin = await signUp(ctx.app, 'Адмін 56');
  emails.add(admin.email.toLowerCase());
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, admin.email));
  olya = await signUp(ctx.app, 'Оля');
  const olesya = await signUp(ctx.app, 'Олеся');
  adminId = await idOf(admin.email);
  olyaId = await idOf(olya.email);
  olesyaId = await idOf(olesya.email);
  for (const id of [adminId, olyaId, olesyaId]) await ensureProfile(db, id);
  await banUser(db, { adminId, targetId: olesyaId, reason: null, now: new Date() });
  expect(await ensureBotAccount(db)).toBe(true);
  quizId = await createQuiz(db, BOT_USER_ID, lakes());
  const made = await createGroup(db, adminId, { name: 'Малинські', emoji: '🏡', description: '' }, new Date());
  if (!made.ok) throw new Error(made.error);
  groupId = made.id;
  await db.insert(groupMember).values({ groupId, userId: olyaId, role: 'member', joinedAt: new Date() });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('admin bot schedule routes (56)', () => {
  it('the admin plans a game and sees it with groups in the bot tab', async () => {
    const made = await asAdmin('POST', '/api/admin/bot/plans', input({ recipients: { kind: 'group', groupId }, autoStartMin: 10, weekly: true }));
    expect(made.statusCode).toBe(201);
    expect(made.json()).toMatchObject({ title: TITLE, status: 'scheduled', autoStartMin: 10, weekly: true, code: null });
    const listed = (await asAdmin('GET', '/api/admin/bot')).json() as AdminBot;
    expect(listed.schedule.plans[0]).toMatchObject({ title: TITLE, to: { kind: 'group', groupId, name: 'Малинські' } });
    expect(listed.schedule.groups).toContainEqual({ id: groupId, name: 'Малинські', emoji: '🏡', members: 2 });
    expect(listed.schedule.max).toBe(BOT_PLANS_MAX);
    expect(JSON.stringify(listed)).not.toContain('@');
  });

  it('errors: bad body 400, past time 400 plan_time, foreign quiz 404, full 409, locked 409', async () => {
    await db.delete(botPlan);
    const bad = await asAdmin('POST', '/api/admin/bot/plans', { quizId: 'x' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'invalid_payload' });
    const past = await asAdmin('POST', '/api/admin/bot/plans', input({ startsAt: inDays(-1) }));
    expect(past.statusCode).toBe(400);
    expect(past.json()).toEqual({ error: 'plan_time' });
    const foreign = ((await call('POST', '/api/quizzes', olya.cookie, lakes())).json() as { id: string }).id;
    expect((await asAdmin('POST', '/api/admin/bot/plans', input({ quizId: foreign }))).statusCode).toBe(404);
    expect((await asAdmin('POST', '/api/admin/bot/plans', input({ recipients: { kind: 'people', userIds: [olesyaId] } }))).statusCode).toBe(400);

    let first = '';
    for (let i = 0; i < BOT_PLANS_MAX; i++) {
      const made = await asAdmin('POST', '/api/admin/bot/plans', input({ startsAt: inDays(1, i) }));
      expect(made.statusCode).toBe(201);
      if (i === 0) first = (made.json() as AdminBotPlan).id;
    }
    const full = await asAdmin('POST', '/api/admin/bot/plans', input({ startsAt: inDays(3) }));
    expect(full.statusCode).toBe(409);
    expect(full.json()).toEqual({ error: 'plans_full' });

    await db.update(botPlan).set({ status: 'opened' }).where(eq(botPlan.id, first));
    const put = await asAdmin('PUT', `/api/admin/bot/plans/${first}`, input({ startsAt: inDays(2) }));
    expect(put.statusCode).toBe(409);
    expect(put.json()).toEqual({ error: 'plan_locked' });
    const cancel = await asAdmin('POST', `/api/admin/bot/plans/${first}/cancel`);
    expect(cancel.statusCode).toBe(409);
    expect(cancel.json()).toEqual({ error: 'plan_locked' });

    const unknown = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
    expect((await asAdmin('PUT', `/api/admin/bot/plans/${unknown}`, input())).statusCode).toBe(404);
    expect((await asAdmin('POST', `/api/admin/bot/plans/${unknown}/cancel`)).statusCode).toBe(404);
    expect((await asAdmin('PUT', '/api/admin/bot/plans/abc', input())).statusCode).toBe(404);
    expect((await asAdmin('POST', '/api/admin/bot/plans/abc/cancel')).statusCode).toBe(404);
    expect((await asAdmin('PUT', `/api/admin/bot/plans/${unknown}`, { junk: 1 })).statusCode).toBe(400);
  });

  it('change and cancel are logged', async () => {
    await db.delete(botPlan);
    const { id } = (await asAdmin('POST', '/api/admin/bot/plans', input())).json() as AdminBotPlan;
    const later = inDays(2);
    const put = await asAdmin('PUT', `/api/admin/bot/plans/${id}`, input({ startsAt: later }));
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ id, startsAt: later });
    const rows = async () => ((await asAdmin('GET', '/api/admin/log')).json() as AdminList<AdminLogEntry>).rows;
    expect((await rows())[0]).toMatchObject({ kind: 'bot_plan_update', details: { title: TITLE, when: later } });
    const cancel = await asAdmin('POST', `/api/admin/bot/plans/${id}/cancel`);
    expect(cancel.statusCode).toBe(204);
    expect((await rows())[0]).toMatchObject({ kind: 'bot_plan_cancel', details: { title: TITLE, when: later } });
    const listed = (await asAdmin('GET', '/api/admin/bot')).json() as AdminBot;
    expect(listed.schedule.plans.find((p) => p.id === id)?.status).toBe('cancelled');
  });

  it('people search finds the admin too, never the bot or the banned', async () => {
    const find = async (q: string) => {
      const res = await asAdmin('GET', `/api/admin/bot/people?q=${encodeURIComponent(q)}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('email');
      expect(res.body).not.toContain('@');
      return res.json() as AdminBotPerson[];
    };
    expect((await find('Адм')).map((p) => p.id)).toEqual([adminId]);
    expect((await find('Кві')).map((p) => p.nickname)).not.toContain('Квіз-бот');
    expect(await find('Олес')).toEqual([]);
    expect((await find('Ол')).map((p) => p.id)).toEqual([olyaId]);
    expect(await find('А')).toEqual([]);
    expect((await asAdmin('GET', `/api/admin/bot/people?q=${'а'.repeat(41)}`)).statusCode).toBe(400);
    expect((await asAdmin('GET', '/api/admin/bot/people')).statusCode).toBe(400);
  });

  it('non-admins and guests get 404', async () => {
    const id = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
    const routes: [Method, string, unknown][] = [
      ['POST', '/api/admin/bot/plans', input()],
      ['PUT', `/api/admin/bot/plans/${id}`, input()],
      ['POST', `/api/admin/bot/plans/${id}/cancel`, undefined],
      ['GET', '/api/admin/bot/people?q=ol', undefined],
    ];
    const unknown = await call('GET', '/api/nope');
    for (const [method, url, payload] of routes) {
      for (const cookie of [undefined, olya.cookie]) {
        const res = await call(method, url, cookie, payload);
        expect(res.statusCode, `${method} ${url}`).toBe(404);
        expect(res.body).toBe(unknown.body);
      }
    }
  });
});
