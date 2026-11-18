import { z } from 'zod';
import { QUESTION_TYPES } from './question-types';
import { answerKey, type Question } from './quiz';

/** Запитань на сторінці банку. */
export const QUESTION_BANK_PAGE_SIZE = 30;
/** Найдовший пошуковий запит. */
export const QUESTION_BANK_QUERY_MAX = 100;

const typesParam = z
  .string()
  .transform((value) => value.split(','))
  .pipe(
    z
      .array(z.enum(QUESTION_TYPES))
      .min(1)
      .max(QUESTION_TYPES.length)
      .refine((types) => new Set(types).size === types.length),
  );

/** Параметри GET /api/question-bank: text, типи через кому (немає — усі), сторінка від 1. */
export const questionBankQuerySchema = z
  .object({
    q: z.string().trim().max(QUESTION_BANK_QUERY_MAX).default(''),
    types: typesParam.optional().transform((types) => types ?? [...QUESTION_TYPES]),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();

export type QuestionBankQuery = z.infer<typeof questionBankQuerySchema>;

export interface QuestionBankItem {
  quizId: string;
  quizTitle: string;
  roundIndex: number;
  roundTitle: string;
  question: Question;
}

export interface QuestionBankPage {
  items: QuestionBankItem[];
  page: number;
  pages: number;
  total: number;
}

/** Ключі, під якими лежить текст для пошуку (на будь-якій глибині). */
const TEXT_KEYS = new Set(['text', 'hint']);
/** Ключі масивів рядків (відповіді, підказки, слова, шлях). */
const LIST_KEYS = new Set(['accepted', 'clues', 'lies', 'words', 'path']);
/** Адреси, ідентифікатори й медіа в пошук не входять. */
const SKIP_KEYS = new Set(['id', 'imageUrl', 'url', 'video', 'audio', 'photo', 'original', 'changed']);

function collect(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (SKIP_KEYS.has(key)) continue;
    if (TEXT_KEYS.has(key) && typeof child === 'string') out.push(child);
    else if (LIST_KEYS.has(key) && Array.isArray(child)) {
      for (const item of child) if (typeof item === 'string') out.push(item);
    } else collect(child, out);
  }
}

/** Усе, що в запитанні можна знайти: текст, варіанти, відповіді, підказка; без id й адрес медіа. */
export function questionSearchText(question: Question): string {
  const out: string[] = [];
  collect(question, out);
  if (question.type === 'numeric') out.push(String(question.correct));
  return out.join('\n');
}

/** Кожне слово запиту є підрядком тексту запитання (без урахування регістру й апострофів); порожній запит — збіг. */
export function matchesBankQuery(question: Question, q: string): boolean {
  const words = answerKey(q).split(' ').filter((word) => word !== '');
  if (words.length === 0) return true;
  const haystack = answerKey(questionSearchText(question));
  return words.every((word) => haystack.includes(word));
}
