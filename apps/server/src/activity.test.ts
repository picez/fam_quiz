import { BOT_USER_ID } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { EDITOR_DAY_MAX_SEC, addEditorTime, markActiveDay } from './activity';
import type { Db } from './db/client';
import { activityDay, profile, user } from './db/schema';
import { touchSeen } from './profiles';
import { createTestDb } from './testing/test-db';

const NOW = new Date('2026-11-20T10:00:00.000Z');
let db: Db;
const queries: string[] = [];
let n = 0;

async function person(): Promise<string> {
  n += 1;
  const id = `u-${n}`;
  await db.insert(user).values({ id, name: `Людина ${n}`, email: `${id}@example.com` });
  return id;
}
const daysOf = (userId: string) =>
  db.select({ day: activityDay.day, sec: activityDay.editorSec, sessions: activityDay.editorSessions }).from(activityDay).where(eq(activityDay.userId, userId));

beforeAll(async () => {
  db = await createTestDb({ onQuery: (query) => queries.push(query) });
});

describe('markActiveDay (71)', () => {
  it('one row per Kyiv day, twice is the same', async () => {
    const id = await person();
    await markActiveDay(db, id, NOW);
    await markActiveDay(db, id, NOW);
    expect(await daysOf(id)).toEqual([{ day: '2026-11-20', sec: 0, sessions: 0 }]);
  });

  it('the day is Kyiv, not UTC', async () => {
    const id = await person();
    await markActiveDay(db, id, new Date('2026-11-21T23:30:00.000Z'));
    expect(await daysOf(id)).toEqual([{ day: '2026-11-22', sec: 0, sessions: 0 }]);
  });

  it('the bot is not a person', async () => {
    await markActiveDay(db, BOT_USER_ID, NOW);
    expect(await daysOf(BOT_USER_ID)).toEqual([]);
  });
});

describe('addEditorTime (71)', () => {
  it('adds seconds and sessions, the day cap holds', async () => {
    const id = await person();
    await addEditorTime(db, id, { seconds: 300, start: true }, NOW);
    expect(await daysOf(id)).toEqual([{ day: '2026-11-20', sec: 300, sessions: 1 }]);
    await addEditorTime(db, id, { seconds: 600, start: false }, NOW);
    expect(await daysOf(id)).toEqual([{ day: '2026-11-20', sec: 900, sessions: 1 }]);
    for (let i = 0; i < 100; i += 1) await addEditorTime(db, id, { seconds: 600, start: false }, NOW);
    expect(await daysOf(id)).toEqual([{ day: '2026-11-20', sec: EDITOR_DAY_MAX_SEC, sessions: 1 }]);
  });

  it('a visit row of the day gets the editor time', async () => {
    const id = await person();
    await markActiveDay(db, id, NOW);
    await addEditorTime(db, id, { seconds: 60, start: true }, NOW);
    expect(await daysOf(id)).toEqual([{ day: '2026-11-20', sec: 60, sessions: 1 }]);
  });

  it('the bot writes nothing', async () => {
    await addEditorTime(db, BOT_USER_ID, { seconds: 60, start: true }, NOW);
    expect(await daysOf(BOT_USER_ID)).toEqual([]);
  });
});

describe('touchSeen (71)', () => {
  it('marks the day when the seen mark moves, and does not even try within the same minute', async () => {
    const id = await person();
    await db.insert(profile).values({ userId: id, nickname: `Нік ${id}`, nicknameKey: `нік ${id}` });
    await touchSeen(db, id);
    expect(await daysOf(id)).toHaveLength(1);

    queries.length = 0;
    await touchSeen(db, id);
    expect(queries.some((query) => query.includes('insert into "activity_day"'))).toBe(false);
    expect(await daysOf(id)).toHaveLength(1);
  });
});
