import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale, activateLocaleForTests, countText, loadLocale, t } from '../i18n';
import { ENABLED_LOCALES } from './locales';

describe('en', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('is enabled and speaks English', async () => {
    expect(ENABLED_LOCALES).toContain('en');
    await loadLocale('en');
    activateLocale('en');
    expect(t('yes')).toBe('Yes');
    expect(t('no')).toBe('No');
    expect(countText('questionCount', 1, { count: 1 })).toBe('1 question');
    expect(countText('questionCount', 5, { count: 5 })).toBe('5 questions');
    expect(t('menuShortJoin')).toBe('Play');
    expect(t('menuShortProfile')).toBe('Profile');
  });
});
