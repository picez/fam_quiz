import { z } from 'zod';
import type { Phase } from './game';
import { stickerOf } from './stickers';

export const QUICK_EMOJI = ['👏', '😂', '😱', '🔥', '😭', '🤯'] as const;
export type QuickEmoji = (typeof QUICK_EMOJI)[number];

/** Фази, у яких можна реагувати: між запитаннями, на підсумку раунду й на фіналі. */
export const REACTION_PHASES: readonly Phase[] = ['reveal', 'leaderboard', 'round_end', 'finished'];
export const reactionAllowed = (phase: Phase): boolean => REACTION_PHASES.includes(phase);

/** Сервер приймає від однієї людини не частіше ніж раз на стільки мс. */
export const REACTION_GAP_MS = 2000;
/** Скільки мс реакція видна. */
export const REACTION_SHOW_MS = 4000;
export const FAVORITE_STICKERS_MAX = 40;

export type ReactionItem = { kind: 'emoji'; value: QuickEmoji } | { kind: 'sticker'; value: string };

export const reactSchema: z.ZodType<ReactionItem> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('emoji'), value: z.enum(QUICK_EMOJI) }),
  z.object({ kind: z.literal('sticker'), value: z.string().max(40).refine((id) => stickerOf(id) !== undefined, 'unknown sticker') }),
]);

export interface Reaction {
  seq: number;
  /** id гравця чи людини команди; 'host' — ведучий. */
  by: string;
  /** null — ведучий (веб пише «Ведучий»). */
  nickname: string | null;
  /** participantId рядка таблиці: команда автора в командній грі, інакше by; null — ведучий. */
  rowId: string | null;
  item: ReactionItem;
}

export const favoriteStickersSchema = z.object({ favorites: z.array(z.string().max(40)).max(FAVORITE_STICKERS_MAX) });

/** Лише відомі id, без повторів (перший лишається), не більше 40. */
export function normalizeFavorites(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) if (stickerOf(id) !== undefined) seen.add(id);
  return [...seen].slice(0, FAVORITE_STICKERS_MAX);
}

/** Є — прибрати; немає — на початок, понад 40 найстаріший (останній) випадає. */
export function toggleFavorite(list: readonly string[], id: string): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return [id, ...list].slice(0, FAVORITE_STICKERS_MAX);
}
