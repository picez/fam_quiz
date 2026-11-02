import { makeQuiz, single } from '@quiz/engine/testing';
import type { PushPayload } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { banUser, unbanUser } from './bans';
import { createEvent, decideRequest, noRooms, requestToJoin } from './calendar-store';
import { calendarEvent, calendarRequest, feedEvent, follow } from './db/schema';
import { createPushService, type PushSend } from './push';
import { saveSubscription } from './push-store';
import { createQuiz } from './quizzes';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof createTestDb>>;
let a: Awaited<ReturnType<typeof signUp>>;
let b: Awaited<ReturnType<typeof signUp>>;
let c: Awaited<ReturnType<typeof signUp>>;
let aId: string;
let bId: string;
let cId: string;
let bEventId: string;
let aEventId: string;
let feedId: string;
let gameId: string;
let inviteCode: string;

const B_NICK = 'Богдан Прихований';
const MIN = 60_000;
const DAY = 86_400_000;

const request = (method: 'GET' | 'POST' | 'PUT', url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
const idOf = async (cookie: string) => ((await request('GET', '/api/me', cookie)).json() as { id: string }).id;
const friendsOfA = async () => ((await request('GET', '/api/me/friends', a.cookie)).json() as { id: string }[]).map((f) => f.id);
const feedOfA = async () => ((await request('GET', '/api/me/feed', a.cookie)).json() as { events: { id: string; who: { id: string } }[] }).events;
type CalendarItem = { id: string; host: { id: string }; requests: { user: { id: string } }[] | null };
const calendarOfA = async () => ((await request('GET', '/api/me/calendar', a.cookie)).json() as { events: CalendarItem[] }).events;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
  a = await signUp(ctx.app, 'Аня');
  b = await signUp(ctx.app, B_NICK);
  c = await signUp(ctx.app, 'Віра');
  [aId, bId, cId] = await Promise.all([a, b, c].map((u) => idOf(u.cookie)));
  // Профілі з ніками (ensureProfile бере перше слово — тож явно ставимо повний нік b).
  await Promise.all([a, c].map((u) => request('GET', '/api/me/profile', u.cookie)));
  expect((await request('PUT', '/api/me/profile', b.cookie, { nickname: B_NICK, avatar: null })).statusCode).toBe(200);
  await db.insert(follow).values([
    { followerId: aId, followeeId: bId },
    { followerId: bId, followeeId: aId },
  ]);

  const now = new Date();
  // Зіграна гра a з b (історія) і подія стрічки b.
  gameId = (
    await seedGame(db, {
      hostId: aId,
      startedAt: new Date(now.getTime() - 10 * MIN),
      title: 'Карпати',
      players: [
        { userId: aId, nickname: 'Аня', score: 3, rank: 1 },
        { userId: bId, nickname: B_NICK, score: 1, rank: 2 },
      ],
    })
  ).gameId;
  const at = new Date(now.getTime() - MIN);
  feedId = (
    await db
      .insert(feedEvent)
      .values({ key: `game:${gameId}:${bId}`, userId: bId, kind: 'game', gameId, data: { kind: 'game', title: 'Карпати', place: 2, of: 2, team: null } as never, at, createdAt: at })
      .returning({ id: feedEvent.id })
  )[0].id;

  // Подія календаря b і запит b на подію a.
  const bQuiz = await createQuiz(db, bId, { ...makeQuiz([single]), title: 'Писанки' });
  const aQuiz = await createQuiz(db, aId, { ...makeQuiz([single]), title: 'Вареники' });
  const bEvent = await createEvent(db, bId, { title: 'Вечір Богдана', startsAt: new Date(now.getTime() + 5 * DAY).toISOString(), quizId: bQuiz }, now);
  const aEvent = await createEvent(db, aId, { title: 'Вечір Ані', startsAt: new Date(now.getTime() + 4 * DAY).toISOString(), quizId: aQuiz }, now);
  if (!bEvent.ok || !aEvent.ok) throw new Error('event');
  bEventId = bEvent.id;
  aEventId = aEvent.id;
  expect(await requestToJoin(db, bId, aEventId, now, noRooms)).toEqual({ ok: true, status: 'pending' });

  // Кімната b у лобі з запрошенням a.
  inviteCode = (await startGame(ctx.app, makeQuiz([single]), b.cookie)).game.code;
  expect((await request('POST', `/api/games/by-code/${inviteCode}/invites`, b.cookie, { userIds: [aId] })).statusCode).toBe(200);
  expect(((await request('GET', '/api/me/invites', a.cookie)).json() as unknown[]).length).toBe(1);

  // До бану все видно.
  expect((await request('GET', `/api/profiles/${bId}`)).statusCode).toBe(200);
  expect(await friendsOfA()).toContain(bId);
  expect((await feedOfA()).map((e) => e.id)).toContain(feedId);
  const before = await calendarOfA();
  expect(before.map((e) => e.id)).toContain(bEventId);
  expect(before.find((e) => e.id === aEventId)?.requests?.map((r) => r.user.id)).toEqual([bId]);

  expect(await banUser(db, { adminId: cId, targetId: bId, reason: null, now })).toEqual({ ok: true, changed: true });
});

afterAll(async () => {
  await ctx.shutdown();
});

describe('a banned person is hidden from others (21a)', () => {
  it('profile, achievements, versus and adding a friend answer 404', async () => {
    const profile = await request('GET', `/api/profiles/${bId}`, a.cookie);
    expect(profile.statusCode).toBe(404);
    expect(profile.json()).toEqual({ error: 'not_found' });
    const achievements = await request('GET', `/api/profiles/${bId}/achievements`);
    expect(achievements.statusCode).toBe(404);
    expect(achievements.json()).toEqual({ error: 'not_found' });
    const versus = await request('GET', `/api/me/versus/${bId}`, a.cookie);
    expect(versus.statusCode).toBe(404);
    expect(versus.json()).toEqual({ error: 'not_found' });
    const add = await request('PUT', `/api/me/friends/${bId}`, c.cookie);
    expect(add.statusCode).toBe(404);
    expect(add.json()).toEqual({ error: 'not_found' });
  });

  it('friends, search and nickname lookup skip them', async () => {
    expect(await friendsOfA()).not.toContain(bId);
    expect((await request('GET', `/api/profiles/search?q=${encodeURIComponent('Бог')}`, a.cookie)).json()).toEqual([]);
    const byNick = await request('GET', `/api/profiles?nickname=${encodeURIComponent(B_NICK)}`, a.cookie);
    expect(byNick.statusCode).toBe(404);
  });

  it('feed, calendar and invites skip them', async () => {
    expect((await feedOfA()).some((e) => e.who.id === bId)).toBe(false);
    const calendar = await calendarOfA();
    expect(calendar.map((e) => e.id)).not.toContain(bEventId);
    expect(calendar.find((e) => e.id === aEventId)?.requests).toEqual([]);
    expect((await request('GET', '/api/me/invites', a.cookie)).json()).toEqual([]);
  });

  it('past games keep their nickname', async () => {
    const history = (await request('GET', '/api/me/history', a.cookie)).json() as { gameId: string }[];
    expect(history.map((g) => g.gameId)).toContain(gameId);
    const detail = await request('GET', `/api/games/${gameId}`, a.cookie);
    expect(detail.statusCode).toBe(200);
    expect(detail.body).toContain(B_NICK);
  });

  it('push skips their events and their requests', async () => {
    const now = new Date();
    await saveSubscription(db, aId, { endpoint: `https://push.example.com/${aId}`, keys: { p256dh: 'BPa', auth: 'aua' } }, now);
    await saveSubscription(db, bId, { endpoint: `https://push.example.com/${bId}`, keys: { p256dh: 'BPb', auth: 'aub' } }, now);
    const sent: { endpoint: string; payload: PushPayload }[] = [];
    const send = vi.fn<PushSend>(async (target, payload) => {
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as PushPayload });
      return { status: 201 };
    });
    const service = createPushService({ db, publicKey: 'pk', send });
    const soon = new Date(now.getTime() + 30 * MIN);

    const [own] = await db.insert(calendarEvent).values({ hostId: bId, title: 'Нагадування Богдана', startsAt: soon, createdAt: now }).returning({ id: calendarEvent.id });
    await db.insert(calendarRequest).values({ eventId: own.id, userId: aId, status: 'approved', requestedAt: now });
    expect(await service.remindDue(now)).toBe(0);
    expect(send).not.toHaveBeenCalled();

    // Подія a, де b затверджено: нагадування йде лише a.
    expect(await decideRequest(db, aId, aEventId, bId, 'approved', now, noRooms)).toEqual({ ok: true });
    await db.update(calendarEvent).set({ startsAt: soon }).where(eq(calendarEvent.id, aEventId));
    expect(await service.remindDue(now)).toBe(1);
    await service.idle();
    expect(sent.map((s) => s.endpoint)).toEqual([`https://push.example.com/${aId}`]);
  });

  it('unbanning brings them back', async () => {
    expect(await unbanUser(db, { adminId: cId, targetId: bId, now: new Date() })).toEqual({ changed: true });
    expect((await request('GET', `/api/profiles/${bId}`, a.cookie)).statusCode).toBe(200);
    expect(await friendsOfA()).toContain(bId);
    expect((await feedOfA()).map((e) => e.id)).toContain(feedId);
  });
});
