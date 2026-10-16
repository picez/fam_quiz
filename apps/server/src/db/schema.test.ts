import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { createTestDb } from '../testing/test-db';
import { quiz, user } from './schema';

describe('database schema', () => {
  it('stores a quiz with its rounds and settings and returns them unchanged', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const source = makeQuiz([single]);

    const [created] = await db
      .insert(quiz)
      .values({ ownerId: 'u1', title: source.title, description: '', settings: source.settings, rounds: source.rounds })
      .returning();

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    const [loaded] = await db.select().from(quiz).where(eq(quiz.id, created.id));
    expect(loaded.rounds).toEqual(source.rounds);
    expect(loaded.settings).toEqual(source.settings);
  });

  it('removes a user’s quizzes together with the user', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const source = makeQuiz([single]);
    await db.insert(quiz).values({ ownerId: 'u1', title: 'T', description: '', settings: source.settings, rounds: source.rounds });

    await db.delete(user).where(eq(user.id, 'u1'));
    expect(await db.select().from(quiz)).toEqual([]);
  });

  it('refuses two users with the same email', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'same@example.com' });
    await expect(db.insert(user).values({ id: 'u2', name: 'Тарас', email: 'same@example.com' })).rejects.toThrow();
  });
});

describe('game results schema', () => {
  it('removes participants and answers together with the game', async () => {
    const { answer, game, participant } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const gameId = '11111111-1111-4111-8111-111111111111';
    const playerId = '22222222-2222-4222-8222-222222222222';
    await db.insert(game).values({
      id: gameId,
      quizId: null,
      hostId: 'u1',
      code: '123456',
      status: 'running',
      title: 'Гра',
      quizSnapshot: makeQuiz([single]),
      startedAt: new Date(),
    });
    await db.insert(participant).values({ id: playerId, gameId, nickname: 'Тарас', score: 0, totalTimeMs: 0 });
    await db.insert(answer).values({
      participantId: playerId,
      questionIndex: 0,
      payload: { type: 'single', optionId: 'b' },
      timeMs: 1000,
      accepted: true,
      points: 1000,
      overridden: false,
    });

    await db.delete(game).where(eq(game.id, gameId));
    expect(await db.select().from(participant)).toEqual([]);
    expect(await db.select().from(answer)).toEqual([]);
  });

  it('keeps a played game when the player account is deleted', async () => {
    const { game, participant } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values([
      { id: 'host', name: 'Ведуча', email: 'host@example.com' },
      { id: 'player', name: 'Тарас', email: 'taras@example.com' },
    ]);
    const gameId = '11111111-1111-4111-8111-111111111111';
    await db.insert(game).values({ id: gameId, quizId: null, hostId: 'host', code: '123456', status: 'finished', title: 'Гра', quizSnapshot: makeQuiz([single]), startedAt: new Date() });
    await db.insert(participant).values({ id: '22222222-2222-4222-8222-222222222222', gameId, nickname: 'Тарас', userId: 'player', score: 10, totalTimeMs: 0 });

    await db.delete(user).where(eq(user.id, 'player'));
    const [row] = await db.select().from(participant);
    expect(row.userId).toBeNull();
    expect(row.nickname).toBe('Тарас');
  });
});
