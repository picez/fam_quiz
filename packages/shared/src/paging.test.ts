import { describe, expect, it } from 'vitest';
import { evenPageSize, nextOffset, pageCount, pageOffset, pageSlice } from './paging';

describe('paging (30d)', () => {
  it('pageCount: at least one page', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });

  it('pageOffset: pages from 1', () => {
    expect(pageOffset(1, 50)).toBe(0);
    expect(pageOffset(3, 50)).toBe(100);
  });

  it('nextOffset: size + 1 rows fetched means one more page', () => {
    expect(nextOffset(21, 0, 20)).toBe(20);
    expect(nextOffset(20, 0, 20)).toBeNull();
    expect(nextOffset(21, 40, 20)).toBe(60);
  });

  it('evenPageSize: even pages without an almost empty last one', () => {
    expect(evenPageSize(40, 40)).toBe(40);
    expect(evenPageSize(41, 40)).toBe(21);
    expect(evenPageSize(81, 40)).toBe(27);
    expect(evenPageSize(24, 24)).toBe(24);
    expect(evenPageSize(5, 12)).toBe(5);
    expect(evenPageSize(13, 12)).toBe(7);
    expect(evenPageSize(25, 12)).toBe(9);
    expect(evenPageSize(30, 24)).toBe(15);
    expect(evenPageSize(0, 12)).toBe(1);
  });

  it('pageSlice: pages from 0', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(pageSlice(items, 0, 4)).toEqual([0, 1, 2, 3]);
    expect(pageSlice(items, 2, 4)).toEqual([8, 9]);
    expect(pageSlice(items, 3, 4)).toEqual([]);
  });
});
