import { makeQuiz, single } from '@quiz/engine/testing';
import { BOT_USER_ID } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { healthDb, healthProblems, liveBreakdown } from './admin-health';
import { ensureBotAccount } from './bot-account';
import type { Db } from './db/client';
import { problemReport, pushSubscription, quiz, serverError, user, userReport } from './db/schema';
import type { Room } from './rooms/manager';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

const NOW = new Date('2026-11-20T10:00:00.000Z');
const HOUR = 3_600_000;
const quizOne = makeQuiz([single]);

async function people(db: Db): Promise<[string, string]> {
  await ensureBotAccount(db);
  await db.insert(user).values([
    { id: 'h-1', name: 'Оля', email: 'h-1@example.com' },
    { id: 'h-2', name: 'Тарас', email: 'h-2@example.com' },
  ]);
  return ['h-1', 'h-2'];
}

describe('healthDb (71)', () => {
  it('counts rows without the bot, push subscriptions and people', async () => {
    const db = await createTestDb();
    const [olia, taras] = await people(db);
    await db.insert(quiz).values({ ownerId: olia, title: 'Карпати', description: '', settings: quizOne.settings, rounds: quizOne.rounds });
    await seedGame(db, {
      hostId: olia,
      startedAt: NOW,
      players: [
        { userId: olia, nickname: 'Оля', score: 1, rank: 1 },
        { userId: taras, nickname: 'Тарас', score: 0, rank: 2 },
      ],
    });
    await db.insert(pushSubscription).values({ endpoint: 'https://push.example/1', userId: olia, p256dh: 'k', auth: 'a', createdAt: NOW });

    const health = await healthDb(db);
    expect(health.rows).toMatchObject({ user: 2, quiz: 1, game: 1, participant: 2, answer: 0, game_event: 0, saved_game: 0, activity_day: 0 });
    expect(health.push).toEqual({ subscriptions: 1, people: 1 });
    expect(health.bytes === null || (typeof health.bytes === 'number' && health.bytes > 0)).toBe(true);
  });

  it('a failing database size is null, the rows are still there', async () => {
    const db = await createTestDb({
      onQuery: (query) => {
        if (query.includes('pg_database_size')) throw new Error('no size here');
      },
    });
    await people(db);
    const health = await healthDb(db);
    expect(health.bytes).toBeNull();
    expect(health.rows.user).toBe(2);
  });
});

describe('healthProblems (71)', () => {
  it('errors of the last 24 hours, new errors, open problem and content reports', async () => {
    const db = await createTestDb();
    const [olia, taras] = await people(db);
    const at = (ms: number) => new Date(NOW.getTime() - ms);
    await db.insert(serverError).values([
      { fingerprint: 'a', where: 'http', name: 'Error', message: 'boom', dayCount: 3, count: 5, dayStart: at(2 * HOUR), firstAt: at(40 * HOUR), lastAt: at(HOUR) },
      { fingerprint: 'b', where: 'http', name: 'Error', message: 'old', dayCount: 7, count: 7, dayStart: at(30 * HOUR), firstAt: at(30 * HOUR), lastAt: at(29 * HOUR) },
      { fingerprint: 'c', where: 'http', name: 'Error', message: 'done', dayCount: 2, count: 2, dayStart: at(HOUR), firstAt: at(HOUR), lastAt: at(HOUR), status: 'resolved' },
    ]);
    await db.insert(problemReport).values([
      { userId: olia, fromAccount: true, text: 'Зависла гра', createdAt: NOW },
      { userId: olia, fromAccount: true, text: 'Уже розібрали', status: 'resolved', createdAt: NOW },
    ]);
    await db.insert(userReport).values([
      { reporterId: olia, targetKind: 'profile', targetUserId: taras, reason: 'other' },
      { reporterId: taras, targetKind: 'profile', targetUserId: olia, reason: 'other', status: 'dismissed' },
    ]);

    expect(await healthProblems(db, NOW)).toEqual({ errors24h: 5, errorKinds24h: 2, errorsNew: 2, problemsOpen: 1, reportsOpen: 1 });
  });
});

describe('liveBreakdown (71)', () => {
  const room = (over: { phase: string; roundIndex?: number; paused?: boolean; autopilot?: object; host?: string | null; players?: number; online?: number }): Room => {
    const players = Array.from({ length: over.players ?? 0 }, (_, i) => ({ id: `p${i}` }));
    const connections = new Map(players.slice(0, over.online ?? 0).map((p) => [p.id, 1]));
    return {
      hostUserId: over.host ?? null,
      connections,
      state: { phase: over.phase, roundIndex: over.roundIndex ?? 0, paused: over.paused ?? false, autopilot: over.autopilot, players, quiz: { rounds: [{}] } },
    } as unknown as Room;
  };

  it('lobby, playing, paused, bot and autopilot rooms and players; finished rooms do not count', () => {
    const rooms = [
      room({ phase: 'lobby', host: 'u1', players: 2, online: 2 }),
      room({ phase: 'question', host: BOT_USER_ID, players: 3, online: 1 }),
      room({ phase: 'question', roundIndex: -1, host: 'u2', players: 1, online: 1 }),
      room({ phase: 'reveal', paused: true, host: 'u3', autopilot: { authorId: 'u3' }, players: 4, online: 0 }),
      room({ phase: 'finished', host: BOT_USER_ID, players: 5, online: 5 }),
    ];
    expect(liveBreakdown(rooms, 20, false)).toEqual({ lobby: 1, playing: 2, paused: 1, bot: 1, autopilot: 1, playersOnline: 4, playersTotal: 10, maxRooms: 20, restarting: false });
    expect(liveBreakdown([], 20, true)).toEqual({ lobby: 0, playing: 0, paused: 0, bot: 0, autopilot: 0, playersOnline: 0, playersTotal: 0, maxRooms: 20, restarting: true });
  });
});
