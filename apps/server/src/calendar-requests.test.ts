import { makeQuiz, single } from '@quiz/engine/testing';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  attachGame, calendarBadge, cancelEvent, createEvent, decideRequest, listCalendar, markCalendarSeen, noRooms,
  requestToJoin, updateEvent, withdrawRequest,
} from './calendar-store';
import { banUser } from './bans';
import type { Db } from './db/client';
import { calendarRequest, follow, profile, user } from './db/schema';
import { createQuiz } from './quizzes';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const NOW = new Date('2026-11-02T10:00:00.000Z');
const H = 3_600_000;
const DAY = 24 * H;
const at = (ms: number) => new Date(NOW.getTime() + ms);

beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  n += 1;
  const id = `rq${n}`;
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
  return id;
}

describe('calendar requests', () => {
  let h: string, o: string, p: string, v: string, quizId: string, E: string;

  // Нові люди й подія E (h, now + 5 д) для кожного тесту.
  beforeEach(async () => {
    [h, o, p, v] = [await person(), await person(), await person(), await person()];
    await db.insert(follow).values([
      { followerId: h, followeeId: o },
      { followerId: h, followeeId: p },
      { followerId: v, followeeId: h },
    ]);
    quizId = await createQuiz(db, h, { ...makeQuiz([single]), title: 'Писанки' });
    const r = await createEvent(db, h, { title: 'Вечір', startsAt: at(5 * DAY).toISOString(), quizId }, NOW);
    if (!r.ok) throw new Error(r.error);
    E = r.id;
  });

  const rows = () => db.select().from(calendarRequest).where(eq(calendarRequest.eventId, E));
  const mineOf = async (viewer: string) => (await listCalendar(db, viewer, NOW, noRooms)).events.find((e) => e.id === E);
  const seenOf = async (id: string) => (await db.select().from(profile).where(eq(profile.userId, id)))[0]?.calendarSeenAt ?? null;

  it('asks idempotently; the host and outsiders cannot', async () => {
    expect(await requestToJoin(db, o, E, NOW, noRooms)).toEqual({ ok: true, status: 'pending' });
    expect(await requestToJoin(db, o, E, NOW, noRooms)).toEqual({ ok: true, status: 'pending' });
    expect(await rows()).toHaveLength(1);
    expect(await requestToJoin(db, h, E, NOW, noRooms)).toEqual({ ok: false, error: 'own_event' });
    expect(await requestToJoin(db, v, E, NOW, noRooms)).toEqual({ ok: false, error: 'not_found' });
    expect(await requestToJoin(db, o, 'nope', NOW, noRooms)).toEqual({ ok: false, error: 'not_found' });
  });

  it('withdraws only while pending', async () => {
    await requestToJoin(db, o, E, NOW, noRooms);
    expect(await withdrawRequest(db, o, E)).toEqual({ ok: true });
    expect(await rows()).toHaveLength(0);
    expect(await withdrawRequest(db, o, E)).toEqual({ ok: false, error: 'not_found' });
    expect(await requestToJoin(db, o, E, NOW, noRooms)).toEqual({ ok: true, status: 'pending' });
    expect(await decideRequest(db, h, E, o, 'approved', NOW, noRooms)).toEqual({ ok: true });
    expect((await rows())[0].decidedAt).toEqual(NOW);
    expect(await withdrawRequest(db, o, E)).toEqual({ ok: false, error: 'request_approved' });
    expect(await requestToJoin(db, o, E, NOW, noRooms)).toEqual({ ok: true, status: 'approved' });
    expect(await decideRequest(db, o, E, p, 'approved', NOW, noRooms)).toEqual({ ok: false, error: 'not_found' });
  });

  it('a rejected person cannot ask again, but the host may change their mind', async () => {
    await requestToJoin(db, p, E, NOW, noRooms);
    await decideRequest(db, h, E, p, 'rejected', NOW, noRooms);
    expect(await requestToJoin(db, p, E, NOW, noRooms)).toEqual({ ok: false, error: 'request_rejected' });
    expect(await decideRequest(db, h, E, p, 'approved', at(H), noRooms)).toEqual({ ok: true });
    expect((await mineOf(p))?.myRequest).toBe('approved');
    expect(await decideRequest(db, h, E, v, 'approved', NOW, noRooms)).toEqual({ ok: false, error: 'not_found' });
  });

  it('closed events take no requests and no decisions', async () => {
    await requestToJoin(db, o, E, NOW, noRooms);
    // missed
    expect(await requestToJoin(db, p, E, at(5 * DAY + 6 * H), noRooms)).toEqual({ ok: false, error: 'event_closed' });
    // open
    const gameId = '11111111-1111-4111-8111-111111111111';
    await attachGame(db, E, gameId, '123456');
    const probe = (id: string, code: string) => id === gameId && code === '123456';
    expect(await requestToJoin(db, p, E, at(5 * DAY + 7 * H), probe)).toEqual({ ok: true, status: 'pending' });
    // cancelled
    expect(await cancelEvent(db, h, E, NOW, noRooms)).toMatchObject({ ok: true });
    const q = await person();
    await db.insert(follow).values({ followerId: h, followeeId: q });
    // скасована подія прихована від друга без запиту й від відхиленого
    expect(await requestToJoin(db, q, E, NOW, noRooms)).toEqual({ ok: false, error: 'not_found' });
    expect(await requestToJoin(db, o, E, NOW, noRooms)).toEqual({ ok: false, error: 'event_closed' });
    expect(await decideRequest(db, h, E, o, 'approved', NOW, noRooms)).toEqual({ ok: false, error: 'event_locked' });
  });

  it('lists requests for the host (pending first) and the count and own status for others', async () => {
    await requestToJoin(db, p, E, at(-2 * H), noRooms);
    await requestToJoin(db, o, E, at(-H), noRooms);
    await decideRequest(db, h, E, p, 'approved', NOW, noRooms);
    const host = await mineOf(h);
    expect(host?.requests?.map((r) => [r.user.id, r.status])).toEqual([[o, 'pending'], [p, 'approved']]);
    expect(host?.approved).toBe(1);
    expect(await mineOf(p)).toMatchObject({ myRequest: 'approved', requests: null, approved: 1 });
  });

  it('Review Focus 1: the host removes a friend, the event vanishes for them, the host still decides', async () => {
    await requestToJoin(db, o, E, NOW, noRooms);
    await db.delete(follow).where(and(eq(follow.followerId, h), eq(follow.followeeId, o)));
    expect(await mineOf(o)).toBeUndefined();
    expect(await requestToJoin(db, o, E, NOW, noRooms)).toEqual({ ok: false, error: 'not_found' });
    expect(await withdrawRequest(db, o, E)).toEqual({ ok: false, error: 'not_found' });
    expect((await mineOf(h))?.requests?.map((r) => r.user.id)).toEqual([o]);
    expect(await decideRequest(db, h, E, o, 'rejected', NOW, noRooms)).toEqual({ ok: true });
  });

  it('a cancelled event stays visible to an approved guest, not to a rejected one', async () => {
    await requestToJoin(db, o, E, NOW, noRooms);
    await requestToJoin(db, p, E, NOW, noRooms);
    await decideRequest(db, h, E, o, 'approved', NOW, noRooms);
    await decideRequest(db, h, E, p, 'rejected', NOW, noRooms);
    await cancelEvent(db, h, E, NOW, noRooms);
    expect((await mineOf(o))?.state).toBe('cancelled');
    expect(await mineOf(p)).toBeUndefined();
  });

  it('gives the join code to the host and the approved guest only', async () => {
    await requestToJoin(db, o, E, NOW, noRooms);
    await requestToJoin(db, p, E, NOW, noRooms);
    await decideRequest(db, h, E, o, 'approved', NOW, noRooms);
    const gameId = '22222222-2222-4222-8222-222222222222';
    await attachGame(db, E, gameId, '123456');
    const probe = (id: string, code: string) => id === gameId && code === '123456';
    const code = async (viewer: string) => (await listCalendar(db, viewer, NOW, probe)).events.find((e) => e.id === E)?.joinCode;
    expect(await code(o)).toBe('123456');
    expect(await code(p)).toBeNull();
    expect(await code(h)).toBe('123456');
  });

  it('a banned requester counts neither in the host badge nor in the approved count', async () => {
    await requestToJoin(db, o, E, NOW, noRooms);
    await requestToJoin(db, p, E, NOW, noRooms);
    await decideRequest(db, h, E, p, 'approved', NOW, noRooms);
    expect((await calendarBadge(db, h, NOW)).requests).toBe(1);
    expect((await mineOf(h))?.approved).toBe(1);
    await banUser(db, { adminId: h, targetId: o, reason: null, now: NOW });
    await banUser(db, { adminId: h, targetId: p, reason: null, now: NOW });
    expect((await calendarBadge(db, h, NOW)).requests).toBe(0);
    expect((await mineOf(h))?.approved).toBe(0);
  });

  describe('badge', () => {
    it('counts the host pending requests and drops them on decision, missed and cancel', async () => {
      await requestToJoin(db, o, E, NOW, noRooms);
      await requestToJoin(db, p, E, NOW, noRooms);
      expect((await calendarBadge(db, h, NOW)).requests).toBe(2);
      await decideRequest(db, h, E, o, 'approved', NOW, noRooms);
      expect((await calendarBadge(db, h, NOW)).requests).toBe(1);
      expect((await calendarBadge(db, h, at(5 * DAY + 6 * H))).requests).toBe(0);
      await cancelEvent(db, h, E, NOW, noRooms);
      expect((await calendarBadge(db, h, NOW)).requests).toBe(0);
    });

    it('counts a decision once and clears it with the seen mark', async () => {
      await requestToJoin(db, o, E, NOW, noRooms);
      expect(await seenOf(o)).toBeNull();
      expect((await calendarBadge(db, o, NOW)).decisions).toBe(0);
      await decideRequest(db, h, E, o, 'approved', NOW, noRooms);
      expect((await calendarBadge(db, o, at(1))).decisions).toBe(1);
      await markCalendarSeen(db, o, at(1), at(1));
      expect((await calendarBadge(db, o, at(1))).decisions).toBe(0);
    });

    it('Review Focus 4: an edit lights up approved guests, not rejected ones', async () => {
      await requestToJoin(db, o, E, NOW, noRooms);
      await requestToJoin(db, p, E, NOW, noRooms);
      await decideRequest(db, h, E, o, 'approved', NOW, noRooms);
      await decideRequest(db, h, E, p, 'rejected', NOW, noRooms);
      await markCalendarSeen(db, o, NOW, NOW);
      await markCalendarSeen(db, p, NOW, NOW);
      const later = at(60_000);
      expect(await updateEvent(db, h, E, { title: 'Нова', startsAt: at(6 * DAY).toISOString(), quizId }, later, noRooms)).toEqual({ ok: true });
      expect((await calendarBadge(db, o, later)).decisions).toBe(1);
      expect((await calendarBadge(db, p, later)).decisions).toBe(0);
      await markCalendarSeen(db, o, later, later);
      expect((await calendarBadge(db, o, later)).decisions).toBe(0);
    });

    it('a cancel lights up the approved guest and a rejection the rejected one', async () => {
      await requestToJoin(db, o, E, NOW, noRooms);
      await requestToJoin(db, p, E, NOW, noRooms);
      await decideRequest(db, h, E, o, 'approved', NOW, noRooms);
      await markCalendarSeen(db, o, NOW, NOW);
      const later = at(60_000);
      await decideRequest(db, h, E, p, 'rejected', later, noRooms);
      expect((await calendarBadge(db, p, later)).decisions).toBe(1);
      await cancelEvent(db, h, E, at(120_000), noRooms);
      expect((await calendarBadge(db, o, at(120_000))).decisions).toBe(1);
    });

    it('a rejected guest does not get a decision for an event that was then cancelled', async () => {
      await requestToJoin(db, p, E, NOW, noRooms);
      await decideRequest(db, h, E, p, 'rejected', NOW, noRooms);
      expect((await calendarBadge(db, p, at(1))).decisions).toBe(1);
      await cancelEvent(db, h, E, at(2), noRooms);
      expect((await calendarBadge(db, p, at(2))).decisions).toBe(0);
    });

    it('repeating the same decision does not move decided_at or light the badge', async () => {
      await requestToJoin(db, o, E, NOW, noRooms);
      await decideRequest(db, h, E, o, 'approved', NOW, noRooms);
      await markCalendarSeen(db, o, at(1), at(1));
      expect(await decideRequest(db, h, E, o, 'approved', at(2), noRooms)).toEqual({ ok: true });
      expect((await rows())[0].decidedAt).toEqual(NOW);
      expect((await calendarBadge(db, o, at(2))).decisions).toBe(0);
    });

    it('the seen mark never goes back and a future mark becomes now', async () => {
      await markCalendarSeen(db, o, NOW, NOW);
      await markCalendarSeen(db, o, at(-H), NOW);
      expect(await seenOf(o)).toEqual(NOW);
      await markCalendarSeen(db, p, at(DAY), NOW);
      expect(await seenOf(p)).toEqual(NOW);
    });
  });
});
