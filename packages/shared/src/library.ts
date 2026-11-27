import { z } from 'zod';
import { localeSchema, type Locale } from './locale';
import type { Quiz, RoundType } from './quiz';
import { UNSTORABLE, isStorable } from './text';

/** Найменше запитань, щоб вікторину можна було відкрити в бібліотеці (47). */
export const LIBRARY_MIN_QUESTIONS = 5;
/** Стільки різних скаржників автоматично ховають вікторину до рішення адміна. */
export const LIBRARY_AUTO_HIDE = 3;
export const LIBRARY_PAGE = 20;
export const LIBRARY_QUERY_MAX = 100;
export const REPORT_TEXT_MAX = 300;
/** Опис вікторини не довший за це (`quizSchema`). */
const DESCRIPTION_MAX = 500;

export const REPORT_REASONS = ['offensive', 'spam', 'personal', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const LIBRARY_MODERATION = ['ok', 'auto_hidden', 'hidden'] as const;
export type LibraryModeration = (typeof LIBRARY_MODERATION)[number];
export const LIBRARY_SORTS = ['popular', 'new'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const LIBRARY_AUTHOR_LABEL: Record<Locale, string> = {
  uk: 'Автор',
  en: 'Author',
  pl: 'Autor',
  de: 'Autor',
  es: 'Autor',
  it: 'Autore',
  ar: 'المؤلف',
};
export const LIBRARY_DEFAULT_NICK: Record<Locale, string> = {
  uk: 'Гравець',
  en: 'Player',
  pl: 'Gracz',
  de: 'Spieler',
  es: 'Jugador',
  it: 'Giocatore',
  ar: 'لاعب',
};

/** «Автор: нік» мовою копіювальника; без ніка — підставка «Гравець». */
export function authorLine(locale: Locale, nickname: string | null): string {
  return `${LIBRARY_AUTHOR_LABEL[locale]}: ${nickname ?? LIBRARY_DEFAULT_NICK[locale]}`;
}

/** Рядок автора першим рядком опису; усе разом ≤ 500 (опис обрізається). */
export function withAuthorLine(description: string, line: string): string {
  if (description === '') return line.slice(0, DESCRIPTION_MAX);
  const room = DESCRIPTION_MAX - line.length - 1;
  if (room <= 0) return line.slice(0, DESCRIPTION_MAX);
  let cut = description.slice(0, room);
  // не розривати сурогатну пару
  const last = cut.charCodeAt(cut.length - 1);
  if (cut.length === room && last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${line}\n${cut}`;
}

/** Різні типи раундів у порядку появи. */
export function roundTypesOf(quiz: Pick<Quiz, 'rounds'>): RoundType[] {
  const seen: RoundType[] = [];
  for (const r of quiz.rounds) if (!seen.includes(r.type)) seen.push(r.type);
  return seen;
}

export const libraryOpenSchema = z.object({ language: localeSchema }).strict();
export const libraryCopySchema = z.object({ locale: localeSchema }).strict();
export const libraryLikeSchema = z.object({ liked: z.boolean() }).strict();
export const libraryQuerySchema = z
  .object({
    q: z.string().trim().max(LIBRARY_QUERY_MAX).optional(),
    sort: z.enum(LIBRARY_SORTS).default('popular'),
    lang: localeSchema.optional(),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();

export type ReportTarget = { kind: 'quiz'; entryId: string } | { kind: 'profile'; userId: string };
export const reportSchema = z
  .object({
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('quiz'), entryId: z.string().uuid() }).strict(),
      z.object({ kind: z.literal('profile'), userId: z.string().min(1).max(64) }).strict(),
    ]),
    reason: z.enum(REPORT_REASONS),
    text: z.string().trim().max(REPORT_TEXT_MAX).refine(isStorable, UNSTORABLE).optional(),
  })
  .strict();

export const adminQuizActionSchema = z.object({ action: z.enum(['hide', 'restore', 'dismiss']) }).strict();
export const adminProfileActionSchema = z.object({ action: z.enum(['reset_nickname', 'reset_avatar', 'dismiss']) }).strict();

export interface LibraryCard {
  id: string;
  title: string;
  description: string;
  /** Нікнейм автора; '' коли його немає. */
  author: string;
  questionCount: number;
  roundTypes: RoundType[];
  language: Locale;
  likes: number;
  plays: number;
  liked?: boolean;
  mine?: true;
}
export interface LibraryDetail extends LibraryCard {
  rounds: { title: string; type: RoundType }[];
  /** 77: що провести з цієї сторінки — своя вікторина автора або найсвіжіша ще жива копія глядача; лише з акаунтом. */
  hostQuizId?: string;
  openedAt: string;
  updatedAt: string;
}
export interface LibraryPage { items: LibraryCard[]; next: number | null }
export interface LibraryMine {
  quizId: string;
  entryId: string;
  listed: boolean;
  moderation: LibraryModeration;
  appealed: boolean;
  appealOpen: boolean;
  language: Locale;
  updatedAt: string;
  likes: number;
  plays: number;
}
export type AdminReportItem =
  | {
      kind: 'quiz';
      entryId: string;
      quizId: string;
      title: string;
      author: { id: string; nickname: string | null };
      moderation: LibraryModeration;
      appeal: boolean;
      reports: number;
      reasons: Partial<Record<ReportReason, number>>;
      texts: string[];
      since: string;
    }
  | {
      kind: 'profile';
      userId: string;
      nickname: string | null;
      avatar: string | null;
      reports: number;
      reasons: Partial<Record<ReportReason, number>>;
      texts: string[];
      since: string;
    };
