import { describe, expect, it } from 'vitest';
import { memoryCardAt, memoryCardKey, memoryGridSize, memoryLayout, memoryPairOf, memoryPoints } from './memory';

describe('memory', () => {
  it('grids give columns, rows and pairs', () => {
    expect(memoryGridSize('3x4')).toEqual({ cols: 3, rows: 4, pairs: 6 });
    expect(memoryGridSize('4x4')).toEqual({ cols: 4, rows: 4, pairs: 8 });
    expect(memoryGridSize('4x5')).toEqual({ cols: 4, rows: 5, pairs: 10 });
  });

  it('the layout is a fixed shuffle of every card', () => {
    const l = memoryLayout(6, 12345);
    expect(l).toHaveLength(12);
    expect([...l].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(memoryLayout(6, 12345)).toEqual(l);
    expect(memoryLayout(6, 12346)).not.toEqual(l);
    expect([...memoryLayout(10, 7)].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(l).toMatchInlineSnapshot(`
      [
        1,
        5,
        6,
        8,
        10,
        0,
        2,
        9,
        7,
        4,
        3,
        11,
      ]
    `);
  });

  it('two cells are a pair when their cards share a pair', () => {
    const layout = [3, 0, 2, 1];
    expect(memoryPairOf(layout, 0)).toBe(1);
    expect(memoryPairOf(layout, 3)).toBe(0);
    expect(memoryPairOf(layout, 0)).toBe(memoryPairOf(layout, 2));
    expect(memoryPairOf(layout, 1)).toBe(memoryPairOf(layout, 3));
  });

  it('the card at a cell', () => {
    const q = { pairs: [{ a: { text: 'Україна' }, b: { text: 'Київ' } }] };
    expect(memoryCardAt(q, [1, 0], 0)).toEqual({ text: 'Київ' });
    expect(memoryCardAt(q, [1, 0], 1)).toEqual({ text: 'Україна' });
  });

  it('card keys ignore case and spaces', () => {
    expect(memoryCardKey({ text: ' Київ ' })).toBe(memoryCardKey({ text: 'київ' }));
    expect(memoryCardKey({ text: '', imageUrl: '/uploads/a.png' })).toBe('i:/uploads/a.png');
    expect(memoryCardKey({ text: '', imageUrl: '/uploads/a.png' })).not.toBe(memoryCardKey({ text: '/uploads/a.png' }));
  });

  it('points scale by the fastest time', () => {
    expect(memoryPoints(300, 40000, 40000)).toBe(300);
    expect(memoryPoints(300, 40000, 60000)).toBe(200);
    expect(memoryPoints(300, 40000, 90000)).toBe(133);
    expect(memoryPoints(600, 30000, 45000)).toBe(400);
    expect(memoryPoints(300, 0, 0)).toBe(300);
  });
});
