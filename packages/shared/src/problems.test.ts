import { describe, expect, it } from 'vitest';
import {
  BACKUP_RESTORE_COMMANDS,
  PROBLEM_MOMENT_MAX_AGE_MS,
  adminErrorsQuerySchema,
  adminProblemsQuerySchema,
  cleanPagePath,
  problemReplySchema,
  problemReportInputSchema,
} from './problems';

describe('problem reports (64)', () => {
  const page = { path: '/play/123456?token=abc#x', browser: 'Mozilla/5.0 …', screen: '360x740', lang: 'uk', theme: 'light' };

  it('a problem report: text up to 1000, an optional page snapshot', () => {
    expect(problemReportInputSchema.parse({ text: 'Не відкривається таблиця', page: null })).toEqual({ text: 'Не відкривається таблиця', page: null, game: null });
    expect(problemReportInputSchema.parse({ text: 'Не відкривається таблиця' }).page).toBeNull();
    const withPage = problemReportInputSchema.parse({ text: 'Не відкривається таблиця', page });
    expect(withPage.page?.path).toBe('/play/123456');
    expect(withPage.page).toEqual({ ...page, path: '/play/123456' });
    const long = problemReportInputSchema.parse({ text: 'x', page: { ...page, browser: 'b'.repeat(1000) } });
    expect(long.page?.browser).toHaveLength(300);
    expect(problemReportInputSchema.safeParse({ text: '', page: null }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: '   ', page: null }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'а'.repeat(1001), page: null }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'а'.repeat(1000), page: null }).success).toBe(true);
    expect(problemReportInputSchema.safeParse({ text: 'x', page: { ...page, screen: '360' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', page: { ...page, theme: 'blue' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', page: { ...page, lang: 'ru' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', page: { ...page, ip: '1.2.3.4' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', page: null, extra: 1 }).success).toBe(false);
  });

  it('a game moment (70): optional, cut to size, strict', () => {
    const game = { code: '123456', role: 'player', phase: 'question', round: 1, roundTitle: 'Кіно', question: 2, type: 'single', text: 'Хто зняв фільм?' };
    expect(problemReportInputSchema.parse({ text: 'x' }).game).toBeNull();
    expect(problemReportInputSchema.parse({ text: 'x', game }).game).toEqual(game);
    const empty = { code: '123456', role: 'host', phase: null, round: null, roundTitle: null, question: null, type: null, text: null };
    expect(problemReportInputSchema.parse({ text: 'x', game: empty }).game).toEqual(empty);
    const long = problemReportInputSchema.parse({ text: 'x', game: { ...game, roundTitle: 'р'.repeat(1000), text: 'т'.repeat(4000) } }).game;
    expect(long?.roundTitle).toHaveLength(120);
    expect(long?.text).toHaveLength(500);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, roundTitle: 'р'.repeat(1001) } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, text: 'т'.repeat(4001) } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, code: '12345' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, code: 'abcdef' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, type: 'guess' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, role: 'stage' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, phase: 'Question!' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, question: -2 } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, quizId: 'q1' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, text: 'a\u0000b' } }).success).toBe(false);
    expect(problemReportInputSchema.safeParse({ text: 'x', game: { ...game, roundTitle: 'a\u0000b' } }).success).toBe(false);
    expect(PROBLEM_MOMENT_MAX_AGE_MS).toBe(30 * 60_000);
  });

  it('cleanPagePath keeps only a site path', () => {
    expect(cleanPagePath('/stage/123456#tok')).toBe('/stage/123456');
    expect(cleanPagePath('/a?b=1')).toBe('/a');
    expect(cleanPagePath('//evil.example')).toBe('/');
    expect(cleanPagePath('https://x')).toBe('/');
    expect(cleanPagePath('')).toBe('/');
    expect(cleanPagePath('/' + 'a'.repeat(399))).toHaveLength(300);
    expect(cleanPagePath('/\\evil.example')).toBe('/');
  });

  it('cleanPagePath hides invite and challenge codes, keeps room codes', () => {
    expect(cleanPagePath('/groups/join/AbC123xyz')).toBe('/groups/join/:code');
    expect(cleanPagePath('/groups/join/AbC123xyz/')).toBe('/groups/join/:code/');
    expect(cleanPagePath('/challenge/k9Zq-77?x=1')).toBe('/challenge/:code');
    expect(cleanPagePath('/groups/join')).toBe('/groups/join');
    expect(cleanPagePath('/play/123456')).toBe('/play/123456');
    expect(cleanPagePath('/profile/groups/g1')).toBe('/profile/groups/g1');
  });

  it('a reply is up to 500', () => {
    expect(problemReplySchema.safeParse({ text: 'я'.repeat(500) }).success).toBe(true);
    expect(problemReplySchema.safeParse({ text: 'я'.repeat(501) }).success).toBe(false);
    expect(problemReplySchema.safeParse({ text: '  ' }).success).toBe(false);
  });

  it('admin queries default to new and open', () => {
    expect(adminErrorsQuerySchema.parse({})).toEqual({ status: 'new', page: 1 });
    expect(adminProblemsQuerySchema.parse({})).toEqual({ status: 'open', page: 1 });
    expect(adminProblemsQuerySchema.parse({ status: 'resolved', page: '2' })).toEqual({ status: 'resolved', page: 2 });
    expect(adminErrorsQuerySchema.safeParse({ status: 'all' }).success).toBe(false);
    expect(adminProblemsQuerySchema.safeParse({ status: 'all' }).success).toBe(false);
  });

  it('restore commands name db:restore', () => {
    for (const c of Object.values(BACKUP_RESTORE_COMMANDS)) expect(c).toContain('db:restore');
    expect(BACKUP_RESTORE_COMMANDS.key).toContain('{key}');
  });
});
