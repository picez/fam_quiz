import { z } from 'zod';
import type { ProfileCard } from './profile';
import { UNSTORABLE, isStorable } from './text';

/** Через скільки після початку непочата подія стає «Не відбулась». */
export const CALENDAR_MISSED_AFTER_MS = 6 * 3_600_000;
export const CALENDAR_MAX_AHEAD_DAYS = 365;
export const CALENDAR_TITLE_MAX = 80;
export const CALENDAR_LIST_CAP = 100;

export const CALENDAR_STATES = ['planned', 'open', 'played', 'missed', 'cancelled'] as const;
export type CalendarState = (typeof CALENDAR_STATES)[number];

export const CALENDAR_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type CalendarRequestStatus = (typeof CALENDAR_REQUEST_STATUSES)[number];

export interface CalendarRequest {
  user: ProfileCard;
  status: CalendarRequestStatus;
  /** requested_at, ISO */
  at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO UTC */
  startsAt: string;
  host: ProfileCard;
  /** я ведучий */
  mine: boolean;
  /** id — лише ведучому; title null — вікторину видалено */
  quiz: { id: string | null; title: string | null };
  state: CalendarState;
  editedAt: string | null;
  cancelledAt: string | null;
  /** скільки підтверджено */
  approved: number;
  /** для ведучого завжди null */
  myRequest: CalendarRequestStatus | null;
  /** лише ведучому, pending першими, далі за requested_at */
  requests: CalendarRequest[] | null;
  /** ведучому чи підтвердженому, лише в стані open */
  joinCode: string | null;
}

export interface CalendarPage {
  events: CalendarEvent[];
  asOf: string;
}

/** Межі часу перевіряє сервер (потрібне now). */
export const calendarInputSchema = z
  .object({
    title: z.string().trim().min(1).max(CALENDAR_TITLE_MAX).refine(isStorable, UNSTORABLE),
    startsAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'bad date'),
    quizId: z.string().uuid(),
  })
  .strict();
export type CalendarInput = z.infer<typeof calendarInputSchema>;

export const calendarDecisionSchema = z.object({ decision: z.enum(['approved', 'rejected']) }).strict();
