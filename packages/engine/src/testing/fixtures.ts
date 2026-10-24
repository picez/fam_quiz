import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  type BlitzRound,
  type BoardRound,
  type BoardCell,
  type ClassicRound,
  type Duels,
  type FinalRound,
  type Question,
  type QuestionAudio,
  type Quiz,
  type QuizSettings,
  type RevealMode,
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

/** single на 4 варіанти: a Львів, b Київ (правильний), c Одеса, d Харків. */
export const single4 = {
  ...single,
  options: [...single.options, { id: 'd', text: 'Харків' }],
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

/** Сортування: 100 балів за слово, підвисання 3 с; до типового списку makeQuiz не входить. */
export const sortQ = {
  ...base,
  id: 'q9',
  type: 'sort',
  text: 'Овочі й фрукти',
  points: 100,
  lockSeconds: 3,
  categories: [
    { id: 'c1', text: 'Овочі' },
    { id: 'c2', text: 'Фрукти' },
  ],
  words: [
    { id: 'w1', text: 'Морква', categoryId: 'c1' },
    { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
    { id: 'w3', text: 'Буряк', categoryId: 'c1' },
    { id: 'w4', text: 'Груша', categoryId: 'c2' },
  ],
} satisfies Question;

/** Повзунок 0…100 %, крок 1, правильне 50, допуск ±2, нуль далі ніж ±12; до типового списку makeQuiz не входить. */
export const slider = {
  ...base,
  id: 'q10',
  type: 'slider',
  text: 'Скільки відсотків поверхні Землі вкриває вода?',
  min: 0,
  max: 100,
  step: 1,
  correct: 50,
  tolerance: 2,
  zeroBeyond: 12,
  unit: '%',
} satisfies Question;

/** «Хто я?»: 5 підказок по 5 с, 30 с; до типового списку makeQuiz не входить. */
export const clues = {
  ...base,
  id: 'q11',
  type: 'clues',
  text: 'Хто я?',
  timeLimit: 30,
  clues: ['Я народився 1814 року.', 'Я був кріпаком.', 'Я художник.', 'Я написав «Кобзар».', 'Я на купюрі 100 гривень.'],
  accepted: ['Шевченко', 'Тарас Шевченко'],
  interval: 5,
} satisfies Question;

/** Точка на мапі «Світ» (2 : 1): правильна в центрі, повні бали до 3 %, нуль від 15 %; до типового списку makeQuiz не входить. */
export const pin = {
  ...base,
  id: 'q12',
  type: 'pin',
  text: 'Де Київ?',
  timeLimit: 30,
  map: 'world',
  aspect: 2,
  target: { x: 0.5, y: 0.5 },
  fullRadius: 3,
  zeroRadius: 15,
} satisfies Question;

const tiles = (prefix: string, ...texts: string[]) => texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text }));

/** Стіна 4×4: групи gr (r1…r4), gm (m1…m4), gl (l1…l4), gi (i1…i4); 1000 балів, 3 помилки, 90 с; до типового списку makeQuiz не входить. */
export const wall = {
  ...base,
  id: 'q13',
  type: 'wall',
  text: 'Знайдіть зв’язки',
  timeLimit: 90,
  points: 1000,
  mistakes: 3,
  groups: [
    { id: 'gr', name: 'Річки', tiles: tiles('r', 'Дніпро', 'Десна', 'Рось', 'Псел') },
    { id: 'gm', name: 'Гори', tiles: tiles('m', 'Говерла', 'Петрос', 'Піп Іван', 'Бребенескул') },
    { id: 'gl', name: 'Озера', tiles: tiles('l', 'Світязь', 'Синевир', 'Ялпуг', 'Кагул') },
    { id: 'gi', name: 'Острови', tiles: tiles('i', 'Хортиця', 'Джарилгач', 'Зміїний', 'Бірючий') },
  ],
} satisfies Question;

/** Стіна 3×3: групи ga (a1…a3), gb (b1…b3), gc (c1…c3); 900 балів, 2 помилки, 60 с. */
export const wall3 = {
  ...base,
  id: 'q14',
  type: 'wall',
  text: 'Швидка стіна',
  timeLimit: 60,
  points: 900,
  mistakes: 2,
  groups: [
    { id: 'ga', name: 'Фрукти', tiles: tiles('a', 'Яблуко', 'Груша', 'Слива') },
    { id: 'gb', name: 'Птахи', tiles: tiles('b', 'Сова', 'Лелека', 'Чапля') },
    { id: 'gc', name: 'Метали', tiles: tiles('c', 'Мідь', 'Залізо', 'Олово') },
  ],
} satisfies Question;

/** Опитування: три варіанти, без правильного, 0 балів, 20 с; до типового списку makeQuiz не входить. */
export const poll = {
  ...base,
  id: 'q15',
  type: 'poll',
  text: 'Найкраща пора року?',
  timeLimit: 20,
  points: 0,
  options: [
    { id: 'a', text: 'Весна' },
    { id: 'b', text: 'Літо' },
    { id: 'c', text: 'Осінь' },
  ],
} satisfies Question;

/** «Хмара слів»: до 3 слів, 0 балів, 30 с; до типового списку makeQuiz не входить. */
export const cloud = {
  ...base,
  id: 'q16',
  type: 'wordcloud',
  text: 'З чим асоціюється Київ?',
  timeLimit: 30,
  points: 0,
  words: 3,
} satisfies Question;

const row = (id: string, text: string, popularity: number, accepted: string[] = []) => ({ id, text, popularity, accepted });

/**
 * «100 до 1»: дошка ведучого sa Яблуко 32 (ще «яблучко»), sb Банан 25, sc Полуниця 15, sd Кавун 10, se Груша 8;
 * до 3 відповідей, 1000 балів, 45 с; до типового списку makeQuiz не входить.
 */
export const survey = {
  ...base,
  id: 'q17',
  type: 'survey',
  text: 'Назвіть фрукт, який люблять діти',
  timeLimit: 45,
  points: 1000,
  answers: 3,
  rows: [row('sa', 'Яблуко', 32, ['яблучко']), row('sb', 'Банан', 25), row('sc', 'Полуниця', 15), row('sd', 'Кавун', 10), row('se', 'Груша', 8)],
} satisfies Question;

/** «100 до 1» з хмари cloud (q16), без запасних рядків; до 2 відповідей, 1000 балів, 45 с. */
export const surveyCloud = {
  ...base,
  id: 'q18',
  type: 'survey',
  text: 'Що ви назвали про Київ?',
  timeLimit: 45,
  points: 1000,
  answers: 2,
  rows: [],
  cloudId: cloud.id,
} satisfies Question;

/** Адреса картинки для запитань, що проявляються. */
export const IMG = `/uploads/${'b'.repeat(32)}.png`;

/** Копія запитання з картинкою, що проявляється. */
export const withReveal = (question: Question, reveal: RevealMode = 'pixels'): Question => ({
  ...question,
  imageUrl: question.imageUrl ?? IMG,
  reveal,
});

/** Копія запитання з аудіофайлом: типово з 0 с, 30 с. */
export const withAudio = (question: Question, audio: Partial<QuestionAudio> = {}): Question => ({
  ...question,
  audio: { source: 'file', url: `/uploads/${'a'.repeat(32)}.mp3`, start: 0, duration: 30, ...audio } as QuestionAudio,
});

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
  return { id, type: 'final', title: '', shuffleOptions: false, check: 'auto', wagerMode: 'classic', ...options, questions: [question] };
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
  categories: { title: string; cells: (Question | (Partial<BoardCell> & { question: Question }))[]; spares?: Question[] }[],
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
    categories: categories.map(({ title, cells, spares }, index) => ({
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
      ...(spares === undefined ? {} : { spares }),
    })),
  };
}

/** Вікторина з одним класичним раундом; налаштування раунду й вікторини в одному об'єкті. */
export function makeQuiz(
  questions: Question[] = [single, multi, bool, text, numeric, order],
  { leaderboard, debuffs, debuffPrices, buffs, ...round }: Partial<QuizSettings> & RoundOptions = {},
): Quiz {
  const settings: Partial<QuizSettings> = {
    ...(leaderboard ? { leaderboard } : {}),
    ...(debuffs ? { debuffs } : {}),
    ...(debuffPrices ? { debuffPrices } : {}),
    ...(buffs ? { buffs } : {}),
  };
  return makeRoundsQuiz([classicRound('r1', questions, round)], settings);
}

export function makeRoundsQuiz(rounds: Round[], settings: Partial<QuizSettings> = {}): Quiz {
  return {
    title: 'Тестова вікторина',
    description: '',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    rounds,
  };
}

/** Пул дуелей: дві категорії по три запитання, 2 запитання за дуель, 20 с, ставка 300. */
export const duels: Duels = {
  categories: [
    {
      id: 'dc1',
      title: 'Столиці',
      questions: [
        { id: 'd1', text: 'Столиця Франції?', accepted: ['Париж'] },
        { id: 'd2', text: 'Столиця Італії?', accepted: ['Рим'] },
        { id: 'd3', text: 'Столиця Польщі?', accepted: ['Варшава'] },
      ],
    },
    {
      id: 'dc2',
      title: 'Хімія',
      questions: [
        { id: 'd4', text: 'Символ Fe — це…', accepted: ['Залізо', 'Ферум'] },
        { id: 'd5', text: 'Символ Au — це…', accepted: ['Золото', 'Аурум'] },
        { id: 'd6', text: 'Символ O — це…', accepted: ['Кисень', 'Оксиген'] },
      ],
    },
  ],
  questionsPerDuel: 2,
  timeLimit: 20,
  stake: 300,
};
