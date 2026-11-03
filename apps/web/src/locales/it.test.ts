import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale, activateLocaleForTests, countText, loadLocale, t } from '../i18n';
import { ENABLED_LOCALES } from './locales';

describe('it', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('is enabled and speaks Italian', async () => {
    expect(ENABLED_LOCALES).toContain('it');
    await loadLocale('it');
    activateLocale('it');
    expect(t('yes')).toBe('Sì');
    expect(t('no')).toBe('No');
    expect([1, 5, 1000000].map((n) => countText('questionCount', n, { count: n }))).toEqual(['1 domanda', '5 domande', '1000000 di domande']);
    expect(t('menuShortHistory')).toBe('Storico');
    expect(t('menuHistory')).toBe('Cronologia');
    expect(t('menuShortAchievements')).toBe('Trofei');
    expect(t('menuAchievements')).toBe('Traguardi');
  });
});
