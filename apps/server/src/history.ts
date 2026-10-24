import {
  allSpares,
  isUnscored,
  questionPrice,
  questionsOf,
  findCell,
  roundQuestions,
  quizSchema,
  roundSchema,
  upgradeQuiz,
  wipeoutStandings,
  type AdjustmentSource,
  type BuffKind,
  type GameDetail,
  type Answer,
  type GameQuestionResult,
  type GameResponse,
  type GameStatus,
  type GameSummary,
  type PlayedGame,
  type FinalRound,
  type Question,
  type Quiz,
  type Round,
} from '@quiz/shared';
import { orderBluffOptions } from '@quiz/engine';
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { ADJUSTMENT_ATTEMPT, answer, game, participant, PENALTY_ATTEMPT, scoreAdjustment, VOTE_ATTEMPT, type PlayRef } from './db/schema';

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

/** Блеф для історії: варіанти в порядку розкриття (правда остання), прибрані в кінці; id авторів і виборів — нікнейми. */
function bluffResult(ref: PlayRef | undefined, nicknames: Map<string, string>): GameQuestionResult['bluff'] {
  if (ref?.bluff === undefined) return undefined;
  const { options, picks } = ref.bluff;
  const named = (ids: string[]) => ids.flatMap((id) => nicknames.get(id) ?? []);
  const ordered = [...orderBluffOptions(options, Object.values(picks)), ...options.filter((o) => o.removed)];
  return {
    options: ordered.map((o) => ({
      text: o.text,
      kind: o.kind,
      authors: named(o.authors),
      pickedBy: named(Object.entries(picks).flatMap(([playerId, optionId]) => (optionId === o.id ? [playerId] : []))),
      removed: o.removed,
    })),
  };
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
    price: questionPrice(found.cell.question),
    multiplier: found.cell.mark === 'x2' ? 2 : found.cell.mark === 'x3' ? 3 : 1,
    chooser: nicknames.get(chooserId) ?? null,
    points: own.length === 0 ? null : own.reduce((sum, a) => sum + a.points, 0),
  };
}

/** Відповіді на запитання: учасники за турнірною таблицею, потім за номером спроби. */
function responsesOf(
  given: { participantId: string; attempt: number; payload: Answer | null; accepted: boolean; buff: BuffKind | null; spareId: string | null }[],
  standings: { participantId: string; nickname: string }[],
  spares: Question[],
): GameResponse[] {
  return standings.flatMap(({ participantId, nickname }) =>
    given
      // Штрафний рядок бліц-клітинки не є відповіддю.
      .filter((a) => a.participantId === participantId && a.attempt !== PENALTY_ATTEMPT)
      .sort((a, b) => a.attempt - b.attempt)
      .map((a) => ({ nickname, answer: a.payload, accepted: a.accepted, buff: a.buff ?? null, spare: spares.find((q) => q.id === a.spareId) ?? null })),
  );
}

/** Запитання фіналу: ставка кожного учасника з рядками на нього (мовчання теж), за турнірною таблицею. */
function finalResult(
  round: FinalRound,
  given: { participantId: string; attempt: number; payload: Answer | null; accepted: boolean; points: number; wager: number | null }[],
  standings: { participantId: string; nickname: string }[],
): GameQuestionResult['final'] {
  return {
    // Знімок пройшов схему, тож у старих іграх тут «Класичні» за замовчуванням.
    mode: round.wagerMode,
    entries: standings.flatMap(({ participantId, nickname }) => {
      const row = given.filter((a) => a.participantId === participantId).sort((a, b) => b.attempt - a.attempt)[0];
      // Старі ігри не зберігали ставку: у класиці бали фіналу завжди «плюс» або «мінус» ставка.
      return row === undefined
        ? []
        : [{ nickname, answer: row.attempt === PENALTY_ATTEMPT ? null : row.payload, wager: row.wager ?? Math.abs(row.points), points: row.points, accepted: row.accepted }];
    }),
  };
}

/**
 * Драбина «Ва-банк» після запитання index: ціна зі знімка, стан і банк кожного учасника за турнірною таблицею.
 * Кроки — запитання цього раунду до index включно: правильні — учасники з прийнятою відповіддю (спроба 0), забрали — з журналу.
 */
function wipeoutResult(
  quiz: Quiz,
  plays: PlayRef[],
  index: number,
  answers: { participantId: string; questionIndex: number; attempt: number; accepted: boolean }[],
  standings: { participantId: string; nickname: string }[],
): GameQuestionResult['wipeout'] {
  const ref = plays[index];
  if (ref === undefined) return undefined;
  const indices = plays.flatMap((play, i) => (i <= index && play.roundIndex === ref.roundIndex ? [i] : []));
  const steps = indices.flatMap((i) => {
    const question = roundQuestionsAt(quiz, plays[i].roundIndex).find((q) => q.id === plays[i].questionId);
    if (question === undefined) return [];
    return [
      {
        price: question.points,
        correct: answers.filter((a) => a.questionIndex === i && a.attempt === 0 && a.accepted).map((a) => a.participantId),
        took: plays[i].wipeout?.took ?? [],
      },
    ];
  });
  const table = wipeoutStandings(
    standings.map((s) => s.participantId),
    steps,
    ref.wipeout?.end === true,
  );
  return {
    price: steps.at(-1)?.price ?? 0,
    rows: standings.map(({ participantId, nickname }) => ({ nickname, status: table[participantId].status, bank: table[participantId].bank })),
  };
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
            wager: answer.wager,
            buff: answer.buff,
            spareId: answer.spareId,
          })
          .from(answer)
          .where(
            inArray(
              answer.participantId,
              participants.map((p) => p.id),
            ),
          );

  const adjustments =
    participants.length === 0
      ? []
      : await db
          .select()
          .from(scoreAdjustment)
          .where(
            inArray(
              scoreAdjustment.participantId,
              participants.map((p) => p.id),
            ),
          )
          .orderBy(asc(scoreAdjustment.seq));

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
    // Як на сцені: у класиці відповіді на запасні — інше запитання, лічильники їх не рахують; на полі рахують.
    const main = ref?.cell !== undefined ? given : given.filter((a) => a.spareId === null);
    const round = quiz?.rounds[roundIndex];
    const cloudRows = question.type === 'survey' ? ref?.surveyRows : undefined;
    return [
      {
        index,
        roundIndex,
        text: question.text,
        type: question.type,
        answered: distinct(main.filter((a) => a.attempt !== PENALTY_ATTEMPT).map((a) => a.participantId)),
        accepted: distinct(main.filter((a) => a.accepted).map((a) => a.participantId)),
        cell: quiz === null ? null : cellResult(quiz, ref, nicknames, given, standings),
        question: cloudRows === undefined ? question : { ...question, rows: cloudRows },
        ...(cloudRows === undefined ? {} : { surveyFromCloud: true as const }),
        ...(ref?.bluff === undefined ? {} : { bluff: bluffResult(ref, nicknames) }),
        ...(ref?.cloudHidden === undefined || ref.cloudHidden.length === 0 ? {} : { cloudHidden: ref.cloudHidden }),
        responses: responsesOf(given, standings, quiz === null ? [] : allSpares(quiz)),
        ...(round?.type === 'wipeout' && quiz !== null ? { wipeout: wipeoutResult(quiz, row.plays, index, answers, standings) } : {}),
        final: round?.type === 'final' ? finalResult(round, given, standings) : null,
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
    adjustments: adjustments.map(({ participantId, seq, roundIndex, afterQuestion, points, source, debuff, targetNickname }) => ({
      seq,
      roundIndex,
      afterQuestion,
      // Коригування вилученого гравця зникають разом з учасником (каскадом), тож нікнейм є завжди.
      nickname: nicknames.get(participantId) ?? '',
      points,
      source,
      ...(source === 'debuff' ? { debuff: debuff ?? undefined, target: targetNickname } : {}),
    })),
  };
}

export interface AnswerMark {
  questionIndex: number;
  attempt: number;
  accepted: boolean;
}

/** Рядок-відповідь для статистики гравця: без штрафів і голосів (опитування, хмара). */
const isAnswerRow = (attempt: number) => attempt !== PENALTY_ATTEMPT && attempt !== VOTE_ATTEMPT;

/** Скільки з перших questionsPlayed запитань журналу — без балів (опитування, хмара). Старі ігри без журналу — 0. */
function unscoredPlayed(snapshot: unknown, plays: PlayRef[] | null, questionsPlayed: number): number {
  if (plays === null || typeof snapshot !== 'object' || snapshot === null) return 0;
  const { rounds } = snapshot as { rounds?: unknown };
  if (!Array.isArray(rounds)) return 0;
  return plays.slice(0, questionsPlayed).filter((ref) => {
    const round: unknown = rounds[ref.roundIndex];
    const questions = typeof round === 'object' && round !== null ? (round as { questions?: unknown }).questions : undefined;
    if (!Array.isArray(questions)) return false;
    const found: unknown = questions.find((q: unknown) => typeof q === 'object' && q !== null && (q as { id?: unknown }).id === ref.questionId);
    return typeof found === 'object' && found !== null && isUnscored(found as { type: Question['type'] });
  }).length;
}

/**
 * Скільки зіграних запитань «Ва-банк» цей гравець не грав: після згоряння чи «Забрати» він лише дивився, рядків-відповідей на ті сходинки немає.
 * Такі сходинки не рахуємо його запитаннями: точність — зі сходинок, на яких він був у грі (мовчання теж невдала відповідь).
 * Драбина одного гравця залежить лише від його власних правильних відповідей і його рішення, тож чужих рядків не потрібно.
 */
function unplayedWipeout(snapshot: unknown, plays: PlayRef[] | null, questionsPlayed: number, participantId: string, accepted: Set<number>): number {
  // Розбір знімка дорогий: для ігор без «Ва-банк» його не робимо.
  const rounds = typeof snapshot === 'object' && snapshot !== null ? (snapshot as { rounds?: unknown }).rounds : undefined;
  if (plays === null || !Array.isArray(rounds) || !rounds.some((round: unknown) => (round as { type?: unknown } | null)?.type === 'wipeout')) return 0;
  const quiz = snapshotOf(snapshot);
  if (quiz === null) return 0;
  const played = plays.slice(0, questionsPlayed);
  let unplayed = 0;
  for (const roundIndex of new Set(played.map((ref) => ref.roundIndex))) {
    if (quiz.rounds[roundIndex]?.type !== 'wipeout') continue;
    const indices = played.flatMap((ref, i) => (ref.roundIndex === roundIndex ? [i] : []));
    const steps = indices.map((i) => ({
      price: roundQuestionsAt(quiz, roundIndex).find((q) => q.id === played[i].questionId)?.points ?? 0,
      correct: accepted.has(i) ? [participantId] : [],
      took: played[i].wipeout?.took ?? [],
    }));
    const { step } = wipeoutStandings([participantId], steps, false)[participantId];
    if (step !== null) unplayed += steps.length - 1 - step;
  }
  return unplayed;
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

  const byParticipant = groupBy(answers, (a) => a.participantId);
  return rows.map((row) => {
    const mine = byParticipant.get(row.participant.id) ?? [];
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
        answered: distinct(mine.filter((a) => isAnswerRow(a.attempt)).map((a) => a.questionIndex)),
        questionsPlayed:
          row.game.questionsPlayed -
          unscoredPlayed(row.game.quizSnapshot, row.game.plays, row.game.questionsPlayed) -
          unplayedWipeout(
            row.game.quizSnapshot,
            row.game.plays,
            row.game.questionsPlayed,
            row.participant.id,
            new Set(mine.filter((a) => a.accepted && a.attempt === 0).map((a) => a.questionIndex)),
          ),
      },
      marks: mine.filter((a) => isAnswerRow(a.attempt)).map(({ questionIndex, attempt, accepted }) => ({ questionIndex, attempt, accepted })),
    };
  });
}

export async function playerHistory(db: Db, userId: string): Promise<PlayedGame[]> {
  return (await playerGames(db, userId, LIMIT)).map((g) => g.played);
}

export interface TableRow {
  roundIndex: number;
  /** Номер спроби, PENALTY_ATTEMPT для штрафу або ADJUSTMENT_ATTEMPT для коригування рахунку. */
  attempt: number;
  accepted: boolean;
  points: number;
  /** Ставка фіналу; null поза фіналом і в старих іграх. */
  wager: number | null;
  /** Звідки коригування (ведучий чи дуель); лише в рядках ADJUSTMENT_ATTEMPT. */
  source?: AdjustmentSource;
}

export interface TablePlayer {
  participantId: string;
  userId: string | null;
  score: number;
  rank: number | null;
  rows: TableRow[];
}

/** Гра з усіма учасниками: для ачівок, що порівнюють гравців у межах раунду. */
export interface GameTable {
  gameId: string;
  status: GameStatus;
  startedAt: string;
  /** Типи раундів зі знімка; [] — знімок не вдалося прочитати. */
  roundTypes: Round['type'][];
  players: TablePlayer[];
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

const ROUND_TYPES: ReadonlySet<unknown> = new Set(roundSchema.options.map((option) => option.shape.type.value));

/** Типи раундів, прочитані в SQL, якщо кожен раунд має відомий тип; інакше null — тоді читаємо весь знімок. */
function roundTypesOf(types: unknown, roundCount: number | null): Round['type'][] | null {
  if (roundCount === null || !Array.isArray(types) || types.length !== roundCount) return null;
  return types.every((type) => ROUND_TYPES.has(type)) ? (types as Round['type'][]) : null;
}

/**
 * Ігри за id (порядок не гарантовано), з усіма учасниками та їхніми рядками answer і коригуваннями (attempt = ADJUSTMENT_ATTEMPT).
 * Типи раундів читаються в SQL без завантаження знімка; лише старий формат (без rounds) чи дивний знімок
 * дочитується повністю й розбирається схемою.
 */
export async function gameTables(db: Db, gameIds: string[]): Promise<GameTable[]> {
  if (gameIds.length === 0) return [];
  const rounds = sql`${game.quizSnapshot}->'rounds'`;
  const games = await db
    .select({
      id: game.id,
      status: game.status,
      startedAt: game.startedAt,
      roundCount: sql<number | null>`case when jsonb_typeof(${rounds}) = 'array' then jsonb_array_length(${rounds}) end`,
      roundTypes: sql<unknown>`jsonb_path_query_array(${game.quizSnapshot}, '$.rounds[*].type')`,
    })
    .from(game)
    .where(inArray(game.id, gameIds));
  const types = new Map(games.map((row) => [row.id, roundTypesOf(row.roundTypes, row.roundCount)]));
  const unread = games.filter((row) => types.get(row.id) === null).map((row) => row.id);
  if (unread.length > 0) {
    const snapshots = await db.select({ id: game.id, quizSnapshot: game.quizSnapshot }).from(game).where(inArray(game.id, unread));
    for (const row of snapshots) types.set(row.id, (snapshotOf(row.quizSnapshot)?.rounds ?? []).map((round) => round.type));
  }

  const participants = await db
    .select({ id: participant.id, gameId: participant.gameId, userId: participant.userId, score: participant.score, rank: participant.rank })
    .from(participant)
    .where(inArray(participant.gameId, gameIds));
  const answers =
    participants.length === 0
      ? []
      : await db
          .select({ participantId: answer.participantId, roundIndex: answer.roundIndex, attempt: answer.attempt, accepted: answer.accepted, points: answer.points, wager: answer.wager })
          .from(answer)
          .where(
            and(
              inArray(
                answer.participantId,
                participants.map((p) => p.id),
              ),
              // Голоси опитувань і хмари не бувають спробами: таблиця рахує лише відповіді й штрафи.
              ne(answer.attempt, VOTE_ATTEMPT),
            ),
          );
  const adjustments =
    participants.length === 0
      ? []
      : await db
          .select({
            participantId: scoreAdjustment.participantId,
            roundIndex: scoreAdjustment.roundIndex,
            points: scoreAdjustment.points,
            source: scoreAdjustment.source,
          })
          .from(scoreAdjustment)
          .where(
            inArray(
              scoreAdjustment.participantId,
              participants.map((p) => p.id),
            ),
          );
  // Коригування — рядки без відповіді: входять у бали раунду (бліц, камбек), але не в «влучив у фінал».
  // Дуель теж коригування, але бліц-раунду не виграє: source лишається в рядку.
  const adjustmentRows = adjustments.map(({ participantId, roundIndex, points, source }) => ({
    participantId,
    roundIndex,
    attempt: ADJUSTMENT_ATTEMPT,
    accepted: false,
    points,
    wager: null,
    source,
  }));
  const playersByGame = groupBy(participants, (p) => p.gameId);
  const rowsByParticipant = groupBy<TableRow & { participantId: string }>([...answers, ...adjustmentRows], (a) => a.participantId);
  return games.map((row) => ({
    gameId: row.id,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    roundTypes: types.get(row.id) ?? [],
    players: (playersByGame.get(row.id) ?? []).map((p) => ({
      participantId: p.id,
      userId: p.userId,
      score: p.score,
      rank: p.rank,
      rows: (rowsByParticipant.get(p.id) ?? []).map(({ roundIndex, attempt, accepted, points, wager, source }) => ({
        roundIndex,
        attempt,
        accepted,
        points,
        wager,
        ...(source === undefined ? {} : { source }),
      })),
    })),
  }));
}
