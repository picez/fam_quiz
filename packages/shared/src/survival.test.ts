import { describe, expect, it } from 'vitest';
import { DOOR_COUNT, survivorsAfter } from './index';

describe('survivorsAfter (10h)', () => {
  const ids = ['p1', 'p2', 'p3'];
  it('everyone is alive before any trial', () => {
    expect(survivorsAfter(ids, [])).toEqual(ids);
  });
  it('drops everyone who is out in any trial, keeping the player order', () => {
    expect(survivorsAfter(ids, [['p2'], ['p3']])).toEqual(['p1']);
    expect(survivorsAfter(['p3', 'p1', 'p2'], [['p1']])).toEqual(['p3', 'p2']);
  });
  it('repeats and strangers in the outs change nothing', () => {
    expect(survivorsAfter(ids, [['p2', 'p2'], ['p2', 'zz']])).toEqual(['p1', 'p3']);
  });
  it('there are three doors', () => {
    expect(DOOR_COUNT).toBe(3);
  });
});
