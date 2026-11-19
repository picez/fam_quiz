import { z } from 'zod';

/** 56: скільки планів у стані `scheduled` може бути одночасно. */
export const BOT_PLANS_MAX = 20;
/** 56: за скільки до старту шле нагадування. */
export const BOT_PLAN_REMIND_MS = 15 * 60_000;
/** 56: найбільше запізнення відкриття (сервер «лежав»), після якого план — `failed` / `server_down`. */
export const BOT_PLAN_LATE_MS = 10 * 60_000;
export const BOT_PLAN_TICK_MS = 60_000;
export const BOT_PLAN_AUTO_MIN = 5;
export const BOT_PLAN_AUTO_MAX = 30;
/** 56: скільки хвилин чекає лобі без автостарту. */
export const BOT_PLAN_WAIT_MIN = 30;
export const BOT_PLAN_PEOPLE_MAX = 50;
/** 56: як далеко наперед можна планувати. */
export const BOT_PLAN_AHEAD_MS = 60 * 86_400_000;
/** 56: скільки завершених планів показує список. */
export const BOT_PLAN_HISTORY = 20;

export const BOT_PLAN_STATUSES = ['scheduled', 'opened', 'played', 'nobody', 'cancelled', 'failed'] as const;
export type BotPlanStatus = (typeof BOT_PLAN_STATUSES)[number];
export const BOT_PLAN_REASONS = ['server_down', 'quiz_missing', 'autopilot_blocked', 'server_busy', 'bot_rooms_full', 'bot_unavailable', 'room_closed', 'not_started', 'start_failed'] as const;
export type BotPlanReason = (typeof BOT_PLAN_REASONS)[number];

export const botPlanRecipientsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('all') }).strict(),
  z.object({ kind: z.literal('group'), groupId: z.string().uuid() }).strict(),
  z
    .object({
      kind: z.literal('people'),
      userIds: z
        .array(z.string().min(1).max(64))
        .min(1)
        .max(BOT_PLAN_PEOPLE_MAX)
        .refine((ids) => new Set(ids).size === ids.length, 'duplicate'),
    })
    .strict(),
]);
export type BotPlanRecipients = z.infer<typeof botPlanRecipientsSchema>;

/** Межі часу (у майбутньому, не далі BOT_PLAN_AHEAD_MS) перевіряє сервер (потрібне now). */
export const botPlanInputSchema = z
  .object({
    quizId: z.string().uuid(),
    startsAt: z.string().datetime(),
    recipients: botPlanRecipientsSchema,
    autoStartMin: z.number().int().min(BOT_PLAN_AUTO_MIN).max(BOT_PLAN_AUTO_MAX).nullable(),
    weekly: z.boolean(),
  })
  .strict();
export type BotPlanInput = z.infer<typeof botPlanInputSchema>;
