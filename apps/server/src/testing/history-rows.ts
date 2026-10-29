import { randomUUID } from 'node:crypto';
import type { AdjustmentSource, Answer, BuffKind, DebuffKind, GameStatus } from '@quiz/shared';
import { makeQuiz, single } from '@quiz/engine/testing';
import type { Db } from '../db/client';
import { answer, game, participant, scoreAdjustment, type PlayRef } from '../db/schema';

export interface SeedPlayer {
  userId: string | null;
  nickname: string;
  score: number;
  rank: number | null;
  /** Рядок команди (12i): is_team. */
  isTeam?: boolean;
  /** Людина команди (12i): індекс рядка її команди в players; такі рядки вставляються після команд. */
  teamOf?: number;
  /**
   * wager — ставка фіналу; без неї рядок як у старих іграх (null). payload і timeMs — за замовчуванням null і 0.
   * debuff, clue, answeredBy (12i): answeredBy — індекс людини в players, стає її id.
   */
  rows?: {
    questionIndex: number;
    roundIndex?: number;
    attempt?: number;
    accepted: boolean;
    points: number;
    wager?: number;
    buff?: BuffKind;
    spareId?: string;
    awayMs?: number;
    payload?: Answer | null;
    timeMs?: number;
    debuff?: DebuffKind;
    clue?: number;
    answeredBy?: number;
  }[];
  /** Бали від ведучого; roundIndex і afterQuestion за замовчуванням 0. */
  adjustments?: { seq: number; roundIndex?: number; afterQuestion?: number; points: number; source?: AdjustmentSource; debuff?: DebuffKind; targetNickname?: string; undoesQuestion?: number; undoesSeq?: number }[];
}

let codes = 0;

/**
 * Вставляє гру з учасниками, рядками answer і коригуваннями; повертає id гри й учасників у порядку players.
 * plays — журнал гри; finishedAt — за замовчуванням startedAt для завершеної гри, інакше null; quizId — вікторина гри.
 */
export async function seedGame(
  db: Db,
  spec: {
    hostId: string;
    status?: GameStatus;
    startedAt: Date;
    finishedAt?: Date | null;
    snapshot?: unknown;
    questionsPlayed?: number;
    title?: string;
    autopilot?: boolean;
    plays?: PlayRef[];
    quizId?: string;
    players: SeedPlayer[];
  },
): Promise<{ gameId: string; participantIds: string[] }> {
  const gameId = randomUUID();
  codes += 1;
  const status = spec.status ?? 'finished';
  await db.insert(game).values({
    id: gameId,
    quizId: spec.quizId ?? null,
    hostId: spec.hostId,
    code: String(100000 + codes),
    status,
    title: spec.title ?? 'Гра',
    quizSnapshot: spec.snapshot ?? makeQuiz([single]),
    questionsPlayed: spec.questionsPlayed ?? 1,
    plays: spec.plays ?? [],
    startedAt: spec.startedAt,
    finishedAt: spec.finishedAt !== undefined ? spec.finishedAt : status === 'finished' ? spec.startedAt : null,
    autopilot: spec.autopilot ?? false,
  });
  const participantIds = spec.players.map(() => randomUUID());
  // Рядки людей посилаються на рядок команди: спершу всі інші.
  const order = [...spec.players.keys()].sort((a, b) => Number(spec.players[a].teamOf !== undefined) - Number(spec.players[b].teamOf !== undefined));
  for (const i of order) {
    const p = spec.players[i];
    await db.insert(participant).values({
      id: participantIds[i]!,
      gameId,
      nickname: p.nickname,
      userId: p.userId,
      score: p.score,
      totalTimeMs: 0,
      rank: p.rank,
      isTeam: p.isTeam ?? false,
      teamId: p.teamOf === undefined ? null : participantIds[p.teamOf]!,
    });
    if (p.rows !== undefined && p.rows.length > 0) {
      await db.insert(answer).values(
        p.rows.map((r) => ({
          participantId: participantIds[i]!,
          questionIndex: r.questionIndex,
          attempt: r.attempt ?? 0,
          roundIndex: r.roundIndex ?? 0,
          payload: r.payload ?? null,
          timeMs: r.timeMs ?? 0,
          accepted: r.accepted,
          points: r.points,
          wager: r.wager ?? null,
          buff: r.buff ?? null,
          spareId: r.spareId ?? null,
          awayMs: r.awayMs ?? null,
          debuff: r.debuff ?? null,
          clue: r.clue ?? null,
          answeredBy: r.answeredBy === undefined ? null : participantIds[r.answeredBy]!,
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
          undoesQuestion: a.undoesQuestion ?? null,
          undoesSeq: a.undoesSeq ?? null,
        })),
      );
    }
  }
  return { gameId, participantIds };
}
