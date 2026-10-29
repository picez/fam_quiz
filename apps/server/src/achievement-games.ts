import {
  cellAnswerMode,
  factLimitMs,
  findCell,
  isUnscored,
  type AdjustmentSource,
  type Answer,
  type BuffKind,
  type DebuffKind,
  type GameStatus,
  type Question,
  type Quiz,
  type RoundType,
} from '@quiz/shared';
import { and, inArray, ne } from 'drizzle-orm';
import type { Db } from './db/client';
import { answer, AWAY_ATTEMPT, game, participant, scoreAdjustment, VOTE_ATTEMPT, type PlayRef } from './db/schema';
import type { AchievementWho } from './game-achievements';
import { playedQuestions, snapshotOf } from './history';

/** Зігране (закрите) запитання для ачівок. */
export interface AchievementQuestion {
  /** Індекс у game.plays і answer.question_index. */
  index: number;
  roundIndex: number;
  roundType: RoundType | null;
  /** Основне запитання (не запасне). */
  question: Question;
  /** Межа часу відповіді, мс (factLimitMs); null — час не справжній. */
  limitMs: number | null;
  /** З балами (не опитування й не хмара). */
  scored: boolean;
  /** Бліц-раунд чи бліц-клітинка. */
  blitz: boolean;
  /** Клітинка поля: хто вибрав, позначка (1, 2, 3), бліц-клітинка. */
  cell: { chooserId: string; mark: 1 | 2 | 3; blitz: boolean } | null;
  ref: PlayRef;
}

/** Рядок answer для ачівок (без VOTE_ATTEMPT і AWAY_ATTEMPT). */
export interface AchievementRow {
  participantId: string;
  questionIndex: number;
  roundIndex: number;
  attempt: number;
  payload: Answer | null;
  timeMs: number;
  accepted: boolean;
  points: number;
  buff: BuffKind | null;
  spareId: string | null;
  debuff: DebuffKind | null;
  clue: number | null;
  answeredBy: string | null;
}

/** Учасник таблиці (соло — гравець, командна гра — команда) і люди команди. */
export interface AchievementPlayer {
  participantId: string;
  userId: string | null;
  members: { participantId: string; userId: string | null }[];
  rank: number | null;
  score: number;
}

export interface AchievementGame {
  gameId: string;
  status: GameStatus;
  startedAt: Date;
  finishedAt: Date | null;
  questionsPlayed: number;
  teams: boolean;
  players: AchievementPlayer[];
  /** Порожньо, якщо знімок не читається чи гра стара (без plays). */
  questions: AchievementQuestion[];
  rows: AchievementRow[];
  adjustments: { participantId: string; source: AdjustmentSource; points: number }[];
}

/** Елементи списку за ключем, в одному проході. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(key(item));
    if (list === undefined) groups.set(key(item), [item]);
    else list.push(item);
  }
  return groups;
}

/** Зіграні запитання гри зі знімка й журналу; запитання, якого немає в знімку, пропускається (індекси решти не зсуваються). */
function questionsOf(rawSnapshot: unknown, plays: PlayRef[], questionsPlayed: number): AchievementQuestion[] {
  // Старі ігри без журналу не знають раундів і клітинок: умови за запитаннями для них не рахуються.
  if (plays.length === 0) return [];
  let quiz: Quiz | null;
  try {
    quiz = snapshotOf(rawSnapshot);
  } catch {
    quiz = null;
  }
  if (quiz === null) return [];
  const known = quiz;
  return playedQuestions(known, plays, questionsPlayed).flatMap(({ roundIndex, question, ref }, index): AchievementQuestion[] => {
    if (question === undefined || ref === undefined) return [];
    const round = known.rounds[roundIndex];
    const found = ref.cell !== undefined && round?.type === 'board' ? findCell(round, ref.cell.cellId) : undefined;
    // Як factInputOf: усна клітинка не має справжнього часу відповіді.
    const voice = round?.type === 'board' && found !== undefined && cellAnswerMode(round, found.cell) === 'voice';
    const cellBlitz = found?.cell.kind === 'blitz';
    return [
      {
        index,
        roundIndex,
        roundType: round?.type ?? null,
        question,
        limitMs: factLimitMs(question, round, voice),
        scored: !isUnscored(question),
        blitz: round?.type === 'blitz' || cellBlitz,
        cell:
          ref.cell === undefined || found === undefined
            ? null
            : { chooserId: ref.cell.chooserId, mark: found.cell.mark === 'x2' ? 2 : found.cell.mark === 'x3' ? 3 : 1, blitz: cellBlitz },
        ref,
      },
    ];
  });
}

/** Ігри за id для ачівок: чотири запити на всю пачку (ігри, учасники, відповіді, коригування) і розбір знімка в Node. Порядок — як у gameIds. */
export async function loadAchievementGames(db: Db, gameIds: string[]): Promise<AchievementGame[]> {
  if (gameIds.length === 0) return [];
  const games = await db
    .select({
      id: game.id,
      status: game.status,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      questionsPlayed: game.questionsPlayed,
      plays: game.plays,
      quizSnapshot: game.quizSnapshot,
    })
    .from(game)
    .where(inArray(game.id, gameIds));
  if (games.length === 0) return [];

  const participants = await db
    .select({ id: participant.id, gameId: participant.gameId, userId: participant.userId, score: participant.score, rank: participant.rank, isTeam: participant.isTeam, teamId: participant.teamId })
    .from(participant)
    .where(
      inArray(
        participant.gameId,
        games.map((g) => g.id),
      ),
    );
  const ids = participants.map((p) => p.id);
  const answers =
    ids.length === 0
      ? []
      : await db
          .select({
            participantId: answer.participantId,
            questionIndex: answer.questionIndex,
            roundIndex: answer.roundIndex,
            attempt: answer.attempt,
            payload: answer.payload,
            timeMs: answer.timeMs,
            accepted: answer.accepted,
            points: answer.points,
            buff: answer.buff,
            spareId: answer.spareId,
            debuff: answer.debuff,
            clue: answer.clue,
            answeredBy: answer.answeredBy,
          })
          .from(answer)
          // Голоси опитувань і хмари та позначки виходу — не відповіді.
          .where(and(inArray(answer.participantId, ids), ne(answer.attempt, VOTE_ATTEMPT), ne(answer.attempt, AWAY_ATTEMPT)));
  const adjustments =
    ids.length === 0
      ? []
      : await db
          .select({ participantId: scoreAdjustment.participantId, source: scoreAdjustment.source, points: scoreAdjustment.points })
          .from(scoreAdjustment)
          .where(inArray(scoreAdjustment.participantId, ids));

  const gameOf = new Map(participants.map((p) => [p.id, p.gameId]));
  const rowsOf = groupBy(answers, (a) => gameOf.get(a.participantId) ?? '');
  const adjustmentsOf = groupBy(adjustments, (a) => gameOf.get(a.participantId) ?? '');
  const participantsOf = groupBy(participants, (p) => p.gameId);
  const byId = new Map(games.map((g) => [g.id, g]));
  return gameIds.flatMap((gameId): AchievementGame[] => {
    const row = byId.get(gameId);
    if (row === undefined) return [];
    const own = participantsOf.get(gameId) ?? [];
    // Таблицю складають команди (командна гра) чи гравці (соло); рядки людей — склад команди.
    const players = own
      .filter((p) => p.teamId === null)
      .map((p) => ({
        participantId: p.id,
        userId: p.userId,
        members: own.filter((m) => m.teamId === p.id).map((m) => ({ participantId: m.id, userId: m.userId })),
        rank: p.rank,
        score: p.score,
      }));
    return [
      {
        gameId,
        status: row.status,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        questionsPlayed: row.questionsPlayed,
        teams: own.some((p) => p.isTeam),
        players,
        questions: questionsOf(row.quizSnapshot, row.plays, row.questionsPlayed),
        rows: rowsOf.get(gameId) ?? [],
        adjustments: adjustmentsOf.get(gameId) ?? [],
      },
    ];
  });
}

/** Учасник гри, за якого грав користувач: соло — свій рядок; команда — рядок команди і personId — рядок людини; null — не грав. */
export function whoIn(game: AchievementGame, userId: string): AchievementWho | null {
  for (const player of game.players) {
    const member = player.members.find((m) => m.userId === userId);
    if (member !== undefined) return { participantId: player.participantId, personId: member.participantId };
    if (player.userId === userId) return { participantId: player.participantId, personId: null };
  }
  return null;
}
