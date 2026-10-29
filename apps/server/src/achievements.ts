import { ACHIEVEMENT_INFO, ACHIEVEMENTS, isWin, type AchievementId, type PlayedGame } from '@quiz/shared';
import { ADJUSTMENT_ATTEMPT, AWAY_ATTEMPT, PENALTY_ATTEMPT, VOTE_ATTEMPT } from './db/schema';
import type { AnswerMark, GameTable, TablePlayer } from './history';

/** Скільки запитань з відповіддю потрібно для ідеальної гри. */
const PERFECT_MIN_QUESTIONS = 5;

/** Рядки-відповіді: штрафний рядок бліц-клітинки і голос в опитуванні чи хмарі не є відповіддю. */
const answersOf = (marks: AnswerMark[]) => marks.filter((mark) => mark.attempt !== PENALTY_ATTEMPT && mark.attempt !== VOTE_ATTEMPT && mark.attempt !== AWAY_ATTEMPT);

/**
 * Найдовша серія зарахованих запитань у грі: запитання зараховане, якщо прийнято хоч одну спробу;
 * штрафні рядки не рахуються; запитань без рядків немає в серії.
 */
export function bestStreak(marks: AnswerMark[]): number {
  const accepted = new Map<number, boolean>();
  for (const mark of answersOf(marks)) accepted.set(mark.questionIndex, (accepted.get(mark.questionIndex) ?? false) || mark.accepted);
  let best = 0;
  let current = 0;
  for (const index of [...accepted.keys()].sort((a, b) => a - b)) {
    current = accepted.get(index) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

/** Завершена гра, ≥ 5 запитань з відповіддю (без штрафних рядків), жодного рядка з accepted = false, крім штрафних. */
export function isPerfect(game: { played: PlayedGame; marks: AnswerMark[] }): boolean {
  const answers = answersOf(game.marks);
  return (
    game.played.status === 'finished' &&
    new Set(answers.map((mark) => mark.questionIndex)).size >= PERFECT_MIN_QUESTIONS &&
    answers.every((mark) => mark.accepted)
  );
}

/** Кар'єрні факти (16 перших ачівок + 12i). */
export interface CareerFacts {
  games: number;
  wins: number;
  hosted: number;
  bestStreak: number;
  perfectGames: number;
  winStreak: number;
  blitzWins: number;
  finalHits: number;
  comebacks: number;
  friendsPlayedWith: number;
  /** Разів у трійці (podiumStats). */
  podium: number;
  /** Куплених дебафів у соло-іграх. */
  debuffsBought: number;
  /** Завершених ігор за вікторинами користувача. */
  authorGames: number;
  /** Різних типів раундів, де є свій рядок. */
  roundTypes: number;
  /** Різних типів запитань, де є своя відповідь. */
  questionTypes: number;
}

/** Найдовша серія перемог (isWin) серед завершених ігор за startedAt; незавершені пропускаються. */
export function winStreak(games: PlayedGame[]): number {
  const finished = games.filter((g) => g.status === 'finished').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  let best = 0;
  let current = 0;
  for (const g of finished) {
    current = isWin(g) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

/** Сума points рядків учасника в раунді (зі штрафними й коригуваннями). */
export function roundPoints(player: TablePlayer, roundIndex: number): number {
  return player.rows.filter((row) => row.roundIndex === roundIndex).reduce((sum, row) => sum + row.points, 0);
}

/** Бали учасника в раунді гри: без ставок дуелей, купівель дебафів і перенесених балів (12r) — це не гра раунду, хоч рядок і лягає в нього. */
function roundPointsOfPlay(player: TablePlayer, roundIndex: number): number {
  return player.rows
    .filter((row) => row.roundIndex === roundIndex && row.source !== 'duel' && row.source !== 'debuff' && row.source !== 'carry')
    .reduce((sum, row) => sum + row.points, 0);
}

/** Учасник має строгу перевагу > 0 хоч в одному бліц-раунді гри з ≥ 2 учасниками; ставки дуелей не рахуються. */
export function wonBlitzRound(table: GameTable, participantId: string): boolean {
  const me = table.players.find((p) => p.participantId === participantId);
  if (me === undefined || table.players.length < 2) return false;
  return table.roundTypes.some((type, index) => {
    if (type !== 'blitz') return false;
    const mine = roundPointsOfPlay(me, index);
    return mine > 0 && table.players.every((p) => p === me || roundPointsOfPlay(p, index) < mine);
  });
}

/**
 * У фінал-раунді є рядок учасника accepted && (wager ?? points) > 0: правильна відповідь з ненульовою ставкою,
 * навіть коли спільний банк був порожній. Старі рядки без ставки — за балами, як і було.
 */
export function hitFinal(table: GameTable, participantId: string): boolean {
  const me = table.players.find((p) => p.participantId === participantId);
  return (
    me !== undefined &&
    table.roundTypes.some((type, index) => type === 'final' && me.rows.some((row) => row.roundIndex === index && row.accepted && (row.wager ?? row.points) > 0))
  );
}

/**
 * isWin учасника, зіграно ≥ 2 раунди (від найменшого до найбільшого roundIndex серед рядків-відповідей усіх; коригування
 * від ведучого раунд зіграним не роблять), і перед останнім зіграним хтось мав строго більше.
 * Перенесені бали (12r) завжди «до останнього раунду», хоч і лежать у стартовому раунді.
 */
export function isComeback(table: GameTable, participantId: string): boolean {
  const me = table.players.find((p) => p.participantId === participantId);
  if (me === undefined) return false;
  const won = isWin({ status: table.status, rank: me.rank, score: me.score, playerCount: table.players.length, correct: 0, questionsPlayed: 0 });
  const played = table.players.flatMap((p) => p.rows.filter((row) => row.attempt !== ADJUSTMENT_ATTEMPT).map((row) => row.roundIndex));
  const last = Math.max(-1, ...played);
  // Без перенесених балів — як до 12r: раунди від нуля, навіть якщо в перших немає рядків-відповідей.
  const carried = table.players.some((p) => p.rows.some((row) => row.source === 'carry'));
  const first = carried ? Math.min(last, ...played) : 0;
  if (!won || last - first < 1) return false;
  const before = (p: TablePlayer) => p.rows.filter((row) => row.roundIndex < last || row.source === 'carry').reduce((sum, row) => sum + row.points, 0);
  const mine = before(me);
  return table.players.some((p) => p !== me && before(p) > mine);
}

/** Різні userId (не userId і є в friendIds) серед учасників цих ігор; у командній грі — і люди кожної команди (свої й суперники). */
export function friendsPlayedWith(tables: GameTable[], userId: string, friendIds: Set<string>): number {
  const met = new Set<string>();
  for (const table of tables) {
    for (const p of table.players) {
      for (const id of [p.userId, ...p.memberUserIds]) if (id !== null && id !== userId && friendIds.has(id)) met.add(id);
    }
  }
  return met.size;
}

/** Разові кар'єрні ачівки (без поступу). */
const ONE_OFF = new Map<AchievementId, (facts: CareerFacts) => boolean>([
  ['first_game', (f) => f.games >= 1],
  ['first_win', (f) => f.wins >= 1],
  ['perfect_game', (f) => f.perfectGames >= 1],
  ['host', (f) => f.hosted >= 1],
  ['blitz_win', (f) => f.blitzWins >= 1],
  ['final_hit', (f) => f.finalHits >= 1],
  ['comeback', (f) => f.comebacks >= 1],
]);

/** Лічильні кар'єрні ачівки: значення, що доходить до goal з ACHIEVEMENT_INFO. */
const COUNTERS = new Map<AchievementId, (facts: CareerFacts) => number>([
  ['games_10', (f) => f.games],
  ['games_50', (f) => f.games],
  ['games_100', (f) => f.games],
  ['veteran', (f) => f.games],
  ['wins_10', (f) => f.wins],
  ['host_10', (f) => f.hosted],
  ['podium_10', (f) => f.podium],
  ['prankster', (f) => f.debuffsBought],
  ['author_hit', (f) => f.authorGames],
  ['friends_5', (f) => f.friendsPlayedWith],
  ['streak_5', (f) => f.bestStreak],
  ['streak_10', (f) => f.bestStreak],
  ['win_streak_3', (f) => f.winStreak],
  ['all_rounds', (f) => f.roundTypes],
  ['all_types', (f) => f.questionTypes],
]);

/** 22 кар'єрні ачівки, отримані за фактами, у порядку ACHIEVEMENTS. */
export function careerEarned(facts: CareerFacts): AchievementId[] {
  return ACHIEVEMENTS.filter((id) => {
    const counter = COUNTERS.get(id);
    const goal = ACHIEVEMENT_INFO[id].goal;
    if (counter !== undefined) return goal !== null && counter(facts) >= goal;
    return ONE_OFF.get(id)?.(facts) ?? false;
  });
}

/** Поступ лічильних: min(значення, goal) з ACHIEVEMENT_INFO; разових тут немає. */
export function careerProgress(facts: CareerFacts): Partial<Record<AchievementId, number>> {
  const progress: Partial<Record<AchievementId, number>> = {};
  for (const [id, value] of COUNTERS) {
    const goal = ACHIEVEMENT_INFO[id].goal;
    if (goal !== null) progress[id] = Math.min(value(facts), goal);
  }
  return progress;
}
