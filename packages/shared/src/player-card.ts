import { z } from 'zod';
import { ACHIEVEMENTS, type AchievementId } from './achievements';
import { UNSTORABLE, isStorable } from './text';

/** 58: одна ручна зміна досвіду — ціле від −5000 до 5000, не 0. */
export const ADMIN_XP_MAX = 5000;
export const ADMIN_XP_REASON_MAX = 200;
export const GIFT_NOTE_MAX = 120;
export const ADMIN_CARD_GAMES = 20;
export const ADMIN_CARD_BANS = 50;
export const ADMIN_CARD_XP = 50;
/** Скільки найновіших вікторин показує картка (лічильник в огляді — усі). */
export const ADMIN_CARD_QUIZZES = 50;
/** Нік, яким замінюють видаленого гравця в чужих іграх — маркер у базі; веб показує замість нього перекладений текст. */
export const DELETED_NICKNAME = 'Видалений гравець';
/** Текст факту «Правди про гравця», який написав видалений гравець — маркер у журналі гри; веб показує перекладений. */
export const DELETED_FACT = '(факт видалено)';

export interface AdminCardOverview { avatar: string | null; registeredAt: string; lastSeenAt: string | null; level: number; xp: number; games: number; wins: number; quizzes: number; friends: number; groups: number }
export interface AdminCardAchievement { id: AchievementId; earnedAt: string | null }
export interface AdminCardGame { gameId: string; title: string; startedAt: string; rank: number | null; playerCount: number; score: number }
export interface AdminCardQuiz { id: string; title: string; questions: number; updatedAt: string }
export interface AdminCardBan { at: string; kind: 'ban' | 'unban'; admin: string; reason: string | null }
/** balance — рядок, що повернув суму до нуля після зняття досягнення (note порожній; текст перекладає веб). */
export interface AdminCardXp { id: string; amount: number; note: string; at: string; balance?: true }
export interface AdminPlayerCard { overview: AdminCardOverview; achievements: AdminCardAchievement[]; blocked: AchievementId[]; games: AdminCardGame[]; quizzes: AdminCardQuiz[]; bans: AdminCardBan[]; xp: AdminCardXp[] }
export interface XpAdminLine { amount: number; note: string; at: string; balance?: true }

/** Текст: краї обрізано, пробіли стиснуто, придатний для бази, 1..max символів (як у призах). */
const text = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1).max(max).refine(isStorable, UNSTORABLE));

export const adminGrantSchema = z.object({ achievementId: z.enum(ACHIEVEMENTS) }).strict();

export const adminXpSchema = z
  .object({
    amount: z
      .number()
      .int()
      .min(-ADMIN_XP_MAX)
      .max(ADMIN_XP_MAX)
      .refine((n) => n !== 0),
    reason: text(ADMIN_XP_REASON_MAX),
  })
  .strict();

export const adminGiftSchema = z
  .object({
    prizeId: z.string().uuid(),
    note: text(GIFT_NOTE_MAX)
      .nullable()
      .optional()
      .transform((note) => note ?? null),
  })
  .strict();

export const adminDeleteSchema = z.object({ confirm: z.string().max(200) }).strict();
