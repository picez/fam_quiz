import { describe, expect, it } from 'vitest';
import { normalizeText } from './normalize';

describe('normalizeText', () => {
  it('trims, collapses spaces and lowercases', () => {
    expect(normalizeText('  Івано   Франківськ ')).toBe('івано франківськ');
  });

  it('treats every apostrophe variant as the same character', () => {
    const expected = normalizeText("Кам'янець");
    expect(normalizeText('Кам’янець')).toBe(expected);
    expect(normalizeText('Камʼянець')).toBe(expected);
    expect(normalizeText('Кам`янець')).toBe(expected);
  });

  it('treats decomposed Unicode letters as composed ones', () => {
    expect(normalizeText('Київ'.normalize('NFD'))).toBe(normalizeText('Київ'));
    expect(normalizeText('Йосип'.normalize('NFD'))).toBe(normalizeText('Йосип'));
  });

  it('unifies quotation marks', () => {
    expect(normalizeText('«Кобзар»')).toBe('"кобзар"');
    expect(normalizeText('“Кобзар”')).toBe('"кобзар"');
  });
});
