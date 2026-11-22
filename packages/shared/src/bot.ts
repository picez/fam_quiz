import { z } from 'zod';
import { lobbyPasswordSchema } from './lobby';
import { LIMITS } from './quiz';

/** The «Квіз-бот» account: a fixed user row that hosts autopilot games and can never sign in. */
export const BOT_USER_ID = 'quiz-bot';
/** The author id of a bot game (`state.autopilot.authorId`); players are uuids, truth fakes are `fake-N`. */
export const BOT_PLAYER_ID = 'quiz-bot';
export const BOT_NICKNAME = 'Квіз-бот';
/** A reserved `.invalid` domain: no mail can ever reach it. */
export const BOT_EMAIL = 'quiz-bot@quiz.invalid';
/** At most this many unfinished bot rooms at once. */
export const BOT_ROOMS_MAX = 3;
/** Bare bot room actions (no payload). 62: skip closes the open question, time adds BOT_TIME_SECONDS, end-round ends the round. */
export const BOT_ACTIONS = ['start', 'pause', 'resume', 'end', 'skip', 'time', 'end-round'] as const;
export type BotAction = (typeof BOT_ACTIONS)[number];
/** 62: actions on one person of a bot room, by player id. */
export const BOT_PERSON_ACTIONS = ['kick', 'release'] as const;
/** 62: the team forms the admin may choose for a bot room (no host: the bot cannot assign). */
export const BOT_TEAM_FORMS = ['pick', 'random', 'dice'] as const;
/** 62: «+30 с» in a bot room. */
export const BOT_TIME_SECONDS = 30;
export const botCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(BOT_ACTIONS) }).strict(),
  z.object({ type: z.enum(BOT_PERSON_ACTIONS), playerId: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal('team-form'), form: z.enum(BOT_TEAM_FORMS) }).strict(),
  // Бали від адміна людині (у командній грі — її команді): ціле, не 0, за модулем до LIMITS.maxAdjust, як у ведучого.
  z.object({ type: z.literal('adjust'), playerId: z.string().min(1).max(64), points: z.number().int().min(-LIMITS.maxAdjust).max(LIMITS.maxAdjust).refine((n) => n !== 0) }).strict(),
]);
export type BotCommand = z.infer<typeof botCommandSchema>;
/** 62: every command type, for checking the `:action` of a route. */
export const BOT_COMMAND_TYPES = [...BOT_ACTIONS, ...BOT_PERSON_ACTIONS, 'team-form', 'adjust'] as const;
/** 62: the bot room lobby the admin sets: shown in the lobby list or not, and an optional password. */
export const adminBotLobbySchema = z.object({ listed: z.boolean(), password: lobbyPasswordSchema.nullable() }).strict();
export type AdminBotLobby = z.infer<typeof adminBotLobbySchema>;
/** 68: with every admin host screen offline this long, a bot room in manual mode goes back to the bot. */
export const BOT_MANUAL_GRACE_MS = 60_000;
/** 68: «Взяти керування» (on) / «Віддати боту» (off) in a bot room. */
export const adminBotManualSchema = z.object({ on: z.boolean() }).strict();
export type AdminBotManual = z.infer<typeof adminBotManualSchema>;
/** 68: the admin's own host screen token for a bot room (kept in memory only) and the stage token. */
export interface AdminBotHostAccess {
  hostToken: string;
  stageToken: string;
}

export function isBotUser(id: string | null | undefined): boolean {
  return id === BOT_USER_ID;
}

/** An address in the bot's domain (`@quiz.invalid`, any case): nobody may sign up with one. */
export function isBotDomainEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase().endsWith('@' + BOT_EMAIL.split('@')[1]!);
}
