import { ACHIEVEMENTS, isWin, type Achievement, type AchievementId, type PlayedGame } from '@quiz/shared';
import { PENALTY_ATTEMPT } from './db/schema';
import type { AnswerMark, GameTable, TablePlayer } from './history';

/** Скільки запитань з відповіддю потрібно для ідеальної гри. */
const PERFECT_MIN_QUESTIONS = 5;

/** Рядки-відповіді: штрафний рядок бліц-клітинки не є відповіддю. */
const answersOf = (marks: AnswerMark[]) => marks.filter((mark) => mark.attempt !== PENALTY_ATTEMPT);

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

export interface AchievementFacts {
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

/** Учасник має строгу перевагу > 0 хоч в одному бліц-раунді гри з ≥ 2 учасниками. */
export function wonBlitzRound(table: GameTable, participantId: string): boolean {
  const me = table.players.find((p) => p.participantId === participantId);
  if (me === undefined || table.players.length < 2) return false;
  return table.roundTypes.some((type, index) => {
    if (type !== 'blitz') return false;
    const mine = roundPoints(me, index);
    return mine > 0 && table.players.every((p) => p === me || roundPoints(p, index) < mine);
  });
}

/** У фінал-раунді є рядок учасника accepted && points > 0. */
export function hitFinal(table: GameTable, participantId: string): boolean {
  const me = table.players.find((p) => p.participantId === participantId);
  return (
    me !== undefined &&
    table.roundTypes.some((type, index) => type === 'final' && me.rows.some((row) => row.roundIndex === index && row.accepted && row.points > 0))
  );
}

/** isWin учасника, зіграно ≥ 2 раунди (за найбільшим roundIndex серед рядків усіх), і перед останнім зіграним хтось мав строго більше. */
export function isComeback(table: GameTable, participantId: string): boolean {
  const me = table.players.find((p) => p.participantId === participantId);
  if (me === undefined) return false;
  const won = isWin({ status: table.status, rank: me.rank, score: me.score, playerCount: table.players.length, correct: 0, questionsPlayed: 0 });
  const last = Math.max(-1, ...table.players.flatMap((p) => p.rows.map((row) => row.roundIndex)));
  if (!won || last < 1) return false;
  const before = (p: TablePlayer) => p.rows.filter((row) => row.roundIndex < last).reduce((sum, row) => sum + row.points, 0);
  const mine = before(me);
  return table.players.some((p) => p !== me && before(p) > mine);
}

/** Різні userId (не userId і є в friendIds) серед учасників цих ігор. */
export function friendsPlayedWith(tables: GameTable[], userId: string, friendIds: Set<string>): number {
  const met = new Set<string>();
  for (const table of tables) {
    for (const p of table.players) if (p.userId !== null && p.userId !== userId && friendIds.has(p.userId)) met.add(p.userId);
  }
  return met.size;
}

const EARNED: Record<AchievementId, (facts: AchievementFacts) => boolean> = {
  first_game: (f) => f.games >= 1,
  first_win: (f) => f.wins >= 1,
  games_10: (f) => f.games >= 10,
  streak_5: (f) => f.bestStreak >= 5,
  perfect_game: (f) => f.perfectGames >= 1,
  host: (f) => f.hosted >= 1,
  games_50: (f) => f.games >= 50,
  wins_10: (f) => f.wins >= 10,
  games_100: (f) => f.games >= 100,
  host_10: (f) => f.hosted >= 10,
  streak_10: (f) => f.bestStreak >= 10,
  win_streak_3: (f) => f.winStreak >= 3,
  blitz_win: (f) => f.blitzWins >= 1,
  final_hit: (f) => f.finalHits >= 1,
  comeback: (f) => f.comebacks >= 1,
  friends_5: (f) => f.friendsPlayedWith >= 5,
};

/** Усі ачівки в порядку ACHIEVEMENTS з позначкою, чи отримано. */
export function achievementsOf(facts: AchievementFacts): Achievement[] {
  return ACHIEVEMENTS.map((id) => ({ id, earned: EARNED[id](facts) }));
}
