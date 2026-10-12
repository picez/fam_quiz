import { describe, expect, it } from 'vitest';
import { countText, errorText, t } from './i18n';

describe('i18n', () => {
  it('substitutes variables', () => {
    expect(t('answeredOf', { answered: 7, total: 12 })).toBe('Відповіли 7 з 12');
  });

  it('explains known error codes and falls back for unknown ones', () => {
    expect(errorText('nickname_taken')).toBe('Таке ім’я вже зайняте. Виберіть інше.');
    expect(errorText('something_new')).toBe('Щось пішло не так. Спробуйте ще раз.');
  });
});

describe('countText', () => {
  it('picks the Ukrainian form of the noun for the number', () => {
    const games = (count: number) => countText('statGames', count);
    expect([1, 21, 101].map(games)).toEqual(['гра', 'гра', 'гра']);
    expect([2, 3, 4, 22, 104].map(games)).toEqual(['гри', 'гри', 'гри', 'гри', 'гри']);
    expect([0, 5, 11, 12, 14, 20, 111, 112].map(games)).toEqual(Array(8).fill('ігор'));
    expect([1, 2, 5].map((count) => countText('statWins', count))).toEqual(['перемога', 'перемоги', 'перемог']);
  });
});
