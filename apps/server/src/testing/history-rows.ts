import { randomUUID } from 'node:crypto';
import type { BuffKind, DebuffKind, GameStatus } from '@quiz/shared';
import { makeQuiz, single } from '@quiz/engine/testing';
import type { Db } from '../db/client';
import { answer, game, participant, scoreAdjustment } from '../db/schema';

export interface SeedPlayer {
  userId: string | null;
  nickname: string;
  score: number;
  rank: number | null;
  /** wager — ставка фіналу; без неї рядок як у старих іграх (null). */
  rows?: { questionIndex: number; roundIndex?: number; attempt?: number; accepted: boolean; points: number; wager?: number; buff?: BuffKind; spareId?: string }[];
  /** Бали від ведучого; roundIndex і afterQuestion за замовчуванням 0. */
  adjustments?: { seq: number; roundIndex?: number; afterQuestion?: number; points: number; source?: 'host' | 'duel' | 'debuff'; debuff?: DebuffKind; targetNickname?: string }[];
}

let codes = 0;

/** Вставляє гру з учасниками, рядками answer і коригуваннями; повертає id гри й учасників у порядку players. */
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
          wager: r.wager ?? null,
          buff: r.buff ?? null,
          spareId: r.spareId ?? null,
          overridden: false,
        })),
      );
    }
    if (p.adjustments !== undefined && p.adjustments.length > 0) {
      await db.insert(scoreAdjustment).values(
        p.adjustments.map((a) => ({
          participantId: participantIds[i]!,
          seq: a.seq,
          roundIndex: a.roundIndex ?? 0,
          afterQuestion: a.afterQuestion ?? 0,
          points: a.points,
          source: a.source ?? ('host' as const),
          debuff: a.debuff ?? null,
          targetNickname: a.targetNickname ?? null,
        })),
      );
    }
  }
  return { gameId, participantIds };
}
