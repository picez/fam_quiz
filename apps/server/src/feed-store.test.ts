import { randomUUID } from 'node:crypto';
import { makeQuiz, single } from '@quiz/engine/testing';
import { FEED_PAGE_SIZE, feedCursor, type FeedData, type FeedEvent, type LikeKind } from '@quiz/shared';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { feedEvent, follow, game, profile, user, userLike } from './db/schema';
import { feedBadge, feedCutoff, feedPage, markFeedSeen, pruneFeed, visibleEvent } from './feed-store';
import { createTestDb } from './testing/test-db';

const DAY = 86_400_000;
const NOW = new Date('2026-11-02T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: 'h', name: 'Ведучий', email: 'h@example.com' });
});

/** Свіжі Оля, Петро й Віра для одного тесту (акаунти з профілями). */
async function people() {
  n += 1;
  const o = `o${n}`;
  const p = `p${n}`;
  const v = `v${n}`;
  for (const id of [o, p, v]) {
    await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
    await db.insert(profile).values({ userId: id, nickname: `Нік ${id}`, nicknameKey: `нік${id}`, avatar: `/uploads/${id}.png` });
  }
  return { o, p, v };
}

const befriend = (a: string, b: string) => db.insert(follow).values({ followerId: a, followeeId: b });
const unfriend = (a: string, b: string) => db.delete(follow).where(and(eq(follow.followerId, a), eq(follow.followeeId, b)));
const mutual = async (a: string, b: string) => {
  await befriend(a, b);
  await befriend(b, a);
};

async function seedGameRow(title = 'Писанки') {
  const id = randomUUID();
  n += 1;
  await db.insert(game).values({
    id,
    hostId: 'h',
    code: String(200000 + n),
    status: 'finished',
    title,
    quizSnapshot: makeQuiz([single]),
    startedAt: ago(DAY),
    finishedAt: ago(DAY),
  });
  return id;
}

let keys = 0;
async function event(
  userId: string,
  opts: { kind?: 'game' | 'achievement' | 'level' | 'prize'; at?: Date; createdAt?: Date; gameId?: string | null; data?: FeedData } = {},
) {
  keys += 1;
  const kind = opts.kind ?? 'game';
  const at = opts.at ?? ago(60_000);
  const data: FeedData =
    opts.data ??
    (kind === 'game'
      ? { kind: 'game', title: 'Писанки', place: 1, of: 3, team: null }
      : kind === 'level'
        ? { kind: 'level', level: 3 }
        : kind === 'achievement'
          ? { kind: 'achievement', achievementId: 'first-win' as never }
          : { kind: 'prize', place: 1 as never, name: 'Кубок', title: 'Писанки', nickTitle: null });
  const [row] = await db
    .insert(feedEvent)
    .values({
      key: `${kind}:test:${keys}`,
      userId,
      kind,
      gameId: opts.gameId === undefined ? randomUUID() : opts.gameId,
      data,
      at,
      createdAt: opts.createdAt ?? at,
    })
    .returning();
  return row;
}

async function like(
  userId: string,
  kind: LikeKind,
  targetUserId: string,
  opts: { gameId?: string | null; questionId?: string; eventKey?: string; hidden?: boolean; createdAt?: Date } = {},
) {
  await db.insert(userLike).values({
    userId,
    kind,
    targetUserId,
    gameId: opts.gameId ?? null,
    quizId: kind === 'question' || kind === 'quiz' ? randomUUID() : null,
    questionId: opts.questionId ?? null,
    eventKey: opts.eventKey ?? null,
    hidden: opts.hidden ?? false,
    createdAt: opts.createdAt ?? ago(30_000),
  });
}

const page = (viewer: string, cursor: { at: Date; id: string } | null = null) => feedPage(db, viewer, cursor, NOW);
const idsOf = async (viewer: string) => (await page(viewer)).events.map((e) => e.id);

/** Усі сторінки підряд: курсор з next кожної попередньої. */
async function allPages(viewer: string) {
  const pages = [];
  let cursor: { at: Date; id: string } | null = null;
  for (let i = 0; i < 10; i++) {
    const current = await page(viewer, cursor);
    pages.push(current);
    if (current.next === null) break;
    const at = current.next.slice(0, current.next.indexOf('|'));
    cursor = { at: new Date(at), id: current.next.slice(current.next.indexOf('|') + 1) };
  }
  return pages;
}

describe('feedCutoff', () => {
  it('is now minus 90 days', () => {
    expect(feedCutoff(NOW).toISOString()).toBe(new Date(NOW.getTime() - 90 * DAY).toISOString());
  });
});

describe('visibility (Review Focus 2)', () => {
  it('needs friendship both ways and disappears at once when it is removed', async () => {
    const { o, p } = await people();
    const eo = await event(o);
    const ep = await event(p);

    await befriend(o, p);
    expect(await idsOf(o)).toEqual([eo.id]);
    expect(await idsOf(p)).toEqual([ep.id]);
    expect(await visibleEvent(db, o, ep.id, NOW)).toBeNull();

    await befriend(p, o);
    expect(new Set(await idsOf(o))).toEqual(new Set([eo.id, ep.id]));
    expect(new Set(await idsOf(p))).toEqual(new Set([eo.id, ep.id]));
    expect((await visibleEvent(db, o, ep.id, NOW))?.id).toBe(ep.id);

    await unfriend(o, p);
    expect(await idsOf(o)).toEqual([eo.id]);
    expect(await idsOf(p)).toEqual([ep.id]);
    expect(await visibleEvent(db, o, ep.id, NOW)).toBeNull();
    expect(await visibleEvent(db, p, eo.id, NOW)).toBeNull();
  });

  it('a third party friend of one side does not see the other', async () => {
    const { o, p, v } = await people();
    await mutual(o, p);
    await mutual(p, v);
    const ev = await event(v);
    expect(await idsOf(o)).not.toContain(ev.id);
    expect(await idsOf(p)).toContain(ev.id);
  });

  it('visibleEvent: own event yes, not a uuid or unknown → null', async () => {
    const { o } = await people();
    const eo = await event(o);
    expect((await visibleEvent(db, o, eo.id, NOW))?.key).toBe(eo.key);
    expect(await visibleEvent(db, o, 'not-a-uuid', NOW)).toBeNull();
    expect(await visibleEvent(db, o, randomUUID(), NOW)).toBeNull();
  });
});

describe('feedPage events', () => {
  it('own events without friends are mine with an empty like counter; who is the current profile', async () => {
    const { o } = await people();
    const eo = await event(o, { data: { kind: 'game', title: 'Писанки', place: 2, of: 5, team: null } });
    const result = await page(o);
    expect(result.events).toEqual([
      {
        id: eo.id,
        at: eo.at.toISOString(),
        who: { id: o, nickname: `Нік ${o}`, avatar: `/uploads/${o}.png` },
        mine: true,
        data: { kind: 'game', title: 'Писанки', place: 2, of: 5, team: null },
        likes: { count: 0, liked: false },
      },
    ]);
    expect(result.next).toBeNull();
    expect(result.asOf).toBe(NOW.toISOString());

    await db.update(profile).set({ nickname: 'Оля' }).where(eq(profile.userId, o));
    expect((await page(o)).events[0].who.nickname).toBe('Оля');
  });

  it('game likes are the player likes of the owner, other kinds are event likes by key', async () => {
    const { o, p, v } = await people();
    await mutual(o, p);
    const gameId = randomUUID();
    const eg = await event(p, { kind: 'game', gameId, at: ago(10_000) });
    const el = await event(p, { kind: 'level', gameId, at: ago(20_000) });
    const ea = await event(p, { kind: 'achievement', gameId, at: ago(30_000) });
    await like(v, 'player', p, { gameId });
    await like(o, 'player', p, { gameId });
    // лайк гравця іншому в тій самій грі не рахується
    await like(o, 'player', v, { gameId });
    await like(o, 'event', p, { gameId, eventKey: el.key });

    const byId = new Map((await page(o)).events.map((e) => [e.id, e]));
    expect(byId.get(eg.id)?.likes).toEqual({ count: 2, liked: true });
    expect(byId.get(el.id)?.likes).toEqual({ count: 1, liked: true });
    expect(byId.get(ea.id)?.likes).toEqual({ count: 0, liked: false });
    expect(byId.get(eg.id)?.mine).toBe(false);

    // для власника: лічильник є, liked завжди false
    const own = new Map((await page(p)).events.map((e) => [e.id, e]));
    expect(own.get(eg.id)?.likes).toEqual({ count: 2, liked: false });
    expect(own.get(el.id)?.likes).toEqual({ count: 1, liked: false });
  });

  it('90 days: 91 days ago is gone, 89 days ago is shown; pruneFeed removes only the old one', async () => {
    const { o } = await people();
    const old = await event(o, { at: ago(91 * DAY) });
    const fresh = await event(o, { at: ago(89 * DAY) });
    expect(await idsOf(o)).toEqual([fresh.id]);
    expect(await visibleEvent(db, o, old.id, NOW)).toBeNull();

    // інших тестів старих подій немає, тож прибирання зачіпає лише цю
    expect(await pruneFeed(db, NOW)).toBe(1);
    expect(await db.select().from(feedEvent).where(eq(feedEvent.id, old.id))).toHaveLength(0);
    expect(await db.select().from(feedEvent).where(eq(feedEvent.id, fresh.id))).toHaveLength(1);
    expect(await pruneFeed(db, NOW)).toBe(0);
  });
});

describe('feedPage likes to me', () => {
  it('one card per liker and game; hidden likes do not count; only the target sees it', async () => {
    const { o, p, v } = await people();
    await mutual(o, p);
    const g1 = await seedGameRow('Писанки');
    const first = ago(5 * 60_000);
    await like(p, 'question', o, { gameId: g1, questionId: 'q1', createdAt: first });
    await like(p, 'question', o, { gameId: g1, questionId: 'q2', createdAt: ago(4 * 60_000) });
    await like(p, 'question', o, { gameId: g1, questionId: 'q3', createdAt: ago(3 * 60_000), hidden: true });
    await like(p, 'quiz', o, { gameId: g1, createdAt: ago(2 * 60_000) });
    await like(p, 'host', o, { gameId: g1, createdAt: ago(60_000) });
    // лайк від не друга — теж подія про мене
    await like(v, 'player', o, { gameId: g1, createdAt: ago(90_000) });
    // лайки під подіями стрічки карток не дають
    await like(v, 'event', o, { gameId: g1, eventKey: 'level:x:2', createdAt: ago(80_000) });
    // лише прихований — групи немає
    const g2 = await seedGameRow('Без лайків');
    await like(p, 'question', o, { gameId: g2, questionId: 'q9', hidden: true });

    const events = (await page(o)).events;
    expect(events).toHaveLength(2);
    const fromP = events.find((e) => e.who.id === p) as FeedEvent;
    expect(fromP).toEqual({
      id: `like:${g1}:${p}`,
      at: first.toISOString(),
      who: { id: p, nickname: `Нік ${p}`, avatar: `/uploads/${p}.png` },
      mine: true,
      data: { kind: 'like', title: 'Писанки', questions: 2, quiz: true, host: true, player: false },
      likes: null,
    });
    const fromV = events.find((e) => e.who.id === v) as FeedEvent;
    expect(fromV.data).toEqual({ kind: 'like', title: 'Писанки', questions: 0, quiz: false, host: false, player: true });
    // новіша група зверху
    expect(events.map((e) => e.who.id)).toEqual([v, p]);

    expect(await idsOf(p)).toEqual([]);
    expect(await idsOf(v)).toEqual([]);
  });

  it('a like group of a game that is gone has a null title; likes older than 90 days are not shown', async () => {
    const { o, p } = await people();
    const gone = randomUUID();
    await like(p, 'host', o, { gameId: gone });
    await like(p, 'host', o, { gameId: randomUUID(), createdAt: ago(91 * DAY) });
    const events = (await page(o)).events;
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ kind: 'like', title: null, questions: 0, quiz: false, host: true, player: false });
  });
});

describe('feedPage paging (Review Focus 5)', () => {
  it('45 events and 3 like groups, some sharing at → 20, 20, 8 with no gaps or repeats', async () => {
    const { o, p, v } = await people();
    await mutual(o, p);
    const shared = ago(10 * 60_000);
    for (let i = 0; i < 45; i++) {
      // кожна третя — на тій самій мілісекунді, решта — кожна своя
      const at = i % 3 === 0 ? shared : ago(i * 1000 + 7);
      await event(i % 2 === 0 ? o : p, { at });
    }
    for (const liker of [p, v]) await like(liker, 'host', o, { gameId: await seedGameRow(), createdAt: shared });
    await like(v, 'quiz', o, { gameId: await seedGameRow(), createdAt: ago(3 * DAY) });

    const pages = await allPages(o);
    expect(pages.map((x) => x.events.length)).toEqual([FEED_PAGE_SIZE, FEED_PAGE_SIZE, 8]);
    expect(pages[2].next).toBeNull();
    expect(pages[0].next).toBe(feedCursor(pages[0].events[19]));
    expect(pages[0].asOf).toBe(NOW.toISOString());
    expect(pages[1].asOf).toBeUndefined();
    expect(pages[2].asOf).toBeUndefined();

    const all = pages.flatMap((x) => x.events);
    expect(new Set(all.map((e) => e.id)).size).toBe(48);
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1];
      const b = all[i];
      const before = a.at > b.at || (a.at === b.at && a.id > b.id);
      expect(before, `${a.at}|${a.id} before ${b.at}|${b.id}`).toBe(true);
    }
  });

  it('a cursor exactly at shared milliseconds continues past rows with sub-millisecond times', async () => {
    const { o } = await people();
    const base = '2026-11-01T10:00:00.500';
    // мікросекунди в базі (не з JS) мусять порівнюватись як мілісекунди
    for (let i = 0; i < FEED_PAGE_SIZE + 3; i++) {
      keys += 1;
      await db.insert(feedEvent).values({
        key: `game:micro:${keys}`,
        userId: o,
        kind: 'game',
        gameId: null,
        data: { kind: 'game', title: 'Писанки', place: 1, of: 1, team: null },
        at: new Date(`${base}Z`),
        createdAt: new Date(`${base}Z`),
      });
    }
    // зсуваємо частину на мікросекунди в межах тієї самої мілісекунди
    await db.execute(sql.raw(`update feed_event set at = at + interval '123 microseconds' where user_id = '${o}' and key like 'game:micro:%' and id::text < '8'`));
    const pages = await allPages(o);
    const all = pages.flatMap((x) => x.events);
    expect(all).toHaveLength(FEED_PAGE_SIZE + 3);
    expect(new Set(all.map((e) => e.id)).size).toBe(FEED_PAGE_SIZE + 3);
  });
});

describe('feedBadge', () => {
  it('counts foreign visible events by write time, not mine or likes; the seen mark only moves forward', async () => {
    const { o, p, v } = await people();
    await mutual(o, p);
    await event(o);
    await event(p, { at: ago(2 * 60_000) });
    await event(p, { at: ago(3 * 60_000) });
    await event(v); // не друг
    const newest = await event(p, { at: new Date(NOW.getTime() - 1000) });
    await like(p, 'host', o, { gameId: randomUUID() });

    expect(await feedBadge(db, o, NOW)).toEqual({ events: 3, requests: 0, decisions: 0 });

    const T = NOW;
    await markFeedSeen(db, o, T, NOW);
    expect((await feedBadge(db, o, NOW)).events).toBe(0);

    // Review Focus 3: дописана пізніше, але з давнішим at
    const late = await event(p, { at: new Date(T.getTime() - 5000), createdAt: new Date(T.getTime() + 2000) });
    const later = new Date(T.getTime() + 10_000);
    expect((await feedBadge(db, o, later)).events).toBe(1);
    const ids = (await feedPage(db, o, null, later)).events.map((e) => e.id);
    expect(ids[0]).toBe(newest.id);
    expect(ids[1]).toBe(late.id);

    // старий asOf з іншої вкладки мітку не відкочує
    await markFeedSeen(db, o, new Date(T.getTime() - 60_000), later);
    const [row] = await db.select({ seen: profile.feedSeenAt }).from(profile).where(eq(profile.userId, o));
    expect(row.seen?.toISOString()).toBe(T.toISOString());
    expect((await feedBadge(db, o, later)).events).toBe(1);

    // upTo у майбутньому стає now
    await markFeedSeen(db, o, new Date(later.getTime() + DAY), later);
    const [after] = await db.select({ seen: profile.feedSeenAt }).from(profile).where(eq(profile.userId, o));
    expect(after.seen?.toISOString()).toBe(later.toISOString());
    expect((await feedBadge(db, o, later)).events).toBe(0);
  });

  it('caps at FEED_BADGE_CAP + 1', async () => {
    const { o, p } = await people();
    await mutual(o, p);
    const rows = Array.from({ length: 150 }, (_, i) => ({
      key: `game:cap:${p}:${i}`,
      userId: p,
      kind: 'game' as const,
      gameId: null,
      data: { kind: 'game', title: 'Писанки', place: 1, of: 1, team: null } as FeedData,
      at: ago(i * 1000),
      createdAt: ago(i * 1000),
    }));
    await db.insert(feedEvent).values(rows);
    expect(await feedBadge(db, o, NOW)).toEqual({ events: 100, requests: 0, decisions: 0 });
  });

  it('markFeedSeen creates the profile when there is none yet', async () => {
    n += 1;
    const id = `fresh${n}`;
    await db.insert(user).values({ id, name: 'Свіжий', email: `${id}@example.com` });
    await markFeedSeen(db, id, NOW, NOW);
    const [row] = await db.select({ seen: profile.feedSeenAt }).from(profile).where(eq(profile.userId, id));
    expect(row.seen?.toISOString()).toBe(NOW.toISOString());
  });
});

describe('deleted account', () => {
  it('takes its events and like groups with it', async () => {
    const { o, p } = await people();
    await mutual(o, p);
    await event(p);
    await like(p, 'host', o, { gameId: randomUUID() });
    expect((await page(o)).events).toHaveLength(2);
    await db.delete(user).where(eq(user.id, p));
    expect((await page(o)).events).toHaveLength(0);
    expect((await feedBadge(db, o, NOW)).events).toBe(0);
  });
});
