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
  /** Запитань в одному раунді. */
  maxQuestions: 100,
  maxQuizQuestions: 200,
  maxRounds: 10,
  roundTitle: 60,
  maxPlayers: 50,
  nicknameMin: 2,
  nicknameMax: 20,
} as const;

/** Обмеження для зображень у запитаннях. */
export const IMAGE_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/** Адреса завантаженого зображення: лише власне сховище цього сайту. */
export const IMAGE_URL = /^\/uploads\/[a-z0-9]{16,64}\.(jpg|png|webp)$/;

const choice = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  text: z.string().trim().min(1).max(LIMITS.optionText).refine(isStorable, UNSTORABLE),
});

const base = {
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  text: z.string().trim().min(1).max(LIMITS.questionText).refine(isStorable, UNSTORABLE),
  imageUrl: z.string().regex(IMAGE_URL).nullable(),
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

export const roundRulesSchema = z.object({
  penalty: z.enum(['none', 'minus']),
  /** Частка балів за «частково», у відсотках; null — кнопки «частково» немає. */
  partial: z.number().int().min(10).max(90).nullable(),
  streak: z
    .object({
      length: z.number().int().min(2).max(10),
      bonus: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('percent'), value: z.number().int().min(1).max(200) }),
        z.object({ kind: z.literal('fixed'), value: z.number().int().min(1).max(LIMITS.maxPoints) }),
      ]),
    })
    .nullable(),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type RoundRules = z.infer<typeof roundRulesSchema>;

export const DEFAULT_RULES: RoundRules = { penalty: 'none', partial: null, streak: null, multiplier: 1 };

export const classicRoundSchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  type: z.literal('classic'),
  title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
  speedBonus: z.boolean(),
  shuffleOptions: z.boolean(),
  rules: roundRulesSchema,
  questions: z.array(questionSchema).min(1).max(LIMITS.maxQuestions),
});

export type ClassicRound = z.infer<typeof classicRoundSchema>;

export const roundSchema = z.discriminatedUnion('type', [classicRoundSchema]);

export type Round = z.infer<typeof roundSchema>;

export const quizSettingsSchema = z.object({
  leaderboard: z.enum(['each', 'end']),
});

export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const DEFAULT_SETTINGS: QuizSettings = {
  leaderboard: 'each',
};

export const quizSchema = z
  .object({
    title: z.string().trim().min(1).max(120).refine(isStorable, UNSTORABLE),
    description: z.string().max(500).refine(isStorable, UNSTORABLE),
    settings: quizSettingsSchema,
    rounds: z.array(roundSchema).min(1).max(LIMITS.maxRounds),
  })
  .superRefine((quiz, ctx) => {
    const questions = quiz.rounds.flatMap((round) => round.questions);
    if (questions.length > LIMITS.maxQuizQuestions) ctx.addIssue({ code: 'custom', message: 'too_many_questions' });
    if (hasDuplicates(questions.map((q) => q.id))) ctx.addIssue({ code: 'custom', message: 'duplicate_question_ids' });
    if (hasDuplicates(quiz.rounds.map((r) => r.id))) ctx.addIssue({ code: 'custom', message: 'duplicate_round_ids' });
  });

export type Quiz = z.infer<typeof quizSchema>;

/** Усі запитання вікторини в порядку раундів. */
export function questionsOf(quiz: Quiz): Question[] {
  return quiz.rounds.flatMap((round) => round.questions);
}
