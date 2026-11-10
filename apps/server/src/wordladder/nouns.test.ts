import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS, ladderKey, ladderLetters } from '@quiz/shared';
import { EXCLUDED } from '../../scripts/wordladder-dict';
import { NOUNS_FILE, lazyNouns, loadNouns, nounsOf, parseNouns } from './nouns';

const FIXTURE = resolve(import.meta.dirname, '__fixtures__/nouns.txt');

describe('noun dictionary (26c)', () => {
  it('parses a list, skipping comments and blanks', () => {
    const nouns = parseNouns('# x\nполе\n\nпола\n');
    expect(nouns.size).toBe(2);
    expect(nouns.isNoun('поле')).toBe(true);
    expect(nouns.isNoun('# x')).toBe(false);
    expect(nouns.isNoun('')).toBe(false);
  });

  it('loads the fixture file', () => {
    const nouns = loadNouns(FIXTURE);
    expect(nouns.size).toBe(7);
    for (const w of ['поле', 'пола', 'пора', 'пара', 'тара', 'кора', 'кара']) expect(nouns.isNoun(w)).toBe(true);
    expect(nouns.isNoun('пила')).toBe(false);
  });

  it('lazyNouns reads the file only when first asked', () => {
    const missing = lazyNouns(resolve(import.meta.dirname, '__fixtures__/missing.txt'));
    expect(() => missing.isNoun('поле')).toThrow();
    const nouns = lazyNouns(FIXTURE);
    expect(nouns.isNoun('тара')).toBe(true);
    expect(nouns.size).toBe(7);
  });

  it('nounsOf keys the words it is given', () => {
    const nouns = nounsOf(['ПОЛЕ', 'м’ята', 'pole']);
    expect(nouns.size).toBe(2);
    expect(nouns.isNoun('поле')).toBe(true);
    expect(nouns.isNoun("м'ята")).toBe(true);
  });

  it('keys gives every key (27d)', () => {
    expect([...parseNouns('# x\nполе\n\nпола\n').keys()].sort()).toEqual(['пола', 'поле']);
    expect([...nounsOf(['ПОЛЕ', 'м’ята']).keys()].sort()).toEqual(["м'ята", 'поле']);
    const lazy = lazyNouns(FIXTURE);
    expect([...lazy.keys()]).toHaveLength(7);
    expect([...loadNouns().keys()]).toHaveLength(loadNouns().size);
  });

  it('the committed dictionary is a real noun list', () => {
    const nouns = loadNouns();
    expect(nouns.size).toBeGreaterThan(20_000);
    for (const w of ['поле', 'пола', 'пора', 'пара', 'тара', 'кора', 'кара', 'кіт', 'кит', "м'ята"]) expect(nouns.isNoun(w)).toBe(true);
    expect(nouns.isNoun('київ')).toBe(false);
    expect(nouns.isNoun('бігти')).toBe(false);
    for (const w of EXCLUDED) expect(nouns.isNoun(w)).toBe(false);
    const words = readFileSync(NOUNS_FILE, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#'));
    expect(words).toHaveLength(nouns.size);
    expect(words).toEqual([...words].sort());
    const odd = words.filter((w) => ladderKey(w) !== w || ladderLetters(w) < LIMITS.minWordLadderLetters || ladderLetters(w) > LIMITS.maxWordLadderLetters);
    expect(odd).toEqual([]);
  });
});
