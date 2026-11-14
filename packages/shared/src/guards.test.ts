import { describe, expect, it } from 'vitest';
import { isObjectLike, isRecord } from './guards';

const plain = [{}, { a: 1 }, new Date(0), Object.create(null) as object];
const arrays = [[], [1]];
const others = [null, undefined, 0, '', 'x', true, () => 1];

describe('guards (30d)', () => {
  it('isRecord: non-null objects, not arrays, not functions', () => {
    for (const value of plain) expect(isRecord(value)).toBe(true);
    for (const value of [...arrays, ...others]) expect(isRecord(value)).toBe(false);
  });

  it('isObjectLike: non-null objects including arrays, not functions', () => {
    for (const value of [...plain, ...arrays]) expect(isObjectLike(value)).toBe(true);
    for (const value of others) expect(isObjectLike(value)).toBe(false);
  });
});
