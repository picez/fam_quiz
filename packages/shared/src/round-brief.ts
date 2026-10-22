import { ANSWER_MODES, boardCells, cellAnswerMode, rulesOf, type AnswerMode, type Round, type RoundRules } from './quiz';

/** Налаштування раунду, від яких залежать бали; з цього клієнт складає пояснення для гравців. */
export interface RoundBrief {
  type: Round['type'];
  /** Класичний: бонус за швидкість. */
  speedBonus: boolean;
  /** Мінус ціна запитання за хибну відповідь (rules.penalty === 'minus'). */
  penalty: boolean;
  streak: RoundRules['streak'];
  multiplier: RoundRules['multiplier'];
  /** Бліц-раунд з автоматичною перевіркою (миттєвий): тоді attempts 1, answerWindow null. */
  instant: boolean;
  /** Бліц: спроб на запитання; null — без обмежень (і поза бліцом). */
  attempts: 1 | 2 | 3 | null;
  /** Бліц: секунди на відповідь після натискання; null — до кінця таймера (і поза бліцом). */
  answerWindow: number | null;
  /** Поле: є клітинки ×2 або ×3. */
  marks: boolean;
  /** Поле: є бліц-клітинки. */
  blitzCells: boolean;
  /** Поле: є бліц-клітинка зі штрафом для всіх (penalty 'all'). */
  penaltyAll: boolean;
  /** Поле: способи відповіді клітинок (cellAnswerMode), без повторів, у порядку ['phone', 'voice']; поза полем []. */
  answerModes: AnswerMode[];
}

/** Зведення без жодної опції: усі прапорці (і instant) false, streak null, multiplier 1, attempts і answerWindow null, answerModes []. */
export function emptyBrief(type: Round['type']): RoundBrief {
  return {
    type,
    instant: false,
    speedBonus: false,
    penalty: false,
    streak: null,
    multiplier: 1,
    attempts: null,
    answerWindow: null,
    marks: false,
    blitzCells: false,
    penaltyAll: false,
    answerModes: [],
  };
}

export function roundBrief(round: Round): RoundBrief {
  const base = emptyBrief(round.type);
  if (round.type === 'final') return base;
  const rules = rulesOf(round);
  const withRules = { ...base, penalty: rules.penalty === 'minus', streak: rules.streak, multiplier: rules.multiplier };
  if (round.type === 'classic') return { ...withRules, speedBonus: round.speedBonus };
  if (round.type === 'blitz') {
    // Миттєвий бліц ігнорує збережені вікно й спроби (як і рушій).
    if (round.check === 'auto') return { ...withRules, instant: true, attempts: 1, answerWindow: null };
    return { ...withRules, attempts: round.attempts, answerWindow: round.answerWindow };
  }
  const cells = boardCells(round).map(({ cell }) => cell);
  const modes = new Set(cells.map((cell) => cellAnswerMode(round, cell)));
  return {
    ...withRules,
    marks: cells.some((cell) => cell.mark !== 'none'),
    blitzCells: cells.some((cell) => cell.kind === 'blitz'),
    penaltyAll: cells.some((cell) => cell.kind === 'blitz' && cell.penalty === 'all'),
    answerModes: ANSWER_MODES.filter((mode) => modes.has(mode)),
  };
}
