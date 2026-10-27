import { DEFAULT_RULES, type Answer } from '@quiz/shared';
import { next, submitAnswer, type GameState } from '../game';
import { classicRound, makeRoundsQuiz, single, withId } from './fixtures';
import { lobbyWith, must, openAt } from './helpers';

export const U_T0 = 1_000_000;
export const rng = () => 0;
const R = { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' as const } };
export const right: Answer = { type: 'single', optionId: 'b' };
export const wrong: Answer = { type: 'single', optionId: 'a' };
export const undoQuiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], R), classicRound('r2', [withId(single, 'q3')], R)]);

/** Відповіді всіх; запитання закривається само; next → розкриття. */
export function answerAll(s: GameState, answers: Record<string, Answer>, now: number): GameState {
  let state = s;
  for (const [id, answer] of Object.entries(answers)) state = must(submitAnswer(state, id, answer, now));
  return must(next(state, now + 100, rng));
}
/** Розкриття q1: Оля p1 +1000, Петро p2 −1000, Іра p3 +1000. */
export const revealed1 = () => answerAll(openAt(lobbyWith(undoQuiz, 'Оля', 'Петро', 'Іра'), U_T0), { p1: right, p2: wrong, p3: right }, U_T0 + 1000);
/** Таблиця після q1 (leaderboard). */
export const after1 = () => must(next(revealed1(), U_T0 + 2000, rng));
