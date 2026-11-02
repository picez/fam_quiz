import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeQuiz, single } from '@quiz/engine/testing';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  attachGame, calendarEventFor, calendarState, cancelEvent, createEvent, listCalendar, noRooms, startsAtAllowed, updateEvent,
} from './calendar-store';
import type { Db } from './db/client';
import { calendarEvent, calendarRequest, feedEvent, follow, quiz, user } from './db/schema';
import { createQuiz } from './quizzes';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const T = new Date('2026-11-10T16:00:00.000Z');

beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  n += 1;
  const id = `cu${n}`;
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
  return id;
}

describe('calendar schema', () => {
  it('inserts an event without a game or quiz, not cancelled', async () => {
    const hostId = await person();
    const [row] = await db.insert(calendarEvent).values({ hostId, title: 'Вечір', startsAt: T, createdAt: T }).returning();
    expect(row.gameId).toBeNull();
    expect(row.gameCode).toBeNull();
    expect(row.quizId).toBeNull();
    expect(row.cancelledAt).toBeNull();
    expect(row.editedAt).toBeNull();
  });

  it('rejects a second request for the same event and person', async () => {
    const hostId = await person();
    const userId = await person();
    const [ev] = await db.insert(calendarEvent).values({ hostId, title: 'Вечір', startsAt: T, createdAt: T }).returning();
    await db.insert(calendarRequest).values({ eventId: ev.id, userId, status: 'pending', requestedAt: T });
    await expect(
      db.insert(calendarRequest).values({ eventId: ev.id, userId, status: 'pending', requestedAt: T }),
    ).rejects.toThrow();
  });

  it('keeps the event with a null quiz when the quiz is deleted', async () => {
    const hostId = await person();
    const [q] = await db.insert(quiz).values({ ownerId: hostId, title: 'Україна', description: '', settings: makeQuiz([single]).settings, rounds: makeQuiz([single]).rounds }).returning();
    const [ev] = await db.insert(calendarEvent).values({ hostId, title: 'Вечір', quizId: q.id, startsAt: T, createdAt: T }).returning();
    await db.delete(quiz).where(eq(quiz.id, q.id));
    const [after] = await db.select().from(calendarEvent).where(eq(calendarEvent.id, ev.id));
    expect(after).toBeDefined();
    expect(after.quizId).toBeNull();
  });

  it('removes events and requests when the host is deleted', async () => {
    const hostId = await person();
    const userId = await person();
    const [ev] = await db.insert(calendarEvent).values({ hostId, title: 'Вечір', startsAt: T, createdAt: T }).returning();
    await db.insert(calendarRequest).values({ eventId: ev.id, userId, status: 'approved', requestedAt: T, decidedAt: T });
    await db.delete(user).where(eq(user.id, hostId));
    expect(await db.select().from(calendarEvent).where(eq(calendarEvent.id, ev.id))).toHaveLength(0);
    expect(await db.select().from(calendarRequest).where(eq(calendarRequest.eventId, ev.id))).toHaveLength(0);
  });

  it('ships the migration text', () => {
    const sql = readFileSync(join(__dirname, '..', 'drizzle', '0025_calendar.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE "calendar_event"');
    expect(sql).toContain('CREATE TABLE "calendar_request"');
    expect(sql).toContain('ADD COLUMN "calendar_seen_at"');
  });
});

const NOW = new Date('2026-11-02T10:00:00.000Z');
const H = 3_600_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const alive = () => true;
const base = { cancelledAt: null, gameId: null, gameCode: null } as const;

describe('calendarState', () => {
  it('planned before the start', () => {
    expect(calendarState({ ...base, startsAt: at(H) }, NOW, noRooms, false)).toBe('planned');
  });
  it('missed exactly six hours after the start, not a millisecond earlier', () => {
    expect(calendarState({ ...base, startsAt: at(-6 * H + 1) }, NOW, noRooms, false)).toBe('planned');
    expect(calendarState({ ...base, startsAt: at(-6 * H) }, NOW, noRooms, false)).toBe('missed');
  });
  it('open with a live room even past the edge', () => {
    expect(calendarState({ ...base, gameId: 'g', gameCode: 'C', startsAt: at(-7 * H) }, NOW, alive, false)).toBe('open');
  });
  it('played beats open', () => {
    expect(calendarState({ ...base, gameId: 'g', gameCode: 'C', startsAt: at(-7 * H) }, NOW, alive, true)).toBe('played');
  });
  it('cancelled beats everything', () => {
    expect(calendarState({ ...base, cancelledAt: NOW, gameId: 'g', gameCode: 'C', startsAt: at(-7 * H) }, NOW, alive, true)).toBe('cancelled');
  });
  it('back to planned when the room is gone', () => {
    expect(calendarState({ ...base, gameId: 'g', gameCode: 'C', startsAt: at(H) }, NOW, noRooms, false)).toBe('planned');
  });
});

describe('startsAtAllowed', () => {
  it('bounds the time', () => {
    const day = 86_400_000;
    expect(startsAtAllowed(NOW, NOW)).toBe(false);
    expect(startsAtAllowed(at(1), NOW)).toBe(true);
    expect(startsAtAllowed(at(365 * day), NOW)).toBe(true);
    expect(startsAtAllowed(at(365 * day + 1), NOW)).toBe(false);
  });
});

describe('calendar store', () => {
  let h: string, o: string, p: string, v: string, quizId: string;
  const input = (over: Partial<{ title: string; startsAt: string; quizId: string }> = {}) => ({
    title: 'Вечір загадок',
    startsAt: '2026-11-07T17:00:00.000Z',
    quizId,
    ...over,
  });
  const create = async (over = {}) => {
    const r = await createEvent(db, h, input(over), NOW);
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };

  beforeAll(async () => {
    [h, o, p, v] = [await person(), await person(), await person(), await person()];
    await db.insert(follow).values([
      { followerId: h, followeeId: o },
      { followerId: h, followeeId: p },
      { followerId: v, followeeId: h },
    ]);
    quizId = await createQuiz(db, h, { ...makeQuiz([single]), title: 'Писанки' });
  });

  it('creates an event and its planned feed row', async () => {
    const id = await create();
    const [row] = await db.select().from(feedEvent).where(eq(feedEvent.key, `planned:${id}`));
    expect(row.kind).toBe('planned');
    expect(row.userId).toBe(h);
    expect(row.data).toEqual({ kind: 'planned', eventId: id, title: 'Вечір загадок', startsAt: '2026-11-07T17:00:00.000Z' });
  });

  it('refuses a foreign quiz and a past time', async () => {
    const other = await createQuiz(db, o, { ...makeQuiz([single]), title: 'Чужа' });
    expect(await createEvent(db, h, input({ quizId: other }), NOW)).toEqual({ ok: false, error: 'quiz_not_found' });
    expect(await createEvent(db, h, input({ startsAt: '2026-11-01T10:00:00.000Z' }), NOW)).toEqual({ ok: false, error: 'calendar_time' });
  });

  it('shows the event to the host and to the people the host follows, not to others', async () => {
    const id = await create();
    for (const viewer of [o, p]) {
      const ev = (await listCalendar(db, viewer, NOW, noRooms)).events.find((e) => e.id === id)!;
      expect(ev).toMatchObject({ mine: false, quiz: { id: null, title: 'Писанки' }, requests: null, joinCode: null, state: 'planned' });
    }
    const own = (await listCalendar(db, h, NOW, noRooms)).events.find((e) => e.id === id)!;
    expect(own.mine).toBe(true);
    expect(own.quiz.id).toBe(quizId);
    expect(own.requests).toEqual([]);
    expect((await listCalendar(db, v, NOW, noRooms)).events).toEqual([]);
    expect(await calendarEventFor(db, v, id, NOW, noRooms)).toBeNull();
    expect(await calendarEventFor(db, o, 'nope', NOW, noRooms)).toBeNull();
    await db.delete(follow).where(and(eq(follow.followerId, h), eq(follow.followeeId, o)));
    expect((await listCalendar(db, o, NOW, noRooms)).events).toEqual([]);
    await db.insert(follow).values({ followerId: h, followeeId: o });
  });

  it('windows by six hours unless a live room holds the event, ordered by start', async () => {
    const old = await create();
    await db.update(calendarEvent).set({ startsAt: at(-7 * H) }).where(eq(calendarEvent.id, old));
    expect((await listCalendar(db, o, NOW, noRooms)).events.map((e) => e.id)).not.toContain(old);
    await attachGame(db, old, '11111111-1111-4111-8111-111111111111', 'ABCD');
    const open = (await listCalendar(db, o, NOW, alive)).events.find((e) => e.id === old)!;
    expect(open.state).toBe('open');
    expect(open.joinCode).toBeNull();
    expect((await listCalendar(db, h, NOW, alive)).events.find((e) => e.id === old)!.joinCode).toBe('ABCD');
    const starts = (await listCalendar(db, o, NOW, alive)).events.map((e) => e.startsAt);
    expect(starts).toEqual([...starts].sort());
  });

  it('edits only a planned event and keeps the feed row created_at', async () => {
    const id = await create();
    const [before] = await db.select().from(feedEvent).where(eq(feedEvent.key, `planned:${id}`));
    const later = at(H);
    expect(await updateEvent(db, h, id, input({ title: 'Новий', startsAt: '2026-11-08T17:00:00.000Z' }), later, noRooms)).toEqual({ ok: true });
    const [row] = await db.select().from(calendarEvent).where(eq(calendarEvent.id, id));
    expect(row.editedAt).toEqual(later);
    const [after] = await db.select().from(feedEvent).where(eq(feedEvent.key, `planned:${id}`));
    expect(after.data).toMatchObject({ title: 'Новий', startsAt: '2026-11-08T17:00:00.000Z' });
    expect(after.createdAt).toEqual(before.createdAt);
    expect(await updateEvent(db, o, id, input(), later, noRooms)).toEqual({ ok: false, error: 'not_found' });
    await attachGame(db, id, '22222222-2222-4222-8222-222222222222', 'WXYZ');
    expect(await updateEvent(db, h, id, input(), later, alive)).toEqual({ ok: false, error: 'event_locked' });
    const missed = await create();
    await db.update(calendarEvent).set({ startsAt: at(-6 * H) }).where(eq(calendarEvent.id, missed));
    expect(await updateEvent(db, h, missed, input(), NOW, noRooms)).toEqual({ ok: false, error: 'event_locked' });
  });

  it('cancels once, drops the planned row and hides it from friends without a request', async () => {
    const id = await create();
    expect(await cancelEvent(db, h, id, NOW, noRooms)).toEqual({ ok: true, changed: true });
    const [row] = await db.select().from(calendarEvent).where(eq(calendarEvent.id, id));
    expect(row.cancelledAt).toEqual(NOW);
    expect(await db.select().from(feedEvent).where(eq(feedEvent.key, `planned:${id}`))).toHaveLength(0);
    expect(await cancelEvent(db, h, id, NOW, noRooms)).toEqual({ ok: true, changed: false });
    expect((await listCalendar(db, h, NOW, noRooms)).events.find((e) => e.id === id)?.state).toBe('cancelled');
    expect((await listCalendar(db, o, NOW, noRooms)).events.map((e) => e.id)).not.toContain(id);
    await db.insert(calendarRequest).values({ eventId: id, userId: p, status: 'pending', requestedAt: NOW });
    expect((await listCalendar(db, p, NOW, noRooms)).events.map((e) => e.id)).toContain(id);
    expect(await cancelEvent(db, o, id, NOW, noRooms)).toEqual({ ok: false, error: 'not_found' });
  });

  it('refuses to cancel a played event', async () => {
    const id = await create();
    await attachGame(db, id, '33333333-3333-4333-8333-333333333333', 'PLAY');
    await db.execute(
      sql`insert into game (id, host_id, code, status, title, quiz_snapshot, started_at, finished_at) values ('33333333-3333-4333-8333-333333333333', ${h}, 'PLAY', 'finished', 'x', '{}'::jsonb, now(), now())`,
    );
    expect(await cancelEvent(db, h, id, NOW, noRooms)).toEqual({ ok: false, error: 'event_locked' });
  });

  it('lists an event at +6h-1ms and drops it at exactly +6h', async () => {
    const id = await create();
    await db.update(calendarEvent).set({ startsAt: at(-6 * H + 1) }).where(eq(calendarEvent.id, id));
    expect((await listCalendar(db, o, NOW, noRooms)).events.map((e) => e.id)).toContain(id);
    await db.update(calendarEvent).set({ startsAt: at(-6 * H) }).where(eq(calendarEvent.id, id));
    expect((await listCalendar(db, o, NOW, noRooms)).events.map((e) => e.id)).not.toContain(id);
  });

  it('does not return an old played event that has a room', async () => {
    const id = await create();
    const gid = '44444444-4444-4444-8444-444444444444';
    await db.update(calendarEvent).set({ startsAt: at(-7 * H) }).where(eq(calendarEvent.id, id));
    await attachGame(db, id, gid, 'OLDP');
    await db.execute(
      sql`insert into game (id, host_id, code, status, title, quiz_snapshot, started_at, finished_at) values (${gid}::uuid, ${h}, 'OLDP', 'finished', 'x', '{}'::jsonb, now(), now())`,
    );
    expect((await listCalendar(db, o, NOW, alive)).events.map((e) => e.id)).not.toContain(id);
  });

  it('shows a deleted quiz as a null title', async () => {
    const q = await createQuiz(db, h, { ...makeQuiz([single]), title: 'Зникне' });
    const id = await create({ quizId: q });
    await db.delete(quiz).where(eq(quiz.id, q));
    expect((await listCalendar(db, o, NOW, noRooms)).events.find((e) => e.id === id)!.quiz.title).toBeNull();
  });
});
