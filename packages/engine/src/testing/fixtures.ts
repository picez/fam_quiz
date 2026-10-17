import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  type BlitzRound,
  type ClassicRound,
  type Question,
  type Quiz,
  type QuizSettings,
  type Round,
} from '@quiz/shared';

const base = { imageUrl: null, timeLimit: 20, points: 1000 };

export const single = {
  ...base,
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  options: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
    { id: 'c', text: 'Одеса' },
  ],
  correctId: 'b',
} satisfies Question;

export const multi = {
  ...base,
  id: 'q2',
  type: 'multi',
  text: 'Які з цих міст стоять на Дніпрі?',
  options: [
    { id: 'a', text: 'Київ' },
    { id: 'b', text: 'Львів' },
    { id: 'c', text: 'Черкаси' },
    { id: 'd', text: 'Одеса' },
  ],
  correctIds: ['a', 'c'],
} satisfies Question;

export const bool = {
  ...base,
  id: 'q3',
  type: 'boolean',
  text: 'Говерла є найвищою горою України',
  correct: true,
} satisfies Question;

export const text = {
  ...base,
  id: 'q4',
  type: 'text',
  text: 'Яке місто називають перлиною біля моря?',
  accepted: ['Одеса'],
} satisfies Question;

export const numeric = {
  ...base,
  id: 'q5',
  type: 'numeric',
  text: 'Яка висота Говерли в метрах?',
  correct: 2061,
  tolerance: 100,
} satisfies Question;

export const order = {
  ...base,
  id: 'q6',
  type: 'order',
  text: 'Розташуйте міста з заходу на схід',
  items: [
    { id: 'u', text: 'Ужгород' },
    { id: 'l', text: 'Львів' },
    { id: 'k', text: 'Київ' },
    { id: 'h', text: 'Харків' },
  ],
} satisfies Question;

export type RoundOptions = Partial<Pick<ClassicRound, 'title' | 'speedBonus' | 'shuffleOptions' | 'rules'>>;

export function classicRound(id: string, questions: Question[], options: RoundOptions = {}): ClassicRound {
  return {
    id,
    type: 'classic',
    title: '',
    speedBonus: true,
    shuffleOptions: false,
    rules: DEFAULT_RULES,
    ...options,
    questions,
  };
}

export function blitzRound(
  id: string,
  questions: Question[],
  options: Partial<Omit<BlitzRound, 'id' | 'type' | 'questions'>> = {},
): BlitzRound {
  return {
    id,
    type: 'blitz',
    title: '',
    shuffleOptions: false,
    answerWindow: 15,
    attempts: 1,
    check: 'auto',
    rules: { ...DEFAULT_RULES, partial: null },
    ...options,
    questions,
  };
}

/** Вікторина з одним класичним раундом; налаштування раунду й вікторини в одному об'єкті. */
export function makeQuiz(
  questions: Question[] = [single, multi, bool, text, numeric, order],
  { leaderboard, ...round }: Partial<QuizSettings> & RoundOptions = {},
): Quiz {
  return makeRoundsQuiz([classicRound('r1', questions, round)], leaderboard ? { leaderboard } : {});
}

export function makeRoundsQuiz(rounds: Round[], settings: Partial<QuizSettings> = {}): Quiz {
  return {
    title: 'Тестова вікторина',
    description: '',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    rounds,
  };
}
