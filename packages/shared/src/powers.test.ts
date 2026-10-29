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
    expect([RISK_FACTOR, LETTER_SHARE, SCOPE]).toEqual([3, 0.75, { sliderShare: 0.2, numericShare: 0.1, numericMin: 2, pinSize: 0.5 }]);
  });

  it('lists the question types each new buff fits', () => {
    expect(RISK_TYPES).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'slider', 'clues', 'pin']);
    expect(LETTER_TYPES).toEqual(['text', 'clues']);
    expect(SCOPE_TYPES).toEqual(['numeric', 'slider', 'pin']);
  });
});
