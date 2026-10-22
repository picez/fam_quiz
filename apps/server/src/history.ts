import {
  questionsOf,
  findCell,
  roundQuestions,
  quizSchema,
  upgradeQuiz,
  type GameDetail,
  type Answer,
  type GameQuestionResult,
  type GameResponse,
  type GameSummary,
  type PlayedGame,
  type Question,
  type Quiz,
} from '@quiz/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { answer, game, participant, PENALTY_ATTEMPT, type PlayRef } from './db/schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 100;

/**
 * Знімок вікторини гри: ігри, зіграні до появи раундів, зберегли його в старому форматі.
 * Знімки не змінюються, а схема змінюється, тож старий знімок може її не пройти: тоді null.
 */
function snapshotOf(raw: unknown): Quiz | null {
  const parsed = quizSchema.safeParse(upgradeQuiz(raw));
  return parsed.success ? parsed.data : null;
}

/** Кількість запитань у знімку без повної валідації: зіпсований знімок рахуємо за сирою структурою. */
function questionCountOf(raw: unknown): number {
  const quiz = snapshotOf(raw);
  if (quiz !== null) return questionsOf(quiz).length;
  const upgraded = upgradeQuiz(raw);
  if (typeof upgraded !== 'object' || upgraded === null) return 0;
  const { rounds, questions } = upgraded as { rounds?: unknown; questions?: unknown };
  if (Array.isArray(rounds)) {
    return rounds.reduce((sum: number, round: unknown) => {
      const { questions: list, categories } =
        typeof round === 'object' && round !== null ? (round as { questions?: unknown; categories?: unknown }) : {};
      // У раунді поля запитання лежать у клітинках категорій.
      const cells = Array.isArray(categories)
        ? categories.reduce((n: number, category: unknown) => {
            const own = typeof category === 'object' && category !== null ? (category as { cells?: unknown }).cells : undefined;
            return n + (Array.isArray(own) ? own.length : 0);
          }, 0)
        : 0;
      return sum + (Array.isArray(list) ? list.length : 0) + cells;
    }, 0);
  }
  return Array.isArray(questions) ? questions.length : 0;
}

function roundQuestionsAt(quiz: Quiz, roundIndex: number): Question[] {
  const round = quiz.rounds[roundIndex];
  return round ? roundQuestions(round) : [];
}

/** Закриті запитання гри в порядку гри; індекс у масиві відповідає answer.question_index. */
function playedQuestions(quiz: Quiz, plays: PlayRef[], questionsPlayed: number) {
  // Старі ігри не мають журналу: вони йшли одним списком, тож зіграно перші questionsPlayed запитань.
  if (plays.length === 0) {
    return questionsOf(quiz)
      .slice(0, questionsPlayed)
      .map((question) => ({ roundIndex: 0, question, ref: undefined }));
  }
  return plays.slice(0, questionsPlayed).map((ref) => ({
    roundIndex: ref.roundIndex,
    question: roundQuestionsAt(quiz, ref.roundIndex).find((q) => q.id === ref.questionId),
    ref,
  }));
}

/** Клітинка запитання для історії: категорія, ціна й множник зі знімка, вибравший і його бали. */
function cellResult(
  quiz: Quiz,
  ref: PlayRef | undefined,
  nicknames: Map<string, string>,
  given: { participantId: string; points: number }[],
  standings: { participantId: string; nickname: string }[],
): GameQuestionResult['cell'] {
  if (ref?.cell === undefined) return null;
  const round = quiz.rounds[ref.roundIndex];
  const found = round?.type === 'board' ? findCell(round, ref.cell.cellId) : undefined;
  if (found === undefined) return null;
  const { chooserId } = ref.cell;
  const own = given.filter((a) => a.participantId === chooserId);
  const blitz = found.cell.kind === 'blitz';
  return {
    kind: found.cell.kind,
    scores: blitz
      ? standings.flatMap(({ participantId, nickname }) => {
          const rows = given.filter((a) => a.participantId === participantId);
          return rows.length === 0 ? [] : [{ nickname, points: rows.reduce((sum, a) => sum + a.points, 0) }];
        })
      : [],
    category: found.category.title,
    price: found.cell.question.points,
    multiplier: found.cell.mark === 'x2' ? 2 : found.cell.mark === 'x3' ? 3 : 1,
    chooser: nicknames.get(chooserId) ?? null,
    points: own.length === 0 ? null : own.reduce((sum, a) => sum + a.points, 0),
  };
}

/** Відповіді на запитання: учасники за турнірною таблицею, потім за номером спроби. */
function responsesOf(
  given: { participantId: string; attempt: number; payload: Answer | null; accepted: boolean }[],
  standings: { participantId: string; nickname: string }[],
): GameResponse[] {
  return standings.flatMap(({ participantId, nickname }) =>
    given
      // Штрафний рядок бліц-клітинки не є відповіддю.
      .filter((a) => a.participantId === participantId && a.attempt !== PENALTY_ATTEMPT)
      .sort((a, b) => a.attempt - b.attempt)
      .map((a) => ({ nickname, answer: a.payload, accepted: a.accepted })),
  );
}

/** Кількість різних значень: у бліці гравець може мати кілька рядків-спроб на одне запитання. */
const distinct = (values: unknown[]) => new Set(values).size;

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
    questionCount: questionCountOf(row.quizSnapshot),
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
          .select({
            participantId: answer.participantId,
            questionIndex: answer.questionIndex,
            attempt: answer.attempt,
            payload: answer.payload,
            accepted: answer.accepted,
            points: answer.points,
          })
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
      correct: distinct(answers.filter((a) => a.participantId === p.id && a.accepted).map((a) => a.questionIndex)),
    }))
    // Спершу за місцем; до фінішу місць немає, тоді за балами.
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.score - a.score || a.nickname.localeCompare(b.nickname));

  const quiz = snapshotOf(row.quizSnapshot);
  const nicknames = new Map(participants.map((p) => [p.id, p.nickname]));
  // Зіпсований знімок не валить деталі: турнірна таблиця є, запитань і раундів немає.
  const questions = (quiz === null ? [] : playedQuestions(quiz, row.plays, row.questionsPlayed)).flatMap(({ roundIndex, question, ref }, index) => {
    // Знімок не змінюється, тож запитання з журналу в ньому є; перевірка лише від зіпсованого рядка.
    if (question === undefined) return [];
    const given = answers.filter((a) => a.questionIndex === index);
    return [
      {
        index,
        roundIndex,
        text: question.text,
        type: question.type,
        answered: distinct(given.filter((a) => a.attempt !== PENALTY_ATTEMPT).map((a) => a.participantId)),
        accepted: distinct(given.filter((a) => a.accepted).map((a) => a.participantId)),
        cell: quiz === null ? null : cellResult(quiz, ref, nicknames, given, standings),
        question,
        responses: responsesOf(given, standings),
      },
    ];
  });

  return {
    id: row.id,
    title: row.title,
    code: row.code,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    questionsPlayed: row.questionsPlayed,
    questionCount: questionCountOf(row.quizSnapshot),
    rounds: (quiz?.rounds ?? []).map((round) => ({ title: round.title, type: round.type })),
    standings,
    questions,
  };
}

export interface AnswerMark {
  questionIndex: number;
  attempt: number;
  accepted: boolean;
}

/** Ігри гравця з акаунта, найновіші першими, з рядками його відповідей; limit null — усі. */
export async function playerGames(db: Db, userId: string, limit: number | null): Promise<{ played: PlayedGame; marks: AnswerMark[] }[]> {
  const query = db
    .select({ participant, game })
    .from(participant)
    .innerJoin(game, eq(participant.gameId, game.id))
    .where(eq(participant.userId, userId))
    .orderBy(desc(game.startedAt));
  const rows = limit === null ? await query : await query.limit(limit);
  if (rows.length === 0) return [];

  const players = await playerCounts(
    db,
    rows.map((row) => row.game.id),
  );
  const answers = await db
    .select({ participantId: answer.participantId, questionIndex: answer.questionIndex, accepted: answer.accepted, attempt: answer.attempt })
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
      played: {
        gameId: row.game.id,
        title: row.game.title,
        status: row.game.status,
        startedAt: row.game.startedAt.toISOString(),
        nickname: row.participant.nickname,
        score: row.participant.score,
        rank: row.participant.rank,
        playerCount: players.get(row.game.id) ?? 0,
        correct: distinct(mine.filter((a) => a.accepted).map((a) => a.questionIndex)),
        answered: distinct(mine.filter((a) => a.attempt !== PENALTY_ATTEMPT).map((a) => a.questionIndex)),
        questionsPlayed: row.game.questionsPlayed,
      },
      marks: mine.map(({ questionIndex, attempt, accepted }) => ({ questionIndex, attempt, accepted })),
    };
  });
}

export async function playerHistory(db: Db, userId: string): Promise<PlayedGame[]> {
  return (await playerGames(db, userId, LIMIT)).map((g) => g.played);
}
