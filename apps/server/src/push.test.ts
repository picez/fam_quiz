import { randomUUID } from 'node:crypto';
import { makeQuiz, single } from '@quiz/engine/testing';
import type { PushPayload } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { attachGame, cancelEvent, noRooms, updateEvent } from './calendar-store';
import type { Db } from './db/client';
import { calendarEvent, calendarRequest, follow, game, pushSubscription, user } from './db/schema';
import { createPushService, startPushReminders, type PushOptions, type PushSend, type PushService } from './push';
import { saveSubscription } from './push-store';
import { createQuiz } from './quizzes';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const NOW = new Date('2026-11-07T15:00:00.000Z');
const MIN = 60_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const URL = 'https://fcm.googleapis.com/fcm/send/';

beforeAll(async () => {
  db = await createTestDb();
});

interface Call {
  endpoint: string;
  payload: PushPayload;
  options: PushOptions;
}
let calls: Call[];
let status: Record<string, number>;
let send: PushSend;
let log: Mock<(message: string, error?: unknown) => void>;
let service: PushService;
let h: string, o: string, p: string, q: string, E: string, quizId: string;

/** Імена людей без номера — порядок відправок не важливий. */
const who = (c: Call[]) =>
  c
    .map((x) => x.endpoint.slice(URL.length))
    .sort();

async function person(name: string) {
  n += 1;
  const id = `${name}${n}`;
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
  await saveSubscription(db, id, { endpoint: URL + id, keys: { p256dh: 'BP' + id, auth: 'au' + id } }, NOW);
  return id;
}

async function event(startsAt: Date, title = 'Вечір загадок') {
  const [row] = await db.insert(calendarEvent).values({ hostId: h, title, startsAt, createdAt: NOW }).returning({ id: calendarEvent.id });
  return row.id;
}

const request = (eventId: string, userId: string, st: 'pending' | 'approved' | 'rejected') =>
  db.insert(calendarRequest).values({ eventId, userId, status: st, requestedAt: NOW });

const row = async (id: string) => (await db.select().from(calendarEvent).where(eq(calendarEvent.id, id)))[0];

beforeEach(async () => {
  await db.delete(calendarEvent);
  await db.delete(pushSubscription);
  calls = [];
  status = {};
  log = vi.fn<(message: string, error?: unknown) => void>();
  send = vi.fn(async (target, payload, options) => {
    calls.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as PushPayload, options });
    return { status: status[target.endpoint] ?? 201 };
  });
  service = createPushService({ db, publicKey: 'pub', send, now: () => NOW, log });
  h = await person('h');
  o = await person('o');
  p = await person('p');
  q = await person('q');
  quizId = await createQuiz(db, h, { ...makeQuiz([single]), title: 'Писанки' });
  for (const f of [o, p, q]) await db.insert(follow).values({ followerId: h, followeeId: f });
  E = await event(at(60 * MIN));
  await request(E, o, 'approved');
  await request(E, p, 'pending');
  await request(E, q, 'rejected');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reminders', () => {
  it('reminds the host and approved friends once', async () => {
    expect(await service.remindDue(NOW)).toBe(1);
    expect(who(calls)).toEqual([h, o].sort());
    for (const c of calls) {
      expect(c.payload).toEqual({ kind: 'reminder', eventId: E, title: 'Вечір загадок', startsAt: '2026-11-07T16:00:00.000Z' });
      expect(c.options).toEqual({ ttl: 3600, urgency: 'high' });
    }
    expect((await row(E)).remindedAt).toEqual(NOW);
    calls.length = 0;
    expect(await service.remindDue(NOW)).toBe(0);
    expect(calls).toEqual([]);
  });

  it('has exact edges: +60 min yes, +60 min +1 ms no, started no', async () => {
    await db.delete(calendarEvent);
    const late = await event(at(60 * MIN + 1));
    const started = await event(NOW);
    expect(await service.remindDue(NOW)).toBe(0);
    expect((await row(late)).remindedAt).toBeNull();
    expect((await row(started)).remindedAt).toBeNull();
    expect(await service.remindDue(at(1))).toBe(1);
    expect((await row(late)).remindedAt).toEqual(at(1));
  });

  it('skips cancelled events and events with a finished game', async () => {
    const gid = randomUUID();
    await db.insert(game).values({ id: gid, hostId: h, code: '111111', status: 'finished', title: 'x', quizSnapshot: {}, startedAt: NOW, finishedAt: NOW });
    await db.update(calendarEvent).set({ gameId: gid, gameCode: '111111' }).where(eq(calendarEvent.id, E));
    const cancelled = await event(at(30 * MIN));
    await db.update(calendarEvent).set({ cancelledAt: NOW }).where(eq(calendarEvent.id, cancelled));
    expect(await service.remindDue(NOW)).toBe(0);
    expect(calls).toEqual([]);
  });

  it('does not remind again after the time is changed', async () => {
    expect(await service.remindDue(NOW)).toBe(1);
    const changed = await updateEvent(db, h, E, { title: 'Вечір загадок', startsAt: at(30 * MIN).toISOString(), quizId }, NOW, noRooms);
    expect(changed).toEqual({ ok: true });
    expect((await row(E)).startsAt).toEqual(at(30 * MIN));
    calls.length = 0;
    expect(await service.remindDue(NOW)).toBe(0);
    expect(calls).toEqual([]);
  });

  it('claims once under two parallel runs', async () => {
    const counts = await Promise.all([service.remindDue(NOW), service.remindDue(NOW)]);
    expect(counts[0] + counts[1]).toBe(1);
    expect(calls.filter((c) => c.endpoint === URL + o)).toHaveLength(1);
  });
});

describe('opened', () => {
  it('tells approved friends once with the code', async () => {
    expect(await attachGame(db, E, randomUUID(), '123456')).toBe(true);
    service.calendarNotify.opened(E);
    await service.idle();
    expect(who(calls)).toEqual([o]);
    expect(calls[0].payload).toEqual({ kind: 'opened', eventId: E, title: 'Вечір загадок', code: '123456' });
    expect(calls[0].options).toEqual({ ttl: 21_600, urgency: 'high' });
    await attachGame(db, E, randomUUID(), '654321');
    service.calendarNotify.opened(E);
    await service.idle();
    expect(calls).toHaveLength(1);
  });

  it('says nothing for an event without a room', async () => {
    service.calendarNotify.opened(E);
    await service.idle();
    expect(calls).toEqual([]);
  });
});

describe('cancelled', () => {
  it('tells pending and approved, not the host or rejected', async () => {
    await cancelEvent(db, h, E, NOW, noRooms);
    service.calendarNotify.cancelled(E);
    await service.idle();
    expect(who(calls)).toEqual([o, p].sort());
    expect(calls[0].payload).toEqual({ kind: 'cancelled', eventId: E, title: 'Вечір загадок', startsAt: '2026-11-07T16:00:00.000Z' });
    expect(calls[0].options).toEqual({ ttl: 86_400, urgency: 'normal' });
  });
});

describe('friends removed', () => {
  it('sends nothing to a person the host no longer follows', async () => {
    await db.delete(follow).where(and(eq(follow.followerId, h), eq(follow.followeeId, o)));
    expect(await service.remindDue(NOW)).toBe(1);
    expect(who(calls)).toEqual([h]);
    calls.length = 0;
    await attachGame(db, E, randomUUID(), '123456');
    service.calendarNotify.opened(E);
    await service.idle();
    expect(calls).toEqual([]);
    await cancelEvent(db, h, E, NOW, noRooms);
    service.calendarNotify.cancelled(E);
    await service.idle();
    expect(who(calls)).toEqual([p]);
  });
});

describe('delivery', () => {
  const payload: PushPayload = { kind: 'cancelled', eventId: 'e', title: 't', startsAt: '2026-11-07T16:00:00.000Z' };
  const left = async (id: string) => (await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, URL + id))).length;

  it('drops dead subscriptions on 404 and 410', async () => {
    status[URL + o] = 410;
    status[URL + p] = 404;
    expect(await service.deliver([o, p, q], payload)).toBe(3);
    expect(await left(o)).toBe(0);
    expect(await left(p)).toBe(0);
    expect(await left(q)).toBe(1);
  });

  it('keeps the row and logs on 500 and 0', async () => {
    status[URL + o] = 500;
    status[URL + p] = 0;
    await service.deliver([o, p], payload);
    expect(await left(o)).toBe(1);
    expect(await left(p)).toBe(1);
    expect(log).toHaveBeenCalled();
  });

  it('does not throw when send throws', async () => {
    const boom = createPushService({
      db,
      publicKey: 'pub',
      send: async () => {
        throw new Error('boom');
      },
      log,
    });
    await expect(boom.deliver([o], payload)).resolves.toBe(1);
    expect(log).toHaveBeenCalled();
  });

  it('sends to every subscription of a person', async () => {
    await saveSubscription(db, o, { endpoint: URL + 'second', keys: { p256dh: 'x', auth: 'y' } }, at(1));
    await service.deliver([o], payload);
    expect(who(calls)).toEqual([o, 'second'].sort());
  });
});

describe('ticker', () => {
  it('runs at once, then every period, until stopped', () => {
    vi.useFakeTimers();
    const remindDue = vi.fn(async () => 0);
    const stop = startPushReminders({ remindDue } as unknown as PushService, 60_000);
    expect(remindDue).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(remindDue).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(180_000);
    expect(remindDue).toHaveBeenCalledTimes(2);
  });

  it('reports a failing run to onError', async () => {
    vi.useFakeTimers();
    const err = new Error('x');
    const onError = vi.fn();
    const stop = startPushReminders(
      {
        remindDue: async () => {
          throw err;
        },
      } as unknown as PushService,
      60_000,
      onError,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(err);
    stop();
  });
});
