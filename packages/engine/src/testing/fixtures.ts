import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  type BlitzRound,
  type BoardRound,
  type BoardCell,
  type ClassicRound,
  type FinalRound,
  type Question,
  type Quiz,
  type QuizSettings,
  type Round,
  type Video,
} from '@quiz/shared';

const base = { imageUrl: null, video: null, timeLimit: 20, points: 1000 };

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

export const match = {
  ...base,
  id: 'q7',
  type: 'match',
  text: 'З’єднайте місто з річкою',
  pairs: [
    { left: { id: 'a', text: 'Київ' }, right: { id: 'x', text: 'Дніпро' } },
    { left: { id: 'b', text: 'Львів' }, right: { id: 'y', text: 'Полтва' } },
    { left: { id: 'c', text: 'Ужгород' }, right: { id: 'z', text: 'Уж' } },
  ],
} satisfies Question;

/** Ланцюжок слів; до типового списку makeQuiz не входить. */
export const chain = {
  ...base,
  id: 'q8',
  type: 'chain',
  text: 'Від риби до корабля',
  words: ['Форель', 'Риба', 'Океан', 'Корабель'],
  hintSeconds: 5,
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

/** Типові: title '', shuffleOptions false, check 'auto'. */
export function finalRound(
  id: string,
  question: Question,
  options: Partial<Omit<FinalRound, 'id' | 'type' | 'questions'>> = {},
): FinalRound {
  return { id, type: 'final', title: '', shuffleOptions: false, check: 'auto', ...options, questions: [question] };
}

/** Копія запитання з іншим id: поле збирають з однакових запитань. */
export const withId = (question: Question, id: string): Question => ({ ...question, id });

/** Копія запитання з відео. */
export const withVideo = (question: Question, video: Video = { id: 'dQw4w9WgXcQ', start: 0 }): Question => ({
  ...question,
  video,
});

/** Копія запитання з іншою ціною. */
export const withPoints = (question: Question, points: number): Question => ({ ...question, points });

/** Фікстура схему не перевіряє: тести рушія можуть будувати поле менше за 3×3. */
export function boardRound(
  id: string,
  categories: { title: string; cells: (Question | (Partial<BoardCell> & { question: Question }))[] }[],
  options: Partial<Omit<BoardRound, 'id' | 'type' | 'categories'>> = {},
): BoardRound {
  return {
    id,
    type: 'board',
    title: '',
    shuffleOptions: false,
    answerMode: 'phone',
    check: 'auto',
    rules: DEFAULT_RULES,
    ...options,
    categories: categories.map(({ title, cells }, index) => ({
      id: `c${index + 1}`,
      title,
      cells: cells.map(
        (cell): BoardCell => ({
          mark: 'none',
          kind: 'normal',
          penalty: 'none',
          ...('question' in cell ? cell : { question: cell }),
        }),
      ),
    })),
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
