import { describe, expect, it } from 'vitest';
import { collapseLadder, ladderKey, ladderLetters, ladderPathIssue, oneLetterApart } from './index';

describe('word ladder letter rules (26c)', () => {
  it('ladderKey normalizes case, NFC and apostrophes and refuses non-Ukrainian letters', () => {
    expect(ladderKey(' ПОЛЕ ')).toBe('поле');
    expect(ladderKey('м’ята')).toBe("м'ята");
    expect(ladderKey('мʼята')).toBe("м'ята");
    expect(ladderKey('м‘ята')).toBe("м'ята");
    expect(ladderKey('м`ята')).toBe("м'ята");
    expect(ladderKey('йод')).toBe('йод');
    expect(ladderKey('йод'.normalize('NFD'))).toBe('йод');
    expect(ladderKey('Їжак')).toBe('їжак');
    expect(ladderKey('ґава')).toBe('ґава');
    for (const bad of ['pole', 'пiле', 'по ле', "'поле", "по''ле", "поле'", '', 'ёж', 'ъ', 'по-ле']) expect(ladderKey(bad)).toBeNull();
  });

  it('counts letters without the apostrophe', () => {
    expect(ladderLetters("м'ята")).toBe(4);
    expect(ladderLetters('поле')).toBe(4);
  });

  it('one letter apart', () => {
    expect(oneLetterApart('поле', 'пола')).toBe(true);
    expect(oneLetterApart('поле', 'поле')).toBe(false);
    expect(oneLetterApart('поле', 'пила')).toBe(false);
    expect(oneLetterApart('поле', 'полем')).toBe(false);
    expect(oneLetterApart('ґава', 'гава')).toBe(true);
  });

  it('path issues in order', () => {
    expect(ladderPathIssue(['поле', 'пола', 'пора', 'пара', 'тара'], 4)).toBeNull();
    expect(ladderPathIssue(['поле', 'пола', 'пора', 'пара', 'тара'], 3)).toBe('wordladder_steps');
    expect(ladderPathIssue(['поле', 'полем'], 8)).toBe('wordladder_length');
    expect(ladderPathIssue(['поле', 'пила'], 8)).toBe('wordladder_step');
    expect(ladderPathIssue(['по', 'па'], 8)).toBe('wordladder_word');
    expect(ladderPathIssue(['пароплав', 'пароплав'], 8)).toBe('wordladder_word');
    expect(ladderPathIssue(['поле', 'pola'], 8)).toBe('wordladder_word');
    // Ключі, а не написання: велика літера й типографський апостроф — те саме слово.
    expect(ladderPathIssue(['ПОЛЕ', 'Пола'], 1)).toBeNull();
  });

  it('collapse keeps start, second, gap and last two', () => {
    expect(collapseLadder([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
    expect(collapseLadder([1, 2, 3, 4, 5, 6])).toEqual([1, 2, null, 5, 6]);
    expect(collapseLadder([1])).toEqual([1]);
  });
});
