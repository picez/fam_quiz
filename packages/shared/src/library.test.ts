import { describe, expect, it } from 'vitest';
import { ADMIN_ACTION_KINDS } from './admin';
import { LOCALES } from './locale';
import {
  LIBRARY_AUTHOR_LABEL,
  LIBRARY_DEFAULT_NICK,
  adminProfileActionSchema,
  adminQuizActionSchema,
  authorLine,
  libraryCopySchema,
  libraryLikeSchema,
  libraryOpenSchema,
  libraryQuerySchema,
  reportSchema,
  roundTypesOf,
  withAuthorLine,
} from './library';

const UUID = '3f2b8c1e-9d4a-4b6e-8a57-1c2d3e4f5a6b';

describe('library', () => {
  it('author line in every language', () => {
    expect(authorLine('uk', 'Олена')).toBe('Автор: Олена');
    expect(authorLine('it', 'Olena')).toBe('Autore: Olena');
    expect(authorLine('en', null)).toBe('Author: Player');
    for (const l of LOCALES) {
      expect(LIBRARY_AUTHOR_LABEL[l]).toBeTruthy();
      expect(LIBRARY_DEFAULT_NICK[l]).toBeTruthy();
      expect(authorLine(l, null)).toBe(`${LIBRARY_AUTHOR_LABEL[l]}: ${LIBRARY_DEFAULT_NICK[l]}`);
    }
  });

  it('the author line goes first and the description fits 500', () => {
    expect(withAuthorLine('Про річки', 'Автор: Олена')).toBe('Автор: Олена\nПро річки');
    expect(withAuthorLine('', 'Автор: Олена')).toBe('Автор: Олена');
    const long = withAuthorLine('я'.repeat(500), 'Автор: Олена');
    expect(long).toHaveLength(500);
    expect(long.startsWith('Автор: Олена\n')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(500);
    // сурогатна пара на межі не розривається
    const emoji = withAuthorLine('😀'.repeat(300), 'Автор: Олена');
    expect(emoji.length).toBeLessThanOrEqual(500);
    expect(emoji).not.toMatch(/[\ud800-\udbff]$/);
  });

  it('round types are distinct and ordered', () => {
    const rounds = ['classic', 'board', 'classic', 'final'].map((type) => ({ type }));
    expect(roundTypesOf({ rounds } as never)).toEqual(['classic', 'board', 'final']);
  });

  it('schemas', () => {
    expect(libraryQuerySchema.parse({})).toEqual({ sort: 'popular', offset: 0 });
    expect(libraryQuerySchema.parse({ offset: '40', sort: 'new', lang: 'pl' })).toEqual({ sort: 'new', offset: 40, lang: 'pl' });
    expect(libraryQuerySchema.safeParse({ lang: 'xx' }).success).toBe(false);
    expect(libraryQuerySchema.safeParse({ sort: 'top' }).success).toBe(false);
    expect(libraryQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);

    const ok = { target: { kind: 'quiz', entryId: UUID }, reason: 'spam' };
    expect(reportSchema.safeParse(ok).success).toBe(true);
    expect(reportSchema.safeParse({ target: { kind: 'profile', userId: 'u1' }, reason: 'other' }).success).toBe(true);
    expect(reportSchema.safeParse({ ...ok, target: { kind: 'quiz', entryId: 'abc' } }).success).toBe(false);
    expect(reportSchema.safeParse({ ...ok, reason: 'ugly' }).success).toBe(false);
    expect(reportSchema.safeParse({ ...ok, text: 'a'.repeat(301) }).success).toBe(false);
    expect(reportSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(reportSchema.parse({ ...ok, text: '  так  ' }).text).toBe('так');

    expect(libraryOpenSchema.safeParse({ language: 'de' }).success).toBe(true);
    expect(libraryOpenSchema.safeParse({ language: 'ru' }).success).toBe(false);
    expect(libraryCopySchema.safeParse({ locale: 'ar' }).success).toBe(true);
    expect(libraryLikeSchema.safeParse({ liked: true }).success).toBe(true);
    expect(adminQuizActionSchema.safeParse({ action: 'hide' }).success).toBe(true);
    expect(adminProfileActionSchema.safeParse({ action: 'reset_avatar' }).success).toBe(true);
    expect(adminProfileActionSchema.safeParse({ action: 'ban' }).success).toBe(false);
  });

  it('admin kinds', () => {
    for (const k of ['library_hide', 'library_restore', 'report_dismiss', 'appeal_reject', 'nickname_reset', 'avatar_reset']) {
      expect(ADMIN_ACTION_KINDS).toContain(k);
    }
  });
});
