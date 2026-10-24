import { DEFAULT_RULES, LIMITS, PIN_MAP_ASPECT, type DuelCategory, type DuelQuestion, type PinMap, type Question, type QuestionAudio, type Quiz, type RevealMode, type RoundRules } from '@quiz/shared';
import { PIN_PLACES } from './pin-places';

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

/** «Хто я?»: підказки від найважчої, прийнятні написання, інтервал між підказками; час піднімається, щоб остання підказка встигла відкритися. */
export const clues = (
  text: string,
  hints: string[],
  accepted: string[],
  interval = LIMITS.defaultClueSeconds,
  points?: number,
  time = 40,
): Question => ({
  ...q(text, points, Math.max(time, (hints.length - 1) * interval + LIMITS.clueTailSeconds)),
  type: 'clues',
  clues: hints,
  accepted,
  interval,
});

/** Точка на мапі: вбудована мапа або власна картинка з пропорцією (imageUrl задається в запитанні); radii — [повні, нуль], %. */
export const pin = (
  text: string,
  base: PinMap | { imageUrl: string; aspect: number },
  target: { x: number; y: number },
  radii: [number, number] = [LIMITS.defaultPinFull, LIMITS.defaultPinZero],
  points?: number,
  time?: number,
): Question => ({
  ...q(text, points, time),
  ...(typeof base === 'string' ? {} : { imageUrl: base.imageUrl }),
  type: 'pin',
  map: typeof base === 'string' ? base : null,
  aspect: typeof base === 'string' ? PIN_MAP_ASPECT[base] : base.aspect,
  target,
  fullRadius: radii[0],
  zeroRadius: radii[1],
});

/** Стіна зв'язків: groups — [назва, плитки][], 4 групи по 4 або 3 по 3. Id плиток наскрізні, не з назви групи. */
export const wall = (
  text: string,
  groups: [string, string[]][],
  mistakes: number = LIMITS.defaultWallMistakes,
  points = 1000,
  time: number = LIMITS.defaultWallTime,
): Question => ({
  ...q(text, points, time),
  type: 'wall',
  groups: groups.map(([name, tiles]) => ({
    id: id('g'),
    name,
    tiles: tiles.map((tile) => ({ id: id('t'), text: tile })),
  })),
  mistakes,
});

/** Опитування без правильного варіанта й без балів. */
export const poll = (text: string, options: string[], time = 20): Question => ({
  ...q(text, 0, time),
  type: 'poll',
  options: opts(...options),
});

/** «Хмара слів»: кожен гравець пише до words слів; без балів. */
export const cloud = (text: string, words: number = LIMITS.maxCloudWords, time = 30): Question => ({
  ...q(text, 0, time),
  type: 'wordcloud',
  words,
});

/** «100 до 1» з дошкою ведучого: rows — [текст, популярність, додаткові написання?][]. */
export const survey = (
  text: string,
  rows: [string, number, string[]?][],
  answers: number = LIMITS.defaultSurveyAnswers,
  points = 1000,
  time: number = LIMITS.defaultSurveyTime,
): Question => ({
  ...q(text, points, time),
  type: 'survey',
  rows: rows.map(([rowText, popularity, accepted = []]) => ({ id: id('s'), text: rowText, popularity, accepted })),
  answers,
});

/** «100 до 1» з дошкою з хмари cloudQ (запитання, що стоїть раніше); spare — запасні рядки, як у survey. */
export const surveyFromCloud = (
  text: string,
  cloudQ: Question,
  spare: [string, number, string[]?][] = [],
  answers = 2,
  points = 1000,
  time: number = LIMITS.defaultSurveyTime,
): Question => ({ ...survey(text, spare, answers, points, time), cloudId: cloudQ.id } as Question);

/** Блеф: факт із пропуском, правда з написаннями (перше — текст варіанта), 2–3 запасні вигадки. */
export const bluff = (
  text: string,
  accepted: string[],
  lies: string[],
  points = 1000,
  time: number = LIMITS.defaultBluffTime,
  choiceTime: number = LIMITS.defaultChoiceTime,
): Question => ({ ...q(text, points, time), type: 'bluff', accepted, lies, choiceTime });

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

const kyivCloud = cloud('Одним словом: з чим у вас асоціюється Київ?');

export const demoQuiz: Quiz = {
  title: 'Демо: усі можливості',
  description:
    'Усі типи запитань (один варіант, кілька, так/ні, текст, число, порядок, пари, ланцюжок слів, «Хто я?», точка на мапі, стіна зв’язків, опитування, «хмара слів», «100 до 1», блеф), класичні раунди з різними правилами, бліц (авто й ручна перевірка) та ігрове поле (телефони й голос, ×2/×3).',
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
        poll('Яка пора року найкраща для вікторини?', ['Весна', 'Літо', 'Осінь', 'Зима']),
        kyivCloud,
        bluff('Блеф: Ейфелеву вежу спершу пропонували поставити в …, але місто відмовилося.', ['Барселона', 'Барселоні'], ['Мадрид', 'Лондон', 'Брюссель']),
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
        surveyFromCloud('100 до 1 з ваших відповідей: з чим асоціюється Київ? Назвіть два слова', kyivCloud, [
          ['Каштани', 30, ['каштан']],
          ['Дніпро', 25],
          ['Лавра', 15, ['Києво-Печерська лавра']],
          ['Майдан', 10],
        ]),
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
        slider('Скільки відсотків поверхні Землі вкриває вода?', { min: 0, max: 100 }, 71, { tolerance: 2, zeroBeyond: 15, unit: '%' }),
        withAudio(single('Назвіть гурт', ['Queen', 'ABBA', 'The Beatles', 'Pink Floyd'], 0), { source: 'youtube', id: 'fJ9rUzIMcZQ', start: 0, duration: 15 }),
        single('Яка хімічна формула води?', ['CO2', 'H2O', 'O2', 'NaCl'], 1, 1000, 15),
        textQ('Як називається столиця Японії?', ['Токіо', 'Tokyo'], 1000, 20),
        clues(
          'Хто я?',
          ['Я народився в Моринцях 1814 року.', 'Мене викупили з кріпацтва 1838 року.', 'Я був і художником, і поетом.', 'Мій «Кобзар» вийшов 1840 року.', 'Мій портрет — на купюрі 100 гривень.'],
          ['Тарас Шевченко', 'Шевченко'],
          6,
        ),
        pin('Де на мапі Львів?', 'ukraine', PIN_PLACES.ukraine.lviv),
        wall('Стіна зв’язків: знайдіть чотири четвірки', [
          ['Річки України', ['Дніпро', 'Десна', 'Рось', 'Псел']],
          ['Вершини Карпат', ['Говерла', 'Петрос', 'Піп Іван', 'Бребенескул']],
          ['Озера', ['Світязь', 'Синевир', 'Несамовите', 'Пісочне']],
          ['Острови', ['Хортиця', 'Джарилгач', 'Зміїний', 'Бірючий']],
        ]),
        survey('100 до 1: назвіть фрукт, який люблять діти', [
          ['Яблуко', 32, ['яблучко']],
          ['Банан', 25],
          ['Полуниця', 15, ['суниця']],
          ['Кавун', 10],
          ['Груша', 8],
          ['Мандарин', 6, ['мандаринка']],
        ]),
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
            cell(pin('Де на мапі Одеса?', 'ukraine', PIN_PLACES.ukraine.odesa, [3, 15], 500, 30)),
            cell(
              wall(
                'Швидка стіна',
                [
                  ['Фрукти', ['Яблуко', 'Груша', 'Слива']],
                  ['Птахи', ['Сова', 'Лелека', 'Чапля']],
                  ['Метали', ['Мідь', 'Залізо', 'Олово']],
                ],
                2,
                600,
                60,
              ),
            ),
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
            cell(
              clues(
                'Хто я?',
                ['Я народилася в Новограді-Волинському.', 'Мій дядько — Михайло Драгоманов.', 'Я написала «Лісову пісню».', 'Мій псевдонім пов’язаний з назвою країни.'],
                ['Леся Українка', 'Лариса Косач'],
                8,
                400,
              ),
            ),
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
      id: 'r-wipeout',
      type: 'wipeout',
      title: 'Ва-банк: столиці',
      shuffleOptions: true,
      questions: [
        // Столиця Канади — Оттава, а не найбільше місто Торонто.
        single('Столиця Канади?', ['Оттава', 'Торонто', 'Монреаль', 'Ванкувер'], 0, 100, 20),
        // Столиця Австралії — Канберра, а не Сідней чи Мельбурн.
        bool('Канберра — столиця Австралії', true, 200, 15),
        // В Україні 24 області; окремо стоять Автономна Республіка Крим і два міста зі спеціальним статусом.
        numeric('Скільки областей в Україні?', 24, 0, 300, 20),
        // Столиця Туреччини — Анкара, а не Стамбул.
        textQ('Столиця Туреччини?', ['Анкара'], 400, 20),
        // В ООН 193 держави-члени.
        slider('Скільки країн-членів має ООН?', { min: 150, max: 210, step: 1 }, 193, { tolerance: 2 }, 500, 25),
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
