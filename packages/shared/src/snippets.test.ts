import { describe, expect, it } from 'vitest';
import { MELODY_STEPS, melodySeconds, melodyShare } from './melody';
import {
  SNIPPET_REVEAL_SECONDS,
  SNIPPET_SHARES,
  SNIPPET_STEP_COUNT,
  SNIPPET_STEPS,
  snippetSeconds,
  snippetShare,
} from './snippets';

describe('snippets', () => {
  it('steps double and shares fall', () => {
    expect([...SNIPPET_STEPS]).toEqual([1, 2, 4, 8, 16]);
    expect([...SNIPPET_SHARES]).toEqual([1, 0.8, 0.6, 0.4, 0.25]);
    expect(SNIPPET_STEPS).toHaveLength(SNIPPET_STEP_COUNT);
    expect(SNIPPET_SHARES).toHaveLength(SNIPPET_STEP_COUNT);
    expect(SNIPPET_REVEAL_SECONDS).toBe(30);
  });

  it('shares by the chunk', () => {
    expect([1, 2, 3, 4, 5].map((n) => Math.round(1000 * snippetShare(n)))).toEqual([
      1000, 800, 600, 400, 250,
    ]);
    expect(snippetShare(0)).toBe(1);
    expect(snippetShare(NaN)).toBe(1);
    expect(snippetShare(9)).toBe(0.25);
    expect(snippetShare(2.7)).toBe(0.8);
  });

  it('seconds of the longest chunk', () => {
    expect(snippetSeconds(0)).toBe(0);
    expect(snippetSeconds(1)).toBe(1);
    expect(snippetSeconds(4)).toBe(8);
    expect(snippetSeconds(5)).toBe(16);
    expect(snippetSeconds(9)).toBe(16);
  });

  it('melody keeps its names', () => {
    expect(MELODY_STEPS).toBe(SNIPPET_STEPS);
    expect(melodyShare).toBe(snippetShare);
    expect(melodySeconds).toBe(snippetSeconds);
  });
});
