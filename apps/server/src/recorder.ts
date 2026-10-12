import { rankPlayers, recordOf, type GameState } from '@quiz/engine';
import { and, eq, notInArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { answer, game, participant } from './db/schema';
import type { Room, RoomManager } from './rooms/manager';

export interface Recorder {
  /** Завершується, коли всі поставлені в чергу записи виконано. */
  idle(): Promise<void>;
}

interface Snapshot {
  id: string;
  code: string;
  hostId: string;
  quizId: string | null;
  state: GameState;
  playerUsers: Map<string, string>;
  startedAt: Date;
  /** З якого запитання записувати відповіді: попередні вже збережено. */
  fromQuestion: number;
}

/** Скільки запитань уже закрито. */
function closedQuestions(state: GameState): number {
  if (state.phase === 'lobby') return 0;
  return state.phase === 'question' ? state.questionIndex : state.questionIndex + 1;
}

/** Змінюється лише тоді, коли в грі з'явилося щось варте запису. */
function signature(state: GameState): string {
  return JSON.stringify([state.phase, state.questionIndex, state.players.map((p) => [p.id, p.score])]);
}

async function save(db: Db, snapshot: Snapshot): Promise<void> {
  const { state } = snapshot;
  const finished = state.phase === 'finished';
  const closed = closedQuestions(state);
  const ranks = new Map(finished ? rankPlayers(state.players).map((row) => [row.participantId, row.rank]) : []);
  const progress = {
    status: finished ? ('finished' as const) : ('running' as const),
    questionsPlayed: closed,
    finishedAt: finished ? new Date() : null,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(game)
      .values({
        id: snapshot.id,
        quizId: snapshot.quizId,
        hostId: snapshot.hostId,
        code: snapshot.code,
        title: state.quiz.title,
        quizSnapshot: state.quiz,
        startedAt: snapshot.startedAt,
        ...progress,
      })
      .onConflictDoUpdate({ target: game.id, set: progress });

    // Вилучених гравців прибираємо разом з їхніми відповідями (каскадом).
    const ids = state.players.map((player) => player.id);
    const inGame = eq(participant.gameId, snapshot.id);
    await tx.delete(participant).where(ids.length === 0 ? inGame : and(inGame, notInArray(participant.id, ids)));

    for (const player of state.players) {
      const result = { score: player.score, totalTimeMs: player.totalTimeMs, rank: ranks.get(player.id) ?? null };
      await tx
        .insert(participant)
        .values({
          id: player.id,
          gameId: snapshot.id,
          nickname: player.nickname,
          userId: snapshot.playerUsers.get(player.id) ?? null,
          ...result,
        })
        .onConflictDoUpdate({ target: participant.id, set: result });

      for (let index = snapshot.fromQuestion; index < closed; index++) {
        const record = recordOf(state, index, player.id);
        if (record === undefined) continue;
        const grade = { accepted: record.accepted, points: record.points, overridden: record.overridden };
        await tx
          .insert(answer)
          .values({ participantId: player.id, questionIndex: index, payload: record.answer, timeMs: record.timeMs, ...grade })
          .onConflictDoUpdate({ target: [answer.participantId, answer.questionIndex], set: grade });
      }
    }
  });
}

/** Записує хід ігор у базу. Збій бази журналюється й не зачіпає саму гру. */
export function attachRecorder(
  manager: RoomManager,
  db: Db,
  onError: (error: unknown) => void = (error) => console.error('Не вдалося зберегти гру:', error),
): Recorder {
  const queues = new Map<string, Promise<void>>();
  const lastSignature = new Map<string, string>();
  const startedAt = new Map<string, Date>();
  /** Скільки запитань кімнати вже надійно записано. */
  const savedQuestions = new Map<string, number>();

  const record = (room: Room) => {
    const { state } = room;
    if (room.hostUserId === null || state.phase === 'lobby') return;
    const current = signature(state);
    if (lastSignature.get(room.id) === current) return;
    lastSignature.set(room.id, current);
    if (!startedAt.has(room.id)) startedAt.set(room.id, new Date());

    const closed = closedQuestions(state);
    const snapshot: Snapshot = {
      id: room.id,
      code: room.code,
      hostId: room.hostUserId,
      quizId: room.quizId,
      state,
      playerUsers: new Map(room.playerUsers),
      startedAt: startedAt.get(room.id) ?? new Date(),
      // Останнє закрите запитання записується повторно: його оцінки могли змінити вручну.
      fromQuestion: 0,
    };

    const job = async () => {
      snapshot.fromQuestion = Math.max(0, Math.min(savedQuestions.get(room.id) ?? 0, closed - 1));
      await save(db, snapshot);
      savedQuestions.set(room.id, closed);
    };
    const queued = (queues.get(room.id) ?? Promise.resolve()).then(job).catch((error) => {
      // Наступна зміна стану має спробувати знову, навіть якщо підпис не зміниться.
      lastSignature.delete(room.id);
      onError(error);
    });
    queues.set(room.id, queued);
  };

  manager.onEvent((room, event) => {
    if (event.type === 'changed') {
      record(room);
      return;
    }
    if (event.type === 'closed') {
      for (const map of [lastSignature, startedAt, savedQuestions]) map.delete(room.id);
      void (queues.get(room.id) ?? Promise.resolve()).then(() => queues.delete(room.id));
    }
  });

  return {
    idle: async () => {
      await Promise.all(queues.values());
    },
  };
}

/** Ігри, що лишилися «в процесі» після попереднього запуску сервера, уже ніхто не дограє. */
export async function markInterrupted(db: Db): Promise<void> {
  await db.update(game).set({ status: 'aborted', finishedAt: new Date() }).where(eq(game.status, 'running'));
}
