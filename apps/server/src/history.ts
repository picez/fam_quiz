import {
  AWAY_MS,
  adjustmentSource,
  allSpares,
  answerSource,
  bluffFact,
  breakdownOf,
  cellAnswerMode,
  factLimitMs,
  factTable,
  gameAwards,
  roundTotals,
  LIFELINES,
  isUnscored,
  questionPrice,
  questionsOf,
  findCell,
  roundQuestions,
  quizSchema,
  RESUME_OPTIONS,
  roundSchema,
  survivorsAfter,
  upgradeQuiz,
  wipeoutStandings,
  type AdjustmentSource,
  type AppealOutcome,
  type AppealReason,
  type BuffKind,
  type FactInput,
  type FactQuestion,
  type GameAppeal,
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
  type ResumeOption,
  type Round,
  type ScoreLine,
} from '@quiz/shared';
import { orderBluffOptions } from '@quiz/engine';
import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { ADJUSTMENT_ATTEMPT, answer, appeal, AWAY_ATTEMPT, game, participant, PENALTY_ATTEMPT, scoreAdjustment, VOTE_ATTEMPT, type PlayRef } from './db/schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 100;

/**
 * Знімок вікторини гри: ігри, зіграні до появи раундів, зберегли його в старому форматі.
 * Знімки не змінюються, а схема змінюється, тож старий знімок може її не пройти: тоді null.
 */
export function snapshotOf(raw: unknown): Quiz | null {
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
export function playedQuestions(quiz: Quiz, plays: PlayRef[], questionsPlayed: number) {
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

/** Вхід цікавинок з бази (12d): ті самі рядки, що рушій бере зі стану. Рядки answer з attempt ≥ 0 (без штрафів і голосів); запитання — зі знімка, якщо він читається. */
function factInputOf(
  quiz: Quiz | null,
  played: { roundIndex: number; question: Question | undefined; ref: PlayRef | undefined }[],
  standings: { participantId: string; nickname: string; rank: number | null; score: number; rounds: number[] }[],
  answers: { participantId: string; questionIndex: number; roundIndex: number; attempt: number; payload: Answer | null; timeMs: number; accepted: boolean; wager: number | null; buff: BuffKind | null; spareId: string | null; awayMs: number | null }[],
  adjustments: { participantId: string; source: AdjustmentSource; targetNickname: string | null; points: number }[],
  appeals: { participantId: string; outcome: AppealOutcome }[],
): FactInput {
  const questions: FactQuestion[] = [];
  let number = 0;
  played.forEach(({ roundIndex, question, ref }, index) => {
    // Номер у раунді рахує й запитання, якого немає в знімку: як у грі.
    number = index > 0 && played[index - 1].roundIndex === roundIndex ? number + 1 : 1;
    if (question === undefined) return;
    const round = quiz?.rounds[roundIndex];
    const cell = ref?.cell !== undefined && round?.type === 'board' ? findCell(round, ref.cell.cellId) : undefined;
    const voice = round?.type === 'board' && cell !== undefined && cellAnswerMode(round, cell.cell) === 'voice';
    questions.push({
      index,
      roundIndex,
      number,
      text: question.text,
      limitMs: factLimitMs(question, round, voice),
      scored: !isUnscored(question),
      board: ref?.cell !== undefined,
      blitz: round?.type === 'blitz' || cell?.cell.kind === 'blitz',
      bluff: question.type === 'bluff',
      final: round?.type === 'final',
    });
  });
  const finals = new Set(questions.filter((q) => q.final).map((q) => q.index));
  const ids = new Set(standings.map((s) => s.participantId));
  // Ціль дебафу записано нікнеймом: він унікальний лише серед теперішніх учасників, тож ціль, яку вилучили, а її нікнейм
  // узяв новий гравець, припишеться новому (рідкісна прогалина; рушій має id і такої плутанини не має).
  const idOf = new Map(standings.map((s) => [s.nickname, s.participantId]));
  return {
    // Командна гра: таблиця — рядки команд; рядки людей (голоси) сюди не потрапляють.
    // Перенесені бали (12r) — сума рядків 'carry' учасника, як у рушія.
    players: standings.map(({ participantId, nickname, rank, score, rounds }) => ({
      id: participantId,
      nickname,
      rank,
      score,
      rounds,
      carry: adjustments.filter((a) => a.source === 'carry' && a.participantId === participantId).reduce((s, a) => s + a.points, 0),
    })),
    questions,
    rows: answers
      // Від'ємні спроби — штрафи бліц-клітинки, мовчання у фіналі й голоси: не відповіді.
      .filter((a) => a.attempt >= 0 && ids.has(a.participantId))
      .map((a) => ({
        playerId: a.participantId,
        questionIndex: a.questionIndex,
        roundIndex: a.roundIndex,
        attempt: a.attempt,
        timeMs: a.timeMs,
        accepted: a.accepted,
        buff: a.buff ?? null,
        spare: a.spareId !== null,
        // Старі рядки фіналу без ставки — як у грі без ставки (0).
        wager: finals.has(a.questionIndex) ? (a.wager ?? 0) : a.wager,
        bluff: bluffFact(a.payload),
      })),
    debuffs: adjustments
      .filter((a) => a.source === 'debuff')
      .map((a) => ({ by: a.participantId, target: a.targetNickname === null ? null : (idOf.get(a.targetNickname) ?? null) })),
    // Позначки «відволікався» (12e): ті самі, що в рушія, — учасники таблиці з awayMs від порогу, раз на запитання;
    // штрафні рядки (не натискав на бліці, мовчання у фіналі) і рядки лише з позначкою (AWAY_ATTEMPT) теж, голоси (VOTE_ATTEMPT) — ні.
    away: answers
      .filter((a) => (a.attempt >= 0 || a.attempt === PENALTY_ATTEMPT || a.attempt === AWAY_ATTEMPT) && ids.has(a.participantId) && a.awayMs !== null && a.awayMs >= AWAY_MS.mark)
      .map((a) => ({ playerId: a.participantId, questionIndex: a.questionIndex }))
      .filter((a, i, all) => all.findIndex((b) => b.playerId === a.playerId && b.questionIndex === a.questionIndex) === i),
    // Раховані закриті апеляції (12f) учасників таблиці: host і cancelled не рахуються, як у рушія.
    appeals: appeals.flatMap((a) => (ids.has(a.participantId) && (a.outcome === 'yes' || a.outcome === 'no' || a.outcome === 'tie') ? [{ playerId: a.participantId, outcome: a.outcome }] : [])),
  };
}

/** Нагороди гри й таблиця учасників для історії (12d). */
function factsOf(input: FactInput): GameDetail['facts'] {
  return { awards: gameAwards(input), table: factTable(input) };
}

/** Відповіді на запитання: учасники за турнірною таблицею, потім за номером спроби. */
function responsesOf(
  given: { participantId: string; attempt: number; payload: Answer | null; accepted: boolean; buff: BuffKind | null; spareId: string | null; awayMs: number | null }[],
  standings: { participantId: string; nickname: string }[],
  spares: Question[],
  appeals: { participantId: string; reason: AppealReason; yes: number; no: number; outcome: AppealOutcome }[] = [],
  marks: { participantId: string; awayMs: number | null }[] = [],
): GameResponse[] {
  return standings.flatMap(({ participantId, nickname }) => {
    // Апеляція стоїть на першому рядку відповіді учасника; cancelled історія не показує.
    const found = appeals.find((a) => a.participantId === participantId && a.outcome !== 'cancelled');
    const own: GameAppeal | null =
      found === undefined ? null : { reason: found.reason, yes: found.yes, no: found.no, outcome: found.outcome as GameAppeal['outcome'] };
    const rows = given
      // Штрафний рядок бліц-клітинки не є відповіддю; мовчання з «Ризиком» (12h) видно рядком без відповіді зі значком бафу.
      .filter((a) => a.participantId === participantId && (a.attempt !== PENALTY_ATTEMPT || a.buff === 'risk'))
      .sort((a, b) => a.attempt - b.attempt)
      .map((a, i) => ({ nickname, answer: a.payload, accepted: a.accepted, buff: a.buff ?? null, spare: spares.find((q) => q.id === a.spareId) ?? null, awayMs: a.awayMs ?? null, appeal: i === 0 ? own : null }));
    if (rows.length > 0 || own === null) return rows;
    // Апеляція учасника без рядка відповіді (лише позначка виходу чи штрафний рядок) — окремий рядок без відповіді, щоб її було видно.
    const away = marks.find((a) => a.participantId === participantId)?.awayMs ?? null;
    return [{ nickname, answer: null, accepted: false, buff: null, spare: null, awayMs: away, appeal: own }];
  });
}

/** Запитання фіналу: ставка кожного учасника з рядками на нього (мовчання теж), за турнірною таблицею. */
function finalResult(
  round: FinalRound,
  given: { participantId: string; attempt: number; payload: Answer | null; accepted: boolean; points: number; wager: number | null; awayMs: number | null }[],
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
        : [{ nickname, answer: row.attempt === PENALTY_ATTEMPT ? null : row.payload, wager: row.wager ?? Math.abs(row.points), points: row.points, accepted: row.accepted, awayMs: row.awayMs ?? null }];
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

/**
 * «Вибування» після запитання index: вердикт (з edge і живих до запитання), випробування за учасниками таблиці, привиди й живі після нього.
 * Живі — учасники без тих, хто є в out випробувань цього раунду до index включно.
 */
function survivalResult(quiz: Quiz, plays: PlayRef[], index: number, standings: { participantId: string; nickname: string }[]): GameQuestionResult['survival'] {
  const ref = plays[index];
  const survival = ref?.survival;
  if (ref === undefined || survival === undefined) return undefined;
  const ids = standings.map((s) => s.participantId);
  const outsUpTo = (upTo: number) => plays.flatMap((play, i) => (i <= upTo && play.roundIndex === ref.roundIndex ? [play.survival?.trial?.out ?? []] : []));
  const before = survivorsAfter(ids, outsUpTo(index - 1));
  const edge = survival.edge;
  // Без edge вердикту не було: раунд чи гра скінчились на розкритті.
  const verdict = edge === undefined ? undefined : edge.length === 0 ? 'all_right' : before.every((id) => edge.includes(id)) ? 'all_wrong' : 'trial';
  const trial = survival.trial;
  const round = quiz.rounds[ref.roundIndex];
  const trialQuestion = trial?.questionId === undefined || round?.type !== 'survival' ? undefined : round.trials.find((q) => q.id === trial.questionId);
  const alive = new Set(survivorsAfter(ids, outsUpTo(index)));
  return {
    ...(verdict === undefined ? {} : { verdict }),
    ghosts: survival.ghosts ?? { answered: 0, right: 0 },
    trial:
      trial === undefined
        ? null
        : {
            kind: trial.kind,
            fellBack: trial.fellBack === true,
            question: trialQuestion?.text ?? null,
            ...(trialQuestion === undefined ? {} : { trialQuestion }),
            rows: standings
              .filter((s) => (edge ?? []).includes(s.participantId))
              .map(({ participantId, nickname }) => ({
                nickname,
                out: trial.out.includes(participantId),
                answer: trial.answers?.[participantId]?.answer ?? null,
                door: trial.doors?.[participantId]?.door ?? null,
                auto: trial.doors?.[participantId]?.auto === true,
                trap: trial.doors?.[participantId]?.trap ?? null,
              })),
          },
    alive: standings.filter((s) => alive.has(s.participantId)).map((s) => s.nickname),
    end: survival.end === true,
  };
}

/**
 * «Мільйонер» на запитанні index: учасник, сходинка, підказки, рішення й підсумок зі збереженого журналу; safe — з round.safe знімка.
 * Зал — рядки-відповіді всіх, крім учасника (мовчання — не рядок).
 */
function ladderResult(
  quiz: Quiz,
  plays: PlayRef[],
  index: number,
  nicknames: Map<string, string>,
  given: { participantId: string; attempt: number; accepted: boolean }[],
): GameQuestionResult['ladder'] {
  const ref = plays[index];
  const ladder = ref?.ladder;
  const round = ref === undefined ? undefined : quiz.rounds[ref.roundIndex];
  if (ref === undefined || ladder === undefined || round?.type !== 'ladder') return undefined;
  const hall = given.filter((a) => a.participantId !== ladder.contestant && isAnswerRow(a.attempt));
  const taken = ladder.lifelines ?? {};
  return {
    contestant: nicknames.get(ladder.contestant) ?? '',
    step: ladder.step,
    level: ladder.level,
    safe: round.safe.includes(ladder.step),
    lifelines: LIFELINES.filter((kind) => taken[kind] !== undefined).map((kind) => ({
      kind,
      removed: kind === 'fifty' ? (taken.fifty ?? []) : null,
      tally: kind === 'audience' ? (taken.audience ?? null) : null,
      hint: kind === 'hint' ? (taken.hint?.text ?? null) : null,
      aloud: kind === 'hint' && taken.hint?.aloud === true,
    })),
    decision: ladder.decision ?? null,
    outcome: ladder.outcome ?? null,
    hall: { answered: distinct(hall.map((a) => a.participantId)), right: distinct(hall.filter((a) => a.accepted).map((a) => a.participantId)) },
  };
}

/** Кількість різних значень: у бліці гравець може мати кілька рядків-спроб на одне запитання. */
const distinct = (values: unknown[]) => new Set(values).size;

/** Кількість людей (соло-гравців або людей команд, без рядків команд) у кожній із заданих ігор. */
async function playerCounts(db: Db, gameIds: string[]): Promise<Map<string, number>> {
  if (gameIds.length === 0) return new Map();
  const rows = await db
    .select({ gameId: participant.gameId, players: count() })
    .from(participant)
    .where(and(inArray(participant.gameId, gameIds), eq(participant.isTeam, false)))
    .groupBy(participant.gameId);
  return new Map(rows.map((row) => [row.gameId, row.players]));
}

/** Серед скількох рахується місце в кожній із заданих ігор: соло — гравці, командна гра — команди (рядки без team_id). */
async function rivalCounts(db: Db, gameIds: string[]): Promise<Map<string, number>> {
  if (gameIds.length === 0) return new Map();
  const rows = await db
    .select({ gameId: participant.gameId, players: count() })
    .from(participant)
    .where(and(inArray(participant.gameId, gameIds), isNull(participant.teamId)))
    .groupBy(participant.gameId);
  return new Map(rows.map((row) => [row.gameId, row.players]));
}

/** Командні ігри серед заданих: ті, де є рядки команд. */
async function teamGameIds(db: Db, gameIds: string[]): Promise<Set<string>> {
  if (gameIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ gameId: participant.gameId })
    .from(participant)
    .where(and(inArray(participant.gameId, gameIds), eq(participant.isTeam, true)));
  return new Set(rows.map((row) => row.gameId));
}

export async function hostGames(db: Db, hostId: string): Promise<GameSummary[]> {
  const games = await db.select().from(game).where(eq(game.hostId, hostId)).orderBy(desc(game.startedAt)).limit(LIMIT);
  const ids = games.map((row) => row.id);
  const players = await playerCounts(db, ids);
  const teamGames = await teamGameIds(db, ids);
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
    teams: teamGames.has(row.id),
    autopilot: row.autopilot,
  }));
}

/**
 * Раунд, з якого продовжити гру (12r): план 12r, «resumeOptions і resumeRound».
 * Останній закритий раунд завершено (зіграно всі його запитання) → наступний, інакше він сам; не далі за останній раунд знімка.
 */
export function resumeRound(quiz: Quiz | null, plays: PlayRef[], questionsPlayed: number): number {
  const refs = plays.slice(0, questionsPlayed);
  const last = refs.at(-1)?.roundIndex;
  if (last === undefined) return 0;
  if (quiz === null) return last;
  const round = quiz.rounds[last];
  if (round === undefined) return Math.min(last, quiz.rounds.length - 1);
  const done = refs.filter((ref) => ref.roundIndex === last).length >= roundQuestions(round).length;
  return Math.min(done ? last + 1 : last, quiz.rounds.length - 1);
}

/** Свої ігри цієї вікторини з хоч одним закритим запитанням, без поточної; найновіша перша; не більше RESUME_OPTIONS. */
export async function resumeOptions(db: Db, hostId: string, quizId: string, excludeId: string): Promise<ResumeOption[]> {
  const games = await db
    .select()
    .from(game)
    .where(and(eq(game.hostId, hostId), eq(game.quizId, quizId), ne(game.id, excludeId), sql`${game.questionsPlayed} > 0`))
    .orderBy(desc(game.startedAt))
    .limit(RESUME_OPTIONS);
  if (games.length === 0) return [];
  // Рядки таблиці: соло-гравці й команди (люди команд — копії командних, team_id не null).
  const rows = await db
    .select({ gameId: participant.gameId, nickname: participant.nickname, score: participant.score, rank: participant.rank })
    .from(participant)
    .where(
      and(
        inArray(
          participant.gameId,
          games.map((row) => row.id),
        ),
        isNull(participant.teamId),
      ),
    );
  const byGame = groupBy(rows, (row) => row.gameId);
  return games.map((row) => ({
    gameId: row.id,
    startedAt: row.startedAt.toISOString(),
    status: row.status,
    questionsPlayed: row.questionsPlayed,
    questionCount: questionCountOf(row.quizSnapshot),
    autopilot: row.autopilot,
    roundIndex: resumeRound(snapshotOf(row.quizSnapshot), row.plays, row.questionsPlayed),
    scores: (byGame.get(row.id) ?? [])
      .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || b.score - a.score)
      .map(({ nickname, score }) => ({ nickname, score })),
  }));
}

export async function hostGame(db: Db, hostId: string, id: string): Promise<GameDetail | null> {
  return (await hostGameWithFacts(db, hostId, id))?.detail ?? null;
}

/** Деталі гри разом із входом цікавинок, з якого пораховано facts (тести звіряють його з factInput рушія). */
export async function hostGameWithFacts(db: Db, hostId: string, id: string): Promise<{ detail: GameDetail; factInput: FactInput } | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select()
    .from(game)
    .where(and(eq(game.id, id), eq(game.hostId, hostId)));
  if (row === undefined) return null;

  const participants = await db.select().from(participant).where(eq(participant.gameId, id));
  const stored =
    participants.length === 0
      ? []
      : await db
          .select({
            participantId: answer.participantId,
            questionIndex: answer.questionIndex,
            roundIndex: answer.roundIndex,
            attempt: answer.attempt,
            payload: answer.payload,
            accepted: answer.accepted,
            points: answer.points,
            timeMs: answer.timeMs,
            wager: answer.wager,
            buff: answer.buff,
            spareId: answer.spareId,
            awayMs: answer.awayMs,
          })
          .from(answer)
          .where(
            inArray(
              answer.participantId,
              participants.map((p) => p.id),
            ),
          );
  // Рядки лише з позначкою виходу (AWAY_ATTEMPT) — не відповіді: деталі їх не бачать, лише цікавинки «відволікався»
  // і рядок апеляції учасника, що не має іншого рядка (позначка виходу стоїть поруч із ⚖️).
  const answers = stored.filter((a) => a.attempt !== AWAY_ATTEMPT);
  const awayMarks = stored.filter((a) => a.attempt === AWAY_ATTEMPT);

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

  // Апеляції (12f): закриті, з лічильниками; голосів людей у базі немає.
  const appeals = await db.select().from(appeal).where(eq(appeal.gameId, id)).orderBy(asc(appeal.seq));

  // Командна гра (10j): таблиця — рядки команд, люди — склад під назвою (за нікнеймом).
  const teams = participants.some((p) => p.isTeam);
  const membersOf = (teamId: string) =>
    participants
      .filter((p) => p.teamId === teamId)
      .map((p) => ({ participantId: p.id, nickname: p.nickname }))
      .sort((a, b) => a.nickname.localeCompare(b.nickname));
  const quiz = snapshotOf(row.quizSnapshot);
  const played = quiz === null ? [] : playedQuestions(quiz, row.plays, row.questionsPlayed);
  // Бали за раундами й «+ / −» (11f): з рядків answer (без голосів) і коригувань — працює й для старих ігор і зіпсованих знімків.
  const answersOf = groupBy(answers, (a) => a.participantId);
  const adjustmentsOf = groupBy(adjustments, (a) => a.participantId);
  const lines = (participantId: string): ScoreLine[] => [
    ...(answersOf.get(participantId) ?? [])
      .filter((a) => a.attempt !== VOTE_ATTEMPT && a.points !== 0)
      .map((a) => ({ roundIndex: a.roundIndex, source: answerSource(quiz?.rounds[a.roundIndex]?.type), points: a.points })),
    ...(adjustmentsOf.get(participantId) ?? []).map((a) => ({ roundIndex: a.roundIndex, source: adjustmentSource(a.source), points: a.points })),
  ];
  const roundCount =
    Math.max(-1, ...played.map((p) => p.roundIndex), ...answers.map((a) => a.roundIndex), ...adjustments.map((a) => a.roundIndex)) + 1;
  // Продовжена гра (12r): пропущені раунди колонок не мають — колонки від раунду рядків 'carry'; без них від 0, як у рушія.
  const carryRounds = adjustments.filter((a) => a.source === 'carry').map((a) => a.roundIndex);
  const firstRound = carryRounds.length === 0 ? 0 : Math.max(0, Math.min(...carryRounds));
  const standings = participants
    .filter((p) => p.teamId === null)
    .map((p) => {
      const own = lines(p.id);
      return {
        participantId: p.id,
        nickname: p.nickname,
        score: p.score,
        rank: p.rank,
        correct: distinct((answersOf.get(p.id) ?? []).filter((a) => a.accepted).map((a) => a.questionIndex)),
        rounds: roundTotals(own, roundCount),
        breakdown: breakdownOf(own),
        ...(p.isTeam ? { members: membersOf(p.id).map((m) => m.nickname) } : {}),
      };
    })
    // Спершу за місцем; до фінішу місць немає, тоді за балами.
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.score - a.score || a.nickname.localeCompare(b.nickname));
  // Голоси без балів у командній грі подають люди: їхні рядки йдуть командами за таблицею.
  const voters = teams ? standings.flatMap((s) => membersOf(s.participantId)) : standings;

  // Усі рядки, і людей теж: голоси опитувань і хмари стоять на рядках людей.
  const nicknames = new Map(participants.map((p) => [p.id, p.nickname]));
  // Зіпсований знімок не валить деталі: турнірна таблиця є, запитань і раундів немає.
  const questions = played.flatMap(({ roundIndex, question, ref }, index) => {
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
        responses: responsesOf(given, isUnscored(question) ? voters : standings, quiz === null ? [] : allSpares(quiz), appeals.filter((a) => a.questionIndex === index), awayMarks.filter((a) => a.questionIndex === index)),
        ...(round?.type === 'wipeout' && quiz !== null ? { wipeout: wipeoutResult(quiz, row.plays, index, answers, standings) } : {}),
        ...(round?.type === 'survival' && quiz !== null ? { survival: survivalResult(quiz, row.plays, index, standings) } : {}),
        ...(round?.type === 'ladder' && quiz !== null ? { ladder: ladderResult(quiz, row.plays, index, nicknames, given) } : {}),
        final: round?.type === 'final' ? finalResult(round, given, standings) : null,
      },
    ];
  });

  const factInput = factInputOf(quiz, played, standings, stored, adjustments, appeals);
  const detail: GameDetail = {
    id: row.id,
    title: row.title,
    code: row.code,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    questionsPlayed: row.questionsPlayed,
    questionCount: questionCountOf(row.quizSnapshot),
    autopilot: row.autopilot,
    rounds: (quiz?.rounds ?? []).map((round) => ({ title: round.title, type: round.type })),
    standings,
    firstRound,
    questions,
    teams,
    adjustments: adjustments.map(({ participantId, seq, roundIndex, afterQuestion, points, source, debuff, targetNickname, undoesQuestion, undoesSeq }) => ({
      seq,
      roundIndex,
      afterQuestion,
      // Коригування вилученого гравця зникають разом з учасником (каскадом), тож нікнейм є завжди.
      nickname: nicknames.get(participantId) ?? '',
      points,
      source,
      ...(source === 'debuff' ? { debuff: debuff ?? undefined, target: targetNickname } : {}),
      ...(source === 'undo' && undoesQuestion !== null ? { undoes: { question: undoesQuestion } } : {}),
      ...(source === 'undo' && undoesQuestion === null && undoesSeq !== null ? { undoes: { seq: undoesSeq } } : {}),
    })),

    facts: factsOf(factInput),
  };
  return { detail, factInput };
}

export interface AnswerMark {
  questionIndex: number;
  attempt: number;
  accepted: boolean;
}

/** Рядок-відповідь для статистики гравця: без штрафів, голосів (опитування, хмара) і рядків лише з позначкою виходу. */
const isAnswerRow = (attempt: number) => attempt !== PENALTY_ATTEMPT && attempt !== VOTE_ATTEMPT && attempt !== AWAY_ATTEMPT;

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

/**
 * Скільки зіграних запитань «Вибування» цей гравець не грав живим: після вибування він лише був привидом, рядків-відповідей на ті запитання немає.
 * Такі запитання не рахуємо його запитаннями: точність — із запитань, на яких він був живим. Вибув він на запитанні, де був рядок, — те рахується.
 */
function unplayedSurvival(snapshot: unknown, plays: PlayRef[] | null, questionsPlayed: number, participantId: string): number {
  // Розбір знімка дорогий: для ігор без «Вибування» його не робимо.
  const rounds = typeof snapshot === 'object' && snapshot !== null ? (snapshot as { rounds?: unknown }).rounds : undefined;
  if (plays === null || !Array.isArray(rounds) || !rounds.some((round: unknown) => (round as { type?: unknown } | null)?.type === 'survival')) return 0;
  const quiz = snapshotOf(snapshot);
  if (quiz === null) return 0;
  const played = plays.slice(0, questionsPlayed);
  let unplayed = 0;
  for (const roundIndex of new Set(played.map((ref) => ref.roundIndex))) {
    if (quiz.rounds[roundIndex]?.type !== 'survival') continue;
    const indices = played.flatMap((ref, i) => (ref.roundIndex === roundIndex ? [i] : []));
    const outAt = indices.findIndex((i) => played[i].survival?.trial?.out.includes(participantId) === true);
    if (outAt >= 0) unplayed += indices.length - 1 - outAt;
  }
  return unplayed;
}

/**
 * Скільки зіграних запитань «Мільйонера» цей гравець не грав: він не був учасником драбини й не відповів «за себе».
 * Зал відповідає за бажанням, тож мовчання глядача — не помилка; такі запитання не рахуємо його запитаннями.
 * answered — questionIndex рядків-відповідей гравця.
 */
function unplayedLadder(snapshot: unknown, plays: PlayRef[] | null, questionsPlayed: number, participantId: string, answered: Set<number>): number {
  // Розбір знімка дорогий: для ігор без «Мільйонера» його не робимо.
  const rounds = typeof snapshot === 'object' && snapshot !== null ? (snapshot as { rounds?: unknown }).rounds : undefined;
  if (plays === null || !Array.isArray(rounds) || !rounds.some((round: unknown) => (round as { type?: unknown } | null)?.type === 'ladder')) return 0;
  const quiz = snapshotOf(snapshot);
  if (quiz === null) return 0;
  return plays
    .slice(0, questionsPlayed)
    .filter((ref, i) => quiz.rounds[ref.roundIndex]?.type === 'ladder' && ref.ladder?.contestant !== participantId && !answered.has(i)).length;
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

  // Місце рахується серед команд (командна гра) чи гравців (соло).
  const players = await rivalCounts(
    db,
    rows.map((row) => row.game.id),
  );
  // Людина командної гри: відповіді, місце й перемога — її команди; її власні рядки — лише голоси.
  const teamIds = [...new Set(rows.flatMap((row) => (row.participant.teamId === null ? [] : [row.participant.teamId])))];
  const teamNames = new Map(
    teamIds.length === 0
      ? []
      : (await db.select({ id: participant.id, nickname: participant.nickname }).from(participant).where(inArray(participant.id, teamIds))).map((t) => [t.id, t.nickname]),
  );
  const answers = await db
    .select({ participantId: answer.participantId, questionIndex: answer.questionIndex, accepted: answer.accepted, attempt: answer.attempt })
    .from(answer)
    .where(inArray(answer.participantId, [...rows.map((row) => row.participant.id), ...teamIds]));

  const byParticipant = groupBy(answers, (a) => a.participantId);
  return rows.map((row) => {
    const { teamId } = row.participant;
    // Рядок, що грав: команда людини або сам гравець.
    const playing = teamId ?? row.participant.id;
    const mine = [...(teamId === null ? [] : (byParticipant.get(teamId) ?? [])), ...(byParticipant.get(row.participant.id) ?? [])];
    return {
      played: {
        gameId: row.game.id,
        title: row.game.title,
        status: row.game.status,
        autopilot: row.game.autopilot,
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
            playing,
            new Set(mine.filter((a) => a.accepted && a.attempt === 0).map((a) => a.questionIndex)),
          ) -
          unplayedSurvival(row.game.quizSnapshot, row.game.plays, row.game.questionsPlayed, playing) -
          unplayedLadder(
            row.game.quizSnapshot,
            row.game.plays,
            row.game.questionsPlayed,
            playing,
            new Set(mine.filter((a) => isAnswerRow(a.attempt)).map((a) => a.questionIndex)),
          ),
        team: teamId === null ? null : (teamNames.get(teamId) ?? null),
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
  /** Командна гра: акаунти людей команди; соло — []. */
  memberUserIds: string[];
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
    .select({ id: participant.id, gameId: participant.gameId, userId: participant.userId, score: participant.score, rank: participant.rank, teamId: participant.teamId })
    .from(participant)
    .where(inArray(participant.gameId, gameIds));
  // Рядки людей командної гри не грають самі: їхні акаунти йдуть у memberUserIds команди, а голоси таблиця й так відкидає.
  const memberUsers = new Map<string, string[]>();
  for (const p of participants) {
    if (p.teamId === null || p.userId === null) continue;
    memberUsers.set(p.teamId, [...(memberUsers.get(p.teamId) ?? []), p.userId]);
  }
  const players = participants.filter((p) => p.teamId === null);
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
                players.map((p) => p.id),
              ),
              // Голоси опитувань і хмари не бувають спробами: таблиця рахує лише відповіді й штрафи.
              ne(answer.attempt, VOTE_ATTEMPT),
              ne(answer.attempt, AWAY_ATTEMPT),
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
  const playersByGame = groupBy(players, (p) => p.gameId);
  const rowsByParticipant = groupBy<TableRow & { participantId: string }>([...answers, ...adjustmentRows], (a) => a.participantId);
  return games.map((row) => ({
    gameId: row.id,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    roundTypes: types.get(row.id) ?? [],
    players: (playersByGame.get(row.id) ?? []).map((p) => ({
      participantId: p.id,
      userId: p.userId,
      memberUserIds: memberUsers.get(p.id) ?? [],
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
