import { describe, expect, it } from 'vitest';
import { groupBy } from './collections';

describe('collections (30d)', () => {
  it('groupBy keeps key order of first appearance and input order inside a group', () => {
    const groups = groupBy(['ab', 'ac', 'b'], (s) => s[0]);
    expect([...groups.entries()]).toEqual([
      ['a', ['ab', 'ac']],
      ['b', ['b']],
    ]);
  });

  it('groupBy of an empty list is an empty map', () => {
    expect(groupBy([] as string[], (s) => s).size).toBe(0);
  });
});
