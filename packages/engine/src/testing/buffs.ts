import { DEFAULT_RULES, type Question, type Quiz, type QuizSettings, type RoundRules } from '@quiz/shared';
import { pickCell } from '../board';
import { next, start, type GameState } from '../game';
import { bool, boardRound, makeQuiz, makeRoundsQuiz, multi, numeric, order, single4, text, withId, type RoundOptions } from './fixtures';
import { lobbyWith, must, startRound } from './helpers';

export const T0 = 1_000_000;

/** П'ять бафів 8a: тести 8a беруть їх, а не READY_BUFFS. */
export const FIRST_BUFFS = ['fifty', 'double', 'retry', 'time', 'shield'] as const;

/** Класика «Розминка» (штраф minus, без бонусу швидкості, без серій): q1 single4, q2 numeric 2061 ± 100, q3 bool, q4 order, q5 multi; усі 1000 балів, 20 с; settings.buffs — усі п'ять готових, якщо patch не каже інакше. */
export function buffQuiz(patch: Partial<QuizSettings> & RoundOptions = {}): Quiz {
  return makeQuiz([single4, withId(numeric, 'q2'), bool, withId(order, 'q4'), withId(multi, 'q5')], {
    title: 'Розминка',
    speedBonus: false,
    rules: { ...DEFAULT_RULES, penalty: 'minus' },
    leaderboard: 'end',
    buffs: [...FIRST_BUFFS],
    ...patch,
  });
}

/** Оля p1, Петро p2, Іра p3; відкрито q1 о T0 (rng () => 0, порядок варіантів авторський). */
export function toBuffQuestion(patch: Partial<QuizSettings> & RoundOptions = {}): GameState {
  return startRound(lobbyWith(buffQuiz(patch), 'Оля', 'Петро', 'Іра'), T0, () => 0);
}

/** Поле 3 × 3 (penalty з patch, check auto, з телефона), у c1 друга клітинка x2 на single4; Оля вибирає її о T0. */
export function toBuffCell(rules: Partial<RoundRules> = {}, check: 'auto' | 'manual' = 'auto'): GameState {
  const categories = ['Міста', 'Річки', 'Гори'].map((title, i) => ({
    title,
    cells: [1, 2, 3].map((j) => {
      const question = withId(single4, `c${i + 1}${j}`);
      return i === 0 && j === 2 ? { question, mark: 'x2' as const } : question;
    }),
  }));
  const round = boardRound('g1', categories, { rules: { ...DEFAULT_RULES, ...rules }, check, answerMode: 'phone' });
  const quiz = makeRoundsQuiz([round], { leaderboard: 'end', buffs: [...FIRST_BUFFS] });
  const intro = must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра')));
  return must(pickCell(must(next(intro, T0)), 'p1', 'c12', T0, () => 0));
}

/** Бафи 8b, що потребують інших: зал, підказка, заміна. */
const OTHERS_BUFFS = ['audience', 'hint', 'swap'] as const;

/** Запасні: s1 bool (true), s2 text «Чернівці», s3 single4 (b правильний). */
const OTHERS_SPARES: Question[] = [
  withId(bool, 's1'),
  { ...text, id: 's2', text: 'Яке місто стоїть на Пруті?', accepted: ['Чернівці'] },
  withId(single4, 's3'),
];

type OthersPatch = Partial<QuizSettings> & RoundOptions & { spares?: Question[] };

/**
 * Класика без мінуса й без бонусу: q1 single4 з hint «Тече через Київ», q2 numeric 2061 ± 100 без hint, q3 text «Львів», q4 order;
 * усі 1000, 20 с; buffs ['audience', 'hint', 'swap']; spares — s1 bool (true), s2 text «Чернівці», s3 single4 (b правильний).
 * spares: undefined у patch — вікторина без пулу.
 */
export function othersQuiz(patch: OthersPatch = {}): Quiz {
  const { spares, ...settings } = patch;
  const quiz = makeQuiz(
    [
      { ...single4, hint: 'Тече через Київ' },
      withId(numeric, 'q2'),
      { ...text, id: 'q3', text: 'Найбільше місто заходу України?', accepted: ['Львів'] },
      withId(order, 'q4'),
    ],
    { title: 'Розминка', speedBonus: false, leaderboard: 'end', buffs: [...OTHERS_BUFFS], ...settings },
  );
  const pool = 'spares' in patch ? spares : OTHERS_SPARES;
  return pool === undefined ? quiz : { ...quiz, spares: pool };
}

/** Оля p1, Петро p2, Іра p3; відкрито q1 о T0 (rng () => 0). */
export function toOthersQuestion(patch: OthersPatch = {}): GameState {
  return startRound(lobbyWith(othersQuiz(patch), 'Оля', 'Петро', 'Іра'), T0, () => 0);
}

/** Поле 3 × 3 (check auto, з телефона), у c1 друга клітинка x2 на single4; buffs ['audience', 'hint', 'swap'], spares як в othersQuiz; Оля вибирає c12 о T0. */
export function toOthersCell(): GameState {
  const categories = ['Міста', 'Річки', 'Гори'].map((title, i) => ({
    title,
    cells: [1, 2, 3].map((j) => {
      const question = withId(single4, `c${i + 1}${j}`);
      return i === 0 && j === 2 ? { question, mark: 'x2' as const } : question;
    }),
  }));
  const round = boardRound('g1', categories, { check: 'auto', answerMode: 'phone' });
  const quiz = { ...makeRoundsQuiz([round], { leaderboard: 'end', buffs: [...OTHERS_BUFFS] }), spares: OTHERS_SPARES };
  const intro = must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра')));
  return must(pickCell(must(next(intro, T0)), 'p1', 'c12', T0, () => 0));
}
