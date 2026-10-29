import { describe, expect, it } from 'vitest';
import { LETTER_SHARE, LETTER_TYPES, RISK_FACTOR, RISK_TYPES, SCOPE, SCOPE_TYPES, letterMask } from './powers';

describe('powers (12h)', () => {
  it('letterMask: the first letter, underscores, a dot for a space and the letter count (12h)', () => {
    expect(letterMask('Леся Українка')).toEqual({ first: 'Л', mask: 'Л _ _ _ · _ _ _ _ _ _ _ _', letters: 12 });
    expect(letterMask('Кам’янець-Подільський')).toEqual({ first: 'К', mask: 'К _ _ ’ _ _ _ _ _ - _ _ _ _ _ _ _ _ _ _ _', letters: 19 });
    expect(letterMask('дніпро')?.first).toBe('Д');
    expect(letterMask('  ')).toBeNull();
    expect(letterMask('?!')).toBeNull();
    expect(letterMask('1991 рік')).toEqual({ first: '1', mask: '1 _ _ _ · _ _ _', letters: 7 });
  });

  it('letterMask keeps every kind of apostrophe and does not count it', () => {
    // ʼ (U+02BC) — літера-модифікатор (\p{Lm}), але в українському письмі це апостроф.
    expect(letterMask('Камʼянець')).toEqual({ first: 'К', mask: 'К _ _ ʼ _ _ _ _ _', letters: 8 });
    expect(letterMask("Об'єм")).toEqual({ first: 'О', mask: "О _ ' _ _", letters: 4 });
    expect(letterMask('Кам`янка')?.letters).toBe(7);
  });

  it('letterMask composes letters first and drops stray combining marks', () => {
    // «й» у NFD — «и» + U+0306: одна літера, а не дві.
    const nfd = 'Гай'.normalize('NFD');
    expect(nfd.length).toBe(4);
    expect(letterMask(nfd)).toEqual({ first: 'Г', mask: 'Г _ _', letters: 3 });
    // Знак без пари для складання відкидається.
    expect(letterMask('Ла́ва')).toEqual({ first: 'Л', mask: 'Л _ _ _', letters: 4 });
  });

  it('letterMask: Latin, repeated spaces and spaces around a hyphen', () => {
    expect(letterMask('New York')).toEqual({ first: 'N', mask: 'N _ _ · _ _ _ _', letters: 7 });
    expect(letterMask('  Біла   Церква ')).toEqual({ first: 'Б', mask: 'Б _ _ _ · _ _ _ _ _ _', letters: 10 });
    expect(letterMask('Ла - Манш')).toEqual({ first: 'Л', mask: 'Л _ · - · _ _ _ _', letters: 6 });
  });

  it('the numbers of the new buffs', () => {
    expect([RISK_FACTOR, LETTER_SHARE, SCOPE]).toEqual([3, 0.75, { sliderShare: 0.2, numericShare: 0.1, numericMin: 2, pinSize: 0.5 }]);
  });

  it('lists the question types each new buff fits', () => {
    expect(RISK_TYPES).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'slider', 'clues', 'pin']);
    expect(LETTER_TYPES).toEqual(['text', 'clues']);
    expect(SCOPE_TYPES).toEqual(['numeric', 'slider', 'pin']);
  });
});
