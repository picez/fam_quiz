import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale, activateLocaleForTests, countText, loadLocale, t } from '../i18n';
import { ENABLED_LOCALES } from './locales';

describe('pl', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('is enabled and speaks Polish', async () => {
    expect(ENABLED_LOCALES).toContain('pl');
    await loadLocale('pl');
    activateLocale('pl');
    expect(t('yes')).toBe('Tak');
    expect(t('no')).toBe('Nie');
    const counts = [1, 2, 5, 22, 25].map((n) => countText('questionCount', n, { count: n }));
    expect(counts).toEqual(['1 pytanie', '2 pytania', '5 pytań', '22 pytania', '25 pytań']);
    expect(t('menuShortHistory')).toBe('Historia');
  });
});
