// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale, activateLocaleForTests, countText, loadLocale, t, ukMessages as uk } from '../i18n';
import type { TextKey } from '../i18n';
import { applyDocument } from './choose';
import { ENABLED_LOCALES } from './locales';

describe('ar', () => {
  afterEach(() => {
    activateLocaleForTests('uk');
    applyDocument('uk');
  });

  it('is enabled and speaks Arabic, right to left, with Western digits', async () => {
    expect(ENABLED_LOCALES).toContain('ar');
    await loadLocale('ar');
    activateLocale('ar');
    expect(t('yes')).toBe('نعم');
    expect(t('no')).toBe('لا');
    const counts = [0, 1, 2, 3, 11, 100].map((n) => countText('questionCount', n, { count: n }));
    expect(new Set(counts).size).toBe(6);
    for (const key of Object.keys(uk) as TextKey[]) expect(t(key)).not.toMatch(/[٠-٩۰-۹]/);
    expect(t('menuShortJoin')).toBe('لعب');
    expect(t('menuProfile')).toBe('حسابي');
    applyDocument('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
});
