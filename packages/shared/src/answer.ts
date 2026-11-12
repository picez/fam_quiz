import { z } from 'zod';
import { LIMITS } from './quiz';
import { UNSTORABLE, isStorable } from './text';

const id = z.string().min(1).max(64).refine(isStorable, UNSTORABLE);

export const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('single'), optionId: id }),
  z.object({ type: z.literal('multi'), optionIds: z.array(id).max(LIMITS.maxOptions) }),
  z.object({ type: z.literal('boolean'), value: z.boolean() }),
  z.object({ type: z.literal('text'), value: z.string().max(LIMITS.answerText).refine(isStorable, UNSTORABLE) }),
  z.object({ type: z.literal('numeric'), value: z.number().finite() }),
  z.object({ type: z.literal('slider'), value: z.number().finite() }),
  z.object({ type: z.literal('clues'), value: z.string().max(LIMITS.answerText).refine(isStorable, UNSTORABLE) }),
  z.object({ type: z.literal('pin'), x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }),
  z.object({ type: z.literal('poll'), optionId: id }),
  z.object({
    type: z.literal('wordcloud'),
    words: z.array(z.string().trim().min(1).max(LIMITS.cloudWord).refine(isStorable, UNSTORABLE)).min(1).max(LIMITS.maxCloudWords),
  }),
  z.object({
    type: z.literal('survey'),
    values: z.array(z.string().max(LIMITS.surveyAnswer).refine(isStorable, UNSTORABLE)).min(1).max(LIMITS.maxSurveyAnswers),
  }),
  z.object({ type: z.literal('order'), itemIds: z.array(id).max(LIMITS.maxOrderItems) }),
  z.object({
    type: z.literal('match'),
    links: z.array(z.object({ left: id, right: id })).max(LIMITS.maxPairs),
  }),
]);

export type SubmittedAnswer = z.infer<typeof answerSchema>;

/** Підсумок ланцюжка гравця; його складає рушій, з телефона він не приходить. */
export interface ChainAnswer {
  type: 'chain';
  solved: number;
  hints: number;
  /** Час зі штрафом, мс. */
  timeMs: number;
}

/** Підсумок сортування гравця; складає рушій, з телефона не приходить. */
export interface SortAnswer {
  type: 'sort';
  sorted: number;
  total: number;
  misses: number;
  /** Час повного сортування, мс; null — не встиг. */
  timeMs: number | null;
}

/** Підсумок стіни гравця; складає рушій, з телефона не приходить. */
export interface WallAnswer {
  type: 'wall';
  /** Знайдено груп разом з автоматичною останньою. */
  found: number;
  groups: number;
  mistakes: number;
  /** Час, коли гравець закінчив (склав або замкнув стіну), мс; null — не встиг. */
  timeMs: number | null;
}

/** Відповідь «100 до 1» після перевірки: рушій чистить values і додає збіги; з телефона rows не приходить. */
export interface SurveyAnswer {
  type: 'survey';
  values: string[];
  /** Id влученого рядка для кожного значення; null — мимо або рядок уже влучено. */
  rows: (string | null)[];
}

/** Підсумок блефу гравця; складає рушій у мить закриття, з телефона не приходить. */
export interface BluffAnswer {
  type: 'bluff';
  /** Вигадка гравця, як він її написав; null — не писав. */
  lie: string | null;
  /** Текст вибраного варіанта; null — не вибирав. */
  pick: string | null;
  /** Вибрав правду. */
  truth: boolean;
  /** Скільки інших гравців вибрали його (неприбрану) вигадку. */
  fooled: number;
}

/** Підсумок драбини гравця; складає рушій, з телефона не приходить. words — ключі після стартового. */
export interface WordLadderAnswer {
  type: 'wordladder';
  words: string[];
  steps: number;
  finished: boolean;
}

/** Підсумок списку гравця (команди); складає рушій, з телефона не приходить. found — id пунктів у порядку знахідок. */
export interface TimedListAnswer {
  type: 'timedlist';
  found: string[];
  total: number;
  wrong: number;
}

/** Підсумок «Слів з літер» гравця (команди); складає рушій, з телефона не приходить. words — ключі в порядку знахідок, longest — літер у найдовшому. */
export interface LetterWordsAnswer {
  type: 'letterwords';
  words: string[];
  longest: number;
}

/** Підсумок «Більше чи менше» (28a) гравця (команди); складає рушій, з телефона не приходить. picks — вибори по черзі, right — правильних, total — порівнянь у ряду. */
export interface MoreLessAnswer {
  type: 'moreless';
  picks: ('a' | 'b')[];
  right: number;
  total: number;
}

/** Запис «Малюнка» (28c); складає рушій, з телефона не приходить. Вгадувач: guess — що вписав, drew — null; художник: guess — null, drew — скільки сторін вгадали з тих, що могли. */
export interface DrawingAnswer {
  type: 'drawing';
  guess: string | null;
  drew: { guessed: number; could: number } | null;
}

/** Запис «Головоломок» (28d) гравця (команди); складає рушій, з телефона не приходить. grid — сітка одним рядком ('0' — порожньо), filled — заповнено клітинок, total — усього. */
export interface PuzzleAnswer {
  type: 'puzzle';
  kind: 'sudoku' | 'crossword';
  grid: string;
  filled: number;
  total: number;
  solved: boolean;
  /** Натиснуто «Готово» (у команді — будь-ким); false — сітку зафіксував кінець часу. Немає — запис до цього поля. */
  done?: boolean;
}

/** Запис «Пазла» (29c) гравця (команди); складає рушій, з телефона не приходить. placed — поставлено шматочків, total — усього, timeMs — мить складання від відкриття (мс сервера, без пауз) або null. */
export interface JigsawAnswer {
  type: 'jigsaw';
  placed: number;
  total: number;
  done: boolean;
  timeMs: number | null;
}

/** Запис «Знайди відмінності» (29d) гравця (команди); складає рушій, з телефона не приходить. found — знайдено кіл, total — усього, timeMs — мить останньої знахідки від відкриття (мс сервера, без пауз) або null. */
export interface SpotdiffAnswer {
  type: 'spotdiff';
  found: number;
  total: number;
  done: boolean;
  timeMs: number | null;
}

/** Запис «Пам'яті» (29f) гравця (команди); складає рушій, з телефона не приходить. pairs — знайдено пар, total — усього, timeMs — мить останньої пари від відкриття (мс сервера) або null, moves — ходів (двох карток). */
export interface MemoryAnswer {
  type: 'memory';
  pairs: number;
  total: number;
  done: boolean;
  timeMs: number | null;
  moves: number;
}

export type Answer = SubmittedAnswer | ChainAnswer | SortAnswer | WallAnswer | SurveyAnswer | BluffAnswer | WordLadderAnswer | TimedListAnswer | LetterWordsAnswer | MoreLessAnswer | DrawingAnswer | PuzzleAnswer | JigsawAnswer | SpotdiffAnswer | MemoryAnswer;

/** Збіги перевіреної відповіді «100 до 1»; null — не survey або ще не перевірена (без rows). */
export function surveyHitsOf(answer: Answer | null): (string | null)[] | null {
  if (answer === null || answer.type !== 'survey') return null;
  return 'rows' in answer && Array.isArray(answer.rows) ? answer.rows : null;
}
