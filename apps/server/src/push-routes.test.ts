import { makeQuiz, single } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { calendarEvent, calendarRequest, follow, pushSubscription } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST' | 'DELETE';

const ENDPOINT_O = 'https://fcm.googleapis.com/fcm/send/olya';
const sub = (endpoint: string) => ({ endpoint, expirationTime: null, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } });
const call = (ctx: Ctx, method: Method, url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

async function person(ctx: Ctx, name: string) {
  const { cookie } = await signUp(ctx.app, name);
  const id = ((await call(ctx, 'GET', '/api/me', cookie)).json() as { id: string }).id;
  await call(ctx, 'GET', '/api/me/profile', cookie);
  return { cookie, id };
}

describe('push routes without keys', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
  });
  afterAll(async () => {
    await ctx.shutdown();
  });

  it('is off: null key, 404 push_disabled, server alive', async () => {
    expect(ctx.push).toBeNull();
    expect((await call(ctx, 'GET', '/api/push/key')).json()).toEqual({ publicKey: null });
    const o = await person(ctx, 'Оля');
    const res = await call(ctx, 'POST', '/api/me/push', o.cookie, sub(ENDPOINT_O));
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'push_disabled' });
    expect((await call(ctx, 'DELETE', '/api/me/push', o.cookie, { endpoint: ENDPOINT_O })).statusCode).toBe(404);
    expect((await call(ctx, 'GET', '/health')).statusCode).toBe(200);
  });
});

describe('push routes with keys', () => {
  const publicKey = webpush.generateVAPIDKeys().publicKey;
  const send = vi.fn(async () => ({ status: 201 }));
  const calendarNotify = { opened: vi.fn(), cancelled: vi.fn() };
  let ctx: Ctx;
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let h: { cookie: string; id: string };
  let o: { cookie: string; id: string };
  let p: { cookie: string; id: string };
  let quizId: string;

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await buildApp({ db, auth: TEST_AUTH, push: { publicKey, send }, calendarNotify });
    [h, o, p] = [await person(ctx, 'Ведучий'), await person(ctx, 'Оля'), await person(ctx, 'Петро')];
    await db.insert(follow).values([
      { followerId: h.id, followeeId: o.id },
      { followerId: h.id, followeeId: p.id },
    ]);
    quizId = ((await call(ctx, 'POST', '/api/quizzes', h.cookie, { ...makeQuiz([single]), title: 'Писанки' })).json() as { id: string }).id;
  });
  afterAll(async () => {
    await ctx.shutdown();
  });

  it('serves the public key without a session', async () => {
    expect((await call(ctx, 'GET', '/api/push/key')).json()).toEqual({ publicKey });
  });

  it('subscribes only with a session and a good body', async () => {
    expect((await call(ctx, 'POST', '/api/me/push', undefined, sub(ENDPOINT_O))).statusCode).toBe(401);
    const bad = await call(ctx, 'POST', '/api/me/push', o.cookie, sub('https://example.com/x'));
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'invalid_payload' });
    expect((await call(ctx, 'POST', '/api/me/push', o.cookie, sub(ENDPOINT_O))).statusCode).toBe(204);
    const rows = await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, ENDPOINT_O));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(o.id);
  });

  it('unsubscribes only the own row and always answers 204', async () => {
    expect((await call(ctx, 'DELETE', '/api/me/push', undefined, { endpoint: ENDPOINT_O })).statusCode).toBe(401);
    expect((await call(ctx, 'DELETE', '/api/me/push', p.cookie, { endpoint: ENDPOINT_O })).statusCode).toBe(204);
    expect(await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, ENDPOINT_O))).toHaveLength(1);
    expect((await call(ctx, 'DELETE', '/api/me/push', o.cookie, { endpoint: ENDPOINT_O })).statusCode).toBe(204);
    expect(await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, ENDPOINT_O))).toHaveLength(0);
  });

  it('feeds the calendar hook and the reminder service', async () => {
    await call(ctx, 'POST', '/api/me/push', o.cookie, sub(ENDPOINT_O));
    const made = await call(ctx, 'POST', '/api/calendar', h.cookie, { title: 'Вечір', startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), quizId });
    const eventId = (made.json() as { id: string }).id;
    await db.insert(calendarRequest).values({ eventId, userId: o.id, status: 'approved', requestedAt: new Date() });
    send.mockClear();
    expect((await call(ctx, 'POST', `/api/calendar/${eventId}/open`, h.cookie)).statusCode).toBeLessThan(300);
    await ctx.push!.idle();
    expect(send).toHaveBeenCalledTimes(1);
    const [target, body] = send.mock.calls[0] as unknown as [{ endpoint: string }, string];
    expect(target.endpoint).toBe(ENDPOINT_O);
    expect(JSON.parse(body)).toMatchObject({ kind: 'opened' });
    expect(calendarNotify.opened).toHaveBeenCalledWith(eventId);

    // Відкрита подія вже отримала «Гра почалась» — нагадування їй не йде; перевіряємо на ще не відкритій.
    await db.update(calendarEvent).set({ startsAt: new Date(Date.now() + 30 * 60_000) }).where(eq(calendarEvent.id, eventId));
    expect(await ctx.push!.remindDue(new Date())).toBe(0);
    const next = await call(ctx, 'POST', '/api/calendar', h.cookie, { title: 'Ще вечір', startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), quizId });
    await db.update(calendarEvent).set({ startsAt: new Date(Date.now() + 30 * 60_000) }).where(eq(calendarEvent.id, (next.json() as { id: string }).id));
    expect(await ctx.push!.remindDue(new Date())).toBe(1);
  });

  it('limits subscribing to ten a minute per person (last: it spends the budget)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) codes.push((await call(ctx, 'POST', '/api/me/push', o.cookie, sub(`${ENDPOINT_O}${i}`))).statusCode);
    expect(codes.at(-1)).toBe(429);
  });
});
