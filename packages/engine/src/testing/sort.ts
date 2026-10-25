import { DEFAULT_RULES, type RoundRules } from '@quiz/shared';
import { pickCell } from '../board';
import { next, recordOf, start, type GameState } from '../game';
import { sortOf, sortWord } from '../sort';
import { boardRound, makeQuiz, makeRoundsQuiz, single, sortQ, withId, withPoints } from './fixtures';
import { lobbyWith, must, startRound } from './helpers';

const rng = () => 0;

/** Два сортування поспіль (q9, q10) у класичному раунді. */
export function sortQuiz(rules: Partial<RoundRules> = {}, speedBonus = false) {
  return makeQuiz([sortQ, withId(sortQ, 'q10')], { leaderboard: 'end', speedBonus, rules: { ...DEFAULT_RULES, ...rules } });
}

/** Гра з p1 «Анна» і p2 «Богдан»; перше сортування відкрито о 1000. */
export function toSort(rules: Partial<RoundRules> = {}, speedBonus = false): GameState {
  return startRound(lobbyWith(sortQuiz(rules, speedBonus), 'Анна', 'Богдан'), 1000, rng);
}

/** Поле з p1 «Анна» і p2 «Богдан»: p1 вибрав клітинку ×2 із сортуванням о 1000. */
export function toBoardSort(): GameState {
  const round = boardRound(
    'g1',
    [
      { title: 'Сортування', cells: [{ mark: 'x2', answerMode: 'phone', question: sortQ }] },
      { title: 'Інше', cells: [withPoints(withId(single, 's1'), 300)] },
    ],
    { rules: DEFAULT_RULES },
  );
  const board = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'))), 0));
  return must(pickCell(board, 'p1', 'q9', 1000, rng));
}

/** Поточна картка гравця. */
export const head = (s: GameState, id: string) => sortOf(s, id).queue[0];
const categoryOf = (wordId: string) => sortQ.words.find((w) => w.id === wordId)?.categoryId ?? '';
/** Правильна категорія слова sortQ. */
export const right = (wordId: string) => categoryOf(wordId);
/** Хибна категорія слова sortQ. */
export const wrong = (wordId: string) => (categoryOf(wordId) === 'c1' ? 'c2' : 'c1');

/** Правильні ходи по голові черги, доки вона не порожня або гравець не отримав запис. */
export function sortAll(s: GameState, id: string, now: number): GameState {
  let current = s;
  while (sortOf(current, id).queue.length > 0 && recordOf(current, current.questionIndex, id) === undefined) {
    const w = head(current, id);
    current = must(sortWord(current, id, w, right(w), now));
  }
  return current;
}
