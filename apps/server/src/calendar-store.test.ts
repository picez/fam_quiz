import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeQuiz, single } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { calendarEvent, calendarRequest, quiz, user } from './db/schema';
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
