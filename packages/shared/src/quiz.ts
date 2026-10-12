import { z } from 'zod';
import { UNSTORABLE, isStorable } from './text';

export const LIMITS = {
  questionText: 300,
  optionText: 120,
  answerText: 200,
  minTime: 5,
  maxTime: 120,
  defaultTime: 20,
  maxPoints: 2000,
  defaultPoints: 1000,
  minOptions: 2,
  maxOptions: 6,
  minOrderItems: 3,
  maxOrderItems: 6,
  maxAccepted: 10,
  maxQuestions: 100,
  maxPlayers: 50,
  nicknameMin: 2,
  nicknameMax: 20,
} as const;

const choice = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  text: z.string().trim().min(1).max(LIMITS.optionText).refine(isStorable, UNSTORABLE),
});

const base = {
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  text: z.string().trim().min(1).max(LIMITS.questionText).refine(isStorable, UNSTORABLE),
  imageUrl: z.string().min(1).nullable(),
  timeLimit: z.number().int().min(LIMITS.minTime).max(LIMITS.maxTime),
  points: z.number().int().min(0).max(LIMITS.maxPoints),
};

const options = z.array(choice).min(LIMITS.minOptions).max(LIMITS.maxOptions);

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

export const questionSchema = z
  .discriminatedUnion('type', [
    z.object({ ...base, type: z.literal('single'), options, correctId: z.string() }),
    z.object({ ...base, type: z.literal('multi'), options, correctIds: z.array(z.string()).min(1) }),
    z.object({ ...base, type: z.literal('boolean'), correct: z.boolean() }),
    z.object({
      ...base,
      type: z.literal('text'),
      accepted: z
        .array(z.string().trim().min(1).max(LIMITS.answerText).refine(isStorable, UNSTORABLE))
        .min(1)
        .max(LIMITS.maxAccepted),
    }),
    z.object({
      ...base,
      type: z.literal('numeric'),
      correct: z.number().finite(),
      tolerance: z.number().finite().min(0),
    }),
    z.object({
      ...base,
      type: z.literal('order'),
      // Елементи зберігаються в правильному порядку.
      items: z.array(choice).min(LIMITS.minOrderItems).max(LIMITS.maxOrderItems),
    }),
  ])
  .superRefine((q, ctx) => {
    const ids =
      q.type === 'single' || q.type === 'multi'
        ? q.options.map((o) => o.id)
        : q.type === 'order'
          ? q.items.map((i) => i.id)
          : [];
    if (hasDuplicates(ids)) ctx.addIssue({ code: 'custom', message: 'duplicate_ids' });
    if (q.type === 'single' && !ids.includes(q.correctId)) {
      ctx.addIssue({ code: 'custom', message: 'unknown_correct_id' });
    }
    if (q.type === 'multi' && (hasDuplicates(q.correctIds) || !q.correctIds.every((id) => ids.includes(id)))) {
      ctx.addIssue({ code: 'custom', message: 'unknown_correct_id' });
    }
  });

export type Question = z.infer<typeof questionSchema>;

export const quizSettingsSchema = z.object({
  speedBonus: z.boolean(),
  leaderboard: z.enum(['each', 'end']),
  shuffleOptions: z.boolean(),
});

export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const DEFAULT_SETTINGS: QuizSettings = {
  speedBonus: true,
  leaderboard: 'each',
  shuffleOptions: false,
};

export const quizSchema = z.object({
  title: z.string().trim().min(1).max(120).refine(isStorable, UNSTORABLE),
  description: z.string().max(500).refine(isStorable, UNSTORABLE),
  settings: quizSettingsSchema,
  questions: z.array(questionSchema).min(1).max(LIMITS.maxQuestions),
});

export type Quiz = z.infer<typeof quizSchema>;
