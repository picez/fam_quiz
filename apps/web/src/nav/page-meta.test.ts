import { describe, expect, it } from 'vitest';
import { documentTitle, documentTitleFor, isGamePath, pageTitle, tabGroup } from './page-meta';

describe('page meta (76)', () => {
  it('names pages outside the game', () => {
    expect(pageTitle('/profile/friends')).toBe('Друзі');
    expect(pageTitle('/friends')).toBe('Друзі');
    expect(pageTitle('/')).toBe('Головна');
    expect(pageTitle('/quizzes/new')).toBe('Нова вікторина');
    expect(pageTitle('/quizzes/abc')).toBe('Редагування вікторини');
    expect(pageTitle('/profile/abc')).toBe('Профіль');
    expect(pageTitle('/profile/groups/g1/items/i1')).toBe('Групи');
    expect(pageTitle('/admin/users/1')).toBe('Адмінка');
  });

  it('knows game screens and gives them no page name', () => {
    expect(pageTitle('/play/123456')).toBeNull();
    expect(isGamePath('/bot-host/1')).toBe(true);
    expect(isGamePath('/stage/1')).toBe(true);
    expect(isGamePath('/history')).toBe(false);
  });

  it('builds the tab title', () => {
    expect(documentTitle('Друзі')).toBe('Друзі · Вікторина');
    expect(documentTitle(null)).toBe('Вікторина');
    expect(documentTitleFor('/')).toBe('Вікторина');
    expect(documentTitleFor('/host/1')).toBe('Вікторина');
    expect(documentTitleFor('/inbox')).toBe('Вхідні · Вікторина');
  });

  it('groups pages that act as tabs of one page', () => {
    expect(tabGroup('/me')).toBe(tabGroup('/history'));
    expect(tabGroup('/me')).not.toBeNull();
    expect(tabGroup('/feed/calendar')).toBe(tabGroup('/feed'));
    expect(tabGroup('/admin/users')).toBe(tabGroup('/admin'));
    expect(tabGroup('/admin/users/1')).toBeNull();
    expect(tabGroup('/quizzes')).toBeNull();
    expect(tabGroup('/history/g1')).toBeNull();
  });
});
