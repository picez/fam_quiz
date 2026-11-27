/**
 * База запитань (46): усі запитання сайту й сідів в одному файлі, щоб нові вікторини ніколи не повторювались.
 *
 *   pnpm --filter @quiz/server question-db export                 — DATABASE_URL: усі вікторини (усіх власників, бот теж),
 *                                                                    знімки бібліотеки й зіграних ігор, плюс усі сіди
 *   pnpm --filter @quiz/server question-db export --seeds-only    — без бази: лише сіди
 *   pnpm --filter @quiz/server question-db check <сід…>           — нові сіди проти бази й один проти одного
 *   pnpm --filter @quiz/server question-db check --all-seeds      — усі сіди
 *
 * Файл — .superpowers/question-db/questions.jsonl у корені репозиторію (тека в .gitignore: там приватні сімейні вікторини,
 * у git їй не можна). Експорт лише читає: транзакція READ ONLY, тільки SELECT, міграцій немає.
 * check будує сіди в пам'яті заново (записи seed:* з файлу не беруться) і бере з файлу лише записи бази.
 * Рівні: exact, near, media — код виходу 1; fact — лише попередження. Пороги — прапорці, див. USAGE.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  allSpares,
  questionsOf,
  roundQuestions,
  roundTrials,
  upgradeQuiz,
  type Question,
  type Quiz,
  type Round,
} from '@quiz/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { game, libraryEntry, quiz as quizTable } from '../src/db/schema';
import { alikeQuiz } from './alike-quiz';
import { big1Quiz } from './big1-quiz';
import { BIG2_PHOTOS, big2Quiz } from './big2-quiz';
import { BIG3_FILES, BIG3_PHOTOS, big3Quiz } from './big3-quiz';
import { FANTASY_PHOTOS, fantasyQuiz } from './fantasy-quiz';
import { kneeQuiz } from './knee-quiz';
import { SCREEN_PHOTOS, screenQuiz } from './screen-quiz';
import { partyEnQuiz } from './party-en-quiz';
import { KNEE_KEYS } from './knee/images';
import { CLASSROOM_IMAGES, classroomQuiz } from './classroom-quiz';
import { compassQuiz } from './compass-quiz';
import { demoQuiz } from './demo-quiz';
import { DETECTIVE_FILES, detectiveQuiz } from './detective-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { EVENING_IMAGES, eveningQuiz } from './evening-quiz';
import { familyQuiz } from './family-quiz';
import { family2Quiz } from './family2-quiz';
import { FEST_FILES, FEST_IMAGES, festQuiz } from './fest-quiz';
import { filmbluffQuiz } from './filmbluff-quiz';
import { funQuiz } from './fun-quiz';
import { grandQuiz } from './grand-quiz';
import { halloweenQuiz } from './halloween-quiz';
import { horizonQuiz } from './horizon-quiz';
import { LOGIC_FILES, LOGIC_PHOTOS, logicQuiz } from './logic-quiz';
import { MEGA_FILES, MEGA_IMAGES, megaQuiz } from './mega-quiz';
import { mixQuiz } from './mix-quiz';
import { MIX2_PHOTOS, mix2Quiz } from './mix2-quiz';
import { mosaicQuiz } from './mosaic-quiz';
import { movieQuiz } from './movie-quiz';
import { MOVIES90_IMAGES, movies90Quiz } from './movies90-quiz';
import { partyQuiz } from './party-quiz';
import { PL_BIG_PHOTOS, PL_GEO_PHOTOS, PL_LIGHT_PHOTOS, plBigQuiz, plFunQuiz, plGeoQuiz, plLightQuiz } from './pl-quiz';
import { quickQuiz } from './quick-quiz';
import { schoolQuiz } from './school-quiz';
import { school3Quiz } from './school3-quiz';
import { ARTICLES } from './seed-articles';
import { showcaseQuiz } from './showcase-quiz';
import { spyQuiz } from './spy-quiz';
import { teamsQuiz } from './teams-quiz';
import { thinkQuiz } from './think-quiz';
import { videoQuiz } from './video-quiz';
import { wordleQuiz } from './wordle-quiz';
import { worldQuiz } from './world-quiz';

// ---------------------------------------------------------------- записи

/** Одне запитання бази. Сирі поля — для людини; norm і keys — для пошуку повторів (check перераховує їх сам). */
export interface QRecord {
  /** Унікальний у файлі: джерело, id запитання й порядковий номер. */
  id: string;
  /** `db:<quizId>` (вікторина, бібліотека, гра) чи `seed:<назва>`. */
  source: string;
  /** Звідки взято: сід, рядок вікторини, знімок бібліотеки чи знімок гри. */
  from: 'seed' | 'quiz' | 'library' | 'game';
  quizId: string | null;
  ownerId: string | null;
  quizTitle: string;
  /** Назва раунду (для поля — «раунд / категорія»; запасні й дуелі — у дужках). */
  roundTitle: string;
  /** Тип запитання або 'duel'. */
  type: string;
  text: string;
  /** Правильні відповіді, як їх бачить людина. */
  answers: string[];
  /** Варіанти, підказки, вигадки — усе, що не є правильною відповіддю. */
  options: string[];
  /** Елементи, з яких складається завдання (порядок, пари, стіна, список, кросворд…): порівнюються як набір. */
  items: string[];
  /** Медіа: `yt:<id>`, `upload:<файл>`, для сідів — `wiki:<стаття чи File:…>` або `file:<тека>/img/<ключ>.png`. */
  media: string[];
  /** Нормалізований текст. */
  norm: string;
  /** Нормалізовані правильні відповіді. */
  keys: string[];
}

// ---------------------------------------------------------------- нормалізація

const APOSTROPHES = /[’ʼ‘`´ʹ′']/g;

/** Малими, апострофи ’ ʼ ‘ ` — як «'», ё → е, розділові знаки й лапки — пробіл, пробіли стиснуто. */
export function normText(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('uk')
    .replace(APOSTROPHES, "'")
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
    .replace(/(^|\s)'+|'+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Службові слова й загальні основи запитань («Скільки…», «Хто…», «Яке слово…», «Що на фото…»): за ними повтор не шукаємо.
 * Порівнюються з цілим словом після normText і без апострофа.
 */
export const STOP_WORDS = new Set(
  (
    'і й та а але або чи не ні так це цей ця ці цього цієї цих цим цією той те ті того тієї тих тому тим ' +
    'в у на з із зі зо до від за про по для при під над між через після перед без біля коло понад серед поміж ' +
    'як який яка яке які якого якої якому якій яких якими якою якім скільки хто кого кому ким що чого чому чим де коли куди звідки навіщо ' +
    'чий чия чиє чиї чийого чиєї чиїх котрий котра котре котрі котрого ' +
    'був була було були буде будуть будемо є бути стало став стала ' +
    'він вона воно вони його її їх їм йому їй ним нею ними ми ви ти я мене мені нас вас вам вами свій своя своє свої свого своєї своїх своїм себе собі ' +
    'вже ще лише тільки також теж навіть дуже більше менше найбільше найменше саме ось там тут тоді потім усі всі все весь вся всього усього кожен кожна кожне ' +
    'інший інша інше інші іншого один одна одне одні одного два дві три ' +
    'слово слова слів слові літер літери літера літеру букв букви назвіть назва назву назви назві називається називають називали називався називалася називалось ' +
    'зветься звуть звали вгадайте вгадай вгадати оберіть виберіть вкажіть напишіть розставте розташуйте поставте зєднайте знайдіть впишіть визначте ' +
    'відповідь відповіді правда неправда правильно правильна правильний правильну правильні можна треба має мають мав мала мало могла міг може можуть ' +
    'фото фотографії фотографія картинці картинка картинки картинку зображено зображений зображена зображене зображення відео кадр кадрі кадру ' +
    'фрагмент фрагмента фрагментом пісня пісні пісню мелодія мелодії мелодію звучить запитання питання цифра число числа рік року році роки років ' +
    'the of a an in on at to is are was were what who which how many'
  ).split(' '),
);

const ENDINGS = ['ами', 'ями', 'ові', 'еві', 'ого', 'ому', 'ими', 'ій', 'ої', 'ою', 'ею', 'ах', 'ях', 'ам', 'ям', 'ів', 'их', 'им', 'ий', 'ія', 'ії', 'ію', 'ть', 'а', 'я', 'о', 'е', 'у', 'ю', 'і', 'и', 'ї', 'й', 'ь'];

/** Груба основа: без одного закінчення (основа ≥ 3 літер) і не довша за stemLength. */
export function stem(word: string, stemLength: number = DEFAULTS.stemLength): string {
  let base = word;
  if (!/^\d+$/.test(word)) {
    for (const ending of ENDINGS) {
      if (base.length - ending.length >= 3 && base.endsWith(ending)) {
        base = base.slice(0, -ending.length);
        break;
      }
    }
  }
  return base.length > stemLength ? base.slice(0, stemLength) : base;
}

/** Основи змістовних слів тексту: без службових, без слів коротших за 3 літери (числа лишаються). */
export function contentTokens(text: string, stemLength: number = DEFAULTS.stemLength): string[] {
  const out = new Set<string>();
  for (const raw of normText(text).split(' ')) {
    const word = raw.replace(/'/g, '');
    if (word === '' || STOP_WORDS.has(word)) continue;
    // Короткі латинські слова й числа лишаються: символи елементів (Fe, Na), роки.
    if (word.length < 3 && !/^[\da-z]+$/.test(word)) continue;
    out.add(stem(word, stemLength));
  }
  return [...out];
}

/** Ключ відповіді: normText; порожні й «так/ні» відкидаються. */
const WEAK_KEYS = new Set(['так', 'ні', 'true', 'false', 'yes', 'no']);
export function answerKeys(answers: readonly string[]): string[] {
  return [...new Set(answers.map(normText).filter((key) => key !== '' && !WEAK_KEYS.has(key)))];
}

/** Медіа-ключ адреси картинки чи аудіо: `upload:<файл>`, `seedimg:` сідів — як є, решта — `img:<адреса>`. */
export function mediaKey(url: string): string {
  if (url.startsWith(SEED_IMG)) return url.slice(SEED_IMG.length);
  const upload = /^\/uploads\/([^/?#]+)/.exec(url);
  return upload ? `upload:${upload[1]}` : `img:${url}`;
}

// ---------------------------------------------------------------- розбір запитань

const list = <T>(value: readonly T[] | undefined | null): readonly T[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value));

interface Parts {
  answers: string[];
  options: string[];
  items: string[];
  media: string[];
}

/** Відповіді, варіанти, елементи й медіа запитання за його типом (кожен тип схеми — свій випадок). */
export function partsOf(question: Question): Parts {
  const q = question;
  const media: string[] = [];
  if (q.imageUrl) media.push(mediaKey(q.imageUrl));
  if (q.video?.id) media.push(`yt:${q.video.id}`);
  if (q.audio) media.push(q.audio.source === 'youtube' ? `yt:${q.audio.id}` : mediaKey(q.audio.url));
  const parts: Parts = { answers: [], options: [], items: [], media };
  const optionTexts = (options: readonly { text: string; imageUrl?: string }[]) => {
    for (const o of list(options)) {
      if (o.imageUrl) media.push(mediaKey(o.imageUrl));
    }
    return list(options).map((o) => o.text).filter((t) => t !== '');
  };
  switch (q.type) {
    case 'single': {
      parts.options = optionTexts(q.options);
      const correct = list(q.options).find((o) => o.id === q.correctId);
      parts.answers = correct ? [correct.text || (correct.imageUrl ? mediaKey(correct.imageUrl) : '')] : [];
      break;
    }
    case 'multi':
      parts.options = optionTexts(q.options);
      parts.answers = list(q.options).filter((o) => list(q.correctIds).includes(o.id)).map((o) => o.text);
      break;
    case 'poll':
      parts.options = optionTexts(q.options);
      break;
    case 'boolean':
      parts.answers = [q.correct ? 'так' : 'ні'];
      break;
    case 'text':
    case 'drawing':
    case 'spy':
      parts.answers = [...list(q.accepted)];
      if (q.type === 'spy' && q.spyHint) parts.options = [q.spyHint];
      break;
    case 'clues':
      parts.answers = [...list(q.accepted)];
      parts.options = [...list(q.clues)];
      break;
    case 'bluff':
      parts.answers = [...list(q.accepted)];
      parts.options = [...list(q.lies)];
      break;
    case 'melody':
      parts.answers = [...list(q.accepted)];
      if (q.track) media.push(q.track.source === 'youtube' ? `yt:${q.track.id}` : mediaKey(q.track.url));
      break;
    case 'videoclip':
      parts.answers = [...list(q.accepted)];
      if (q.clip?.id) media.push(`yt:${q.clip.id}`);
      break;
    case 'numeric':
      parts.answers = [str(q.correct)];
      break;
    case 'slider':
      parts.answers = [`${str(q.correct)}${q.unit ? ` ${q.unit}` : ''}`];
      break;
    case 'order':
      parts.items = list(q.items).map((i) => i.text);
      parts.answers = [parts.items.join(' > ')];
      break;
    case 'match':
      parts.items = list(q.pairs).map((p) => `${p.left.text} = ${p.right.text}`);
      parts.answers = parts.items;
      break;
    case 'chain':
      parts.items = [...list(q.words)];
      parts.answers = [parts.items.join(' ')];
      break;
    case 'wordladder': {
      const path = list(q.path);
      parts.items = [...path];
      parts.answers = path.length > 0 ? [`${path[0]} > ${path[path.length - 1]}`] : [];
      break;
    }
    case 'sort': {
      const names = new Map(list(q.categories).map((c) => [c.id, c.text]));
      parts.options = list(q.categories).map((c) => c.text);
      parts.items = list(q.words).map((w) => w.text);
      parts.answers = list(q.words).map((w) => `${w.text}: ${names.get(w.categoryId) ?? '?'}`);
      break;
    }
    case 'pin':
      parts.answers = [`${q.map ?? 'image'} @ ${Number(q.target?.x ?? 0).toFixed(2)},${Number(q.target?.y ?? 0).toFixed(2)}`];
      break;
    case 'wall':
      parts.answers = list(q.groups).map((g) => g.name);
      parts.items = list(q.groups).flatMap((g) => list(g.tiles).map((t) => t.text));
      break;
    case 'wordcloud':
    case 'thinkalike':
      break;
    case 'survey':
      parts.items = list(q.rows).map((r) => r.text);
      parts.answers = parts.items;
      break;
    case 'timedlist':
      parts.items = list(q.items).map((i) => i.text);
      parts.answers = parts.items;
      break;
    case 'letterwords':
      parts.answers = q.set?.kind === 'fixed' ? [q.set.letters] : [];
      break;
    case 'wordle':
      parts.answers = [q.word];
      break;
    case 'moreless':
      parts.items = list(q.pairs).map((p) => `${p.prompt}: ${p.a.text} / ${p.b.text}`);
      parts.answers = list(q.pairs).map((p) => (p.correct === 'a' ? p.a.text : p.b.text));
      break;
    case 'sudoku':
      parts.answers = [q.solution];
      break;
    case 'crossword':
      parts.items = list(q.entries).map((e) => e.answer);
      parts.answers = parts.items;
      parts.options = list(q.entries).map((e) => e.clue);
      if (q.key) parts.answers = [...parts.answers, q.key];
      break;
    case 'jigsaw':
      if (q.photo) media.push(mediaKey(q.photo));
      break;
    case 'spotdiff':
      if (q.original) media.push(mediaKey(q.original));
      if (q.changed) media.push(mediaKey(q.changed));
      break;
    case 'memory':
      parts.items = list(q.pairs).map((p) => `${p.a.text || (p.a.imageUrl ? mediaKey(p.a.imageUrl) : '')} = ${p.b.text || (p.b.imageUrl ? mediaKey(p.b.imageUrl) : '')}`);
      for (const p of list(q.pairs)) {
        if (p.a.imageUrl) media.push(mediaKey(p.a.imageUrl));
        if (p.b.imageUrl) media.push(mediaKey(p.b.imageUrl));
      }
      parts.answers = parts.items;
      break;
    case 'think':
      parts.answers = list(q.words).map((w) => w.word);
      parts.options = list(q.words).flatMap((w) => list(w.synonyms));
      break;
    default: {
      const unknown: never = q;
      void unknown;
    }
  }
  parts.media = [...new Set(media)];
  return parts;
}

/** Запитання вікторини з назвою раунду: основні, питання на виживання, запасні полів і загальні, дуелі. */
export interface Located {
  roundTitle: string;
  question: Question | { type: 'duel'; id: string; text: string; accepted: string[] };
}

const roundName = (round: Round, index: number) => round.title?.trim() || `Раунд ${index + 1}`;

/** Знаходить запитання через спільні помічники схеми (questionsOf, roundTrials, allSpares) і дописує назви раундів. */
export function locateQuestions(quiz: Quiz): Located[] {
  const out: Located[] = [];
  quiz.rounds.forEach((round, index) => {
    const title = roundName(round, index);
    if (round.type === 'board') {
      for (const category of list(round.categories)) {
        for (const cell of list(category.cells)) out.push({ roundTitle: `${title} / ${category.title}`, question: cell.question });
        for (const spare of list(category.spares)) out.push({ roundTitle: `${title} / ${category.title} (запасне)`, question: spare });
      }
    } else {
      for (const question of roundQuestions(round)) out.push({ roundTitle: title, question });
    }
    for (const trial of roundTrials(round)) out.push({ roundTitle: `${title} (виживання)`, question: trial });
  });
  for (const spare of list(quiz.spares)) out.push({ roundTitle: '(запасні)', question: spare });
  for (const category of list(quiz.duels?.categories)) {
    for (const duel of list(category.questions)) {
      out.push({ roundTitle: `(дуелі: ${category.title})`, question: { type: 'duel', id: duel.id, text: duel.text, accepted: [...list(duel.accepted)] } });
    }
  }
  // Сторожа: помічники схеми знаходять ті самі запитання (крім дуелей).
  const expected = questionsOf(quiz).length + quiz.rounds.flatMap(roundTrials).length + allSpares(quiz).length;
  const found = out.filter((l) => l.question.type !== 'duel').length;
  if (expected !== found) throw new Error(`locateQuestions found ${found} questions, the schema helpers ${expected}`);
  return out;
}

interface Origin {
  source: string;
  from: QRecord['from'];
  quizId: string | null;
  ownerId: string | null;
  quizTitle: string;
}

export function recordsOf(quiz: Quiz, origin: Origin): QRecord[] {
  return locateQuestions(quiz).map(({ roundTitle, question }, n) => {
    const parts: Parts =
      question.type === 'duel' ? { answers: question.accepted, options: [], items: [], media: [] } : partsOf(question);
    const text = str(question.text);
    return {
      id: `${origin.source}#${question.id}#${n}`,
      ...origin,
      roundTitle,
      type: question.type,
      text,
      ...parts,
      norm: normText(text),
      keys: answerKeys(parts.answers),
    };
  });
}

/** Вікторина з рядка бази чи знімка: старий формат через upgradeQuiz, дуелі й запасні — із settings, як їх зберігає сервер. */
export function quizFromStored(raw: unknown): Quiz | null {
  const upgraded = upgradeQuiz(raw);
  if (typeof upgraded !== 'object' || upgraded === null) return null;
  const value = upgraded as Record<string, unknown>;
  if (!Array.isArray(value.rounds)) return null;
  const settings = (typeof value.settings === 'object' && value.settings !== null ? value.settings : {}) as Record<string, unknown>;
  const { duels, spares, ...rest } = settings;
  return {
    ...(value as unknown as Quiz),
    settings: rest as Quiz['settings'],
    ...(value.duels === undefined && duels !== undefined ? { duels: duels as Quiz['duels'] } : {}),
    ...(value.spares === undefined && spares !== undefined ? { spares: spares as Quiz['spares'] } : {}),
  };
}

// ---------------------------------------------------------------- сіди

/** Префікс адрес-заглушок сідів: картинка ще не завантажена, ключ — джерело (стаття чи файл). */
const SEED_IMG = 'seedimg:';
const wikiKey = (title: string) => `wiki:${title.replace(/_/g, ' ').toLocaleLowerCase('en')}`;

/** Заглушка завантаження: ключ картинки → `seedimg:wiki:…` чи `seedimg:file:<тека>/img/<ключ>.png`. */
function seedImages(seed: string, photos: Record<string, string>, files: { dir: string; keys: readonly string[] } | null = null) {
  return (key: string): string => {
    if (files?.keys.includes(key)) return `${SEED_IMG}file:${files.dir}/img/${key}.png`;
    const title = photos[key];
    return title === undefined ? `${SEED_IMG}seed:${seed}:${key}` : `${SEED_IMG}${wikiKey(title)}`;
  };
}

/** Карта ключ → заглушка для сідів, що беруть Record (party, showcase, grand, family): статті ARTICLES. */
const articleImages = (): Record<string, string> =>
  Object.fromEntries(Object.entries(ARTICLES).map(([key, title]) => [key, `${SEED_IMG}${wikiKey(title)}`]));

/**
 * Сіди seed-demo.ts (SEEDS, крім party-media — це той самий party з картинками), зібрані в пам'яті без бази й мережі,
 * як у тестах сідів: замість завантаження — заглушки адрес.
 */
export const SEED_BUILDERS = {
  demo: () => demoQuiz,
  party: () => partyQuiz(articleImages()),
  movies: () => movieQuiz,
  erudite: () => eruditeQuiz,
  school: () => schoolQuiz,
  mosaic: () => mosaicQuiz,
  compass: () => compassQuiz,
  horizon: () => horizonQuiz,
  teams: () => teamsQuiz(),
  showcase: () => showcaseQuiz(articleImages()),
  grand: () => grandQuiz(articleImages()),
  family: () => familyQuiz(articleImages()),
  family2: () => family2Quiz(),
  evening: () => eveningQuiz(seedImages('evening', EVENING_IMAGES)),
  classroom: () => classroomQuiz(seedImages('classroom', CLASSROOM_IMAGES)),
  movies90: () => movies90Quiz(seedImages('movies90', MOVIES90_IMAGES)),
  logic: () => logicQuiz(seedImages('logic', LOGIC_PHOTOS, { dir: 'logic', keys: LOGIC_FILES })),
  world: () => worldQuiz(),
  fun: () => funQuiz(),
  halloween: () => halloweenQuiz(),
  mix: () => mixQuiz(),
  quick: () => quickQuiz(),
  mix2: () => mix2Quiz(seedImages('mix2', MIX2_PHOTOS)),
  mega: () => megaQuiz(seedImages('mega', MEGA_IMAGES, { dir: 'mega', keys: MEGA_FILES })),
  fest: () => festQuiz(seedImages('fest', FEST_IMAGES, { dir: 'fest', keys: FEST_FILES })),
  detective: () => detectiveQuiz(seedImages('detective', {}, { dir: 'detective', keys: DETECTIVE_FILES })),
  think: () => thinkQuiz(),
  video: () => videoQuiz(),
  alike: () => alikeQuiz(),
  spy: () => spyQuiz(),
  school3: () => school3Quiz(),
  wordle: () => wordleQuiz(),
  big1: () => big1Quiz(),
  big2: () => big2Quiz(seedImages('big2', BIG2_PHOTOS)),
  big3: () => big3Quiz(seedImages('big3', BIG3_PHOTOS, { dir: 'big3', keys: BIG3_FILES })),
  filmbluff: () => filmbluffQuiz(),
  fantasy: () => fantasyQuiz(seedImages('fantasy', FANTASY_PHOTOS)),
  screen: () => screenQuiz(seedImages('screen', SCREEN_PHOTOS)),
  'party-en': () => partyEnQuiz(),
  knee: () => kneeQuiz(seedImages('knee', {}, { dir: 'knee', keys: KNEE_KEYS })),
  'pl-light': () => plLightQuiz(seedImages('pl-light', PL_LIGHT_PHOTOS)),
  'pl-geo': () => plGeoQuiz(seedImages('pl-geo', PL_GEO_PHOTOS)),
  'pl-big': () => plBigQuiz(seedImages('pl-big', PL_BIG_PHOTOS)),
  'pl-fun': () => plFunQuiz(),
} satisfies Record<string, () => Quiz>;

export type SeedName = keyof typeof SEED_BUILDERS;
export const SEED_NAMES = Object.keys(SEED_BUILDERS) as SeedName[];
export const isSeedName = (name: string): name is SeedName => Object.hasOwn(SEED_BUILDERS, name);

export function seedRecords(names: readonly SeedName[] = SEED_NAMES): QRecord[] {
  return names.flatMap((name) => {
    const quiz = SEED_BUILDERS[name]();
    return recordsOf(quiz, { source: `seed:${name}`, from: 'seed', quizId: null, ownerId: null, quizTitle: quiz.title });
  });
}

// ---------------------------------------------------------------- експорт з бази

/**
 * Усі запитання бази в одній транзакції READ ONLY (лише SELECT): кожна вікторина (усі власники, бот теж);
 * зі знімків бібліотеки й ігор — лише запитання, яких уже немає в живій вікторині (видалені вікторини, змінені запитання).
 */
export async function dbRecords(db: Db): Promise<QRecord[]> {
  return db.transaction(
    async (tx) => {
      const out: QRecord[] = [];
      const seen = new Map<string, Set<string>>();
      const identityOf = (r: QRecord) => `${r.type}|${r.norm}|${r.keys.join('|')}`;
      const add = (records: QRecord[], quizKey: string, onlyNew: boolean) => {
        const known = seen.get(quizKey) ?? new Set<string>();
        seen.set(quizKey, known);
        for (const record of records) {
          const identity = identityOf(record);
          if (onlyNew && known.has(identity)) continue;
          known.add(identity);
          out.push(record);
        }
      };
      const safeRecords = (raw: unknown, origin: Origin): QRecord[] => {
        const quiz = quizFromStored(raw);
        if (quiz === null) return [];
        try {
          return recordsOf(quiz, origin);
        } catch (error) {
          console.warn(`Skipped ${origin.source} (${origin.from}): ${error instanceof Error ? error.message : String(error)}`);
          return [];
        }
      };

      const quizzes = await tx
        .select({ id: quizTable.id, ownerId: quizTable.ownerId, title: quizTable.title, description: quizTable.description, settings: quizTable.settings, rounds: quizTable.rounds })
        .from(quizTable)
        .orderBy(quizTable.createdAt);
      for (const row of quizzes) {
        const origin: Origin = { source: `db:${row.id}`, from: 'quiz', quizId: row.id, ownerId: row.ownerId, quizTitle: row.title };
        add(safeRecords({ title: row.title, description: row.description, settings: row.settings, rounds: row.rounds }, origin), row.id, false);
      }

      const entries = await tx
        .select({ quizId: libraryEntry.quizId, ownerId: libraryEntry.ownerId, title: libraryEntry.title, snapshot: libraryEntry.snapshot })
        .from(libraryEntry);
      for (const row of entries) {
        const origin: Origin = { source: `db:${row.quizId}`, from: 'library', quizId: row.quizId, ownerId: row.ownerId, quizTitle: row.title };
        add(safeRecords(row.snapshot, origin), row.quizId, true);
      }

      const games = await tx
        .select({ id: game.id, quizId: game.quizId, hostId: game.hostId, title: game.title, snapshot: game.quizSnapshot })
        .from(game)
        .orderBy(game.startedAt);
      for (const row of games) {
        const quizKey = row.quizId ?? `game:${row.id}`;
        const origin: Origin = { source: `db:${quizKey}`, from: 'game', quizId: row.quizId, ownerId: row.hostId, quizTitle: row.title };
        add(safeRecords(row.snapshot, origin), quizKey, true);
      }
      return out;
    },
    { accessMode: 'read only' },
  );
}

/** Тека бази запитань за замовчуванням: .superpowers/question-db у корені репозиторію (у .gitignore). */
export const DEFAULT_DIR = resolve(import.meta.dirname, '../../..', '.superpowers', 'question-db');

export function summaryOf(records: readonly QRecord[]): string {
  const count = (key: (r: QRecord) => string) => {
    const map = new Map<string, number>();
    for (const r of records) map.set(key(r), (map.get(key(r)) ?? 0) + 1);
    return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const quizzes = new Set(records.filter((r) => r.from !== 'seed').map((r) => r.source)).size;
  const lines = [
    `Question database, ${new Date().toISOString()}`,
    `Records: ${records.length} (seeds: ${records.filter((r) => r.from === 'seed').length}, database: ${records.filter((r) => r.from !== 'seed').length} from ${quizzes} quizzes)`,
    '',
    'By type:',
    ...count((r) => r.type).map(([k, n]) => `  ${k.padEnd(12)} ${n}`),
    '',
    'By origin:',
    ...count((r) => r.from).map(([k, n]) => `  ${k.padEnd(12)} ${n}`),
    '',
    'By seed:',
    ...count((r) => (r.from === 'seed' ? r.source.slice(5) : '')).filter(([k]) => k !== '').map(([k, n]) => `  ${k.padEnd(12)} ${n}`),
  ];
  return `${lines.join('\n')}\n`;
}

export function writeExport(records: readonly QRecord[], dir: string): { file: string; summary: string } {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'questions.jsonl');
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : ''));
  const summary = summaryOf(records);
  writeFileSync(join(dir, 'summary.txt'), summary);
  return { file, summary };
}

export function readExport(file: string): QRecord[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as QRecord);
}

// ---------------------------------------------------------------- перевірка

export interface Thresholds {
  /** Жаккар змістовних слів для near: і звичайний, і зважений за рідкістю слів мають бути не менші. */
  near: number;
  /** Те саме, коли в обох є відповіді й вони різні («Найбільша планета…» і «Скільки планет…»): поріг вищий. */
  nearOtherAnswer: number;
  /** Жаккар наборів елементів (порядок, пари, стіна, список, кросворд…) для near. */
  itemsNear: number;
  /** Найменше змістовних слів, щоб текст сам по собі щось означав; коротший («Хто це?») порівнюється лише разом із відповіддю. */
  minTokens: number;
  /** Найменше елементів для порівняння наборів. */
  minItems: number;
  /** Слово рідкісне, якщо трапляється не більш ніж у такій частці записів… */
  rareShare: number;
  /** …або не більш ніж у стількох записах (більше з двох). */
  rareMin: number;
  /** Скільки спільних рідкісних слів (разом зі спільною відповіддю) дає fact. */
  factWords: number;
  /** Довжина основи слова. */
  stemLength: number;
}

export const DEFAULTS: Thresholds = { near: 0.6, nearOtherAnswer: 0.85, itemsNear: 0.6, minTokens: 3, minItems: 3, rareShare: 0.005, rareMin: 5, factWords: 2, stemLength: 7 };

export const LEVELS = ['exact', 'near', 'media', 'fact'] as const;
export type Level = (typeof LEVELS)[number];
/** Рівні, що дають код виходу 1. */
export const FAILING: readonly Level[] = ['exact', 'near', 'media'];

export interface Finding {
  level: Level;
  /** Для near — Жаккар, для fact — кількість спільних рідкісних слів, інакше 1. */
  score: number;
  a: QRecord;
  b: QRecord;
  detail: string;
}

interface Prepared {
  record: QRecord;
  tokens: Set<string>;
  items: Set<string>;
  keys: Set<string>;
  /** Короткий текст: збіг лише разом із відповіддю. */
  generic: boolean;
  /** Ключ exact: текст, а для короткого тексту — ще й відповіді. */
  identity: string;
  /** Сід, з якого записи бази (за назвою вікторини), — їх не порівнюємо з самим сідом. */
  twin: string | null;
}

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
};
const overlap = (a: Set<string>, b: Set<string>): string[] => [...a].filter((x) => b.has(x));

/**
 * Типи, де текст — лише інструкція («Стіна зв'язків: знайдіть чотири четвірки», «Складіть пазл»), а зміст — у елементах,
 * слові чи картинці: їх текст сам по собі повтором не вважається.
 */
export const STRUCTURAL_TYPES: ReadonlySet<string> = new Set([
  'order', 'match', 'chain', 'wordladder', 'sort', 'wall', 'survey', 'timedlist', 'letterwords', 'wordle', 'moreless',
  'sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory', 'drawing', 'spy', 'melody', 'videoclip', 'think', 'thinkalike', 'wordcloud', 'poll',
]);

/** Той самий текст до різних картинок з різними відповідями («Перекладіть один сірник…» до трьох малюнків) — різні запитання. */
const differentPictures = (a: Prepared, b: Prepared): boolean =>
  a.record.media.length > 0 && b.record.media.length > 0 && overlap(new Set(a.record.media), new Set(b.record.media)).length === 0 && overlap(a.keys, b.keys).length === 0;

function prepare(record: QRecord, t: Thresholds, twin: string | null): Prepared {
  const tokens = new Set(contentTokens(record.text, t.stemLength));
  const keys = new Set(answerKeys(record.answers));
  const generic = tokens.size < t.minTokens || STRUCTURAL_TYPES.has(record.type);
  const norm = normText(record.text);
  // Короткий текст — разом із відповідями, а без відповідей — з медіа («Хто це?» з різними фото — не повтор).
  const identity = !generic ? norm : keys.size > 0 ? `${norm}|${[...keys].sort().join('|')}` : `${norm}|${[...record.media].sort().join('|')}`;
  return { record: { ...record, norm, keys: [...keys] }, tokens, items: new Set(record.items.map(normText).filter((x) => x !== '')), keys, generic, identity, twin };
}

export interface CheckOptions {
  thresholds?: Partial<Thresholds>;
  /** id вікторин бази, які теж вважати «своїми» для перевіряних сідів (крім тих, що збігаються назвою). */
  excludeQuizIds?: readonly string[];
}

/**
 * Порівнює записи перевіряних сідів (checked) з базою (pool: записи бази й усіх сідів) і між собою.
 * Записи бази з назвою вікторини сіда — копії сіда на сайті: їх запитання, що є в сіді, відкидаються, а з самим сідом не порівнюються.
 * Пара звітується один раз, найгіршим рівнем.
 */
export function findRepeats(checked: readonly SeedName[], pool: readonly QRecord[], options: CheckOptions = {}): Finding[] {
  const t: Thresholds = { ...DEFAULTS, ...options.thresholds };
  const excluded = new Set(options.excludeQuizIds ?? []);
  const seedOf = (r: QRecord) => (r.from === 'seed' ? r.source.slice('seed:'.length) : null);
  const seedTitles = new Map<string, string>();
  for (const r of pool) {
    const seed = seedOf(r);
    if (seed !== null) seedTitles.set(normText(r.quizTitle), seed);
  }

  const prepared: Prepared[] = [];
  const seedIdentities = new Map<string, Set<string>>();
  for (const r of pool) {
    if (r.from !== 'seed') continue;
    const p = prepare(r, t, null);
    prepared.push(p);
    const seed = seedOf(r)!;
    const set = seedIdentities.get(seed) ?? new Set<string>();
    set.add(p.identity);
    seedIdentities.set(seed, set);
  }
  for (const r of pool) {
    if (r.from === 'seed') continue;
    const twin = seedTitles.get(normText(r.quizTitle)) ?? null;
    const p = prepare(r, t, twin);
    // Копія сіда на сайті: те, що є в сіді, вже представлено записом сіда.
    if (twin !== null && seedIdentities.get(twin)?.has(p.identity)) continue;
    prepared.push(p);
  }

  // Рідкісні слова: частота серед усіх записів.
  const df = new Map<string, number>();
  for (const p of prepared) for (const x of p.tokens) df.set(x, (df.get(x) ?? 0) + 1);
  const rareLimit = Math.max(t.rareMin, Math.floor(prepared.length * t.rareShare));
  const rare = (x: string) => (df.get(x) ?? 0) <= rareLimit;
  const weight = (x: string) => Math.log(1 + prepared.length / (df.get(x) ?? 1));
  const weightedJaccard = (a: Set<string>, b: Set<string>): number => {
    let shared = 0;
    let union = 0;
    for (const x of a) {
      union += weight(x);
      if (b.has(x)) shared += weight(x);
    }
    for (const x of b) if (!a.has(x)) union += weight(x);
    return union === 0 ? 0 : shared / union;
  };

  const index = <K>(keyOf: (p: Prepared) => Iterable<K>) => {
    const map = new Map<K, number[]>();
    prepared.forEach((p, i) => {
      for (const k of keyOf(p)) {
        const at = map.get(k);
        if (at) at.push(i);
        else map.set(k, [i]);
      }
    });
    return map;
  };
  const byIdentity = index((p) => (p.identity === '|' ? [] : [p.identity]));
  const byMedia = index((p) => p.record.media);
  const byToken = index((p) => p.tokens);
  const byItem = index((p) => (p.items.size >= t.minItems ? p.items : []));
  const byKey = index((p) => p.keys);

  const checkedSet = new Set<string>(checked);
  const isChecked = (p: Prepared) => {
    const seed = seedOf(p.record);
    return seed !== null && checkedSet.has(seed);
  };
  const best = new Map<string, Finding>();
  const rank = (level: Level) => LEVELS.length - LEVELS.indexOf(level);
  const offer = (i: number, j: number, level: Level, score: number, detail: string) => {
    if (i === j) return;
    const a = prepared[i];
    const b = prepared[j];
    const seedA = seedOf(a.record);
    const seedB = seedOf(b.record);
    // Свої записи бази: копії сіда на сайті й вказані вікторини.
    if (seedA !== null && (b.twin === seedA || (b.record.quizId !== null && excluded.has(b.record.quizId)))) return;
    if (seedB !== null && isChecked(b) && (a.twin === seedB || (a.record.quizId !== null && excluded.has(a.record.quizId)))) return;
    const [x, y] = isChecked(b) && (!isChecked(a) || b.record.id < a.record.id) ? [b, a] : [a, b];
    const key = `${x.record.id}\u0000${y.record.id}`;
    const old = best.get(key);
    if (old && (rank(old.level) > rank(level) || (old.level === level && old.score >= score))) return;
    best.set(key, { level, score, a: x.record, b: y.record, detail: old && old.level !== level ? `${detail}; ${old.level}: ${old.detail}` : detail });
  };

  prepared.forEach((p, i) => {
    if (!isChecked(p)) return;
    for (const j of byIdentity.get(p.identity) ?? []) {
      if (!differentPictures(p, prepared[j])) offer(i, j, 'exact', 1, p.generic ? 'same text and answer' : 'same text');
    }
    for (const m of p.record.media) for (const j of byMedia.get(m) ?? []) offer(i, j, 'media', 1, m);

    if (p.tokens.size > 0 && !STRUCTURAL_TYPES.has(p.record.type)) {
      const candidates = new Set<number>();
      for (const x of p.tokens) for (const j of byToken.get(x) ?? []) candidates.add(j);
      for (const j of candidates) {
        const q = prepared[j];
        if (STRUCTURAL_TYPES.has(q.record.type) || differentPictures(p, q)) continue;
        const plain = jaccard(p.tokens, q.tokens);
        if (plain < t.near) continue;
        // І звичайний, і зважений за рідкістю Жаккар: шаблон «Який елемент позначають символом Fe/Na?» відрізняється
        // саме рідкісним словом, тож зважений падає нижче порога, а справжній перефраз лишається близько 1.
        const score = weightedJaccard(p.tokens, q.tokens);
        if (score < t.near) continue;
        // Короткі тексти («Хто співає?») — near лише зі спільною відповіддю.
        const sameAnswer = overlap(p.keys, q.keys).length > 0;
        if ((p.generic || q.generic) && !sameAnswer) continue;
        if (!sameAnswer && p.keys.size > 0 && q.keys.size > 0 && Math.min(plain, score) < t.nearOtherAnswer) continue;
        offer(i, j, 'near', score, `words ${overlap(p.tokens, q.tokens).join(' ')} (jaccard ${plain.toFixed(2)})`);
      }
    }
    if (p.items.size >= t.minItems) {
      const candidates = new Set<number>();
      for (const x of p.items) for (const j of byItem.get(x) ?? []) candidates.add(j);
      for (const j of candidates) {
        const score = jaccard(p.items, prepared[j].items);
        if (score >= t.itemsNear) offer(i, j, 'near', score, `items ${overlap(p.items, prepared[j].items).slice(0, 6).join(', ')}`);
      }
    }
    for (const k of p.keys) {
      for (const j of byKey.get(k) ?? []) {
        const shared = overlap(p.tokens, prepared[j].tokens).filter(rare);
        if (shared.length >= t.factWords) offer(i, j, 'fact', shared.length, `answer «${k}», rare words ${shared.join(' ')}`);
      }
    }
  });

  return [...best.values()].sort((x, y) => rank(y.level) - rank(x.level) || y.score - x.score || x.a.id.localeCompare(y.a.id));
}

const cut = (text: string, n: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};
const where = (r: QRecord) => (r.from === 'seed' ? r.source : `${r.source} «${cut(r.quizTitle, 30)}»${r.from === 'quiz' ? '' : ` (${r.from})`}`);
const describe = (r: QRecord) => `${where(r)} / ${cut(r.roundTitle, 28)} [${r.type}] «${cut(r.text || r.answers.join(', '), 70)}»`;

/** Таблиця знахідок: рівень, перевірене запитання, повтор, подробиці; зверху — лічильники. */
export function formatFindings(findings: readonly Finding[], max = 300): string {
  const counts = LEVELS.map((level) => `${level}: ${findings.filter((f) => f.level === level).length}`).join(', ');
  const lines = [`Repeats — ${counts}`];
  const pairs = new Map<string, number>();
  for (const f of findings) {
    const key = [f.a.source, f.b.source].sort().join(' ⇄ ');
    if (f.level !== 'fact') pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  if (pairs.size > 0) {
    lines.push('', 'Sources that repeat each other (exact/near/media):');
    for (const [key, n] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 40)) lines.push(`  ${String(n).padStart(4)}  ${key}`);
  }
  if (findings.length > 0) lines.push('');
  for (const f of findings.slice(0, max)) {
    const score = f.level === 'near' ? ` ${f.score.toFixed(2)}` : '';
    lines.push(`${(f.level.toUpperCase() + score).padEnd(10)} ${describe(f.a)}`);
    lines.push(`${''.padEnd(10)} ⇄ ${describe(f.b)}`);
    lines.push(`${''.padEnd(10)}   ${cut(f.detail, 140)}`);
  }
  if (findings.length > max) lines.push(`… and ${findings.length - max} more (--max ${findings.length} to see all)`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI

const USAGE = `Usage:
  question-db export [--seeds-only] [--out <dir>]
      DATABASE_URL — read-only export of every quiz, library and game snapshot, plus every seed;
      --seeds-only — seeds only, no database (DATABASE_URL is ignored).
  question-db check <seed...> | --all-seeds [--db <questions.jsonl>] [--exclude-quiz <id>]...
      [--near 0.6] [--near-other-answer 0.85] [--items-near 0.6] [--min-tokens 3] [--min-items 3] [--rare-share 0.005] [--rare-min 5]
      [--fact-words 2] [--stem 7] [--max 300] [--json <file>]
      Exit 1 on exact, near or media repeats; fact repeats are warnings.
Seeds: ${SEED_NAMES.join(' ')}`;

function option(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
  args.splice(at, 2);
  return value;
}
function numberOption(args: string[], name: string): number | undefined {
  const value = option(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}
function flag(args: string[], name: string): boolean {
  const at = args.indexOf(name);
  if (at >= 0) args.splice(at, 1);
  return at >= 0;
}

async function exportCommand(args: string[]): Promise<number> {
  const seedsOnly = flag(args, '--seeds-only');
  const dir = resolve(option(args, '--out') ?? DEFAULT_DIR);
  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(' ')}`);
  const url = process.env.DATABASE_URL;
  if (!seedsOnly && (url === undefined || url === '')) throw new Error('DATABASE_URL is not set (use --seeds-only for seeds without the database)');
  let fromDb: QRecord[] = [];
  if (!seedsOnly) {
    const pool = new pg.Pool({ connectionString: url, ssl: url!.includes('render.com') ? { rejectUnauthorized: false } : undefined, max: 2 });
    try {
      fromDb = await dbRecords(drizzle(pool, { schema }) as unknown as Db);
    } finally {
      await pool.end();
    }
  }
  const { file, summary } = writeExport([...fromDb, ...seedRecords()], dir);
  console.log(summary);
  console.log(`Written ${file}`);
  return 0;
}

function checkCommand(args: string[]): number {
  const all = flag(args, '--all-seeds');
  const dbFile = resolve(option(args, '--db') ?? join(DEFAULT_DIR, 'questions.jsonl'));
  const json = option(args, '--json');
  const max = numberOption(args, '--max') ?? 300;
  const excludeQuizIds: string[] = [];
  for (let id = option(args, '--exclude-quiz'); id !== undefined; id = option(args, '--exclude-quiz')) excludeQuizIds.push(id);
  const thresholds: Partial<Thresholds> = {};
  const set = (key: keyof Thresholds, name: string) => {
    const value = numberOption(args, name);
    if (value !== undefined) thresholds[key] = value;
  };
  set('near', '--near');
  set('nearOtherAnswer', '--near-other-answer');
  set('itemsNear', '--items-near');
  set('minTokens', '--min-tokens');
  set('minItems', '--min-items');
  set('rareShare', '--rare-share');
  set('rareMin', '--rare-min');
  set('factWords', '--fact-words');
  set('stemLength', '--stem');
  const unknown = args.filter((a) => a.startsWith('--') || !isSeedName(a));
  if (unknown.length > 0) throw new Error(`Unknown seeds or options: ${unknown.join(' ')}`);
  const checked = all ? SEED_NAMES : (args as SeedName[]);
  if (checked.length === 0) throw new Error('Name the seeds to check or pass --all-seeds');

  let fromDb: QRecord[] = [];
  if (existsSync(dbFile)) {
    fromDb = readExport(dbFile).filter((r) => r.from !== 'seed');
    console.log(`Database: ${fromDb.length} records from ${dbFile}`);
  } else {
    console.log(`No ${dbFile}: seeds vs seeds only (run export first to include the site)`);
  }
  const findings = findRepeats(checked, [...fromDb, ...seedRecords()], { thresholds, excludeQuizIds });
  console.log(formatFindings(findings, max));
  if (json !== undefined) writeFileSync(resolve(json), JSON.stringify(findings, null, 1));
  return findings.some((f) => FAILING.includes(f.level)) ? 1 : 0;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === 'export') return exportCommand(rest);
  if (command === 'check') return checkCommand(rest);
  console.error(USAGE);
  return 2;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      console.error(USAGE);
      process.exit(2);
    },
  );
}
