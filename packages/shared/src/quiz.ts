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
  minCategories: 3,
  maxCategories: 8,
  minCategoryQuestions: 3,
  maxCategoryQuestions: 10,
  categoryTitle: 40,
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

/** Типове вікно відповіді в бліці, секунди. */
export const DEFAULT_ANSWER_WINDOW = 15;

/** Бліц: гравці натискають «Відповісти» й відповідають по черзі; бали отримує перший правильний. */
export const blitzRoundSchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  type: z.literal('blitz'),
  title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
  shuffleOptions: z.boolean(),
  /** Секунди на відповідь після натискання; null — до кінця таймера запитання. */
  answerWindow: z.number().int().min(5).max(120).nullable(),
  /** Спроб на запитання; null — без обмежень. */
  attempts: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  check: z.enum(['auto', 'manual']),
  // Часткових балів у бліці немає.
  rules: roundRulesSchema.extend({ partial: z.null() }),
  questions: z.array(questionSchema).min(1).max(LIMITS.maxQuestions),
});

export type BlitzRound = z.infer<typeof blitzRoundSchema>;

export const CELL_MARKS = ['none', 'x2', 'x3'] as const;
export type CellMark = (typeof CELL_MARKS)[number];

/** Клітинка — одне запитання; її ціна — question.points, її id — question.id. */
export const boardCellSchema = z.object({ mark: z.enum(CELL_MARKS), question: questionSchema });

export const boardCategorySchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  title: z.string().trim().min(1).max(LIMITS.categoryTitle).refine(isStorable, UNSTORABLE),
  cells: z.array(boardCellSchema).min(LIMITS.minCategoryQuestions).max(LIMITS.maxCategoryQuestions),
});

/** Ігрове поле: категорії клітинок-запитань, гравці по черзі вибирають клітинку. */
export const boardRoundSchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  type: z.literal('board'),
  title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
  shuffleOptions: z.boolean(),
  categories: z.array(boardCategorySchema).min(LIMITS.minCategories).max(LIMITS.maxCategories),
  answerMode: z.enum(['phone', 'voice']),
  /** Лише для answerMode 'phone'; при 'voice' оцінює ведучий завжди. */
  check: z.enum(['auto', 'manual']),
  rules: roundRulesSchema,
});

export type BoardCell = z.infer<typeof boardCellSchema>;
export type BoardCategory = z.infer<typeof boardCategorySchema>;
export type BoardRound = z.infer<typeof boardRoundSchema>;

export const roundSchema = z.discriminatedUnion('type', [classicRoundSchema, blitzRoundSchema, boardRoundSchema]);

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
    const questions = quiz.rounds.flatMap(roundQuestions);
    if (questions.length > LIMITS.maxQuizQuestions) ctx.addIssue({ code: 'custom', message: 'too_many_questions' });
    if (hasDuplicates(questions.map((q) => q.id))) ctx.addIssue({ code: 'custom', message: 'duplicate_question_ids' });
    if (hasDuplicates(quiz.rounds.map((r) => r.id))) ctx.addIssue({ code: 'custom', message: 'duplicate_round_ids' });
    for (const round of quiz.rounds) {
      if (round.type === 'board') {
        for (const message of boardRoundIssues(round)) ctx.addIssue({ code: 'custom', message });
      }
    }
  });

export type Quiz = z.infer<typeof quizSchema>;

/** Усі запитання вікторини в порядку раундів. */
export function questionsOf(quiz: Quiz): Question[] {
  return quiz.rounds.flatMap(roundQuestions);
}

/** Усі запитання раунду: у полі — по категоріях, у порядку клітинок. */
export function roundQuestions(round: Round): Question[] {
  return round.type === 'board' ? boardCells(round).map(({ cell }) => cell.question) : round.questions;
}

export interface CellRef {
  categoryIndex: number;
  index: number;
  category: BoardCategory;
  cell: BoardCell;
}

/** Клітинки поля по категоріях, у порядку клітинок. */
export function boardCells(round: BoardRound): CellRef[] {
  return round.categories.flatMap((category, categoryIndex) =>
    category.cells.map((cell, index) => ({ categoryIndex, index, category, cell })),
  );
}

/** Клітинка за id; id клітинки — це id її запитання. */
export function findCell(round: BoardRound, cellId: string): CellRef | undefined {
  return boardCells(round).find(({ cell }) => cell.question.id === cellId);
}

/** Перевірки поля, які схема форми не бачить. */
export function boardRoundIssues(round: BoardRound): string[] {
  const issues: string[] = [];
  if (hasDuplicates(round.categories.map((c) => c.id))) issues.push('duplicate_ids');
  if (boardCells(round).length > LIMITS.maxQuestions) issues.push('too_many_questions');
  return issues;
}
