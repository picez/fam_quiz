import { AUDIO_URL, SNIPPET_STEPS, mediaRefs, videoLink, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { decimalText } from '../locales/grammar';
import { questionName } from '../format';
import { questionLines } from './admin-text';

export interface QuestionPreview {
  text: string;
  /** Варіанти чи елементи; correct: true — правильний (✓), false — ні, null — у типу немає правильного (опитування, порядок, пари…). */
  items: { text: string; correct: boolean | null }[];
  /** Правильна відповідь одним рядком, де варіантів немає: «Так»/«Ні» (yes/no), число (numeric, slider), слово (wordle). */
  answer: string | null;
  /** Написання (accepted) для text, drawing, clues, melody, videoclip, bluff, spy. */
  accepted: string[];
  hint: string | null;
  /** Пояснення автора після розкриття (будь-який тип). */
  explanation: string | null;
  /** Усі /uploads-картинки запитання (з mediaRefs), без повторів; аудіофайли — не картинки. */
  images: string[];
  /** Зовнішні картинки старих вікторин (https://…): посилання, а не мініатюри, щоб сторінка адміна сама нікуди не ходила. */
  imageLinks: string[];
  /** Розв'язок судоку: 6 рядків по 6 цифр (пробіл між блоками). */
  grid: string[] | null;
  /** Файл — /uploads/…, YouTube — videoLink; трек «Мелодії» — найдовший шматок. */
  audio: { url: string; start: number; duration: number } | null;
  /** video або clip, url = videoLink(...). */
  video: { url: string; start: number } | null;
  points: number;
  /** null — є відео (таймера немає) чи таймера в запитанні немає зовсім. */
  timeLimit: number | null;
}

type Loose = Record<string, unknown>;

const isRec = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []);

/** Типи, у яких відповідь — написання accepted. */
const ACCEPTED_TYPES: ReadonlySet<string> = new Set(['text', 'drawing', 'clues', 'melody', 'videoclip', 'bluff', 'spy']);

/** Відео YouTube з полів id і start; інша форма — null. */
function videoOf(value: unknown): { url: string; start: number } | null {
  if (!isRec(value)) return null;
  const id = str(value.id);
  if (id === null) return null;
  const start = num(value.start) ?? 0;
  return { url: videoLink({ id, start }), start };
}

/** Аудіо запитання чи трек «Мелодії»: файл зі сховища або YouTube «лише звук». */
function audioOf(value: unknown, fallbackDuration: number | null): QuestionPreview['audio'] {
  if (!isRec(value)) return null;
  const start = num(value.start) ?? 0;
  const duration = num(value.duration) ?? fallbackDuration;
  if (duration === null) return null;
  if (value.source === 'file') {
    const url = str(value.url);
    return url === null ? null : { url, start, duration };
  }
  if (value.source === 'youtube') {
    const id = str(value.id);
    return id === null ? null : { url: videoLink({ id, start }), start, duration };
  }
  return null;
}

/** Варіанти single/multi/poll з позначкою правильних. */
function optionItems(q: Loose): QuestionPreview['items'] {
  const options = Array.isArray(q.options) ? q.options.filter(isRec) : [];
  const correctIds = q.type === 'single' ? [q.correctId] : q.type === 'multi' ? (Array.isArray(q.correctIds) ? q.correctIds : []) : null;
  return options.map((option) => ({ text: str(option.text) ?? '', correct: correctIds === null ? null : correctIds.includes(option.id) }));
}

/** Відсоток з одним знаком після коми лише за потреби: 50, 12,5. */
const share = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return decimalText(rounded, Number.isInteger(rounded) ? 0 : 1);
};

/** Половина картки «Пам'яті»: текст або номер її мініатюри. */
function memoryHalf(card: unknown, images: string[]): string {
  if (!isRec(card)) return '';
  const text = str(card.text)?.trim() ?? '';
  if (text !== '') return text;
  const url = str(card.imageUrl);
  const index = url === null ? -1 : images.indexOf(url);
  return index === -1 ? '' : t('adminPreviewImage', { number: index + 1 });
}

function answerOf(q: Loose): string | null {
  switch (q.type) {
    case 'boolean':
      return typeof q.correct === 'boolean' ? t(q.correct ? 'yes' : 'no') : null;
    case 'numeric':
      return num(q.correct) === null ? null : String(q.correct);
    case 'slider': {
      if (num(q.correct) === null) return null;
      const unit = str(q.unit);
      return unit === null ? String(q.correct) : `${q.correct} ${unit}`;
    }
    case 'wordle':
      return str(q.word);
    case 'pin': {
      const target = isRec(q.target) ? q.target : {};
      const x = num(target.x);
      const y = num(target.y);
      const full = num(q.fullRadius);
      const zero = num(q.zeroRadius);
      if (x === null || y === null || full === null || zero === null) return null;
      return t('adminPreviewPin', { x: share(x * 100), y: share(y * 100), full: share(full), zero: share(zero) });
    }
    case 'spotdiff':
      return Array.isArray(q.spots) ? t('adminPreviewSpots', { count: q.spots.length }) : null;
    default:
      return null;
  }
}

/** Рядки варіантів чи елементів за типом; решта типів — questionLines без тексту. */
function itemsOf(question: Question, q: Loose, images: string[]): QuestionPreview['items'] {
  const loose = (value: unknown): Loose[] => (Array.isArray(value) ? value.filter(isRec) : []);
  switch (q.type) {
    case 'memory':
      return loose(q.pairs).map((pair) => ({ text: `${memoryHalf(pair.a, images)} — ${memoryHalf(pair.b, images)}`, correct: null }));
    case 'sort': {
      const categories = new Map(loose(q.categories).map((category) => [category.id, str(category.text) ?? '']));
      return loose(q.words).map((word) => {
        const category = categories.get(word.categoryId);
        const text = str(word.text) ?? '';
        return { text: category === undefined ? text : `${text} — ${category}`, correct: null };
      });
    }
    case 'survey':
      return loose(q.rows).map((row) => {
        const spellings = strings(row.accepted);
        const popularity = num(row.popularity);
        const text = popularity === null ? (str(row.text) ?? '') : `${str(row.text) ?? ''} — ${popularity}`;
        return { text: spellings.length === 0 ? text : `${text} (${spellings.join(', ')})`, correct: null };
      });
    case 'think':
      return loose(q.words).map((word) => {
        const synonyms = strings(word.synonyms);
        const text = str(word.word) ?? '';
        return { text: synonyms.length === 0 ? text : `${text} (${synonyms.join(', ')})`, correct: null };
      });
    case 'pin':
    case 'sudoku':
    case 'spotdiff':
      return [];
    case 'single':
    case 'multi':
    case 'poll':
      return optionItems(q);
    case 'boolean':
    case 'numeric':
    case 'slider':
    case 'wordle':
    case 'text':
    case 'drawing':
    case 'melody':
    case 'videoclip':
      return [];
    case 'clues':
      return strings(q.clues).map((text) => ({ text, correct: null }));
    case 'bluff':
      // Вигадки ведучого — неправильні варіанти; правда — серед написань.
      return strings(q.lies).map((text) => ({ text, correct: false }));
    case 'spy':
      return [q.spyHint, q.spyWord].filter((text): text is string => typeof text === 'string' && text !== '').map((text) => ({ text, correct: null }));
    default:
      return questionLines(question)
        .slice(1)
        .map((text) => ({ text, correct: null }));
  }
}

/** Розв'язок судоку рядками: '123456…' → '123 456'. */
function gridOf(q: Loose): string[] | null {
  const solution = q.type === 'sudoku' ? str(q.solution) : null;
  if (solution === null || !/^[0-9]{36}$/.test(solution)) return null;
  return Array.from({ length: 6 }, (_, row) => `${solution.slice(row * 6, row * 6 + 3)} ${solution.slice(row * 6 + 3, row * 6 + 6)}`);
}

/** Зовнішні адреси картинок; звук за розширенням — не картинка. */
function imageLinksOf(question: Question): string[] {
  const links = mediaRefs(question)
    .flatMap((ref) => (ref.kind === 'url' ? [ref.url] : []))
    .filter((url) => !/\.(mp3|ogg|m4a|wav)([?#]|$)/i.test(url));
  return [...new Set(links)];
}

function imagesOf(question: Question): string[] {
  const images = mediaRefs(question)
    .flatMap((ref) => (ref.kind === 'storage' ? [`/uploads/${ref.name}`] : []))
    .filter((url) => !AUDIO_URL.test(url));
  return [...new Set(images)];
}

/** Одна частина перегляду; збій на дивних даних — запасне значення, а не падіння сторінки. */
function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/** Що адмін бачить у картці запитання: відповіді, написання, підказка, медіа, бали й таймер. Будь-яка форма даних — без винятку. */
export function questionPreview(question: Question): QuestionPreview {
  const q: Loose = isRec(question) ? (question as unknown as Loose) : {};
  const hasVideo = isRec(q.video);
  const video = q.type === 'videoclip' ? videoOf(q.clip) : videoOf(q.video);
  const audio = q.type === 'melody' ? audioOf(q.track, Math.max(...SNIPPET_STEPS)) : audioOf(q.audio, null);
  const images = safe(() => imagesOf(question), []);
  return {
    // 61: «Вгадай слово» без тексту автора й підказки — у грі їх немає.
    text: q.type === 'wordle' && typeof q.word === 'string' ? questionName(question) : (str(q.text) ?? ''),
    items: safe(() => itemsOf(question, q, images), []),
    answer: safe(() => answerOf(q), null),
    accepted: typeof q.type === 'string' && ACCEPTED_TYPES.has(q.type) ? strings(q.accepted) : [],
    hint: q.type === 'wordle' ? null : str(q.hint),
    explanation: str(q.explanation),
    images,
    imageLinks: safe(() => imageLinksOf(question), []),
    grid: safe(() => gridOf(q), null),
    audio,
    video,
    points: num(q.points) ?? 0,
    timeLimit: hasVideo ? null : num(q.timeLimit),
  };
}
