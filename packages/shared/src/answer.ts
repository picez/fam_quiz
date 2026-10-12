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
  z.object({ type: z.literal('order'), itemIds: z.array(id).max(LIMITS.maxOrderItems) }),
]);

export type Answer = z.infer<typeof answerSchema>;
