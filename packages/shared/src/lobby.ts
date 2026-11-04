import { z } from 'zod';
import type { Phase } from './game';
import type { NickLevel } from './levels';
import type { ProfileCard } from './profile';
import { UNSTORABLE, isStorable } from './text';

/** Хто бачить гру в списку лобі (24c): усі, лише друзі ведучого, ніхто (лише за кодом). */
export const LOBBY_VISIBILITIES = ['all', 'friends', 'hidden'] as const;
export type LobbyVisibility = (typeof LOBBY_VISIBILITIES)[number];

export const LOBBY_PASSWORD_MIN = 4;
export const LOBBY_PASSWORD_MAX = 32;
/** Як часто сторінка «/» перепитує список лобі. */
export const LOBBY_POLL_MS = 5000;
export const LOBBY_LIST_LIMIT = 50;

/** Пароль гри: обрізаний з країв, 4–32 символи (кодові точки), придатний до збереження. */
export const lobbyPasswordSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => {
    const length = [...s].length;
    return length >= LOBBY_PASSWORD_MIN && length <= LOBBY_PASSWORD_MAX;
  }, 'password_length')
  .refine(isStorable, UNSTORABLE);

export const lobbySettingsSchema = z
  .object({ visibility: z.enum(LOBBY_VISIBILITIES), password: lobbyPasswordSchema.nullable() })
  .strict();
export type LobbySettings = z.infer<typeof lobbySettingsSchema>;

/** Поля входу в запаролену гру: пароль і токен пристрою (для лічильника спроб гостя). Розгортаються в joinSchema та claimSchema. */
export const entryFields = { password: z.string().max(64).optional(), device: z.string().max(64).optional() };

/** Рядок списку лобі на «/». */
export interface LobbyRow {
  code: string;
  title: string;
  host: ProfileCard & { level: NickLevel | null };
  players: number;
  maxPlayers: number;
  rounds: number;
  questions: number;
  locked: boolean;
  /** Продовжена гра, що вже йде. */
  late: boolean;
  /** Нікнейми гравців кімнати, на яких підписаний той, хто дивиться. */
  friends: string[];
  /** ISO. */
  openedAt: string;
}

/** Відповідь GET /api/games/by-code/:code. */
export interface CodeInfo {
  phase: Phase;
  title: string;
  locked: boolean;
  late: boolean;
}
