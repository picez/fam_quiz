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

export type Answer = SubmittedAnswer | ChainAnswer | SortAnswer | WallAnswer;
