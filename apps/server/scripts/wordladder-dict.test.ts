import { describe, expect, it } from 'vitest';
import { EXCLUDED, VESUM_VERSION, header, nounOf } from './wordladder-dict';

describe('word ladder dictionary build (26c)', () => {
  it('takes nouns in nominative singular, 3–7 letters, lowercase, no proper names, abbreviations or bad words', () => {
    expect(nounOf('поле noun:inanim:n:v_naz')).toBe('поле');
    expect(nounOf('  поля noun:inanim:n:v_rod')).toBeNull();
    expect(nounOf('ножиці noun:inanim:p:v_naz:ns')).toBeNull();
    expect(nounOf('Аа noun:inanim:f:v_naz:nv:prop:geo')).toBeNull();
    expect(nounOf('ААА noun:inanim:m:v_naz:nv:abbr')).toBeNull();
    expect(nounOf('аа intj:bad')).toBeNull();
    expect(nounOf("м'ята noun:inanim:f:v_naz")).toBe("м'ята");
    expect(nounOf('кіт noun:anim:m:v_naz    # тварина')).toBe('кіт');
    expect(nounOf('  кора noun:inanim:f:v_naz')).toBe('кора');
    expect(nounOf('ох noun:inanim:m:v_naz')).toBeNull();
    expect(nounOf('пароплав noun:inanim:m:v_naz')).toBeNull();
    expect(nounOf('Поле noun:inanim:n:v_naz')).toBeNull();
    expect(nounOf('кара noun:inanim:f:v_naz:alt')).toBeNull();
    expect(nounOf('хто noun:anim:m:v_naz:pron')).toBeNull();
    expect(nounOf('')).toBeNull();
    expect(nounOf('поле')).toBeNull();
  });

  it('never keeps an excluded word', () => {
    expect(EXCLUDED.size).toBeGreaterThan(0);
    expect([...EXCLUDED].every((w) => nounOf(`${w} noun:anim:m:v_naz`) === null)).toBe(true);
  });

  it('the header credits VESUM and its license', () => {
    expect(VESUM_VERSION).toBe('v6.8.6');
    expect(header()).toEqual([
      '# Word ladder dictionary derived from VESUM (dict_uk v6.8.6) by brown-uk, https://github.com/brown-uk/dict_uk',
      '# License: CC BY-NC-SA 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/',
      '# Changes: nouns in nominative singular, 3–7 letters, lowercased, filtered',
    ]);
  });
});
