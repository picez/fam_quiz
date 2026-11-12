import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  generateSudoku,
  jigsawGrid,
  jigsawTabs,
  layoutCrossword,
  pickKeyCells,
  type CrosswordLayout,
  type PuzzlesRound,
  type Answer,
  type AuctionRound,
  type BetsRound,
  type BlitzRound,
  type BoardRound,
  type BoardCell,
  type ClassicRound,
  type Duels,
  type FinalRound,
  type LadderRound,
  type Question,
  type QuestionAudio,
  type Quiz,
  type QuizSettings,
  type RevealMode,
  type Round,
  type SurvivalRound,
  type TruthRound,
  type Video,
  type WipeoutRound,
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

/** «Словесна драбина» поле → тара за 4 кроки, максимум 8, 500 балів, 90 с; до типового списку makeQuiz не входить. */
export const wordladder = {
  ...base,
  id: 'q10',
  type: 'wordladder',
  text: 'Від поля до тари',
  timeLimit: 90,
  points: 500,
  path: ['поле', 'пола', 'пора', 'пара', 'тара'],
  maxSteps: 8,
} satisfies Question;

/** «Список на час» (27c): вісім планет, 100 балів за пункт, мінус 50, 90 с; до типового списку makeQuiz не входить. */
export const timedlist = {
  ...base,
  id: 'q11',
  type: 'timedlist',
  text: 'Планети Сонячної системи',
  timeLimit: 90,
  points: 100,
  minus: 50,
  items: [
    { id: 'l1', text: 'Меркурій', accepted: [] },
    { id: 'l2', text: 'Венера', accepted: [] },
    { id: 'l3', text: 'Земля', accepted: [] },
    { id: 'l4', text: 'Марс', accepted: ['Червона планета'] },
    { id: 'l5', text: 'Юпітер', accepted: [] },
    { id: 'l6', text: 'Сатурн', accepted: [] },
    { id: 'l7', text: 'Уран', accepted: [] },
    { id: 'l8', text: 'Нептун', accepted: [] },
  ],
} satisfies Question;

/** «Слова з літер» (27d): свій набір «морквасті», якнайбільше слів, 20 балів за слово, 90 с; до типового списку makeQuiz не входить. */
export const letterwords = {
  ...base,
  id: 'q12',
  type: 'letterwords',
  text: 'Складіть слова з літер',
  timeLimit: 90,
  points: 20,
  set: { kind: 'fixed', letters: 'морквасті' },
  goal: 'most',
  per: 'word',
} satisfies Question;

/** «Слова з літер» (27d): випадковий набір з 9 літер, найдовше слово, 10 балів за літеру. */
export const letterwordsRandom = {
  ...letterwords,
  id: 'q13',
  set: { kind: 'random', count: 9 },
  goal: 'longest',
  per: 'letter',
  points: 10,
} satisfies Question;

/** «Більше чи менше» (28a): три порівняння (a 100, b 100, a 200), разом 400 балів, 60 с; до типового списку makeQuiz не входить. */
export const moreless = {
  ...base,
  id: 'q14',
  type: 'moreless',
  text: 'Більше чи менше',
  timeLimit: 60,
  points: 400,
  pairs: [
    { id: 'm1', prompt: 'Що вище?', a: { text: 'Говерла', value: '2061 м' }, b: { text: 'Ейфелева вежа', value: '330 м' }, correct: 'a', points: 100 },
    { id: 'm2', prompt: 'Що довше?', a: { text: 'Рейн', value: '1233 км' }, b: { text: 'Дунай', value: '2850 км' }, correct: 'b', points: 100 },
    { id: 'm3', prompt: 'Що глибше?', a: { text: 'Світязь', value: '58 м' }, b: { text: 'Синевир', value: '22 м' }, correct: 'a', points: 200 },
  ],
} satisfies Question;

/** «Малюнок» (28c): слово «соняшник», 100 балів, 60 с; до типового списку makeQuiz не входить. */
export const drawing = {
  ...base,
  id: 'q20',
  type: 'drawing',
  text: 'Що на малюнку?',
  timeLimit: 60,
  points: 100,
  accepted: ['соняшник'],
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

/**
 * Блеф: правда «Барселона» (ще «Барселоні»), запасні вигадки Мадрид, Лондон, Брюссель; 60 с на вигадки, 30 с на вибір, 1000 балів;
 * до типового списку makeQuiz не входить.
 */
export const bluff = {
  ...base,
  id: 'q19',
  type: 'bluff',
  text: 'Ейфелеву вежу спершу пропонували поставити в …, але місто відмовилося.',
  timeLimit: 60,
  choiceTime: 30,
  points: 1000,
  accepted: ['Барселона', 'Барселоні'],
  lies: ['Мадрид', 'Лондон', 'Брюссель'],
} satisfies Question;

/** Розкладка кросворду для фікстур: компонувальник детермінований, тож розкладка завжди та сама. */
function laidOut(entries: { id: string; answer: string; clue: string }[], key: string | null): CrosswordLayout {
  const result = layoutCrossword(entries);
  if (!result.ok) throw new Error(`fixture crossword not laid out: ${result.reason}`);
  if (key === null) return result.layout;
  const keyCells = pickKeyCells(result.layout, entries, key);
  if (!Array.isArray(keyCells)) throw new Error(`fixture crossword key misses ${keyCells.missing.join(',')}`);
  return { ...result.layout, keyCells };
}

const sudokuGrid = generateSudoku(1, 'easy');

/** Судоку (28d): generateSudoku(1, 'easy'), 300 балів, 180 с; лише в раунді puzzles. */
export const sudoku = {
  ...base,
  id: 'z1',
  type: 'sudoku',
  text: 'Розв’яжіть судоку',
  timeLimit: 180,
  points: 300,
  level: 'easy',
  seed: 1,
  givens: sudokuGrid.givens,
  solution: sudokuGrid.solution,
} satisfies Question;

const fullEntries = [
  { id: 'w1', answer: 'калина', clue: 'Червоні ягоди біля хати' },
  { id: 'w2', answer: 'лелека', clue: 'Птах, що гніздиться на стовпі' },
  { id: 'w3', answer: 'вишня', clue: 'Садок … коло хати' },
  { id: 'w4', answer: 'сосна', clue: 'Хвойне дерево з довгими голками' },
];

/** Кросворд «увесь» (28d): калина, лелека, вишня, сосна; 300 балів, 240 с. */
export const crosswordFull = {
  ...base,
  id: 'z2',
  type: 'crossword',
  text: 'Розгадайте кросворд',
  timeLimit: 240,
  points: 300,
  mode: 'full',
  entries: fullEntries,
  key: null,
  layout: laidOut(fullEntries, null),
} satisfies Question;

const keyEntries = [
  { id: 'k1', answer: 'ліщина', clue: 'Кущ, що дає горіхи' },
  { id: 'k2', answer: 'калина', clue: 'Червоні ягоди біля хати' },
  { id: 'k3', answer: 'сосна', clue: 'Хвойне дерево з довгими голками' },
  { id: 'k4', answer: 'озеро', clue: 'Світязь, наприклад' },
];

/** Кросворд з ключовим словом «ліс» (28d): ліщина, калина, сосна, озеро; 300 балів, 240 с. */
export const crosswordKey = {
  ...base,
  id: 'z3',
  type: 'crossword',
  text: 'Знайдіть ключове слово',
  timeLimit: 240,
  points: 300,
  mode: 'key',
  entries: keyEntries,
  key: 'ліс',
  layout: laidOut(keyEntries, 'ліс'),
} satisfies Question;

/** «Головоломки» (28d): типово title ''. */
export function puzzlesRound(id: string, questions: Question[], options: Partial<Omit<PuzzlesRound, 'id' | 'type' | 'questions'>> = {}): PuzzlesRound {
  return { id, type: 'puzzles', title: '', ...options, questions };
}

/** Вікторина з одним раундом «Головоломки»: судоку, кросворд «увесь», кросворд з ключем «ліс». */
export function puzzlesQuiz(settings: Partial<QuizSettings> = {}): Quiz {
  return makeRoundsQuiz([puzzlesRound('pz', [sudoku, crosswordFull, crosswordKey])], settings);
}

const jigsawBase = { ...base, type: 'jigsaw', text: 'Складіть пазл', photo: `/uploads/${'a'.repeat(32)}.jpg`, aspect: '4:3', focus: { x: 0.5, y: 0.5 }, seed: 1, preview: true } as const;
const grid34 = jigsawGrid(12, '4:3');
const grid23 = jigsawGrid(6, '3:4');

/** «Пазл» (29c) 3×4 (rows × cols), 120 с, 300 балів; у класичному раунді чи «Головоломках». */
export const jigsaw = {
  ...jigsawBase,
  id: 'j1',
  timeLimit: 120,
  points: 300,
  ...grid34,
  tabs: jigsawTabs(grid34.rows, grid34.cols, 1),
} satisfies Question;

/** «Пазл» (29c) 6 шматочків, 60 с, 300 балів. */
export const jigsawSmall = {
  ...jigsawBase,
  id: 'j2',
  aspect: '3:4',
  timeLimit: 60,
  points: 300,
  ...grid23,
  tabs: jigsawTabs(grid23.rows, grid23.cols, 1),
} satisfies Question;

/**
 * Вікторина «Пазл» (29c): класика з одним запитанням (30 с) → класика з пазлом 3×4 (120 с) → «Головоломки» з пазлом (60 с).
 * Пазл стоїть після раунду, тож номер запитання в раунді (0) і індекс у plays (1 чи 2) різні.
 */
export function jigsawQuiz(settings: Partial<QuizSettings> = {}): Quiz {
  return makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [jigsaw]), puzzlesRound('pz', [jigsawSmall])], settings);
}

const spotdiffBase = { ...base, type: 'spotdiff', text: 'Знайдіть відмінності', original: `/uploads/${'c'.repeat(32)}.png`, changed: `/uploads/${'d'.repeat(32)}.png`, aspect: 4 / 3 } as const;

/** «Знайди відмінності» (29d): 3 кола, 4:3, 90 с, 300 балів. */
export const spotdiff = {
  ...spotdiffBase,
  id: 'sd1',
  timeLimit: 90,
  points: 300,
  spots: [
    { x: 0.2, y: 0.3, r: 0.05 },
    { x: 0.6, y: 0.5, r: 0.06 },
    { x: 0.85, y: 0.8, r: 0.05 },
  ],
} satisfies Question;

/** «Знайди відмінності» (29d): 2 кола, 60 с, 300 балів. */
export const spotdiffSmall = {
  ...spotdiffBase,
  id: 'sd2',
  timeLimit: 60,
  points: 300,
  spots: [
    { x: 0.3, y: 0.4, r: 0.06 },
    { x: 0.7, y: 0.6, r: 0.06 },
  ],
} satisfies Question;

/**
 * Вікторина «Знайди відмінності» (29d): класика з одним запитанням (30 с) → класика зі spotdiff на 3 кола (90 с) → «Головоломки» з судоку
 * і spotdiff на 2 кола (60 с). Номер запитання в раунді й індекс у plays різні.
 */
export function spotdiffQuiz(settings: Partial<QuizSettings> = {}): Quiz {
  return makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [spotdiff]), puzzlesRound('pz', [sudoku, spotdiffSmall])], settings);
}

/** «Пам'ять» (29f): 3×4, 6 пар «країна — столиця», одна половина — картинка (прапор), seed 42, 90 с, 300 балів. */
export const memory = {
  ...base,
  id: 'mm1',
  type: 'memory',
  text: 'Знайдіть пари',
  timeLimit: 90,
  points: 300,
  grid: '3x4',
  seed: 42,
  pairs: [
    { a: { text: 'Україна' }, b: { text: 'Київ' } },
    { a: { text: 'Польща' }, b: { text: 'Варшава' } },
    { a: { text: 'Франція' }, b: { text: 'Париж' } },
    { a: { text: 'Японія' }, b: { text: 'Токіо' } },
    { a: { text: 'Канада' }, b: { text: 'Оттава' } },
    { a: { text: 'Італія' }, b: { text: '', imageUrl: `/uploads/${'e'.repeat(32)}.png` } },
  ],
} satisfies Question;

/** «Пам'ять» (29f): 4×4, 8 пар «число — слово», 60 с, 300 балів. */
export const memorySmall = {
  ...base,
  id: 'mm2',
  type: 'memory',
  text: 'Знайдіть пари',
  timeLimit: 60,
  points: 300,
  grid: '4x4',
  seed: 7,
  pairs: ['один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім'].map((word, i) => ({ a: { text: String(i + 1) }, b: { text: word } })),
} satisfies Question;

/**
 * Вікторина «Пам'ять» (29f): класика з одним запитанням (30 с) → класика з memory 3×4 (90 с) → «Головоломки» з судоку
 * і memory 4×4 (60 с). Номер запитання в раунді й індекс у plays різні.
 */
export function memoryQuiz(settings: Partial<QuizSettings> = {}): Quiz {
  return makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [memory]), puzzlesRound('pz', [sudoku, memorySmall])], settings);
}

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

/** «Ставки»: типово title '', shuffleOptions false, check 'auto', betStart 200, betStep 100, betMax null; запитанню без betsCut — 2. */
export function betsRound(id: string, questions: Question[], options: Partial<Omit<BetsRound, 'id' | 'type' | 'questions'>> = {}): BetsRound {
  return {
    id,
    type: 'bets',
    title: '',
    shuffleOptions: false,
    check: 'auto',
    betStart: 200,
    betStep: 100,
    betMax: null,
    ...options,
    questions: questions.map((question) => (question.betsCut === undefined ? { ...question, betsCut: 2 } : question)),
  };
}

/** «Аукціон»: типово title '', shuffleOptions false, check 'auto', bidMode 'step', bidStep 100, loss 'bid'; запитанню без betsCut — 2. */
export function auctionRound(
  id: string,
  questions: Question[],
  options: Partial<Omit<AuctionRound, 'id' | 'type' | 'questions'>> = {},
): AuctionRound {
  return {
    id,
    type: 'auction',
    title: '',
    shuffleOptions: false,
    check: 'auto',
    bidMode: 'step',
    bidStep: 100,
    loss: 'bid',
    ...options,
    questions: questions.map((question) => (question.betsCut === undefined ? { ...question, betsCut: 2 } : question)),
  };
}

/** «Правда про гравця» (28b): типово title '', points 300, timeLimit 30; запитання створює гра з фактів. */
export function truthRound(id: string, options: Partial<Omit<TruthRound, 'id' | 'type'>> = {}): TruthRound {
  return { id, type: 'truth', title: '', points: 300, timeLimit: 30, ...options };
}

/** «Ва-банк»: типово title '', shuffleOptions false. */
export function wipeoutRound(
  id: string,
  questions: Question[],
  options: Partial<Omit<WipeoutRound, 'id' | 'type' | 'questions'>> = {},
): WipeoutRound {
  return { id, type: 'wipeout', title: '', shuffleOptions: false, ...options, questions };
}

/** П'ять сходинок 100…500: single, bool, numeric, text, slider з id w1…w5. */
export const wipeoutLadder: Question[] = [single, bool, numeric, text, slider].map((question, i) => ({
  ...question,
  id: `w${i + 1}`,
  points: (i + 1) * 100,
}));

/** П'ять запитань драбини l1…l5: single з варіантами a, b, c, d; правильні b, c, a, d, b; timeLimit 20; points 0. */
export const ladderQuestions: Question[] = ['b', 'c', 'a', 'd', 'b'].map((correctId, i) => ({
  ...base,
  points: 0,
  id: `l${i + 1}`,
  type: 'single',
  text: `Сходинка ${i + 1}?`,
  options: [
    { id: 'a', text: 'А' },
    { id: 'b', text: 'Б' },
    { id: 'c', text: 'В' },
    { id: 'd', text: 'Г' },
  ],
  correctId,
}));

/** «Мільйонер»: типово title '', shuffleOptions false, levels [100, 300, 1000, 3000, 10000], safe [2], pick 'host', усі три підказки, timer false. */
export function ladderRound(
  id: string,
  questions: Question[] = ladderQuestions,
  options: Partial<Omit<LadderRound, 'id' | 'type' | 'questions'>> = {},
): LadderRound {
  return {
    id,
    type: 'ladder',
    title: '',
    shuffleOptions: false,
    levels: [100, 300, 1000, 3000, 10000],
    safe: [2],
    pick: 'host',
    lifelines: ['fifty', 'audience', 'hint'],
    timer: false,
    ...options,
    questions,
  };
}

/** Правильна й неправильна відповідь на l1…l5. */
export const LADDER_RIGHT: Answer[] = ['b', 'c', 'a', 'd', 'b'].map((optionId) => ({ type: 'single', optionId }));
export const LADDER_WRONG: Answer[] = ['a', 'a', 'b', 'a', 'a'].map((optionId) => ({ type: 'single', optionId }));

/** «Вибування»: типово title '', speedBonus false, shuffleOptions false, DEFAULT_RULES, trial 'question', survivors 1, bonus 500. */
export function survivalRound(
  id: string,
  questions: Question[],
  trials: Question[],
  options: Partial<Omit<SurvivalRound, 'id' | 'type' | 'questions' | 'trials'>> = {},
): SurvivalRound {
  return {
    id,
    type: 'survival',
    title: '',
    speedBonus: false,
    shuffleOptions: false,
    rules: DEFAULT_RULES,
    trial: 'question',
    survivors: 1,
    bonus: 500,
    ...options,
    questions,
    trials,
  };
}

/** П'ять запитань s1…s5 по 100: single, bool, numeric, text, slider (відповіді — як у wipeoutLadder). */
export const survivalQuestions: Question[] = [single, bool, numeric, text, slider].map((question, i) => ({
  ...question,
  id: `s${i + 1}`,
  points: 100,
}));

/** Два питання на виживання t1 (boolean, true), t2 (single, правильний 'b'), timeLimit 15. */
export const survivalTrials: Question[] = [
  { ...bool, id: 't1', timeLimit: 15 },
  { ...single, id: 't2', timeLimit: 15 },
];

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
