import { expect, it } from 'vitest';
import { BOT_ACTIONS, BOT_EMAIL, BOT_NICKNAME, BOT_PLAYER_ID, BOT_ROOMS_MAX, BOT_USER_ID, isBotUser } from './bot';

it('the bot is one fixed account that can never receive mail', () => {
  expect(BOT_USER_ID).toBe('quiz-bot');
  expect(BOT_PLAYER_ID).toBe('quiz-bot');
  expect(BOT_NICKNAME).toBe('Квіз-бот');
  expect(BOT_EMAIL.endsWith('.invalid')).toBe(true);
  expect(BOT_ROOMS_MAX).toBe(3);
  expect([...BOT_ACTIONS]).toEqual(['start', 'pause', 'resume', 'end']);
  expect(isBotUser('quiz-bot')).toBe(true);
  expect(isBotUser(null)).toBe(false);
  expect(isBotUser(undefined)).toBe(false);
  expect(isBotUser('Quiz-Bot')).toBe(false);
  expect(isBotUser('a1b2')).toBe(false);
});
