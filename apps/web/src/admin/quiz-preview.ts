import { AUDIO_URL, SNIPPET_STEPS, mediaRefs, videoLink, type Question } from '@quiz/shared';
import { t } from '../i18n';
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
  /** Усі /uploads-картинки запитання (з mediaRefs), без повторів; аудіофайли — не картинки. */
  images: string[];
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
    default:
      return null;
  }
}

/** Рядки варіантів чи елементів за типом; решта типів — questionLines без тексту. */
function itemsOf(question: Question, q: Loose): QuestionPreview['items'] {
  switch (q.type) {
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
  return {
    text: str(q.text) ?? '',
    items: safe(() => itemsOf(question, q), []),
    answer: safe(() => answerOf(q), null),
    accepted: typeof q.type === 'string' && ACCEPTED_TYPES.has(q.type) ? strings(q.accepted) : [],
    hint: str(q.hint),
    images: safe(() => imagesOf(question), []),
    audio,
    video,
    points: num(q.points) ?? 0,
    timeLimit: hasVideo ? null : num(q.timeLimit),
  };
}
