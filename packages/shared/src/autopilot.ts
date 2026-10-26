import { allowedBuffs, type BoardRound, type Question, type Quiz, type Round, roundQuestions } from './quiz';

/** Час етапів гри без ведучого, мс (11g; розділ 11 п. 2 специфікації й рішення плану 11g). Відлік — від початку підкроку, не раніше вікна 11b. */
export const AUTOPILOT_MS = {
  guide: 8000,
  intro: 8000,
  /** + стільки на кожні introChars символів опису раунду (з округленням угору), разом не більше introMax. */
  introPerChars: 1000,
  introChars: 60,
  introMax: 20_000,
  /** «Мільйонер»: після жеребу учасника до першого запитання. */
  introDrawn: 4000,
  locked: 1500,
  reveal: 6000,
  /** «100 до 1» і блеф: кожен рядок чи варіант; після останнього — rowsTail. */
  row: 1500,
  rowsTail: 4000,
  /** Фінал: кожен гравець, розподіл банку, вихід. */
  finalRow: 3000,
  leaderboard: 5000,
  /** Екран рішень «Ва-банк» (11e). */
  decisions: 4000,
  roundEnd: 8000,
  /** Запобіжник для запитання без таймера, у якого немає timeLimit. */
  untimed: 30_000,
  wager: 30_000,
  boardTurn: 30_000,
  boardDice: 10_000,
  /** Поле: результат кубиків видно щонайменше стільки після закриття туру. */
  diceShown: 4000,
  teamDice: 15_000,
  duelCategory: 15_000,
  duelAnswer: 4000,
  duelResult: 5000,
  /** «Мільйонер»: без рішення — «Забираю». */
  ladderDecision: 30_000,
  /** Після повернення першого гравця на паузі «нікого». */
  resume: 3000,
} as const;

/** Що автопілот змінює у вікторині (розділ 11 п. 6), у порядку списку. */
export const AUTOPILOT_CHANGES = ['voice', 'manual', 'ladder_pick', 'hint', 'untimed'] as const;
export type AutopilotChange = (typeof AUTOPILOT_CHANGES)[number];
/** Чого автопілот не може провести: у наявних форматах нічого; майбутній формат додає своє слово сюди. */
export const AUTOPILOT_BLOCKS = [] as const;
export type AutopilotBlock = (typeof AUTOPILOT_BLOCKS)[number];

/** Одна зміна чи блокування: 0-базові раунди за зростанням, без повторів, непорожні. */
export interface AutopilotIssue<C extends string> {
  code: C;
  rounds: number[];
}

export interface AutopilotCheck {
  blocked: AutopilotIssue<AutopilotBlock>[];
  changed: AutopilotIssue<AutopilotChange>[];
}

const hasVoice = (round: BoardRound): boolean =>
  round.answerMode === 'voice' || round.categories.some((c) => c.cells.some((cell) => cell.answerMode === 'voice'));

/** Зміни, яких потребує один раунд. */
function roundChanges(round: Round, hintBuff: boolean): Set<AutopilotChange> {
  const found = new Set<AutopilotChange>();
  const questions: Question[] = roundQuestions(round);
  if (round.type === 'board' && hasVoice(round)) found.add('voice');
  if ((round.type === 'blitz' || round.type === 'board' || round.type === 'final') && round.check === 'manual') found.add('manual');
  if (round.type === 'ladder' && round.pick === 'host') found.add('ladder_pick');
  if (hintBuff && (round.type === 'classic' || round.type === 'board') && questions.some((q) => q.hint === undefined)) found.add('hint');
  if (round.type === 'ladder' && round.lifelines.includes('hint') && questions.some((q) => q.hint === undefined)) found.add('hint');
  if (questions.some((q) => q.video !== null) || (round.type === 'ladder' && !round.timer)) found.add('untimed');
  return found;
}

/** Перевірка сумісності (11g): блокування (зараз завжди []) і зміни за таблицею плану 11g. */
export function autopilotCheck(quiz: Quiz): AutopilotCheck {
  const hintBuff = allowedBuffs(quiz).includes('hint');
  const perRound = quiz.rounds.map((round) => roundChanges(round, hintBuff));
  const changed = AUTOPILOT_CHANGES.flatMap((code) => {
    const rounds = perRound.flatMap((found, index) => (found.has(code) ? [index] : []));
    return rounds.length === 0 ? [] : [{ code, rounds }];
  });
  return { blocked: [], changed };
}

function convert(round: Round): Round {
  switch (round.type) {
    case 'board':
      return {
        ...round,
        answerMode: 'phone',
        check: 'auto',
        categories: round.categories.map((category) => ({
          ...category,
          cells: category.cells.map((cell) => (cell.answerMode === 'voice' ? { ...cell, answerMode: 'phone' as const } : cell)),
        })),
      };
    case 'blitz':
    case 'final':
      return round.check === 'manual' ? { ...round, check: 'auto' } : round;
    case 'ladder':
      return round.pick === 'host' ? { ...round, pick: 'random' } : round;
    default:
      return round;
  }
}

/** Вікторина для автопілота: «вголос» → «з телефона», ручна перевірка → за ключем, «ведучий вибирає» учасника → жереб; решта без змін (новий об'єкт, вхід не змінюється). */
export function autopilotQuiz(quiz: Quiz): Quiz {
  return { ...quiz, rounds: quiz.rounds.map(convert) };
}

/** Заставка раунду в автопілоті: min(introMax, intro + introPerChars × ⌈довжина опису / introChars⌉). */
export function autopilotIntroMs(round: Round): number {
  const length = (round.description ?? '').trim().length;
  const { intro, introPerChars, introChars, introMax } = AUTOPILOT_MS;
  return Math.min(introMax, intro + introPerChars * Math.ceil(length / introChars));
}
