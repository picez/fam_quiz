import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale, activateLocaleForTests, countText, loadLocale, t, ukMessages } from '../i18n';
import de from './de.json';
import { ENABLED_LOCALES } from './locales';

const words = (text: string) => text.split(/\s+/).filter(Boolean);
const graphemes = (word: string) => [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(word)].length;
const uk = ukMessages as Record<string, string>;
/** uk-значення ключа; для форми множини (`x_one`) — будь-яка uk-форма тієї ж основи. */
function ukOf(key: string): string | undefined {
  if (key in uk) return uk[key];
  const base = key.replace(/_[a-z]+$/, '');
  const form = Object.keys(uk).find((one) => one.startsWith(`${base}_`));
  return form === undefined ? undefined : uk[form];
}

describe('de', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('is enabled and speaks German', async () => {
    expect(ENABLED_LOCALES).toContain('de');
    await loadLocale('de');
    activateLocale('de');
    expect(t('yes')).toBe('Ja');
    expect(t('no')).toBe('Nein');
    expect([1, 5].map((n) => countText('questionCount', n, { count: n }))).toEqual(['1 Frage', '5 Fragen']);
    expect(t('menuShortHistory')).toBe('Verlauf');
    expect(t('menuProfile')).toBe('Profil');
  });

  it('keeps every word of a short label (uk ≤ 3 words) within 18 graphemes', () => {
    const long = Object.entries(de as Record<string, string>).flatMap(([key, text]) => {
      const source = ukOf(key);
      if (source === undefined || words(source).length > 3) return [];
      return words(text)
        .filter((word) => graphemes(word) > 18)
        .map((word) => `${key}: ${word}`);
    });
    expect(long).toEqual([]);
  });
});
