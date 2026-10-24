import { DEFAULT_RULES, type DuelCategory, type DuelQuestion, type Question, type QuestionAudio, type Quiz, type RevealMode, type RoundRules } from '@quiz/shared';

/**
 * Демо-вікторина з усіма типами запитань (single, multi, boolean, text, numeric, order, match, chain, sort),
 * усіма раундами (класичний, бліц, поле, фінал зі ставками) і варіантами правил.
 */

let n = 0;
const id = (prefix: string) => `${prefix}-${++n}`;
const q = (text: string, points = 1000, timeLimit = 20) => ({ id: id('q'), text, imageUrl: null, video: null, timeLimit, points });
const opts = (...texts: string[]) => texts.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));

export const single = (text: string, options: string[], correct: number, points?: number, time?: number): Question => ({
  ...q(text, points, time),
  type: 'single',
  options: opts(...options),
  correctId: String.fromCharCode(97 + correct),
});
export const multi = (text: string, options: string[], correct: number[], points?: number, time?: number): Question => ({
  ...q(text, points, time),
  type: 'multi',
  options: opts(...options),
  correctIds: correct.map((i) => String.fromCharCode(97 + i)),
});
export const bool = (text: string, correct: boolean, points?: number, time?: number): Question => ({
  ...q(text, points, time),
  type: 'boolean',
  correct,
});
export const textQ = (text: string, accepted: string[], points?: number, time?: number): Question => ({
  ...q(text, points, time),
  type: 'text',
  accepted,
});
export const numeric = (text: string, correct: number, tolerance: number, points?: number, time?: number): Question => ({
  ...q(text, points, time),
  type: 'numeric',
  correct,
  tolerance,
});
export const order = (text: string, items: string[], points?: number, time?: number, labels?: [top: string, bottom: string]): Question => ({
  ...q(text, points, time),
  type: 'order',
  items: opts(...items),
  ...(labels === undefined ? {} : { topLabel: labels[0], bottomLabel: labels[1] }),
});

export const match = (text: string, pairs: [string, string][], points?: number, time?: number): Question => {
  const base = q(text, points, time);
  const n = pairs.length;
  return {
    ...base,
    type: 'match',
    // Id правих елементів не повторюють номер пари: l1 не стоїть поруч із r1.
    pairs: pairs.map(([left, right], i) => ({
      left: { id: `${base.id}-l${i}`, text: left },
      right: { id: `${base.id}-r${(i + 2) % n}`, text: right },
    })),
  };
};

export const chain = (text: string, words: string[], hintSeconds = 5, points?: number, time?: number): Question => ({
  ...q(text, points, time),
  type: 'chain',
  words,
  hintSeconds,
});

/** Сортування: categories — назви, words — [слово, індекс категорії]. */
export const sort = (text: string, categories: string[], words: [string, number][], points?: number, time?: number, lockSeconds = 3): Question => {
  const base = q(text, points, time);
  return {
    ...base,
    type: 'sort',
    categories: categories.map((name, i) => ({ id: `${base.id}-c${i}`, text: name })),
    words: words.map(([word, category], i) => ({ id: `${base.id}-w${i}`, text: word, categoryId: `${base.id}-c${category}` })),
    lockSeconds,
  };
};

/** Повзунок: діапазон з кроком (типово 1), правильне значення, допуск, межа нуля й одиниця. */
export const slider = (
  text: string,
  range: { min: number; max: number; step?: number },
  correct: number,
  options: { tolerance?: number; zeroBeyond?: number; unit?: string } = {},
  points = 1000,
  time?: number,
): Question => ({
  ...q(text, points, time),
  type: 'slider',
  min: range.min,
  max: range.max,
  step: range.step ?? 1,
  correct,
  tolerance: options.tolerance ?? 0,
  ...(options.zeroBeyond === undefined ? {} : { zeroBeyond: options.zeroBeyond }),
  ...(options.unit === undefined ? {} : { unit: options.unit }),
});

/** Додає до запитання відео з YouTube: id і секунда початку. */
export const video = (question: Question, id: string, start = 0): Question => ({ ...question, video: { id, start } });

/** Додає до запитання аудіо (замість відео). */
export const withAudio = (question: Question, audio: QuestionAudio): Question => ({ ...question, video: null, audio });

/** Картинка запитання проявляється з пікселів або з розмиття; саму картинку потрібно задати окремо. */
export const revealing = (question: Question, mode: RevealMode = 'pixels'): Question => ({ ...question, reveal: mode });

/** Запитання дуелі: текст і прийнятні написання. */
export const duelQ = (text: string, accepted: string[]): DuelQuestion => ({ id: id('d'), text, accepted });
/** Категорія пулу дуелей. */
export const duelCategory = (title: string, questions: DuelQuestion[]): DuelCategory => ({ id: id('dc'), title, questions });

export const rules = (patch: Partial<RoundRules>): RoundRules => ({ ...DEFAULT_RULES, ...patch });
export const cell = (
  question: Question,
  mark: 'none' | 'x2' | 'x3' = 'none',
  extra: { kind?: 'normal' | 'blitz'; answerMode?: 'phone' | 'voice'; penalty?: 'none' | 'all' } = {},
) => ({
  mark,
  kind: extra.kind ?? ('normal' as const),
  penalty: extra.penalty ?? ('none' as const),
  ...(extra.answerMode ? { answerMode: extra.answerMode } : {}),
  question,
});

export const demoQuiz: Quiz = {
  title: 'Демо: усі можливості',
  description:
    'Усі типи запитань (один варіант, кілька, так/ні, текст, число, порядок, пари, ланцюжок слів), класичні раунди з різними правилами, бліц (авто й ручна перевірка) та ігрове поле (телефони й голос, ×2/×3).',
  settings: { leaderboard: 'each' },
  rounds: [
    {
      id: 'r-warmup',
      type: 'classic',
      title: 'Розминка: усі типи запитань',
      speedBonus: true,
      shuffleOptions: true,
      rules: DEFAULT_RULES,
      questions: [
        single('Столиця України?', ['Львів', 'Київ', 'Харків', 'Одеса'], 1),
        video(single('Хто співає цю пісню?', ['Rick Astley', 'Elton John', 'Phil Collins', 'Sting'], 0), 'dQw4w9WgXcQ', 43),
        multi('Які з цих тварин — ссавці?', ['Дельфін', 'Акула', 'Кажан', 'Пінгвін', 'Кит'], [0, 2, 4]),
        bool('Сонце — це зірка.', true, 500, 10),
        textQ('Найдовша річка України?', ['Дніпро', 'Днепр', 'Dnipro'], 1000, 30),
        numeric('Скільки хвилин у добі?', 1440, 0, 1500, 30),
        numeric('Висота Говерли в метрах (±20 м)?', 2061, 20, 1500, 30),
        order('Розставте планети від Сонця', ['Меркурій', 'Венера', 'Земля', 'Марс'], 2000, 40, ['Найближча до Сонця', 'Найдальша від Сонця']),
        match('З’єднайте країну зі столицею', [['Україна', 'Київ'], ['Польща', 'Варшава'], ['Франція', 'Париж'], ['Японія', 'Токіо']], 1500, 40),
        chain('Ланцюжок: від форелі до літака', ['Форель', 'Риба', 'Океан', 'Корабель', 'Порт', 'Подорож', 'Літак'], 5, 1500, 90),
      ],
    },
    {
      id: 'r-rules',
      type: 'classic',
      title: 'Ризик: штраф, частково, серія, ×2',
      speedBonus: false,
      shuffleOptions: false,
      rules: rules({ penalty: 'minus', partial: 50, streak: { length: 3, bonus: { kind: 'percent', value: 50 } }, multiplier: 2 }),
      questions: [
        single('Скільки кольорів у веселці?', ['5', '6', '7', '8'], 2, 500),
        textQ('Хто написав «Кобзар»?', ['Шевченко', 'Тарас Шевченко', 'Т. Шевченко'], 1000, 30),
        multi('Які міста стоять на Дніпрі?', ['Київ', 'Дніпро', 'Львів', 'Запоріжжя', 'Ужгород'], [0, 1, 3], 1000, 30),
        bool('Атлантичний океан — найбільший на Землі.', false, 500, 10),
        order('Від найменшого до найбільшого', ['Мурашка', 'Миша', 'Кіт', 'Кінь', 'Слон'], 1500, 40, ['Найменший', 'Найбільший']),
      ],
    },
    {
      id: 'r-x3',
      type: 'classic',
      title: 'Суперфінал класики: ×3 і фіксована серія',
      speedBonus: true,
      shuffleOptions: true,
      rules: rules({ streak: { length: 2, bonus: { kind: 'fixed', value: 300 } }, multiplier: 3 }),
      questions: [
        numeric('У якому році Україна проголосила незалежність?', 1991, 0, 1000, 20),
        slider('У якому році Україна проголосила незалежність?', { min: 1900, max: 2025 }, 1991, { zeroBeyond: 10, unit: 'рік' }),
        withAudio(single('Назвіть гурт', ['Queen', 'ABBA', 'The Beatles', 'Pink Floyd'], 0), { source: 'youtube', id: 'fJ9rUzIMcZQ', start: 0, duration: 15 }),
        single('Яка хімічна формула води?', ['CO2', 'H2O', 'O2', 'NaCl'], 1, 1000, 15),
        textQ('Як називається столиця Японії?', ['Токіо', 'Tokyo'], 1000, 20),
      ],
    },
    {
      id: 'r-blitz-auto',
      type: 'blitz',
      title: 'Бліц: хто перший (авто)',
      shuffleOptions: true,
      answerWindow: null,
      attempts: 1,
      check: 'auto',
      rules: { ...rules({ penalty: 'minus', streak: { length: 3, bonus: { kind: 'percent', value: 25 } } }), partial: null },
      questions: [
        single('Скільки ніг у павука?', ['6', '8', '10', '12'], 1, 500, 20),
        bool('Кавун — це ягода.', true, 500, 15),
        numeric('Скільки секунд у годині?', 3600, 0, 700, 20),
        multi('Що з цього — кольори прапора України?', ['Синій', 'Червоний', 'Жовтий', 'Зелений'], [0, 2], 700, 20),
        order('Пори року з зими', ['Зима', 'Весна', 'Літо', 'Осінь'], 800, 25, ['Перша', 'Остання']),
        video(single('Назвіть гурт', ['Queen', 'ABBA', 'The Beatles', 'Pink Floyd'], 0), 'fJ9rUzIMcZQ'),
      ],
    },
    {
      id: 'r-blitz-manual',
      type: 'blitz',
      title: 'Бліц: ведучий оцінює',
      shuffleOptions: false,
      answerWindow: null,
      attempts: null,
      check: 'manual',
      rules: { ...DEFAULT_RULES, partial: null },
      questions: [
        textQ('Назвіть будь-яку страву української кухні', ['Борщ', 'Вареники', 'Голубці'], 500, 30),
        textQ('Хто перший полетів у космос?', ['Гагарін', 'Юрій Гагарін'], 1000, 30),
        textQ('Назвіть автора «Лісової пісні»', ['Леся Українка'], 1000, 30),
      ],
    },
    {
      id: 'r-board-phone',
      type: 'board',
      title: 'Поле: відповіді з телефонів',
      shuffleOptions: true,
      answerMode: 'phone',
      check: 'auto',
      rules: rules({ penalty: 'minus' }),
      categories: [
        {
          id: 'c-geo',
          title: 'Географія',
          cells: [
            cell(single('Найвища гора світу?', ['Монблан', 'Еверест', 'Кіліманджаро'], 1, 100)),
            cell(bool('Австралія — це материк і країна водночас.', true, 200), 'x2'),
            cell(textQ('Столиця Канади?', ['Оттава', 'Ottawa'], 300, 30), 'none', { answerMode: 'voice' }),
            cell(numeric('Скільки материків на Землі?', 6, 1, 400)),
          ],
        },
        {
          id: 'c-sci',
          title: 'Наука',
          cells: [
            cell(single('Яка планета найбільша?', ['Сатурн', 'Юпітер', 'Нептун'], 1, 100)),
            cell(multi('Які з цих — благородні гази?', ['Гелій', 'Кисень', 'Неон', 'Аргон'], [0, 2, 3], 200, 30)),
            cell(numeric('Температура кипіння води (°C)?', 100, 0, 300), 'x3', { kind: 'blitz' }),
            cell(order('Від найлегшого', ['Водень', 'Гелій', 'Літій'], 400, 30, ['Найлегший', 'Найважчий'])),
          ],
        },
        {
          id: 'c-cinema',
          title: 'Кіно і музика',
          cells: [
            cell(bool('«Титанік» отримав 11 «Оскарів».', true, 100)),
            cell(single('Хто зняв «Аватар»?', ['Спілберг', 'Кемерон', 'Нолан'], 1, 200)),
            cell(textQ('Гурт, що переміг на Євробаченні-2022?', ['Kalush', 'Kalush Orchestra', 'Калуш'], 300, 30), 'x2', { answerMode: 'voice' }),
            cell(order('Альбоми The Beatles за роком', ['Please Please Me', 'Help!', 'Abbey Road'], 400, 30, ['Найраніше', 'Найпізніше']), 'none', { kind: 'blitz', penalty: 'all' }),
          ],
        },
      ],
    },
    {
      id: 'r-board-voice',
      type: 'board',
      title: 'Поле: усні відповіді',
      shuffleOptions: false,
      answerMode: 'voice',
      check: 'manual',
      rules: rules({ partial: 50 }),
      categories: [
        {
          id: 'c-hist',
          title: 'Історія',
          cells: [
            cell(textQ('Перший президент України?', ['Кравчук', 'Леонід Кравчук'], 100)),
            cell(numeric('Рік хрещення Русі?', 988, 0, 200)),
            cell(textQ('Хто заснував Запорозьку Січ (за легендою)?', ['Дмитро Вишневецький', 'Байда'], 300), 'x3'),
          ],
        },
        {
          id: 'c-lang',
          title: 'Мова',
          cells: [
            cell(textQ('Скільки літер в українській абетці?', ['33'], 100)),
            cell(textQ('Синонім до слова «гарний»', ['Красивий', 'Вродливий', 'Гожий'], 200)),
            cell(textQ('Що означає «файний»?', ['Гарний', 'Хороший'], 300)),
          ],
        },
        {
          id: 'c-sport',
          title: 'Спорт',
          cells: [
            cell(textQ('Скільки гравців у футбольній команді на полі?', ['11'], 100)),
            cell(textQ('Прізвище «Залізного Кличка» (старшого брата)?', ['Віталій Кличко', 'Віталій'], 200), 'x2'),
            cell(textQ('Де пройшли Олімпійські ігри 2024?', ['Париж', 'Paris'], 300)),
          ],
        },
      ],
    },
    {
      id: 'r-final',
      type: 'final',
      title: 'Фінал: Космос',
      shuffleOptions: true,
      check: 'auto',
      wagerMode: 'classic',
      questions: [single('Яка планета найбільша в Сонячній системі?', ['Сатурн', 'Юпітер', 'Нептун', 'Земля'], 1, 1000, 30)],
    },
  ],
};
