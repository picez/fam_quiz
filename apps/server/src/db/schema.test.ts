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

describe('anti-achievements schema (migration 0032)', () => {
  const gameId = '33333333-3333-4333-8333-333333333333';

  it('migration 0032 adds hide_anti = false and clears the history sync mark, earned achievements stay', async () => {
    const { profile, userAchievement } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0031_profile_looks');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    await db.execute(sql`INSERT INTO "profile" ("user_id", "nickname", "nickname_key", "achievements_synced_at") VALUES ('u1', 'Олена', 'олена', now())`);
    await db.execute(sql`
      INSERT INTO "game" ("id", "host_id", "code", "status", "title", "quiz_snapshot", "questions_played", "started_at")
      VALUES (${gameId}, 'u1', '123456', 'finished', 'Гра', ${JSON.stringify(makeQuiz([single]))}::jsonb, 1, now())`);
    await db.execute(sql`INSERT INTO "user_achievement" ("user_id", "achievement_id", "earned_at", "game_id") VALUES ('u1', 'first_game', now(), ${gameId})`);

    await migrateRest();

    const [own] = await db.select().from(profile);
    expect(own.hideAnti).toBe(false);
    expect(own.achievementsSyncedAt).toBeNull();
    expect((await db.select().from(userAchievement)).map((r) => [r.achievementId, r.gameId])).toEqual([['first_game', gameId]]);
  });
});

describe('groups (12k)', () => {
  const groupId = '44444444-4444-4444-8444-444444444444';

  async function seed() {
    const { familyGroup, groupMember } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values([
      { id: 'u1', name: 'Оля', email: 'olia@example.com' },
      { id: 'u2', name: 'Петро', email: 'petro@example.com' },
      { id: 'u3', name: 'Іра', email: 'ira@example.com' },
    ]);
    await db.insert(familyGroup).values({ id: groupId, name: 'Родина Квіткових', emoji: '🌻', inviteCode: 'abcdefghjk' });
    await db.insert(groupMember).values({ groupId, userId: 'u1', role: 'owner', joinedAt: new Date() });
    return db;
  }

  it('migration 0033 lays the four tables over an older database, old data stays', async () => {
    const { profile, userAchievement } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0032_anti_achievements');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    await db.execute(sql`INSERT INTO "profile" ("user_id", "nickname", "nickname_key") VALUES ('u1', 'Олена', 'олена')`);
    await db.execute(sql`INSERT INTO "user_achievement" ("user_id", "achievement_id", "earned_at") VALUES ('u1', 'first_game', now())`);

    await migrateRest();

    const { familyGroup, groupInvite, groupItem, groupMember } = await import('./schema');
    for (const table of [familyGroup, groupMember, groupInvite, groupItem]) expect(await db.select().from(table)).toEqual([]);
    expect((await db.select().from(profile)).map((r) => r.nickname)).toEqual(['Олена']);
    expect((await db.select().from(userAchievement)).map((r) => r.achievementId)).toEqual(['first_game']);
  });

  it('one owner per group, any number of members', async () => {
    const { groupMember } = await import('./schema');
    const db = await seed();
    await expect(db.insert(groupMember).values({ groupId, userId: 'u2', role: 'owner', joinedAt: new Date() })).rejects.toThrow();
    await db.insert(groupMember).values([
      { groupId, userId: 'u2', role: 'member', joinedAt: new Date() },
      { groupId, userId: 'u3', role: 'member', joinedAt: new Date() },
    ]);
    expect(await db.select().from(groupMember)).toHaveLength(3);
  });

  it('the join code is unique', async () => {
    const { familyGroup } = await import('./schema');
    const db = await seed();
    await expect(db.insert(familyGroup).values({ name: 'Друга', emoji: '👪', inviteCode: 'abcdefghjk' })).rejects.toThrow();
  });

  it('a record keeps defaults; a removed author leaves it without an author; a removed group takes everything', async () => {
    const { familyGroup, groupInvite, groupItem, groupMember } = await import('./schema');
    const db = await seed();
    await db.insert(groupMember).values({ groupId, userId: 'u2', role: 'member', joinedAt: new Date() });
    await db.insert(groupInvite).values({ groupId, userId: 'u3', invitedBy: 'u1', createdAt: new Date() });
    const [created] = await db.insert(groupItem).values({ groupId, authorId: 'u2', kind: 'story', text: 'Як тато заблукав у лісі по гриби' }).returning();
    expect(created.about).toEqual([]);
    expect(created.surprise).toBe(false);
    const [group] = await db.select().from(familyGroup);
    expect(group.description).toBe('');

    await db.delete(user).where(eq(user.id, 'u2'));
    const [kept] = await db.select().from(groupItem);
    expect(kept.authorId).toBeNull();
    expect((await db.select().from(groupMember)).map((r) => r.userId)).toEqual(['u1']);

    await db.delete(user).where(eq(user.id, 'u1'));
    expect((await db.select().from(groupInvite))[0].invitedBy).toBeNull();

    await db.delete(familyGroup).where(eq(familyGroup.id, groupId));
    expect(await db.select().from(groupMember)).toEqual([]);
    expect(await db.select().from(groupInvite)).toEqual([]);
    expect(await db.select().from(groupItem)).toEqual([]);
  });
});

describe('group item uses (12l)', () => {
  const groupId = '55555555-5555-4555-8555-555555555555';

  async function seed() {
    const { familyGroup, groupItem, groupMember } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Оля', email: 'olia@example.com' });
    await db.insert(familyGroup).values({ id: groupId, name: 'Родина Квіткових', emoji: '🌻', inviteCode: 'abcdefghjm' });
    await db.insert(groupMember).values({ groupId, userId: 'u1', role: 'owner', joinedAt: new Date() });
    const [item] = await db.insert(groupItem).values({ groupId, authorId: 'u1', kind: 'story', text: 'Як тато заблукав у лісі по гриби' }).returning();
    const source = makeQuiz([single]);
    const [made] = await db
      .insert(quiz)
      .values({ ownerId: 'u1', title: 'Вікторина: Родина Квіткових', description: '', settings: source.settings, rounds: source.rounds })
      .returning();
    return { db, itemId: item.id, quizId: made.id };
  }

  it('migration 0034 adds group_item_use over an older database, group records stay', async () => {
    const { db, migrateRest } = await createTestDbUpTo('0033_groups');
    await db.insert(user).values({ id: 'u1', name: 'Оля', email: 'olia@example.com' });
    await db.execute(sql`INSERT INTO "family_group" ("id", "name", "emoji", "invite_code") VALUES (${groupId}, 'Родина Квіткових', '🌻', 'abcdefghjm')`);
    await db.execute(sql`INSERT INTO "group_item" ("group_id", "author_id", "kind", "text") VALUES (${groupId}, 'u1', 'story', 'Як тато заблукав у лісі по гриби')`);
    const source = makeQuiz([single]);
    await db.insert(quiz).values({ ownerId: 'u1', title: 'T', description: '', settings: source.settings, rounds: source.rounds });

    await migrateRest();

    const { groupItem, groupItemUse } = await import('./schema');
    expect(await db.select().from(groupItemUse)).toEqual([]);
    expect((await db.select().from(groupItem)).map((r) => r.text)).toEqual(['Як тато заблукав у лісі по гриби']);
  });

  it('one mark per record and quiz', async () => {
    const { groupItemUse } = await import('./schema');
    const { db, itemId, quizId } = await seed();
    await db.insert(groupItemUse).values({ itemId, quizId, createdAt: new Date() });
    await expect(db.insert(groupItemUse).values({ itemId, quizId, createdAt: new Date() })).rejects.toThrow();
  });

  it('marks go with the quiz, the record or the group', async () => {
    const { familyGroup, groupItem, groupItemUse } = await import('./schema');
    let { db, itemId, quizId } = await seed();
    await db.insert(groupItemUse).values({ itemId, quizId, createdAt: new Date() });
    await db.delete(quiz).where(eq(quiz.id, quizId));
    expect(await db.select().from(groupItemUse)).toEqual([]);

    ({ db, itemId, quizId } = await seed());
    await db.insert(groupItemUse).values({ itemId, quizId, createdAt: new Date() });
    await db.delete(groupItem).where(eq(groupItem.id, itemId));
    expect(await db.select().from(groupItemUse)).toEqual([]);

    ({ db, itemId, quizId } = await seed());
    await db.insert(groupItemUse).values({ itemId, quizId, createdAt: new Date() });
    await db.delete(familyGroup).where(eq(familyGroup.id, groupId));
    expect(await db.select().from(groupItemUse)).toEqual([]);
  });
});

describe('easy mode column (31)', () => {
  it('migration 0035 adds profile.easy_mode = false to an existing profile, other fields stay', async () => {
    const { profile } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0034_group_item_use');
    await db.insert(user).values({ id: 'u1', name: 'Ганна', email: 'hanna@example.com' });
    await db.execute(sql`INSERT INTO "profile" ("user_id", "nickname", "nickname_key", "locale") VALUES ('u1', 'Ганна', 'ганна', 'uk')`);

    await migrateRest();

    const [row] = await db.select().from(profile);
    expect(row).toMatchObject({ userId: 'u1', nickname: 'Ганна', locale: 'uk', hideAnti: false, easyMode: false });
  });
});

describe('challenges (38a)', () => {
  const T = new Date('2026-11-18T10:00:00Z');
  const later = new Date('2026-11-25T10:00:00Z');

  async function seedChallenge() {
    const { challenge } = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values([
      { id: 'a', name: 'Автор', email: 'a@example.com' },
      { id: 'b', name: 'Гравець', email: 'b@example.com' },
    ]);
    const source = makeQuiz([single]);
    const [q] = await db
      .insert(quiz)
      .values({ ownerId: 'a', title: 'Q', description: '', settings: source.settings, rounds: source.rounds })
      .returning();
    const make = (over: Partial<typeof challenge.$inferInsert> = {}) => ({
      code: 'abcdefghjkmn',
      quizId: q.id,
      ownerId: 'a',
      title: 'Q',
      quizSnapshot: source,
      createdAt: T,
      expiresAt: later,
      ...over,
    });
    return { db, quizId: q.id, make, challenge };
  }

  it('migration 0038 lays the two tables over an older database, old data stays', async () => {
    const { challenge, challengeAttempt } = await import('./schema');
    const { game } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0037_cosmetics_34');
    await db.insert(user).values({ id: 'a', name: 'Автор', email: 'a@example.com' });
    const source = makeQuiz([single]);
    await db.insert(quiz).values({ ownerId: 'a', title: 'Q', description: '', settings: source.settings, rounds: source.rounds });
    await db.insert(game).values({
      id: '11111111-1111-4111-8111-111111111111',
      hostId: 'a',
      code: 'ABCD',
      status: 'finished',
      title: 'Q',
      quizSnapshot: source,
      startedAt: T,
    });

    await migrateRest();

    expect(await db.select().from(quiz)).toHaveLength(1);
    expect(await db.select().from(game)).toHaveLength(1);
    expect(await db.select().from(challenge)).toEqual([]);
    expect(await db.select().from(challengeAttempt)).toEqual([]);
  });

  it('one attempt per account', async () => {
    const { challengeAttempt } = await import('./schema');
    const { db, make, challenge } = await seedChallenge();
    const [c] = await db.insert(challenge).values(make()).returning();
    const attempt = (gameId: string) => ({ challengeId: c.id, userId: 'b', gameId, nickname: 'Б', startedAt: T });
    await db.insert(challengeAttempt).values(attempt('22222222-2222-4222-8222-222222222222'));
    await expect(db.insert(challengeAttempt).values(attempt('33333333-3333-4333-8333-333333333333'))).rejects.toThrow();
  });

  it('one open challenge per quiz; an ended one does not count', async () => {
    const { db, make, challenge, quizId } = await seedChallenge();
    await db.insert(challenge).values(make());
    await expect(db.insert(challenge).values(make({ code: 'bcdefghjkmnp' }))).rejects.toThrow();
    await db.update(challenge).set({ endedAt: T }).where(eq(challenge.quizId, quizId));
    await db.insert(challenge).values(make({ code: 'bcdefghjkmnp' }));
    await db.insert(challenge).values(make({ code: 'cdefghjkmnpq', endedAt: T }));
    expect(await db.select().from(challenge)).toHaveLength(3);
  });

  it('the code is unique', async () => {
    const { db, make, challenge } = await seedChallenge();
    await db.insert(challenge).values(make({ endedAt: T }));
    await expect(db.insert(challenge).values(make({ endedAt: T }))).rejects.toThrow();
  });

  it('deleting the quiz keeps the challenge with quiz_id null', async () => {
    const { db, make, challenge, quizId } = await seedChallenge();
    await db.insert(challenge).values(make());
    await db.delete(quiz).where(eq(quiz.id, quizId));
    const rows = await db.select().from(challenge);
    expect(rows).toHaveLength(1);
    expect(rows[0].quizId).toBeNull();
  });

  it('attempts go with the player account and with the challenge', async () => {
    const { challengeAttempt } = await import('./schema');
    const { db, make, challenge } = await seedChallenge();
    const [c] = await db.insert(challenge).values(make()).returning();
    await db.insert(challengeAttempt).values({ challengeId: c.id, userId: 'b', gameId: '22222222-2222-4222-8222-222222222222', nickname: 'Б', startedAt: T });
    await db.delete(user).where(eq(user.id, 'b'));
    expect(await db.select().from(challengeAttempt)).toEqual([]);

    await db.insert(user).values({ id: 'b', name: 'Гравець', email: 'b@example.com' });
    await db.insert(challengeAttempt).values({ challengeId: c.id, userId: 'b', gameId: '44444444-4444-4444-8444-444444444444', nickname: 'Б', startedAt: T });
    await db.delete(challenge).where(eq(challenge.id, c.id));
    expect(await db.select().from(challengeAttempt)).toEqual([]);
  });
});

describe('family league (38b)', () => {
  const T = new Date('2026-11-18T10:00:00Z');
  const G1 = '11111111-1111-4111-8111-111111111111';
  const G2 = '22222222-2222-4222-8222-222222222222';

  async function seedLeague() {
    const schema = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values([
      { id: 'a', name: 'А', email: 'a@example.com' },
      { id: 'b', name: 'Б', email: 'b@example.com' },
    ]);
    const [group] = await db
      .insert(schema.familyGroup)
      .values({ name: 'Родина', emoji: '🌻', inviteCode: 'abcdefghjk' })
      .returning();
    const point = (gameId: string, userId: string) => ({ gameId, userId, groupId: group.id, month: '2026-11', place: 1, points: 10, nickname: userId });
    return { db, schema, group, point };
  }

  it('migration 0039 lays the league tables over an older database, old data stays', async () => {
    const { game, familyGroup, groupMember, leagueGame, leaguePoint, leagueMonth, leagueChampion } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0038_challenges');
    await db.insert(user).values({ id: 'a', name: 'Автор', email: 'a@example.com' });
    const [group] = await db.insert(familyGroup).values({ name: 'Родина', emoji: '🌻', inviteCode: 'abcdefghjk' }).returning();
    await db.insert(groupMember).values({ groupId: group.id, userId: 'a', role: 'owner', joinedAt: T });
    const source = makeQuiz([single]);
    await db.insert(game).values({ id: G1, hostId: 'a', code: 'ABCD', status: 'finished', title: 'Q', quizSnapshot: source, startedAt: T });

    await migrateRest();

    expect(await db.select().from(familyGroup)).toHaveLength(1);
    expect(await db.select().from(groupMember)).toHaveLength(1);
    expect(await db.select().from(game)).toHaveLength(1);
    for (const table of [leagueGame, leaguePoint, leagueMonth, leagueChampion]) expect(await db.select().from(table)).toEqual([]);
  });

  it('one league row per game and one point row per account in a game', async () => {
    const { db, schema, group, point } = await seedLeague();
    const row = { gameId: G1, groupId: group.id, month: '2026-11', members: 3, counted: true };
    await db.insert(schema.leagueGame).values(row);
    await expect(db.insert(schema.leagueGame).values(row)).rejects.toThrow();
    await db.insert(schema.leaguePoint).values(point(G1, 'a'));
    await expect(db.insert(schema.leaguePoint).values(point(G1, 'a'))).rejects.toThrow();
    await db.insert(schema.leaguePoint).values(point(G1, 'b'));
  });

  it('deleting a group removes its league rows but keeps the champion title', async () => {
    const { db, schema, group, point } = await seedLeague();
    await db.insert(schema.leagueGame).values({ gameId: G1, groupId: group.id, month: '2026-11', members: 3, counted: true });
    await db.insert(schema.leaguePoint).values(point(G1, 'a'));
    await db.insert(schema.leagueMonth).values({ groupId: group.id, month: '2026-10', settledAt: T });
    await db.insert(schema.leagueChampion).values({ groupId: group.id, groupName: 'Родина', month: '2026-10', userId: 'a', points: 10 });

    await db.delete(schema.familyGroup).where(eq(schema.familyGroup.id, group.id));

    expect(await db.select().from(schema.leagueGame)).toEqual([]);
    expect(await db.select().from(schema.leaguePoint)).toEqual([]);
    expect(await db.select().from(schema.leagueMonth)).toEqual([]);
    const champions = await db.select().from(schema.leagueChampion);
    expect(champions).toHaveLength(1);
    expect(champions[0]).toMatchObject({ groupId: null, groupName: 'Родина', userId: 'a' });
  });

  it('deleting an account removes its points and titles; deleting a game row keeps the points', async () => {
    const { db, schema, group, point } = await seedLeague();
    await db.insert(schema.leaguePoint).values([point(G1, 'a'), point(G1, 'b'), point(G2, 'a')]);
    await db.insert(schema.leagueChampion).values({ groupId: group.id, groupName: 'Родина', month: '2026-10', userId: 'a', points: 10 });
    await db.insert(schema.game).values({ id: G2, hostId: 'b', code: 'ABCD', status: 'finished', title: 'Q', quizSnapshot: makeQuiz([single]), startedAt: T });

    await db.delete(schema.game).where(eq(schema.game.id, G2));
    expect(await db.select().from(schema.leaguePoint)).toHaveLength(3);

    await db.delete(user).where(eq(user.id, 'a'));
    const left = await db.select().from(schema.leaguePoint);
    expect(left.map((row) => row.userId)).toEqual(['b']);
    expect(await db.select().from(schema.leagueChampion)).toEqual([]);
  });
});

describe('library (38g)', () => {
  const T = new Date('2026-11-18T10:00:00Z');

  async function seedLibrary() {
    const schema = await import('./schema');
    const db = await createTestDb();
    await db.insert(user).values([
      { id: 'a', name: 'Автор', email: 'a@example.com' },
      { id: 'b', name: 'Гравець', email: 'b@example.com' },
      { id: 'c', name: 'Третій', email: 'c@example.com' },
    ]);
    const source = makeQuiz([single]);
    const addQuiz = async (ownerId: string) => {
      const [row] = await db
        .insert(quiz)
        .values({ ownerId, title: 'Річки', description: '', settings: source.settings, rounds: source.rounds })
        .returning();
      return row.id;
    };
    const entryOf = (quizId: string, ownerId = 'a') => ({
      quizId,
      ownerId,
      title: 'Річки',
      description: '',
      language: 'uk' as const,
      snapshot: source,
      questionCount: 1,
      roundTypes: ['classic' as const],
      listed: true,
      openedAt: T,
      updatedAt: T,
    });
    return { db, schema, source, addQuiz, entryOf };
  }

  it('migration 0040 lays the library tables over an older database, old data stays', async () => {
    const { userLike, adminAction, libraryEntry, libraryCopy, userReport } = await import('./schema');
    const { db, migrateRest } = await createTestDbUpTo('0039_family_league');
    await db.insert(user).values([
      { id: 'a', name: 'Автор', email: 'a@example.com' },
      { id: 'b', name: 'Гравець', email: 'b@example.com' },
    ]);
    const source = makeQuiz([single]);
    const [q] = await db.insert(quiz).values({ ownerId: 'a', title: 'Q', description: '', settings: source.settings, rounds: source.rounds }).returning();
    await db.insert(userLike).values({ userId: 'b', kind: 'quiz', targetUserId: 'a', quizId: q.id, createdAt: T });
    await db.insert(adminAction).values({ at: T, adminId: 'a', adminLabel: 'Автор', kind: 'ban', targetUserId: 'b', targetLabel: 'Гравець', details: {} });

    await migrateRest();

    expect(await db.select().from(quiz)).toHaveLength(1);
    expect(await db.select().from(userLike)).toHaveLength(1);
    expect(await db.select().from(adminAction)).toHaveLength(1);
    for (const table of [libraryEntry, libraryCopy, userReport]) expect(await db.select().from(table)).toEqual([]);
    const indexes = await db.execute(sql`select indexname from pg_indexes where tablename = 'game'`);
    expect(JSON.stringify(indexes)).toContain('game_quiz_idx');
  });

  it('one entry per quiz, one open report per account and object', async () => {
    const { db, schema, addQuiz, entryOf } = await seedLibrary();
    const q = await addQuiz('a');
    const [entry] = await db.insert(schema.libraryEntry).values(entryOf(q)).returning();
    expect(entry.moderation).toBe('ok');
    expect(entry.appealOpen).toBe(false);
    await expect(db.insert(schema.libraryEntry).values(entryOf(q))).rejects.toThrow();

    const report = { reporterId: 'b', targetKind: 'quiz' as const, entryId: entry.id, targetUserId: 'a', reason: 'spam' as const };
    const [first] = await db.insert(schema.userReport).values(report).returning();
    expect(first.status).toBe('open');
    await expect(db.insert(schema.userReport).values(report)).rejects.toThrow();
    await db.update(schema.userReport).set({ status: 'dismissed' }).where(eq(schema.userReport.id, first.id));
    await db.insert(schema.userReport).values(report);

    const profileReport = { reporterId: 'b', targetKind: 'profile' as const, targetUserId: 'c', reason: 'offensive' as const };
    await db.insert(schema.userReport).values(profileReport);
    await expect(db.insert(schema.userReport).values(profileReport)).rejects.toThrow();
    await db.insert(schema.userReport).values({ ...profileReport, reporterId: 'a' });
  });

  it('deleting quizzes and accounts cleans the library rows', async () => {
    const { db, schema, addQuiz, entryOf } = await seedLibrary();
    const original = await addQuiz('a');
    const copied = await addQuiz('b');
    const [entry] = await db.insert(schema.libraryEntry).values(entryOf(original)).returning();
    await db.insert(schema.libraryCopy).values({ entryId: entry.id, userId: 'b', quizId: copied, authorLine: 'Автор: Автор', at: T });
    await db.insert(schema.userReport).values({ reporterId: 'c', targetKind: 'quiz', entryId: entry.id, targetUserId: 'a', reason: 'spam' });

    // Видалення вікторини-копії — рядок копії лишається без вікторини.
    await db.delete(quiz).where(eq(quiz.id, copied));
    const [copy] = await db.select().from(schema.libraryCopy);
    expect(copy.quizId).toBeNull();

    // Видалення оригіналу — запис і його скарги зникають; рядки копій лишаються без запису (рядок автора переживає оригінал), копії-вікторини теж.
    const another = await addQuiz('b');
    await db.insert(schema.libraryCopy).values({ entryId: entry.id, userId: 'b', quizId: another, authorLine: 'Автор: Автор', at: T });
    await db.delete(quiz).where(eq(quiz.id, original));
    expect(await db.select().from(schema.libraryEntry)).toEqual([]);
    expect(await db.select().from(schema.userReport)).toEqual([]);
    const kept = await db.select().from(schema.libraryCopy);
    expect(kept.map((row) => [row.entryId, row.quizId, row.authorLine]).sort()).toEqual([
      [null, another, 'Автор: Автор'],
      [null, null, 'Автор: Автор'],
    ].sort());
    expect((await db.select().from(quiz)).map((row) => row.id)).toEqual([another]);

    // Видалення акаунта: його записи, його рядки копій і скарги (як скаржника й як цілі); чужі рядки копій його записів лишаються без запису.
    const qa = await addQuiz('a');
    const qc = await addQuiz('c');
    const [ea] = await db.insert(schema.libraryEntry).values(entryOf(qa)).returning();
    const [ec] = await db.insert(schema.libraryEntry).values(entryOf(qc, 'c')).returning();
    await db.insert(schema.libraryCopy).values([
      { entryId: ec.id, userId: 'a', quizId: null, authorLine: 'Автор: Третій', at: T },
      { entryId: ea.id, userId: 'c', quizId: null, authorLine: 'Автор: Автор', at: T },
    ]);
    await db.insert(schema.userReport).values([
      { reporterId: 'a', targetKind: 'quiz', entryId: ec.id, targetUserId: 'c', reason: 'spam' },
      { reporterId: 'b', targetKind: 'profile', targetUserId: 'a', reason: 'offensive' },
      { reporterId: 'b', targetKind: 'quiz', entryId: ec.id, targetUserId: 'c', reason: 'other' },
    ]);
    await db.delete(user).where(eq(user.id, 'a'));
    expect((await db.select().from(schema.libraryEntry)).map((row) => row.id)).toEqual([ec.id]);
    const copies = await db.select().from(schema.libraryCopy);
    expect(copies.map((row) => [row.userId, row.entryId]).sort()).toEqual([
      ['b', null],
      ['b', null],
      ['c', null],
    ]);
    const reports = await db.select().from(schema.userReport);
    expect(reports.map((row) => [row.reporterId, row.targetUserId])).toEqual([['b', 'c']]);
  });
});
