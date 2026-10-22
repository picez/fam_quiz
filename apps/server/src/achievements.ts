import { ACHIEVEMENTS, type Achievement, type AchievementId, type PlayedGame } from '@quiz/shared';
import { PENALTY_ATTEMPT } from './db/schema';
import type { AnswerMark } from './history';

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
};

/** Усі ачівки в порядку ACHIEVEMENTS з позначкою, чи отримано. */
export function achievementsOf(facts: AchievementFacts): Achievement[] {
  return ACHIEVEMENTS.map((id) => ({ id, earned: EARNED[id](facts) }));
}
