import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from './app';
import { feedEvent, follow, userLike } from './db/schema';
import * as store from './feed-store';
import { startFeedPrune } from './feed-routes';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof createTestDb>>;
let olya: Awaited<ReturnType<typeof signUp>>;
let petro: Awaited<ReturnType<typeof signUp>>;
let vira: Awaited<ReturnType<typeof signUp>>;
let olyaId: string;
let petroId: string;
const GAME = '11111111-1111-4111-8111-111111111111';

const request = (method: 'GET' | 'POST', url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
const idOf = async (cookie: string) => ((await request('GET', '/api/me', cookie)).json() as { id: string }).id;
const like = (id: string, liked: boolean, cookie = olya.cookie) => request('POST', `/api/feed/${id}/like`, cookie, { liked });

let gameEventId: string;
let levelEventId: string;
let ownEventId: string;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
  olya = await signUp(ctx.app, 'Оля');
  petro = await signUp(ctx.app, 'Петро');
  vira = await signUp(ctx.app, 'Віра');
  olyaId = await idOf(olya.cookie);
  petroId = await idOf(petro.cookie);
  await Promise.all([olya, petro, vira].map((u) => request('GET', '/api/me/profile', u.cookie)));
  await db.insert(follow).values([
    { followerId: olyaId, followeeId: petroId },
    { followerId: petroId, followeeId: olyaId },
  ]);
  const at = new Date(Date.now() - 60_000);
  const make = (key: string, userId: string, kind: 'game' | 'level', data: object, gameId: string | null) =>
    db.insert(feedEvent).values({ key, userId, kind, gameId, data: data as never, at, createdAt: at }).returning({ id: feedEvent.id });
  gameEventId = (await make(`game:${GAME}:${petroId}`, petroId, 'game', { kind: 'game', title: 'Т', place: 1, of: 3, team: null }, GAME))[0].id;
  levelEventId = (await make(`level:${petroId}:3`, petroId, 'level', { kind: 'level', level: 3 }, null))[0].id;
  ownEventId = (await make(`level:${olyaId}:2`, olyaId, 'level', { kind: 'level', level: 2 }, null))[0].id;
});

afterAll(async () => {
  await ctx.shutdown();
});

describe('feed routes', () => {
  it('require an account', async () => {
    expect((await request('GET', '/api/me/feed')).statusCode).toBe(401);
    expect((await request('GET', '/api/me/feed/badge')).statusCode).toBe(401);
    expect((await request('POST', '/api/me/feed/seen', undefined, { upTo: new Date().toISOString() })).statusCode).toBe(401);
    expect((await request('POST', `/api/feed/${gameEventId}/like`, undefined, { liked: true })).statusCode).toBe(401);
  });

  it('serves the page, the badge and the seen mark', async () => {
    const page = await request('GET', '/api/me/feed', olya.cookie);
    expect(page.statusCode).toBe(200);
    const body = page.json() as { events: { id: string }[]; asOf: string };
    expect(body.events.map((e) => e.id)).toContain(gameEventId);
    expect(body.asOf).toEqual(expect.any(String));
    expect((await request('GET', '/api/me/feed?cursor=сміття', olya.cookie)).statusCode).toBe(400);

    expect((await request('GET', '/api/me/feed/badge', olya.cookie)).json()).toEqual({ events: 2, requests: 0, decisions: 0 });
    expect((await request('POST', '/api/me/feed/seen', olya.cookie, { upTo: 'xx' })).statusCode).toBe(400);
    expect((await request('POST', '/api/me/feed/seen', olya.cookie, { upTo: body.asOf })).statusCode).toBe(204);
    expect((await request('GET', '/api/me/feed/badge', olya.cookie)).json()).toEqual({ events: 0, requests: 0, decisions: 0 });
  });

  it('likes a game event as the final screen player like, and an other event by key', async () => {
    const first = await like(gameEventId, true);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ liked: true, likes: 1 });
    const rows = await db.select().from(userLike).where(eq(userLike.userId, olyaId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'player', gameId: GAME, targetUserId: petroId });
    expect((await like(gameEventId, true)).json()).toEqual({ liked: true, likes: 1 });
    expect((await like(gameEventId, false)).json()).toEqual({ liked: false, likes: 0 });

    expect((await like(levelEventId, true)).json()).toEqual({ liked: true, likes: 1 });
    const [row] = await db.select().from(userLike).where(and(eq(userLike.userId, olyaId), eq(userLike.kind, 'event')));
    expect(row).toMatchObject({ eventKey: `level:${petroId}:3`, targetUserId: petroId });
  });

  it('refuses own, invisible and unknown events', async () => {
    const own = await like(ownEventId, true);
    expect(own.statusCode).toBe(403);
    expect(own.json()).toEqual({ error: 'like_self' });
    const stranger = await like(gameEventId, true, vira.cookie);
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual({ error: 'not_found' });
    expect((await like(`like:${GAME}:${petroId}`, true)).statusCode).toBe(404);
  });

  it('limits likes to LIKE_RATE per person', async () => {
    let last = await like(gameEventId, true, petro.cookie); // Петро: своя подія, 403, але рахується
    expect(last.statusCode).toBe(403);
    for (let i = 0; i < 59; i += 1) last = await like(gameEventId, true, petro.cookie);
    const over = await like(gameEventId, true, petro.cookie);
    expect(over.statusCode).toBe(429);
    expect(over.json()).toMatchObject({ error: 'like_rate' });
  });
});

describe('startFeedPrune', () => {
  it('prunes at once and on every tick until stopped', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(store, 'pruneFeed').mockResolvedValue(0);
    try {
      const stop = startFeedPrune(db, 10);
      expect(spy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10);
      expect(spy).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(50);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});
