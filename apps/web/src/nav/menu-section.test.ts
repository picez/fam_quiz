import { describe, expect, it } from 'vitest';
import { menuSection } from './menu-section';

describe('menuSection (77)', () => {
  it.each([
    ['/', 'home'],
    ['/report', 'home'],
    ['/unknown/page', 'home'],
    ['/quizzes', 'quizzes'],
    ['/quizzes/new', 'quizzes'],
    ['/quizzes/liked', 'quizzes'],
    ['/quizzes/5d3c', 'quizzes'],
    ['/library', 'quizzes'],
    ['/library/1', 'quizzes'],
    ['/create', 'quizzes'],
    ['/help', 'quizzes'],
    // 80: «Як грати» для гравця — під «Головною», довідка ведучого — у «Вікторинах».
    ['/help/play', 'home'],
    ['/report/mine', 'home'],
    ['/challenge/AB12', 'quizzes'],
    ['/feed', 'feed'],
    ['/feed/calendar', 'feed'],
    ['/history', 'history'],
    ['/history/7', 'history'],
    ['/me', 'history'],
    ['/me/g1', 'history'],
    ['/history/challenges', 'history'],
    ['/profile', 'profile'],
    ['/profile/friends', 'profile'],
    ['/profile/5/achievements', 'profile'],
    ['/friends', 'profile'],
    ['/prizes', 'profile'],
    ['/achievements', 'profile'],
    ['/groups', 'profile'],
    ['/groups/join/x', 'profile'],
    ['/admin', 'admin'],
    ['/admin/users', 'admin'],
    ['/inbox', 'inbox'],
    ['/login', 'login'],
  ])('%s → %s', (path, section) => {
    expect(menuSection(path)).toBe(section);
  });

  it('a trailing slash does not change the section', () => {
    expect(menuSection('/quizzes/')).toBe('quizzes');
    expect(menuSection('/reports')).toBe('home');
    expect(menuSection('/libraryx')).toBe('home');
  });
});
