import { randomUUID } from 'node:crypto';
import type { GameStatus } from '@quiz/shared';
import { makeQuiz, single } from '@quiz/engine/testing';
import type { Db } from '../db/client';
import { answer, game, participant } from '../db/schema';

export interface SeedPlayer {
  userId: string | null;
  nickname: string;
  score: number;
  rank: number | null;
  rows?: { questionIndex: number; roundIndex?: number; attempt?: number; accepted: boolean; points: number }[];
}

let codes = 0;

/** Вставляє гру з учасниками й рядками answer; повертає id гри й учасників у порядку players. */
export async function seedGame(
  db: Db,
  spec: { hostId: string; status?: GameStatus; startedAt: Date; snapshot?: unknown; questionsPlayed?: number; title?: string; players: SeedPlayer[] },
): Promise<{ gameId: string; participantIds: string[] }> {
  const gameId = randomUUID();
  codes += 1;
  await db.insert(game).values({
    id: gameId,
    hostId: spec.hostId,
    code: String(100000 + codes),
    status: spec.status ?? 'finished',
    title: spec.title ?? 'Гра',
    quizSnapshot: spec.snapshot ?? makeQuiz([single]),
    questionsPlayed: spec.questionsPlayed ?? 1,
    startedAt: spec.startedAt,
  });
  const participantIds = spec.players.map(() => randomUUID());
  for (const [i, p] of spec.players.entries()) {
    await db.insert(participant).values({ id: participantIds[i]!, gameId, nickname: p.nickname, userId: p.userId, score: p.score, totalTimeMs: 0, rank: p.rank });
    if (p.rows !== undefined && p.rows.length > 0) {
      await db.insert(answer).values(
        p.rows.map((r) => ({
          participantId: participantIds[i]!,
          questionIndex: r.questionIndex,
          attempt: r.attempt ?? 0,
          roundIndex: r.roundIndex ?? 0,
          payload: null,
          timeMs: 0,
          accepted: r.accepted,
          points: r.points,
          overridden: false,
        })),
      );
    }
  }
  return { gameId, participantIds };
}
