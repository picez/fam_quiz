import { z } from 'zod';

export const LIKE_KINDS = ['question', 'quiz', 'host', 'player'] as const;
export type LikeKind = (typeof LIKE_KINDS)[number];

/** Частота player:like на людину. */
export const LIKE_RATE = { windowMs: 10_000, max: 12 } as const;

/** Подія player:like: бажаний стан, а не перемикач. */
export const likeSchema = z.discriminatedUnion('target', [
  z.object({ target: z.enum(['question', 'quiz', 'host']), liked: z.boolean() }).strict(),
  z.object({ target: z.literal('player'), id: z.string().min(1).max(64), liked: z.boolean() }).strict(),
]);

export type LikePayload =
  | { target: 'question' | 'quiz' | 'host'; liked: boolean }
  | { target: 'player'; id: string; liked: boolean };

export interface LikePerson {
  id: string;
  nickname: string;
  liked: boolean;
}

/** Лише в зрізі гравця з акаунтом, коли його вподобання прочитано; кожен ключ — є, лише коли цей лайк можна поставити. */
export interface LikesView {
  /** reveal */
  question?: boolean;
  /** finished */
  quiz?: boolean;
  /** finished */
  host?: boolean;
  /** finished; без мене й гостей; [] не ставиться — ключа немає */
  people?: LikePerson[];
}

/** Лайки, які людина отримала (лише hidden = false). */
export interface LikeTotals {
  author: number;
  host: number;
  player: number;
}

/** Лічильники редактора: вікторина й id запитання → кількість (лише > 0). */
export interface QuizLikes {
  quiz: number;
  questions: Record<string, number>;
}
