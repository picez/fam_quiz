import type { GameDetail, GameSummary, PlayedGame } from '@quiz/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { answer, game, participant } from './db/schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 100;

/** Кількість учасників у кожній із заданих ігор. */
async function playerCounts(db: Db, gameIds: string[]): Promise<Map<string, number>> {
  if (gameIds.length === 0) return new Map();
  const rows = await db
    .select({ gameId: participant.gameId, players: count() })
    .from(participant)
    .where(inArray(participant.gameId, gameIds))
    .groupBy(participant.gameId);
  return new Map(rows.map((row) => [row.gameId, row.players]));
}

export async function hostGames(db: Db, hostId: string): Promise<GameSummary[]> {
  const games = await db.select().from(game).where(eq(game.hostId, hostId)).orderBy(desc(game.startedAt)).limit(LIMIT);
  const players = await playerCounts(
    db,
    games.map((row) => row.id),
  );
  return games.map((row) => ({
    id: row.id,
    title: row.title,
    code: row.code,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    playerCount: players.get(row.id) ?? 0,
    questionsPlayed: row.questionsPlayed,
    questionCount: row.quizSnapshot.questions.length,
  }));
}

export async function hostGame(db: Db, hostId: string, id: string): Promise<GameDetail | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select()
    .from(game)
    .where(and(eq(game.id, id), eq(game.hostId, hostId)));
  if (row === undefined) return null;

  const participants = await db.select().from(participant).where(eq(participant.gameId, id));
  const answers =
    participants.length === 0
      ? []
      : await db
          .select({ participantId: answer.participantId, questionIndex: answer.questionIndex, accepted: answer.accepted })
          .from(answer)
          .where(
            inArray(
              answer.participantId,
              participants.map((p) => p.id),
            ),
          );

  const standings = participants
    .map((p) => ({
      participantId: p.id,
      nickname: p.nickname,
      score: p.score,
      rank: p.rank,
      correct: answers.filter((a) => a.participantId === p.id && a.accepted).length,
    }))
    // Спершу за місцем; до фінішу місць немає, тоді за балами.
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.score - a.score || a.nickname.localeCompare(b.nickname));

  const questions = row.quizSnapshot.questions.slice(0, row.questionsPlayed).map((question, index) => {
    const given = answers.filter((a) => a.questionIndex === index);
    return {
      index,
      text: question.text,
      type: question.type,
      answered: given.length,
      accepted: given.filter((a) => a.accepted).length,
    };
  });

  return {
    id: row.id,
    title: row.title,
    code: row.code,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    questionsPlayed: row.questionsPlayed,
    questionCount: row.quizSnapshot.questions.length,
    standings,
    questions,
  };
}

export async function playerHistory(db: Db, userId: string): Promise<PlayedGame[]> {
  const rows = await db
    .select({ participant, game })
    .from(participant)
    .innerJoin(game, eq(participant.gameId, game.id))
    .where(eq(participant.userId, userId))
    .orderBy(desc(game.startedAt))
    .limit(LIMIT);
  if (rows.length === 0) return [];

  const players = await playerCounts(
    db,
    rows.map((row) => row.game.id),
  );
  const answers = await db
    .select({ participantId: answer.participantId, accepted: answer.accepted })
    .from(answer)
    .where(
      inArray(
        answer.participantId,
        rows.map((row) => row.participant.id),
      ),
    );

  return rows.map((row) => {
    const mine = answers.filter((a) => a.participantId === row.participant.id);
    return {
      gameId: row.game.id,
      title: row.game.title,
      status: row.game.status,
      startedAt: row.game.startedAt.toISOString(),
      nickname: row.participant.nickname,
      score: row.participant.score,
      rank: row.participant.rank,
      playerCount: players.get(row.game.id) ?? 0,
      correct: mine.filter((a) => a.accepted).length,
      answered: mine.length,
      questionsPlayed: row.game.questionsPlayed,
    };
  });
}
