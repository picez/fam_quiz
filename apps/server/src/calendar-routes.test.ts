import { makeQuiz, single } from '@quiz/engine/testing';
import { CALENDAR_ACTIVE_CAP, type CalendarEvent, type CalendarPage } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { calendarEvent, follow, game, quiz } from './db/schema';
import { LOBBY_TTL_MS } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Db = Awaited<ReturnType<typeof createTestDb>>;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

interface People {
  h: { cookie: string; id: string };
  o: { cookie: string; id: string };
  p: { cookie: string; id: string };
  vira: { cookie: string; id: string };
  quizId: string;
}

function driver(ctx: Ctx) {
  const call = (method: Method, url: string, cookie?: string, payload?: unknown) =>
    ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
  const person = async (name: string) => {
    const { cookie } = await signUp(ctx.app, name);
    const id = ((await call('GET', '/api/me', cookie)).json() as { id: string }).id;
    await call('GET', '/api/me/profile', cookie);
    return { cookie, id };
  };
  return { call, person };
}

async function setup(ctx: Ctx, db: Db): Promise<People> {
  const { call, person } = driver(ctx);
  const [h, o, p, vira] = [await person('Ведучий'), await person('Оля'), await person('Петро'), await person('Віра')];
  await db.insert(follow).values([
    { followerId: h.id, followeeId: o.id },
    { followerId: h.id, followeeId: p.id },
  ]);
  const saved = await call('POST', '/api/quizzes', h.cookie, { ...makeQuiz([single]), title: 'Писанки' });
  return { h, o, p, vira, quizId: (saved.json() as { id: string }).id };
}

const input = (quizId: string, extra: object = {}) => ({ title: 'Вечір', startsAt: inDays(2), quizId, ...extra });

describe('calendar routes', () => {
  const notify = { opened: vi.fn(), cancelled: vi.fn() };
  let ctx: Ctx;
  let db: Db;
  let who: People;
  let call: ReturnType<typeof driver>['call'];
  let eventId: string;

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await buildApp({ db, auth: TEST_AUTH, calendarNotify: notify });
    call = driver(ctx).call;
    who = await setup(ctx, db);
  });

  afterAll(async () => {
    await ctx.shutdown();
  });

  const events = async (cookie: string) => ((await call('GET', '/api/me/calendar', cookie)).json() as CalendarPage).events;
  const find = async (cookie: string, id: string) => (await events(cookie)).find((e) => e.id === id) as CalendarEvent;
  const badge = async (cookie: string) => (await call('GET', '/api/me/feed/badge', cookie)).json();

  it('answer 401 without an account', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const body = { title: 'x', startsAt: inDays(2), quizId: id };
    const urls: [Method, string, unknown][] = [
      ['GET', '/api/me/calendar', undefined],
      ['POST', '/api/me/calendar/seen', { upTo: new Date().toISOString() }],
      ['POST', '/api/calendar', body],
      ['PUT', `/api/calendar/${id}`, body],
      ['DELETE', `/api/calendar/${id}`, undefined],
      ['POST', `/api/calendar/${id}/request`, undefined],
      ['DELETE', `/api/calendar/${id}/request`, undefined],
      ['POST', `/api/calendar/${id}/requests/${id}`, { decision: 'approved' }],
      ['POST', `/api/calendar/${id}/open`, undefined],
    ];
    for (const [method, url, payload] of urls) expect((await call(method, url, undefined, payload)).statusCode, `${method} ${url}`).toBe(401);
  });

  it('plans an event and rejects bad input', async () => {
    const made = await call('POST', '/api/calendar', who.h.cookie, input(who.quizId));
    expect(made.statusCode).toBe(201);
    const event = made.json() as CalendarEvent;
    expect(event.state).toBe('planned');
    eventId = event.id;
    const past = await call('POST', '/api/calendar', who.h.cookie, input(who.quizId, { startsAt: inDays(-1) }));
    expect(past.statusCode).toBe(400);
    expect(past.json()).toEqual({ error: 'calendar_time' });
    expect((await call('POST', '/api/calendar', who.o.cookie, input(who.quizId))).json()).toEqual({ error: 'quiz_not_found' });
    const extra = await call('POST', '/api/calendar', who.h.cookie, input(who.quizId, { extra: 1 }));
    expect(extra.statusCode).toBe(400);
    expect(extra.json()).toEqual({ error: 'invalid_payload' });
  });

  it('answers 409 calendar_limit past twenty planned games', async () => {
    const { person } = driver(ctx);
    const busy = await person('Зайнятий');
    const own = ((await call('POST', '/api/quizzes', busy.cookie, { ...makeQuiz([single]), title: 'Багато' })).json() as { id: string }).id;
    const startsAt = new Date(Date.now() + 3 * DAY);
    await db.insert(calendarEvent).values(
      Array.from({ length: CALENDAR_ACTIVE_CAP }, () => ({ hostId: busy.id, title: 'Гра', quizId: own, startsAt, createdAt: new Date() })),
    );
    const refused = await call('POST', '/api/calendar', busy.cookie, input(own));
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'calendar_limit' });
  });

  it('lists the event for a friend and not for a stranger', async () => {
    const page = (await call('GET', '/api/me/calendar', who.o.cookie)).json() as CalendarPage;
    expect(page.events).toHaveLength(1);
    expect(page.asOf).toEqual(expect.any(String));
    expect(await events(who.vira.cookie)).toEqual([]);
  });

  it('runs a request through the badge counts', async () => {
    expect((await call('POST', `/api/calendar/${eventId}/request`, who.o.cookie)).json()).toEqual({ status: 'pending' });
    expect(await badge(who.h.cookie)).toEqual({ events: 0, requests: 1, decisions: 0 });
    expect((await call('POST', `/api/calendar/${eventId}/requests/${who.o.id}`, who.h.cookie, { decision: 'approved' })).statusCode).toBe(204);
    expect(await badge(who.o.cookie)).toMatchObject({ requests: 0, decisions: 1 });
    const { asOf } = (await call('GET', '/api/me/calendar', who.o.cookie)).json() as CalendarPage;
    expect((await call('POST', '/api/me/calendar/seen', who.o.cookie, { upTo: asOf })).statusCode).toBe(204);
    expect(await badge(who.o.cookie)).toMatchObject({ requests: 0, decisions: 0 });
    expect((await call('POST', '/api/me/calendar/seen', who.o.cookie, { upTo: 'xx' })).statusCode).toBe(400);
  });

  it('hides the event from a stranger and from a non-host decider', async () => {
    expect((await call('POST', `/api/calendar/${eventId}/request`, who.vira.cookie)).statusCode).toBe(404);
    expect((await call('POST', `/api/calendar/${eventId}/requests/${who.o.id}`, who.p.cookie, { decision: 'rejected' })).statusCode).toBe(404);
    expect((await call('POST', `/api/calendar/${eventId}/requests/${who.o.id}`, who.h.cookie, { decision: 'maybe' })).statusCode).toBe(400);
  });

  it('maps request errors', async () => {
    expect((await call('POST', `/api/calendar/${eventId}/request`, who.h.cookie)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/calendar/${eventId}/request`, who.o.cookie)).statusCode).toBe(409);
    expect((await call('POST', `/api/calendar/${eventId}/request`, who.p.cookie)).json()).toEqual({ status: 'pending' });
    expect((await call('DELETE', `/api/calendar/${eventId}/request`, who.p.cookie)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/calendar/${eventId}/request`, who.p.cookie)).statusCode).toBe(404);
    await call('POST', `/api/calendar/${eventId}/request`, who.p.cookie);
    await call('POST', `/api/calendar/${eventId}/requests/${who.p.id}`, who.h.cookie, { decision: 'rejected' });
    expect((await call('POST', `/api/calendar/${eventId}/request`, who.p.cookie)).json()).toEqual({ error: 'request_rejected' });
  });

  it('opens one room for two parallel taps', async () => {
    const before = ctx.manager.size;
    const [a, b] = await Promise.all([
      call('POST', `/api/calendar/${eventId}/open`, who.h.cookie),
      call('POST', `/api/calendar/${eventId}/open`, who.h.cookie),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    const [first, second] = [a.json(), b.json()] as { code: string; gameId: string; hostToken: string; stageToken: string }[];
    expect(first.code).toBe(second.code);
    expect(first.hostToken).toEqual(expect.any(String));
    expect(ctx.manager.size).toBe(before + 1);
    expect(notify.opened).toHaveBeenCalledTimes(1);
    expect(notify.opened).toHaveBeenCalledWith(eventId);
    // Третє натискання пізніше теж віддає ту саму кімнату.
    const third = await call('POST', `/api/calendar/${eventId}/open`, who.h.cookie);
    expect(third.statusCode).toBe(200);
    expect((third.json() as { code: string }).code).toBe(first.code);
    expect(notify.opened).toHaveBeenCalledTimes(1);

    // Підтверджений бачить код, відхилений (p) — ні.
    const forO = await find(who.o.cookie, eventId);
    expect(forO.state).toBe('open');
    expect(forO.joinCode).toBe(first.code);
    expect((await find(who.p.cookie, eventId)).joinCode).toBeNull();
    const late = await driver(ctx).person('Ліда');
    await db.insert(follow).values({ followerId: who.h.id, followeeId: late.id });
    expect((await call('POST', `/api/calendar/${eventId}/request`, late.cookie)).json()).toEqual({ status: 'pending' });
    const seen = await find(late.cookie, eventId);
    expect(seen.state).toBe('open');
    expect(seen.joinCode).toBeNull();
  });

  it('locks edits while open and answers 404 for a foreign open', async () => {
    expect((await call('PUT', `/api/calendar/${eventId}`, who.h.cookie, input(who.quizId))).statusCode).toBe(409);
    expect((await call('POST', `/api/calendar/${eventId}/open`, who.o.cookie)).statusCode).toBe(404);
  });

  it('refuses to open once the game is played', async () => {
    const [row] = await db.select().from(calendarEvent).where(eq(calendarEvent.id, eventId));
    // Рекордер записує рядок game зі статусом finished: тут той самий слід.
    await db.insert(game).values({
      id: row.gameId!, quizId: row.quizId, hostId: who.h.id, code: row.gameCode!, status: 'finished', title: 'Писанки', quizSnapshot: {}, startedAt: new Date(), finishedAt: new Date(),
    });
    expect((await find(who.h.cookie, eventId)).state).toBe('played');
    const again = await call('POST', `/api/calendar/${eventId}/open`, who.h.cookie);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'event_locked' });
    expect((await call('DELETE', `/api/calendar/${eventId}`, who.h.cookie)).statusCode).toBe(409);
  });

  it('cancels once and tells once', async () => {
    const id = ((await call('POST', '/api/calendar', who.h.cookie, input(who.quizId))).json() as CalendarEvent).id;
    expect((await call('PUT', `/api/calendar/${id}`, who.h.cookie, input(who.quizId, { title: 'Інше' }))).json()).toMatchObject({ title: 'Інше' });
    expect((await call('DELETE', `/api/calendar/${id}`, who.h.cookie)).statusCode).toBe(204);
    expect(notify.cancelled).toHaveBeenCalledTimes(1);
    expect((await call('DELETE', `/api/calendar/${id}`, who.h.cookie)).statusCode).toBe(204);
    expect(notify.cancelled).toHaveBeenCalledTimes(1);
    expect((await call('DELETE', `/api/calendar/${id}`, who.o.cookie)).statusCode).toBe(404);
  });

  it('answers quiz_not_found when the quiz was deleted', async () => {
    const q = ((await call('POST', '/api/quizzes', who.h.cookie, { ...makeQuiz([single]), title: 'Зникне' })).json() as { id: string }).id;
    const id = ((await call('POST', '/api/calendar', who.h.cookie, input(q))).json() as CalendarEvent).id;
    await db.delete(quiz).where(eq(quiz.id, q));
    const opened = await call('POST', `/api/calendar/${id}/open`, who.h.cookie);
    expect(opened.statusCode).toBe(404);
    expect(opened.json()).toEqual({ error: 'quiz_not_found' });
  });

  it('answers 503 when the server is full', async () => {
    const id = ((await call('POST', '/api/calendar', who.h.cookie, input(who.quizId))).json() as CalendarEvent).id;
    const full = await buildApp({ db, auth: TEST_AUTH, maxRooms: 0 });
    try {
      const refused = await full.app.inject({ method: 'POST', url: `/api/calendar/${id}/open`, headers: { cookie: who.h.cookie } });
      expect(refused.statusCode).toBe(503);
      expect(refused.json()).toEqual({ error: 'server_busy' });
    } finally {
      await full.shutdown();
    }
  });
});

describe('calendar: a room that vanished before play', () => {
  it('turns the event planned again and reopens with a new room', async () => {
    const db = await createTestDb();
    const scheduler = new FakeScheduler();
    const ctx = await buildApp({ db, auth: TEST_AUTH, scheduler });
    try {
      const { call } = driver(ctx);
      const who = await setup(ctx, db);
      const id = ((await call('POST', '/api/calendar', who.h.cookie, input(who.quizId))).json() as CalendarEvent).id;
      const first = await call('POST', `/api/calendar/${id}/open`, who.h.cookie);
      expect(first.statusCode).toBe(201);
      const one = first.json() as { gameId: string; code: string };
      scheduler.advance(LOBBY_TTL_MS + 1);
      expect(ctx.manager.get(one.code)).toBeUndefined();
      const page = (await call('GET', '/api/me/calendar', who.o.cookie)).json() as CalendarPage;
      expect(page.events[0].state).toBe('planned');
      expect(page.events[0].joinCode).toBeNull();
      const second = await call('POST', `/api/calendar/${id}/open`, who.h.cookie);
      expect(second.statusCode).toBe(201);
      const two = second.json() as { gameId: string; code: string };
      expect(two.gameId).not.toBe(one.gameId);
      const [row] = await db.select().from(calendarEvent).where(eq(calendarEvent.id, id));
      expect(row.gameId).toBe(two.gameId);
      expect(row.gameCode).toBe(two.code);
    } finally {
      await ctx.shutdown();
    }
  });
});
