import { describe, expect, it } from 'vitest';
import { nickText } from './nick';

describe('nickText', () => {
  it('shows the placeholder for a missing nickname', () => {
    expect(nickText(null)).toBe('Гравець');
    expect(nickText('')).toBe('Гравець');
    expect(nickText('Оля')).toBe('Оля');
  });
});
