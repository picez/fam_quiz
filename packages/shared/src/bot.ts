/** The «Квіз-бот» account: a fixed user row that hosts autopilot games and can never sign in. */
export const BOT_USER_ID = 'quiz-bot';
/** The author id of a bot game (`state.autopilot.authorId`); players are uuids, truth fakes are `fake-N`. */
export const BOT_PLAYER_ID = 'quiz-bot';
export const BOT_NICKNAME = 'Квіз-бот';
/** A reserved `.invalid` domain: no mail can ever reach it. */
export const BOT_EMAIL = 'quiz-bot@quiz.invalid';
/** At most this many unfinished bot rooms at once. */
export const BOT_ROOMS_MAX = 3;
export const BOT_ACTIONS = ['start', 'pause', 'resume', 'end'] as const;
export type BotAction = (typeof BOT_ACTIONS)[number];

export function isBotUser(id: string | null | undefined): boolean {
  return id === BOT_USER_ID;
}

/** An address in the bot's domain (`@quiz.invalid`, any case): nobody may sign up with one. */
export function isBotDomainEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase().endsWith('@' + BOT_EMAIL.split('@')[1]!);
}
