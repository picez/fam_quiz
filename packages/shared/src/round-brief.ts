import { ANSWER_MODES, boardCells, cellAnswerMode, rulesOf, type AnswerMode, type AuctionBidMode, type AuctionLoss, type LadderPick, type LifelineKind, type Round, type RoundRules, type TrialKind, type WagerMode } from './quiz';

/** Налаштування раунду, від яких залежать бали; з цього клієнт складає пояснення для гравців. */
export interface RoundBrief {
  type: Round['type'];
  /** Класичний: бонус за швидкість. */
  speedBonus: boolean;
  /** Мінус ціна запитання за хибну відповідь (rules.penalty === 'minus'; у бліці — і за самої мінусової серії). */
  penalty: boolean;
  /** Бліц-раунд: кроки плюсової й мінусової серій (26b), null — тієї серії немає; null — жодної (і поза бліц-раундом). */
  series: { plus: number | null; minus: number | null } | null;
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
  /** Фінал: тип ставок; null поза фіналом. */
  wagerMode: WagerMode | null;
  /** «Вибування»: вид випробування, скільки має лишитися, бонус; null поза ним. */
  survival: { trial: TrialKind; survivors: number; bonus: number } | null;
  /** «Мільйонер»: як вибирається учасник, підказки, верхній рівень, чи є таймер; null поза ним. */
  ladder: { pick: LadderPick; lifelines: LifelineKind[]; top: number; timer: boolean } | null;
  /** «Ставки»: початок, крок і найбільша ставка (null — усі свої бали), запитань; null поза ним. */
  bets: { betStart: number; betStep: number; betMax: number | null; count: number } | null;
  /** «Аукціон»: режим торгу, крок, що втрачає переможець, запитань; null поза ним. */
  auction: { mode: AuctionBidMode; step: number; loss: AuctionLoss; count: number } | null;
  /** «Правда про гравця»: ціна й таймер; null поза ним. */
  truth: { points: number; time: number } | null;
  /** «Головоломки» (28d): скільки судоку й кросвордів і сумарний час; null поза ним. */
  puzzles: { sudoku: number; crossword: number; time: number } | null;
}

/** Зведення без жодної опції: усі прапорці (і instant) false, streak null, multiplier 1, attempts, answerWindow, series, wagerMode, survival, ladder, bets, auction truth і puzzles null, answerModes []. */
export function emptyBrief(type: Round['type']): RoundBrief {
  return {
    type,
    instant: false,
    speedBonus: false,
    penalty: false,
    series: null,
    streak: null,
    multiplier: 1,
    attempts: null,
    answerWindow: null,
    marks: false,
    blitzCells: false,
    penaltyAll: false,
    answerModes: [],
    wagerMode: null,
    survival: null,
    ladder: null,
    bets: null,
    auction: null,
    truth: null,
    puzzles: null,
  };
}

export function roundBrief(round: Round): RoundBrief {
  const base = emptyBrief(round.type);
  if (round.type === 'final') return { ...base, wagerMode: round.wagerMode };
  if (round.type === 'bets') {
    return { ...base, bets: { betStart: round.betStart, betStep: round.betStep, betMax: round.betMax, count: round.questions.length } };
  }
  if (round.type === 'auction') {
    return { ...base, auction: { mode: round.bidMode, step: round.bidStep, loss: round.loss, count: round.questions.length } };
  }
  if (round.type === 'truth') return { ...base, truth: { points: round.points, time: round.timeLimit } };
  if (round.type === 'puzzles') {
    return {
      ...base,
      puzzles: {
        sudoku: round.questions.filter((q) => q.type === 'sudoku').length,
        crossword: round.questions.filter((q) => q.type === 'crossword').length,
        time: round.questions.reduce((sum, q) => sum + q.timeLimit, 0),
      },
    };
  }
  if (round.type === 'wipeout') return base;
  if (round.type === 'ladder') return { ...base, ladder: { pick: round.pick, lifelines: [...round.lifelines], top: round.levels.at(-1) ?? 0, timer: round.timer } };
  const rules = rulesOf(round);
  const withRules = { ...base, penalty: rules.penalty === 'minus', streak: rules.streak, multiplier: rules.multiplier };
  if (round.type === 'classic') return { ...withRules, speedBonus: round.speedBonus };
  if (round.type === 'survival') {
    return { ...withRules, speedBonus: round.speedBonus, survival: { trial: round.trial, survivors: round.survivors, bonus: round.bonus } };
  }
  if (round.type === 'blitz') {
    const plus = round.rules.streakPlus?.step ?? null;
    const minus = round.rules.streakMinus?.step ?? null;
    // Мінусова серія штрафує за помилки й без penalty 'minus' (як і рушій).
    const blitz = { ...withRules, penalty: withRules.penalty || minus !== null, series: plus === null && minus === null ? null : { plus, minus } };
    // Миттєвий бліц ігнорує збережені вікно й спроби (як і рушій).
    if (round.check === 'auto') return { ...blitz, instant: true, attempts: 1, answerWindow: null };
    return { ...blitz, attempts: round.attempts, answerWindow: round.answerWindow };
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
