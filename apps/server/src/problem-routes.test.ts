import type { MyProblemReport, ProblemPage } from '@quiz/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { problemReport } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;

const page: ProblemPage = { path: '/stage/123456?token=abc#secret', browser: 'Mozilla/5.0 Test', screen: '360x740', lang: 'uk', theme: 'light' };
let hop = 0;
const fresh = () => `10.64.${(hop += 1)}.1`;

describe('player problem reports (64)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let ctx: Ctx;
  let olya: { cookie: string };

  const send = (payload: unknown, ip: string, cookie?: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/problem-reports', payload: payload as object, headers: { 'x-forwarded-for': ip, ...(cookie === undefined ? {} : { cookie }) } });

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await buildApp({ db, auth: TEST_AUTH, trustProxy: true });
    olya = await signUp(ctx.app, 'Оля');
  });
  afterAll(async () => {
    await ctx.shutdown();
  });

  it('a guest and an account send reports with the page snapshot', async () => {
    const guest = await send({ text: 'Кнопка не працює', page }, fresh());
    expect(guest.statusCode).toBe(201);
    const [row] = await db.select().from(problemReport).where(eq(problemReport.id, (guest.json() as { id: string }).id));
    expect(row).toMatchObject({ userId: null, fromAccount: false, status: 'open' });
    expect(row.page).toEqual({ ...page, path: '/stage/123456' });
    const mine = await send({ text: 'Не вантажиться' }, fresh(), olya.cookie);
    expect(mine.statusCode).toBe(201);
    const [own] = await db.select().from(problemReport).where(eq(problemReport.id, (mine.json() as { id: string }).id));
    expect(own).toMatchObject({ fromAccount: true, page: null });
    expect(own.userId).not.toBeNull();
    const list = await ctx.app.inject({ method: 'GET', url: '/api/me/problem-reports', headers: { cookie: olya.cookie } });
    const rows = list.json() as MyProblemReport[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: 'Не вантажиться', status: 'open', reply: null });
    expect((await ctx.app.inject({ method: 'GET', url: '/api/me/problem-reports' })).statusCode).toBe(401);
  });

  it('a guest gets 3 per hour, an account 5', async () => {
    const ip = fresh();
    for (let i = 0; i < 3; i += 1) expect((await send({ text: `гість ${i}` }, ip)).statusCode).toBe(201);
    expect((await send({ text: 'гість 4' }, ip)).statusCode).toBe(429);
    const mate = await signUp(ctx.app, 'Петро');
    for (let i = 0; i < 5; i += 1) expect((await send({ text: `акаунт ${i}` }, fresh(), mate.cookie)).statusCode).toBe(201);
    expect((await send({ text: 'акаунт 6' }, fresh(), mate.cookie)).statusCode).toBe(429);
  });

  it('all guests together stop at 50 per hour', async () => {
    const [{ n }] = await db.select({ n: count() }).from(problemReport).where(and(isNull(problemReport.userId), eq(problemReport.fromAccount, false)));
    const now = new Date();
    const more = Array.from({ length: Math.max(0, 50 - Number(n)) }, () => ({ userId: null, fromAccount: false, text: 'ще', page: null, createdAt: now }));
    if (more.length > 0) await db.insert(problemReport).values(more);
    const busy = await send({ text: 'пізно' }, fresh());
    expect(busy.statusCode).toBe(429);
    expect(busy.json()).toMatchObject({ error: 'problem_busy' });
  });

  it('bad input is 400', async () => {
    expect((await send({ text: 'я'.repeat(1001) }, fresh())).statusCode).toBe(400);
    expect((await send({ text: 'ок', page: { ...page, screen: 'big' } }, fresh())).statusCode).toBe(400);
    expect((await send({ text: '   ' }, fresh())).statusCode).toBe(400);
  });
});
