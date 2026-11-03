import { afterEach, describe, expect, it } from 'vitest';
import { activateLocaleForTests } from '../i18n';
import { accusativeDay, agoText, compareText, decimalText, lowerFirst, namesText, ordinal, searchNormalize, trophyGender, trophyPhrase } from './grammar';

describe('grammar', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('keeps uk output as it was', () => {
    expect(agoText(12 * 60_000)).toBe('12 хв тому');
    expect(agoText(3 * 3_600_000)).toBe('3 год тому');
    expect(ordinal(3, 'f')).toBe('3-я');
    expect(ordinal(13, 'n')).toBe('13-е');
    expect(namesText(['Оля', 'Петро', 'Іра'])).toBe('Оля, Петро і Іра');
    expect(namesText(['Оля', 'Петро', 'Тарас'])).toBe('Оля, Петро й Тарас');
    expect(accusativeDay('субота, 7 листопада')).toBe('суботу, 7 листопада');
    expect(accusativeDay('понеділок, 9 листопада')).toBe('понеділок, 9 листопада');
    expect(lowerFirst('Найбільший')).toBe('найбільший');
    expect(lowerFirst('ВВП')).toBe('ВВП');
    expect(decimalText(23.4, 1)).toBe('23,4');
    expect(decimalText(12345.5, 1)).toBe('12345,5');
    expect(searchNormalize('Бліц')).toBe('бліц');
    expect(compareText('ґанок', 'дім')).toBeLessThan(0);
  });

  it('en: relative time, ordinals and lists', () => {
    activateLocaleForTests('en', { ui: {} });
    expect(agoText(12 * 60_000)).toBe('12 min ago');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map((n) => ordinal(n, 'f'))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
    expect(namesText(['A', 'B', 'C'])).toBe('A, B and C');
    expect(namesText(['A'])).toBe('A');
    expect(namesText([])).toBe('');
    expect(lowerFirst('Largest')).toBe('largest');
    expect(accusativeDay('Saturday 7 November')).toBe('Saturday 7 November');
    expect(decimalText(23.4, 1)).toBe('23.4');
  });

  it('de keeps capitals and uses a dot ordinal', () => {
    activateLocaleForTests('de', { ui: {} });
    expect(ordinal(3, 'n')).toBe('3.');
    expect(lowerFirst('Größte')).toBe('Größte');
  });

  it('pl, es, it and ar ordinals', () => {
    activateLocaleForTests('pl', { ui: {} });
    expect(ordinal(3, 'f')).toBe('3.');
    activateLocaleForTests('es', { ui: {} });
    expect(ordinal(3, 'f')).toBe('3.ª');
    expect(ordinal(3, 'n')).toBe('3.º');
    activateLocaleForTests('it', { ui: {} });
    expect(ordinal(3, 'f')).toBe('3ª');
    expect(ordinal(3, 'n')).toBe('3º');
    activateLocaleForTests('ar', { ui: {} });
    expect(ordinal(3, 'f')).toBe('3');
    expect(lowerFirst('Abc')).toBe('Abc');
    expect(agoText(12 * 60_000)).not.toMatch(/[٠-٩]/);
    expect(agoText(12 * 60_000)).toContain('12');
  });

  it('it: trophy kinds are all feminine and the noun comes first', () => {
    expect((['cup', 'medal', 'crown', 'star', 'statuette'] as const).map((kind) => trophyGender(kind, 'it'))).toEqual(['f', 'f', 'f', 'f', 'f']);
    expect(trophyPhrase("d'oro", 'coppa', 'it')).toBe("Coppa d'oro");
    expect(trophyPhrase('di bronzo', 'statuetta', 'it')).toBe('Statuetta di bronzo');
  });

  it('ar: cup, medal and star are feminine, crown and statuette masculine; the noun comes first', () => {
    expect((['cup', 'medal', 'crown', 'star', 'statuette'] as const).map((kind) => trophyGender(kind, 'ar'))).toEqual(['f', 'f', 'm', 'f', 'm']);
    expect(trophyPhrase('ذهبية', 'كأس', 'ar')).toBe('كأس ذهبية');
    expect(trophyPhrase('فضي', 'تاج', 'ar')).toBe('تاج فضي');
    expect(trophyPhrase('de oro', 'copa', 'es')).toBe('Copa de oro');
    expect(trophyPhrase('Золотий', 'кубок', 'uk')).toBe('Золотий кубок');
  });

  it('takes an explicit locale over the active one', () => {
    expect(ordinal(3, 'f', 'en')).toBe('3rd');
    expect(namesText(['A', 'B'], 'en')).toBe('A and B');
  });
});
