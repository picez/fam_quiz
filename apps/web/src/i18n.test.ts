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

  it('substitutes variables into the chosen form', () => {
    const they = (count: number) => countText('versusTheyHigher', count, { name: 'Віра' });
    expect([1, 3, 0, 5].map(they)).toEqual(['гра, де Віра вище', 'гри, де Віра вище', 'ігор, де Віра вище', 'ігор, де Віра вище']);
  });
});

describe('sort prices', () => {
  it('per-word price and total read right for 1, 2–4, 5+ and 21', () => {
    const word = (points: number) => countText('sortPointsPerWord', points, { points });
    expect([1, 2, 5, 21, 100].map(word)).toEqual(['1 бал за слово', '2 бали за слово', '5 балів за слово', '21 бал за слово', '100 балів за слово']);
    const total = (sum: number) => countText('sortTotal', sum, { total: sum });
    expect([21, 4, 400].map(total)).toEqual(['Разом до 21 бала (не більше 2000)', 'Разом до 4 балів (не більше 2000)', 'Разом до 400 балів (не більше 2000)']);
  });
});

describe('points in words', () => {
  it('agrees the word with the number', () => {
    const said = [0, 1, 2, 5, 11, 21, 871, 1000, 1322].map((score) => t('yourResult', { score, points: countText('pointsWord', score), correct: 1, total: 2 }));
    expect(said.map((line) => line.split(',')[0])).toEqual([
      '0 балів',
      '1 бал',
      '2 бали',
      '5 балів',
      '11 балів',
      '21 бал',
      '871 бал',
      '1000 балів',
      '1322 бали',
    ]);
  });
});
