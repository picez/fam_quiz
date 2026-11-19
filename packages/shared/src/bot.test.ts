import { expect, it } from 'vitest';
import { BOT_ACTIONS, BOT_EMAIL, BOT_NICKNAME, BOT_PLAYER_ID, BOT_ROOMS_MAX, BOT_USER_ID, isBotDomainEmail, isBotUser } from './bot';

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

it('the bot domain is reserved for any address and any case', () => {
  expect(isBotDomainEmail(BOT_EMAIL)).toBe(true);
  expect(isBotDomainEmail('someone@quiz.invalid')).toBe(true);
  expect(isBotDomainEmail(' Quiz-Bot@QUIZ.Invalid ')).toBe(true);
  expect(isBotDomainEmail('olya@notquiz.invalid')).toBe(false);
  expect(isBotDomainEmail('olya@quiz.invalid.example.com')).toBe(false);
  expect(isBotDomainEmail('olya@example.com')).toBe(false);
  expect(isBotDomainEmail(null)).toBe(false);
});
