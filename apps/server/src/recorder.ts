import { rankPlayers, recordOf, type GameState } from '@quiz/engine';
import type { Answer } from '@quiz/shared';
import { and, eq, max, notInArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { answer, game, participant, PENALTY_ATTEMPT, scoreAdjustment } from './db/schema';
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

/** Скільки запитань журналу вже закрито: відкрите запитання завжди останнє. */
function closedQuestions(state: GameState): number {
  return state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
}

/** Змінюється лише тоді, коли в грі з'явилося щось варте запису. */
function signature(state: GameState): string {
  // Оцінки останнього закритого запитання входять у підпис: ручне рішення ведучого
  // треба записати, навіть якщо воно не змінило бали.
  const last = closedQuestions(state) - 1;
  const grades = state.players.map((player) => {
    const record = last < 0 ? undefined : recordOf(state, last, player.id);
    return record === undefined ? null : [record.accepted, record.points, record.overridden];
  });
  const scores = state.players.map((p) => [p.id, p.score]);
  // Коригування не змінюють фазу, а рахунок можуть лишити тим самим (+50 і −50): рахуємо їх окремо.
  return JSON.stringify([state.phase, state.roundIndex, state.questionIndex, scores, grades, state.adjustments.length, state.adjustmentSeq]);
}

interface AnswerRow {
  attempt: number;
  payload: Answer | null;
  timeMs: number;
  accepted: boolean;
  points: number;
  streakBonus: number;
  overridden: boolean;
  /** Ставка фіналу; null поза фіналом. */
  wager: number | null;
}

/** Рядки таблиці answer для гравця на запитання: у бліці по рядку на спробу, інакше один. */
function answerRows(state: GameState, index: number, playerId: string): AnswerRow[] {
  const record = recordOf(state, index, playerId);
  if (record === undefined) return [];
  const attempts = state.plays[index].blitz?.attempts.filter((a) => a.playerId === playerId);
  if (attempts === undefined) {
    const { answer: payload, timeMs, accepted, points, streakBonus, overridden } = record;
    const { final } = state.plays[index];
    // Мовчання у фіналі — рядок балів без відповіді, як штраф бліц-клітинки. Ставка йде окремо:
    // у спільному банку бали не дорівнюють ±ставці.
    const silent = final !== undefined && payload === null;
    const wager = final === undefined ? null : Object.hasOwn(final.wagers, playerId) ? final.wagers[playerId] : 0;
    return [{ attempt: silent ? PENALTY_ATTEMPT : 0, payload, timeMs, accepted, points, streakBonus, overridden, wager }];
  }
  const rows = attempts.map((attempt, number) => {
    // Бонус серії належить виграшній спробі; бали спроби в журналі бліцу його не містять.
    const streakBonus = attempt.grade === 'correct' ? record.streakBonus : 0;
    return {
      attempt: number,
      payload: attempt.answer,
      timeMs: attempt.timeMs,
      accepted: attempt.grade === 'correct',
      points: attempt.points + streakBonus,
      streakBonus,
      overridden: false,
      wager: null,
    };
  });
  // Штраф бліц-клітинки не належить жодній спробі (його платить і той, хто не натискав):
  // він іде окремим рядком, щоб бали гравця за рядками збігалися з журналом.
  const penalty = record.basePoints - attempts.reduce((sum, attempt) => sum + attempt.points, 0);
  if (penalty === 0) return rows;
  return [
    ...rows,
    { attempt: PENALTY_ATTEMPT, payload: null, timeMs: 0, accepted: false, points: penalty, streakBonus: 0, overridden: false, wager: null },
  ];
}

async function save(db: Db, snapshot: Snapshot): Promise<void> {
  const { state } = snapshot;
  const finished = state.phase === 'finished';
  const closed = closedQuestions(state);
  const ranks = new Map(finished ? rankPlayers(state.players).map((row) => [row.participantId, row.rank]) : []);
  const progress = {
    status: finished ? ('finished' as const) : ('running' as const),
    questionsPlayed: closed,
    plays: state.plays.slice(0, closed).map((play) => ({
      roundIndex: play.roundIndex,
      questionId: play.question.id,
      ...(play.board === undefined ? {} : { cell: { cellId: play.board.cellId, chooserId: play.board.chooserId } }),
    })),
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

    // Вилучених гравців прибираємо разом з їхніми відповідями й коригуваннями (каскадом).
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
        for (const row of answerRows(state, index, player.id)) {
          const { attempt, payload, timeMs, ...grade } = row;
          await tx
            .insert(answer)
            .values({
              participantId: player.id,
              questionIndex: index,
              attempt,
              roundIndex: state.plays[index].roundIndex,
              payload,
              timeMs,
              ...grade,
            })
            .onConflictDoUpdate({ target: [answer.participantId, answer.questionIndex, answer.attempt], set: grade });
        }
      }
    }

    // Коригування незмінні, а seq зростає в межах гри: дописуємо лише новіші за вже збережені, одним запитом.
    const [{ saved }] = await tx
      .select({ saved: max(scoreAdjustment.seq) })
      .from(scoreAdjustment)
      .innerJoin(participant, eq(participant.id, scoreAdjustment.participantId))
      .where(inGame);
    const fresh = state.adjustments
      .filter((adjustment) => adjustment.seq > (saved ?? 0))
      .map(({ playerId, seq, roundIndex, afterQuestion, points, source }) => ({ participantId: playerId, seq, roundIndex, afterQuestion, points, source }));
    if (fresh.length > 0) await tx.insert(scoreAdjustment).values(fresh).onConflictDoNothing();
  });
}

const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Записує хід ігор у базу. Збій бази журналюється й не зачіпає саму гру; невдалий запис
 * повторюється сам (з дедалі довшими паузами), бо після фінішу в кімнаті може більше нічого
 * не статися, а результат має потрапити в історію.
 */
export function attachRecorder(
  manager: RoomManager,
  db: Db,
  onError: (error: unknown) => void = (error) => console.error('Не вдалося зберегти гру:', error),
  retryMs = 5000,
  maxRetries = 30,
): Recorder {
  const queues = new Map<string, Promise<void>>();
  const lastSignature = new Map<string, string>();
  const startedAt = new Map<string, Date>();
  /** Скільки запитань кімнати вже надійно записано. */
  const savedQuestions = new Map<string, number>();
  /** Скільки записів кімнати поспіль не вдалося. */
  const failures = new Map<string, number>();
  const closedRooms = new Set<string>();

  const forget = (roomId: string) => {
    for (const map of [queues, lastSignature, startedAt, savedQuestions, failures]) map.delete(roomId);
    closedRooms.delete(roomId);
  };

  const record = (room: Room) => {
    const { state } = room;
    const hostId = room.hostUserId;
    if (hostId === null || state.phase === 'lobby') return;
    const current = signature(state);
    if (lastSignature.get(room.id) === current) return;
    lastSignature.set(room.id, current);
    if (!startedAt.has(room.id)) startedAt.set(room.id, new Date());

    const closed = closedQuestions(state);
    const snapshot = {
      id: room.id,
      code: room.code,
      hostId,
      quizId: room.quizId,
      state,
      playerUsers: new Map(room.playerUsers),
      startedAt: startedAt.get(room.id) ?? new Date(),
    };

    const job = async () => {
      // Останнє закрите запитання записується повторно: його оцінки могли змінити вручну.
      const fromQuestion = Math.max(0, Math.min(savedQuestions.get(room.id) ?? 0, closed - 1));
      await save(db, { ...snapshot, fromQuestion });
      savedQuestions.set(room.id, closed);
      failures.delete(room.id);
    };

    const queued: Promise<void> = (queues.get(room.id) ?? Promise.resolve())
      .then(job)
      .catch((error) => {
        // Підпис скидається, щоб той самий стан можна було записати ще раз.
        lastSignature.delete(room.id);
        onError(error);
        const attempt = (failures.get(room.id) ?? 0) + 1;
        failures.set(room.id, attempt);
        if (attempt > maxRetries) {
          failures.delete(room.id);
          return;
        }
        const timer = setTimeout(() => record(room), Math.min(retryMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));
        timer.unref();
      })
      .then(() => {
        // Кімнату закрито й дописувати більше нічого: звільнити пам'ять.
        if (closedRooms.has(room.id) && queues.get(room.id) === queued && !failures.has(room.id)) forget(room.id);
      });
    queues.set(room.id, queued);
  };

  manager.onEvent((room, event) => {
    if (event.type === 'changed') {
      record(room);
      return;
    }
    if (event.type === 'closed') {
      closedRooms.add(room.id);
      // Якщо останній запис не вдався, його повтор ще попереду; пам'ять звільнить він.
      if (failures.has(room.id)) return;
      const pending = queues.get(room.id);
      if (pending === undefined) forget(room.id);
      else void pending.then(() => {
        if (queues.get(room.id) === pending && !failures.has(room.id)) forget(room.id);
      });
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
