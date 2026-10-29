import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { createTestDb, createTestDbUpTo } from '../testing/test-db';
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

describe('one answer row per blitz attempt (migration 0003)', () => {
  it('migration 0003 keeps existing answers as attempt 0', async () => {
    const { answer } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0002_rounds');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const participantId = '22222222-2222-4222-8222-222222222222';
    await db.execute(sql`
      INSERT INTO "game" ("id", "host_id", "code", "status", "title", "quiz_snapshot", "questions_played", "started_at")
      VALUES ('11111111-1111-4111-8111-111111111111', 'u1', '123456', 'finished', 'Гра', ${JSON.stringify(makeQuiz([single]))}::jsonb, 1, now())`);
    await db.execute(sql`
      INSERT INTO "participant" ("id", "game_id", "nickname", "score", "total_time_ms")
      VALUES (${participantId}, '11111111-1111-4111-8111-111111111111', 'Тарас', 1000, 3000)`);
    await db.execute(sql`
      INSERT INTO "answer" ("participant_id", "question_index", "payload", "time_ms", "accepted", "points", "overridden")
      VALUES (${participantId}, 0, '{"type":"single","optionId":"b"}'::jsonb, 3000, true, 1000, false)`);

    await migrateRest();

    const [kept] = await db.select().from(answer);
    expect(kept).toMatchObject({ participantId, questionIndex: 0, attempt: 0, payload: { type: 'single', optionId: 'b' }, points: 1000 });
    // Нові спроби того самого гравця на те саме запитання лягають поруч, порожня відповідь дозволена.
    await db.insert(answer).values({ participantId, questionIndex: 0, attempt: 1, payload: null, timeMs: 0, accepted: false, points: 0, overridden: false });
    expect(await db.select().from(answer)).toHaveLength(2);
    await expect(
      db.insert(answer).values({ participantId, questionIndex: 0, attempt: 1, payload: null, timeMs: 0, accepted: false, points: 0, overridden: false }),
    ).rejects.toThrow();
  });
});

describe('profiles schema (migration 0004)', () => {
  it('removing a user removes their profile and every follow both ways', async () => {
    const { follow, profile } = await import('./schema');
    const db = await createTestDb();
    for (const id of ['u1', 'u2', 'u3']) await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
    await db.insert(profile).values([
      { userId: 'u1', nickname: 'Один', nicknameKey: 'один' },
      { userId: 'u2', nickname: 'Два', nicknameKey: 'два' },
    ]);
    await db.insert(follow).values([
      { followerId: 'u1', followeeId: 'u2' },
      { followerId: 'u2', followeeId: 'u1' },
      { followerId: 'u3', followeeId: 'u2' },
    ]);

    await db.delete(user).where(eq(user.id, 'u2'));

    expect((await db.select().from(profile)).map((row) => row.userId)).toEqual(['u1']);
    expect(await db.select().from(follow)).toEqual([]);
  });

  it('the profiles migration applies over an existing database', async () => {
    const { ensureProfile } = await import('../profiles');
    const { db, migrateRest } = await createTestDbUpTo('0003_blitz_attempts');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });

    await migrateRest();

    expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена', avatar: null });
  });
});

describe('short default nicknames (migration 0005)', () => {
  it('migration 0005 recreates only profiles nobody saved', async () => {
    const { follow, profile } = await import('./schema');
    const { ensureProfile, nicknameKey } = await import('../profiles');
    const { db, migrateRest } = await createTestDbUpTo('0004_profiles');
    for (const [id, name] of [
      ['u1', 'Олена Петренко'],
      ['u2', 'Тарас Шевченко'],
      ['u3', 'Віра Коваль'],
    ]) {
      await db.insert(user).values({ id, name, email: `${id}@example.com` });
    }
    // Сирий SQL: схема drizzle вже знає стовпці пізніших міграцій (0017), а база — ще ні.
    const row = (userId: string, nickname: string) => sql`(${userId}, ${nickname}, ${nicknameKey(nickname)})`;
    // u1 — створений за старим правилом і не збережений; u2 — збережений з тим самим повним ім'ям; u3 — з аватаром.
    await db.execute(
      sql`INSERT INTO "profile" ("user_id", "nickname", "nickname_key") VALUES ${sql.join([row('u1', 'Олена Петренко'), row('u2', 'Тарас Шевченко'), row('u3', 'Віра Коваль')], sql`, `)}`,
    );
    await db.update(profile).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(profile.userId, 'u2'));
    await db.update(profile).set({ avatar: '/uploads/abcdefabcdefabcd.png' }).where(eq(profile.userId, 'u3'));
    await db.insert(follow).values({ followerId: 'u2', followeeId: 'u1' });

    await migrateRest();

    expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Олена');
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Тарас Шевченко');
    expect((await ensureProfile(db, 'u3'))?.nickname).toBe('Віра Коваль');
    expect(await db.select().from(follow)).toHaveLength(1);
  });
});

describe('score adjustments (migration 0006)', () => {
  it('an old database migrates to score adjustments and keeps its games', async () => {
    const { hostGame } = await import('../history');
    const { db, migrateRest } = await createTestDbUpTo('0005_short_default_nicknames');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const gameId = '11111111-1111-4111-8111-111111111111';
    const participantId = '22222222-2222-4222-8222-222222222222';
    await db.execute(sql`
      INSERT INTO "game" ("id", "host_id", "code", "status", "title", "quiz_snapshot", "questions_played", "started_at")
      VALUES (${gameId}, 'u1', '123456', 'finished', 'Гра', ${JSON.stringify(makeQuiz([single]))}::jsonb, 1, now())`);
    await db.execute(sql`
      INSERT INTO "participant" ("id", "game_id", "nickname", "score", "total_time_ms", "rank")
      VALUES (${participantId}, ${gameId}, 'Тарас', 1000, 3000, 1)`);
    await db.execute(sql`
      INSERT INTO "answer" ("participant_id", "question_index", "payload", "time_ms", "accepted", "points", "overridden")
      VALUES (${participantId}, 0, '{"type":"single","optionId":"b"}'::jsonb, 3000, true, 1000, false)`);

    await migrateRest();

    const after = await hostGame(db, 'u1', gameId);
    // 11f: колонки й розбивка старої гри — з її рядків answer.
    expect(after?.standings).toEqual([
      {
        participantId,
        nickname: 'Тарас',
        score: 1000,
        rank: 1,
        correct: 1,
        rounds: [1000],
        breakdown: { parts: [{ source: 'answers', plus: 1000, minus: 0 }], plus: 1000, minus: 0 },
      },
    ]);
    expect(after?.adjustments).toEqual([]);
    expect(after?.questions).toMatchObject([{ index: 0, roundIndex: 0, answered: 1, accepted: 1 }]);
  });

  it('migration 0011 adds the purchase columns and keeps old adjustments', async () => {
    const { scoreAdjustment } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0010_live_rooms');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const gameId = '11111111-1111-4111-8111-111111111111';
    const participantId = '22222222-2222-4222-8222-222222222222';
    await db.execute(sql`
      INSERT INTO "game" ("id", "host_id", "code", "status", "title", "quiz_snapshot", "questions_played", "started_at")
      VALUES (${gameId}, 'u1', '123456', 'finished', 'Гра', ${JSON.stringify(makeQuiz([single]))}::jsonb, 1, now())`);
    await db.execute(sql`
      INSERT INTO "participant" ("id", "game_id", "nickname", "score", "total_time_ms", "rank")
      VALUES (${participantId}, ${gameId}, 'Тарас', 900, 3000, 1)`);
    await db.execute(sql`
      INSERT INTO "score_adjustment" ("participant_id", "seq", "round_index", "after_question", "points", "source")
      VALUES (${participantId}, 1, 0, 0, -100, 'host')`);

    await migrateRest();

    expect(await db.select().from(scoreAdjustment)).toEqual([
      { participantId, seq: 1, roundIndex: 0, afterQuestion: 0, points: -100, source: 'host', debuff: null, targetNickname: null, undoesQuestion: null, undoesSeq: null },
    ]);
  });

  it('adjustments go together with their participant', async () => {
    const { game, participant, scoreAdjustment } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const gameId = '11111111-1111-4111-8111-111111111111';
    const participantId = '22222222-2222-4222-8222-222222222222';
    await db.insert(game).values({ id: gameId, hostId: 'u1', code: '123456', status: 'running', title: 'Гра', quizSnapshot: makeQuiz([single]), startedAt: new Date() });
    await db.insert(participant).values({ id: participantId, gameId, nickname: 'Тарас', score: -100, totalTimeMs: 0 });
    await db.insert(scoreAdjustment).values({ participantId, seq: 1, roundIndex: 0, afterQuestion: 0, points: -100, source: 'host' });
    await expect(db.insert(scoreAdjustment).values({ participantId, seq: 1, roundIndex: 0, afterQuestion: 0, points: 50, source: 'host' })).rejects.toThrow();

    await db.delete(participant).where(eq(participant.id, participantId));
    expect(await db.select().from(scoreAdjustment)).toEqual([]);
  });
});

describe('live rooms schema', () => {
  it('stores a saved room as JSON and finds it by code', async () => {
    const { liveRoom } = await import('./schema');
    const db = await createTestDb();
    const roomId = '33333333-3333-4333-8333-333333333333';
    const data = { v: 1, code: '123456', state: { phase: 'question', endsAt: 1_000_000, players: [] } };
    await db.insert(liveRoom).values({ code: '123456', roomId, data, owner: 'a', heartbeatAt: new Date(), updatedAt: new Date() });
    const [row] = await db.select().from(liveRoom).where(eq(liveRoom.code, '123456'));
    expect(row.data).toEqual(data);
    expect(row.owner).toBe('a');
    await expect(db.insert(liveRoom).values({ code: '654321', roomId, data, updatedAt: new Date() })).rejects.toThrow();
  });

  it('the migration adds the table to a database from before 9b', async () => {
    const { db, migrateRest } = await createTestDbUpTo('0009_answer_spares');
    await migrateRest();
    const { liveRoom } = await import('./schema');
    expect(await db.select().from(liveRoom)).toEqual([]);
  });
});

describe('teams schema (migration 0012)', () => {
  const gameId = '11111111-1111-4111-8111-111111111111';
  const teamId = '22222222-2222-4222-8222-222222222222';
  const memberId = '33333333-3333-4333-8333-333333333333';

  it('migration 0012 keeps old participants as solo rows: not a team, no team', async () => {
    const { participant } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0011_debuff_purchases');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    await db.execute(sql`
      INSERT INTO "game" ("id", "host_id", "code", "status", "title", "quiz_snapshot", "questions_played", "started_at")
      VALUES (${gameId}, 'u1', '123456', 'finished', 'Гра', ${JSON.stringify(makeQuiz([single]))}::jsonb, 1, now())`);
    await db.execute(sql`
      INSERT INTO "participant" ("id", "game_id", "nickname", "score", "total_time_ms", "rank")
      VALUES (${memberId}, ${gameId}, 'Тарас', 900, 3000, 1)`);

    await migrateRest();

    expect(await db.select().from(participant)).toEqual([
      { id: memberId, gameId, nickname: 'Тарас', userId: null, score: 900, totalTimeMs: 3000, rank: 1, isTeam: false, teamId: null },
    ]);
  });

  it('removing a team row removes the rows of its members', async () => {
    const { game, participant } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    await db.insert(game).values({ id: gameId, hostId: 'u1', code: '123456', status: 'running', title: 'Гра', quizSnapshot: makeQuiz([single]), startedAt: new Date() });
    await db.insert(participant).values({ id: teamId, gameId, nickname: 'Червоні', score: 0, totalTimeMs: 0, isTeam: true });
    await db.insert(participant).values({ id: memberId, gameId, nickname: 'Олена', userId: 'u1', score: 0, totalTimeMs: 0, teamId });
    expect((await db.select().from(participant)).map((p) => [p.nickname, p.isTeam, p.teamId])).toEqual(
      expect.arrayContaining([
        ['Червоні', true, null],
        ['Олена', false, teamId],
      ]),
    );

    await db.delete(participant).where(eq(participant.id, teamId));
    expect(await db.select().from(participant)).toEqual([]);
  });
});

describe('achievements schema (migration 0017)', () => {
  const gameId = '11111111-1111-4111-8111-111111111111';
  const participantId = '22222222-2222-4222-8222-222222222222';

  it('migration 0017 lays over an older database: old answers get three nulls, the profile is not synced, no achievements yet', async () => {
    const { answer, profile, userAchievement } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0016_appeal');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    await db.execute(sql`INSERT INTO "profile" ("user_id", "nickname", "nickname_key") VALUES ('u1', 'Олена', 'олена')`);
    await db.execute(sql`
      INSERT INTO "game" ("id", "host_id", "code", "status", "title", "quiz_snapshot", "questions_played", "started_at")
      VALUES (${gameId}, 'u1', '123456', 'finished', 'Гра', ${JSON.stringify(makeQuiz([single]))}::jsonb, 1, now())`);
    await db.execute(sql`
      INSERT INTO "participant" ("id", "game_id", "nickname", "user_id", "score", "total_time_ms")
      VALUES (${participantId}, ${gameId}, 'Олена', 'u1', 1000, 3000)`);
    await db.execute(sql`
      INSERT INTO "answer" ("participant_id", "question_index", "payload", "time_ms", "accepted", "points", "overridden")
      VALUES (${participantId}, 0, '{"type":"single","optionId":"b"}'::jsonb, 3000, true, 1000, false)`);

    await migrateRest();

    const [kept] = await db.select().from(answer);
    expect(kept).toMatchObject({ participantId, points: 1000, debuff: null, clue: null, answeredBy: null });
    const [own] = await db.select().from(profile);
    expect(own.achievementsSyncedAt).toBeNull();
    expect(await db.select().from(userAchievement)).toEqual([]);
  });

  it('one row per user and achievement; it goes with the user, the game only clears its link', async () => {
    const { game, userAchievement } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    await db.insert(game).values({ id: gameId, hostId: 'u1', code: '123456', status: 'finished', title: 'Гра', quizSnapshot: makeQuiz([single]), startedAt: new Date() });
    const earnedAt = new Date('2026-10-29T10:00:00Z');
    await db.insert(userAchievement).values([
      { userId: 'u1', achievementId: 'first_game', earnedAt, gameId },
      { userId: 'u1', achievementId: 'games_10', earnedAt: null, gameId: null },
    ]);
    await expect(db.insert(userAchievement).values({ userId: 'u1', achievementId: 'first_game' })).rejects.toThrow();

    await db.delete(game).where(eq(game.id, gameId));
    expect((await db.select().from(userAchievement)).map((r) => [r.achievementId, r.earnedAt, r.gameId])).toEqual(
      expect.arrayContaining([
        ['first_game', earnedAt, null],
        ['games_10', null, null],
      ]),
    );
    await db.delete(user).where(eq(user.id, 'u1'));
    expect(await db.select().from(userAchievement)).toEqual([]);
  });
});
