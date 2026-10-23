import type { Answer, Duels, Quiz } from '@quiz/shared';
import { declareDuel, pickDuelCategory } from '../duel';
import { next, submitAnswer, type GameState } from '../game';
import { bool, classicRound, duels, finalRound, makeRoundsQuiz, multi, numeric, order, single, text, withId } from './fixtures';
import { lobbyWith, must, startRound } from './helpers';

export const T0 = 1_000_000;
export const T1 = T0 + 60_000;
const rng0 = () => 0;

/** Класика q1–q3, класика q4–q6, фінал; duels з patch. Поріг 2, межа — раунд 2. */
export function duelQuiz(patch: Partial<Duels> = {}): Quiz {
  return {
    ...makeRoundsQuiz(
      [classicRound('r1', [single, multi, bool]), classicRound('r2', [text, numeric, order]), finalRound('r3', withId(single, 'qf'))],
      { leaderboard: 'end' },
    ),
    duels: { ...duels, ...patch },
  };
}

/** Усі гравці відповідають правильно на q1, q2 або q3; запитання закривається. */
export function answerAll(state: GameState, now: number): GameState {
  const id = state.plays[state.questionIndex]?.question.id;
  const answer: Answer =
    id === 'q1' ? { type: 'single', optionId: 'b' } : id === 'q2' ? { type: 'multi', optionIds: ['a', 'c'] } : { type: 'boolean', value: true };
  return state.players.reduce((s, p) => must(submitAnswer(s, p.id, answer, now)), state);
}

/** Гра на reveal поточного запитання q1–q3 (усі відповіли правильно). */
export function revealOf(state: GameState, now: number): GameState {
  return must(next(answerAll(state, now), now));
}

/** Оля p1, Петро p2, Іра p3; q1 і q2 зіграно (усі відповіли правильно), етап reveal q2, T0 = 1_000_000. */
export function toDeclarable(patch: Partial<Duels> = {}, quiz: Quiz = duelQuiz(patch)): GameState {
  let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), T0, rng0);
  s = revealOf(s, T0 + 1000);
  s = must(next(s, T0 + 2000, rng0));
  return revealOf(s, T0 + 3000);
}

/** toDeclarable → p1 оголошує p2 → next → p1 вибирає 'dc1' з rng () => 0 о T1 → запитання d1, endsAt T1 + 20_000. */
export function toDuelQuestion(patch: Partial<Duels> = {}): GameState {
  const declared = must(declareDuel(toDeclarable(patch), 'p1', 'p2'));
  const started = must(next(declared, T0 + 4000, rng0));
  return must(pickDuelCategory(started, 'p1', 'dc1', T1, rng0));
}
