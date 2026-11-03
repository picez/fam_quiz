import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale, activateLocaleForTests, countText, loadLocale, t } from '../i18n';
import { ENABLED_LOCALES } from './locales';

describe('es', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('is enabled and speaks Spanish', async () => {
    expect(ENABLED_LOCALES).toContain('es');
    await loadLocale('es');
    activateLocale('es');
    expect(t('yes')).toBe('Sí');
    expect(t('no')).toBe('No');
    expect([1, 5, 1000000].map((n) => countText('questionCount', n, { count: n }))).toEqual(['1 pregunta', '5 preguntas', '1000000 de preguntas']);
    expect(t('menuShortHistory')).toBe('Historia');
    expect(t('menuHistory')).toBe('Historial');
    expect(t('menuShortAchievements')).toBe('Logros');
  });
});
