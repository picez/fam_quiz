import { z } from 'zod';
import type { ProfileCard } from './profile';

export const LIKE_KINDS = ['question', 'quiz', 'host', 'player', 'event'] as const;
export type LikeKind = (typeof LIKE_KINDS)[number];

/** Частота player:like на людину. */
export const LIKE_RATE = { windowMs: 10_000, max: 60 } as const;

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

/** Скільки рядків у списках «Мені сподобались» / «Сподобались іншим» за раз. */
export const LIKES_PAGE = 20;

/** ?offset: ціле 0…10 000; рядок з query → число. */
export const likesOffsetSchema = z.coerce.number().int().min(0).max(10_000);

/** Рядок «Мені сподобались»: одна вікторина, де я ставив ❤️ вікторині чи запитанням. */
export interface GivenLike {
  quizId: string;
  /** null — вікторину видалено. */
  quiz: { title: string; author: ProfileCard } | null;
  /** Мої видимі вподобання: вікторині (0/1) + запитанням; для видаленої — 0. */
  count: number;
  /** ISO; найпізніше created_at моїх рядків цієї вікторини (зокрема прихованих). */
  lastAt: string;
  /** Я вподобав саму вікторину (видимо). */
  quizLiked: boolean;
  /** Тексти моїх видимих вподобаних запитань у порядку вікторини; для видаленої — []. */
  questions: string[];
  /** Мої вподобання запитань, яких у вікторині вже немає (hidden); для видаленої — 0. */
  gone: number;
}

/** Рядок «Сподобались іншим»: моя вікторина, що зібрала ❤️. */
export interface ReceivedLike {
  quizId: string;
  title: string;
  /** Видимі вподобання вікторині + запитанням. */
  total: number;
  /** Різні люди серед них. */
  people: number;
  /** До 3 найвподобаніших запитань. */
  top: { text: string; count: number }[];
}

export interface LikesPage<T> {
  items: T[];
  next: number | null;
}
