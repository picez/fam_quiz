import { describe, expect, it } from 'vitest';
import { UNTOUCHED, isTouched, touchKey, touchReducer } from './touched';

describe('touched state (74)', () => {
  it('touches a key only after it is edited and then left', () => {
    const edited = touchReducer(UNTOUCHED, { type: 'edit', key: 'a' });
    expect(isTouched(edited, 'a')).toBe(false);
    const left = touchReducer(edited, { type: 'leave', key: 'a' });
    expect(isTouched(left, 'a')).toBe(true);
    expect(isTouched(left, 'b')).toBe(false);
  });

  it('touches everything after a save attempt', () => {
    const all = touchReducer(UNTOUCHED, { type: 'all' });
    expect(isTouched(all, 'anything')).toBe(true);
  });

  it('returns the same state when nothing changes', () => {
    const edited = touchReducer(UNTOUCHED, { type: 'edit', key: 'a' });
    expect(touchReducer(edited, { type: 'edit', key: 'a' })).toBe(edited);
    const left = touchReducer(edited, { type: 'leave', key: 'a' });
    expect(touchReducer(left, { type: 'edit', key: 'a' })).toBe(left);
    const all = touchReducer(left, { type: 'all' });
    expect(touchReducer(all, { type: 'all' })).toBe(all);
    expect(touchReducer(all, { type: 'edit', key: 'z' })).toBe(all);
  });

  it('leaving an unedited key does nothing', () => {
    expect(touchReducer(UNTOUCHED, { type: 'leave', key: 'a' })).toBe(UNTOUCHED);
  });

  it('builds stable keys', () => {
    expect(touchKey.round('r1')).not.toBe(touchKey.question('r1'));
  });
});
