import { describe, expect, it } from 'vitest';
import { QUEST_WINDOW_MS, questDefaultOrder, questKey, questPoints, questShare, questSlots } from './quest';

describe('quest logic', () => {
  it('the key ignores case, spaces and separators', () => {
    expect(questKey('20.07')).toBe('2007');
    expect(questKey(' сова ')).toBe('СОВА');
    expect(questKey('С-о в а')).toBe('СОВА');
    expect(questKey("п'ять")).toBe('ПЯТЬ');
    expect(questKey('paris')).toBe('PARIS');
    expect(questKey('ґанок')).toBe('ҐАНОК');
    expect(questKey('')).toBe('');
    expect(questKey('й')).toBe('Й');
  });

  it('points fall by the questions revealed and never reach zero', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => questPoints(1200, k, 5))).toEqual([1200, 1000, 800, 600, 400, 200]);
    expect(questPoints(1000, 1, 5)).toBe(833);
    expect(questPoints(5, 20, 20)).toBe(1);
    expect(questShare(0, 5)).toBe(1);
    expect(questShare(9, 5)).toBe(questShare(5, 5));
    expect(questShare(-1, 5)).toBe(1);
  });

  it('slots open in the given order', () => {
    const order = [2, 0, 3, 1];
    expect(questSlots('СОВА', order, 0)).toEqual([null, null, null, null]);
    expect(questSlots('СОВА', order, 1)).toEqual([null, null, 'В', null]);
    expect(questSlots('СОВА', order, 3)).toEqual(['С', null, 'В', 'А']);
    expect(questSlots('СОВА', order, 9)).toEqual(['С', 'О', 'В', 'А']);
  });

  it('the default order goes left to right', () => {
    expect(questDefaultOrder(4)).toEqual([0, 1, 2, 3]);
  });

  it('the window is thirty seconds', () => {
    expect(QUEST_WINDOW_MS).toBe(30_000);
  });
});
