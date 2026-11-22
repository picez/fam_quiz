import { z } from 'zod';

/** 73: особисті категорії вікторин — бачить лише автор; одна категорія на вікторину. */
export const QUIZ_FOLDER_LIMITS = { perOwner: 30, nameMax: 40 } as const;
/** Порядок «Моїх вікторин» і адмінського списку; типовий — `changed` (так список працював і до 73). */
export const QUIZ_SORTS = ['new', 'old', 'name', 'changed'] as const;
export type QuizSort = (typeof QUIZ_SORTS)[number];
export const parseQuizSort = (raw: string | null | undefined): QuizSort => QUIZ_SORTS.find((one) => one === raw) ?? 'changed';

export interface QuizFolder { id: string; name: string; position: number; createdAt: string }

/** Назва категорії: обрізані краї, схлопнуті пробіли, 1–40 символів, без керівних символів. */
export const quizFolderNameSchema = z
  .string()
  .transform((raw) => raw.trim().replace(/ {2,}/g, ' '))
  .pipe(z.string().min(1).max(QUIZ_FOLDER_LIMITS.nameMax).regex(/^[^\p{Cc}]+$/u));

export const quizFolderInputSchema = z.object({ name: quizFolderNameSchema }).strict();

export const quizFolderOrderSchema = z
  .object({
    ids: z
      .array(z.string().uuid())
      .max(QUIZ_FOLDER_LIMITS.perOwner)
      .refine((ids) => new Set(ids).size === ids.length, 'duplicate'),
  })
  .strict();

export const quizFolderMoveSchema = z.object({ folderId: z.string().uuid().nullable() }).strict();

/** Один екземпляр на модуль: «є, і, ї, ґ» на своїх місцях, «Квіз 2» перед «Квіз 10». */
const TITLE_COLLATOR = new Intl.Collator('uk', { sensitivity: 'base', numeric: true });

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Порівняння назв за українською абеткою (Postgres-колація цього не вміє); нічия — за id. */
export function compareQuizTitles(a: { title: string; id: string }, b: { title: string; id: string }): number {
  return TITLE_COLLATOR.compare(a.title, b.title) || byId(a, b);
}

/** Нова відсортована копія; вхідний масив не змінюється. Рівні ключі — за id, щоб порядок був стабільний. */
export function sortQuizzes<T extends { id: string; title: string; createdAt: string; updatedAt: string }>(list: readonly T[], sort: QuizSort): T[] {
  const time = (iso: string) => Date.parse(iso);
  const compare: (a: T, b: T) => number =
    sort === 'name'
      ? compareQuizTitles
      : sort === 'new'
        ? (a, b) => time(b.createdAt) - time(a.createdAt) || byId(a, b)
        : sort === 'old'
          ? (a, b) => time(a.createdAt) - time(b.createdAt) || byId(a, b)
          : (a, b) => time(b.updatedAt) - time(a.updatedAt) || byId(a, b);
  return [...list].sort(compare);
}
