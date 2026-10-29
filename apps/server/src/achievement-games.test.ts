import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { boardRound, classicRound, makeRoundsQuiz, pin, single, text, withId } from '@quiz/engine/testing';
import { loadAchievementGames, whoIn } from './achievement-games';
import type { Db } from './db/client';
import { AWAY_ATTEMPT, game, user, VOTE_ATTEMPT } from './db/schema';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

const HOST = 'ach-host';
const OLYA = 'ach-olya';
const VIRA = 'ach-vira';

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values([
    { id: HOST, name: 'Ведуча', email: 'ach-host@example.com' },
    { id: OLYA, name: 'Оля', email: 'ach-olya@example.com' },
    { id: VIRA, name: 'Віра', email: 'ach-vira@example.com' },
  ]);
});

const boardCell = withId(text, 'bq1');
const quiz = makeRoundsQuiz([
  classicRound('r1', [single, pin]),
  // Схема вимагає поля щонайменше 3 × 3.
  boardRound(
    'b1',
    ['Міста', 'Ріки', 'Гори'].map((title, c) => ({
      title,
      cells: [0, 1, 2].map((i) => (c === 0 && i === 0 ? { question: boardCell, mark: 'x2' as const } : withId(text, `bq-${c}-${i}`))),
    })),
  ),
]);
const plays = [
  { roundIndex: 0, questionId: single.id },
  { roundIndex: 0, questionId: pin.id },
  { roundIndex: 1, questionId: boardCell.id, cell: { cellId: boardCell.id, chooserId: 'chooser-1' } },
];

describe('loadAchievementGames', () => {
  it('reads questions with time limits and cells, answer rows without votes and away marks, and adjustments', async () => {
    const startedAt = new Date('2026-10-20T18:00:00Z');
    const { gameId, participantIds } = await seedGame(db, {
      hostId: HOST,
      startedAt,
      finishedAt: new Date('2026-10-20T19:00:00Z'),
      snapshot: quiz,
      questionsPlayed: 3,
      plays,
      players: [
        {
          userId: OLYA,
          nickname: 'Оля',
          score: 700,
          rank: 1,
          rows: [
            { questionIndex: 0, accepted: true, points: 500, payload: { type: 'single', optionId: 'b' }, timeMs: 1800, debuff: 'fog' },
            { questionIndex: 2, roundIndex: 1, accepted: true, points: 200, payload: { type: 'text', value: 'Одеса' }, timeMs: 4000, clue: 3 },
            { questionIndex: 1, attempt: VOTE_ATTEMPT, accepted: false, points: 0 },
            { questionIndex: 1, attempt: AWAY_ATTEMPT, accepted: false, points: 0, awayMs: 9000 },
          ],
          adjustments: [{ seq: 1, points: 300, source: 'duel' }],
        },
        { userId: null, nickname: 'Петро', score: 0, rank: 2 },
      ],
    });

    const [loaded] = await loadAchievementGames(db, [gameId]);
    expect(loaded.gameId).toBe(gameId);
    expect(loaded.status).toBe('finished');
    expect(loaded.startedAt.toISOString()).toBe(startedAt.toISOString());
    expect(loaded.finishedAt?.toISOString()).toBe('2026-10-20T19:00:00.000Z');
    expect(loaded.questionsPlayed).toBe(3);
    expect(loaded.teams).toBe(false);
    expect(loaded.players.map((p) => ({ id: p.participantId, userId: p.userId, rank: p.rank, score: p.score, members: p.members }))).toEqual([
      { id: participantIds[0], userId: OLYA, rank: 1, score: 700, members: [] },
      { id: participantIds[1], userId: null, rank: 2, score: 0, members: [] },
    ]);

    expect(loaded.questions.map((q) => ({ index: q.index, roundIndex: q.roundIndex, roundType: q.roundType, id: q.question.id, limitMs: q.limitMs, cell: q.cell }))).toEqual([
      { index: 0, roundIndex: 0, roundType: 'classic', id: single.id, limitMs: 20_000, cell: null },
      { index: 1, roundIndex: 0, roundType: 'classic', id: pin.id, limitMs: 30_000, cell: null },
      { index: 2, roundIndex: 1, roundType: 'board', id: boardCell.id, limitMs: 20_000, cell: { chooserId: 'chooser-1', mark: 2, blitz: false } },
    ]);
    expect(loaded.questions.every((q) => q.scored && !q.blitz)).toBe(true);

    const rows = [...loaded.rows].sort((a, b) => a.questionIndex - b.questionIndex);
    expect(rows).toEqual([
      {
        participantId: participantIds[0],
        questionIndex: 0,
        roundIndex: 0,
        attempt: 0,
        payload: { type: 'single', optionId: 'b' },
        timeMs: 1800,
        accepted: true,
        points: 500,
        buff: null,
        spareId: null,
        debuff: 'fog',
        clue: null,
        answeredBy: null,
      },
      expect.objectContaining({ questionIndex: 2, roundIndex: 1, clue: 3, debuff: null, timeMs: 4000 }),
    ]);
    expect(loaded.adjustments).toEqual([{ participantId: participantIds[0], source: 'duel', points: 300 }]);
  });

  it('a team game lists the team rows with their people; answeredBy is the person row', async () => {
    const { gameId, participantIds } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2026-10-21T18:00:00Z'),
      snapshot: quiz,
      questionsPlayed: 1,
      plays: plays.slice(0, 1),
      players: [
        { userId: null, nickname: 'Буковина', score: 500, rank: 1, isTeam: true, rows: [{ questionIndex: 0, accepted: true, points: 500, answeredBy: 2 }] },
        { userId: null, nickname: 'Дніпро', score: 0, rank: 2, isTeam: true },
        { userId: OLYA, nickname: 'Оля', score: 500, rank: 1, teamOf: 0 },
        { userId: VIRA, nickname: 'Віра', score: 500, rank: 1, teamOf: 0 },
        { userId: null, nickname: 'Марко', score: 0, rank: 2, teamOf: 1, rows: [{ questionIndex: 0, attempt: VOTE_ATTEMPT, accepted: false, points: 0 }] },
      ],
    });
    const [loaded] = await loadAchievementGames(db, [gameId]);
    expect(loaded.teams).toBe(true);
    expect(loaded.players.map((p) => p.participantId)).toEqual([participantIds[0], participantIds[1]]);
    expect(loaded.players[0].members).toEqual(
      expect.arrayContaining([
        { participantId: participantIds[2], userId: OLYA },
        { participantId: participantIds[3], userId: VIRA },
      ]),
    );
    expect(loaded.players[0].members).toHaveLength(2);
    expect(loaded.players[1].members).toEqual([{ participantId: participantIds[4], userId: null }]);
    expect(loaded.rows).toEqual([expect.objectContaining({ participantId: participantIds[0], answeredBy: participantIds[2] })]);

    expect(whoIn(loaded, OLYA)).toEqual({ participantId: participantIds[0], personId: participantIds[2] });
    expect(whoIn(loaded, VIRA)).toEqual({ participantId: participantIds[0], personId: participantIds[3] });
    expect(whoIn(loaded, HOST)).toBeNull();
  });

  it('an old game without plays and a broken snapshot give no questions, without throwing', async () => {
    const old = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2025-01-01T12:00:00Z'),
      snapshot: quiz,
      questionsPlayed: 2,
      players: [{ userId: OLYA, nickname: 'Оля', score: 100, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 100 }] }],
    });
    const broken = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2025-01-02T12:00:00Z'),
      snapshot: { rounds: 'зіпсовано' },
      questionsPlayed: 1,
      plays: plays.slice(0, 1),
      players: [{ userId: OLYA, nickname: 'Оля', score: 0, rank: 1 }],
    });
    const loaded = await loadAchievementGames(db, [broken.gameId, old.gameId]);
    expect(loaded.map((g) => g.gameId)).toEqual([broken.gameId, old.gameId]);
    expect(loaded[0].questions).toEqual([]);
    expect(loaded[1].questions).toEqual([]);
    expect(loaded[1].rows).toHaveLength(1);
    expect(whoIn(loaded[1], OLYA)).toEqual({ participantId: old.participantIds[0], personId: null });
    expect(whoIn(loaded[1], VIRA)).toBeNull();
  });

  it('no ids — no queries, and unknown ids are skipped', async () => {
    expect(await loadAchievementGames(db, [])).toEqual([]);
    const [{ id }] = await db.select({ id: game.id }).from(game).where(eq(game.hostId, HOST)).limit(1);
    const loaded = await loadAchievementGames(db, ['00000000-0000-4000-8000-000000000000', id]);
    expect(loaded.map((g) => g.gameId)).toEqual([id]);
  });
});
