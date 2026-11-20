import { expect, it } from 'vitest';
import { BOT_ACTIONS, BOT_COMMAND_TYPES, BOT_TIME_SECONDS, adminBotLobbySchema, botCommandSchema, BOT_EMAIL, BOT_NICKNAME, BOT_PLAYER_ID, BOT_ROOMS_MAX, BOT_USER_ID, isBotDomainEmail, isBotUser } from './bot';

it('the bot is one fixed account that can never receive mail', () => {
  expect(BOT_USER_ID).toBe('quiz-bot');
  expect(BOT_PLAYER_ID).toBe('quiz-bot');
  expect(BOT_NICKNAME).toBe('Квіз-бот');
  expect(BOT_EMAIL.endsWith('.invalid')).toBe(true);
  expect(BOT_ROOMS_MAX).toBe(3);
  expect([...BOT_ACTIONS]).toEqual(['start', 'pause', 'resume', 'end', 'skip', 'time', 'end-round']);
  expect(isBotUser('quiz-bot')).toBe(true);
  expect(isBotUser(null)).toBe(false);
  expect(isBotUser(undefined)).toBe(false);
  expect(isBotUser('Quiz-Bot')).toBe(false);
  expect(isBotUser('a1b2')).toBe(false);
});

it('the bot domain is reserved for any address and any case', () => {
  expect(isBotDomainEmail(BOT_EMAIL)).toBe(true);
  expect(isBotDomainEmail('someone@quiz.invalid')).toBe(true);
  expect(isBotDomainEmail(' Quiz-Bot@QUIZ.Invalid ')).toBe(true);
  expect(isBotDomainEmail('olya@notquiz.invalid')).toBe(false);
  expect(isBotDomainEmail('olya@quiz.invalid.example.com')).toBe(false);
  expect(isBotDomainEmail('olya@example.com')).toBe(false);
  expect(isBotDomainEmail(null)).toBe(false);
});

it('62: bot commands — bare actions, a person by id, a team form without the host choice', () => {
  expect(BOT_TIME_SECONDS).toBe(30);
  expect([...BOT_COMMAND_TYPES]).toEqual(['start', 'pause', 'resume', 'end', 'skip', 'time', 'end-round', 'kick', 'release', 'team-form']);
  expect(botCommandSchema.parse({ type: 'skip' })).toEqual({ type: 'skip' });
  expect(botCommandSchema.parse({ type: 'kick', playerId: 'p1' })).toEqual({ type: 'kick', playerId: 'p1' });
  expect(botCommandSchema.parse({ type: 'team-form', form: 'dice' })).toEqual({ type: 'team-form', form: 'dice' });
  for (const bad of [{ type: 'kick' }, { type: 'team-form', form: 'host' }, { type: 'skip', playerId: 'p1' }, { type: 'lock' }, { type: 'kick', playerId: 'x'.repeat(65) }])
    expect(botCommandSchema.safeParse(bad).success).toBe(false);
});

it('62: the bot lobby — listed and an optional trimmed password of 4 to 32 characters', () => {
  expect(adminBotLobbySchema.parse({ listed: true, password: '  сова62 ' })).toEqual({ listed: true, password: 'сова62' });
  expect(adminBotLobbySchema.safeParse({ listed: false, password: null }).success).toBe(true);
  for (const bad of [{ listed: true, password: 'abc' }, { listed: true, password: 'x'.repeat(33) }, { listed: true, password: null, extra: 1 }, { password: null }])
    expect(adminBotLobbySchema.safeParse(bad).success).toBe(false);
});
