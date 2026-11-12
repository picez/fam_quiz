import { describe, expect, it } from 'vitest';
import {
  MELODY_REVEAL_SECONDS,
  MELODY_SHARES,
  MELODY_STEPS,
  MELODY_STEP_COUNT,
  melodyClip,
  melodyRevealClip,
  melodySeconds,
  melodyShare,
  type MelodyTrack,
} from './melody';
import { audioSchema } from './quiz';

describe('melody', () => {
  it('steps double and shares fall', () => {
    expect([...MELODY_STEPS]).toEqual([1, 2, 4, 8, 16]);
    expect([...MELODY_SHARES]).toEqual([1, 0.8, 0.6, 0.4, 0.25]);
    expect(MELODY_STEPS).toHaveLength(MELODY_STEP_COUNT);
    expect(MELODY_SHARES).toHaveLength(MELODY_STEP_COUNT);
  });

  it('shares by the chunk', () => {
    expect([1, 2, 3, 4, 5].map((n) => Math.round(1000 * melodyShare(n)))).toEqual([1000, 800, 600, 400, 250]);
    expect(melodyShare(0)).toBe(1);
    expect(melodyShare(Number.NaN)).toBe(1);
    expect(melodyShare(9)).toBe(0.25);
  });

  it('seconds of the longest chunk', () => {
    expect(melodySeconds(0)).toBe(0);
    expect(melodySeconds(1)).toBe(1);
    expect(melodySeconds(4)).toBe(8);
    expect(melodySeconds(5)).toBe(16);
  });

  it('clips keep the source and start', () => {
    const file: MelodyTrack = { source: 'file', url: '/uploads/' + 'a'.repeat(32) + '.mp3', start: 5 };
    expect(melodyClip(file, 4)).toEqual({ source: 'file', url: file.url, start: 5, duration: 4 });
    const yt: MelodyTrack = { source: 'youtube', id: 'abcdefghijk', start: 30 };
    expect(melodyClip(yt, 2)).toEqual({ source: 'youtube', id: 'abcdefghijk', start: 30, duration: 2 });
    expect(melodyRevealClip(yt).duration).toBe(MELODY_REVEAL_SECONDS);
    expect(audioSchema.safeParse(melodyClip(file, 4)).success).toBe(true);
    expect(audioSchema.safeParse(melodyRevealClip(yt)).success).toBe(true);
  });
});
