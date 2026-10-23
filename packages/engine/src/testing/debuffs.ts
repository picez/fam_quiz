import { adjustScore } from '../adjust';
import { start, type GameState } from '../game';
import { makeQuiz, single, text, withId } from './fixtures';
import { lobbyWith, must } from './helpers';

export const T0 = 1_000_000;
export const rng = () => 0;
export const debuffQuiz = (settings = {}) => ({ ...makeQuiz([single, text, withId(single, 's2')]), settings: { leaderboard: 'each' as const, ...settings } });
/** Заставка першого раунду, у Олени (p1) 500 балів від ведучого; гравці Олена, Тарас, Віра. */
export function rich(settings = {}): GameState {
  const started = must(start(lobbyWith(debuffQuiz(settings), 'Олена', 'Тарас', 'Віра')));
  return must(adjustScore(started, 'p1', 500, T0));
}
