import { describe, expect, it } from 'vitest';
import { answerWindowMs } from '@quiz/shared';
import { blurRadius, pixelColumns, publicWindowMs, revealProgress, revealStage } from './reveal';

const NOW = 1_000_000;
const q = { timeLimit: 20, audio: null };
const clock = (over: Partial<Parameters<typeof revealProgress>[0]>) => ({ phase: 'question' as const, endsAt: null, remainingMs: null, limitMs: 20_000, ...over });

describe('reveal', () => {
  it('stages', () => {
    expect(revealStage(0)).toBe(0);
    expect(revealStage(0.55)).toBe(5);
    expect(revealStage(1)).toBe(10);
  });

  it('pixel columns and blur radius per stage', () => {
    expect(pixelColumns(0)).toBe(6);
    expect(pixelColumns(9)).toBe(124);
    expect(pixelColumns(10)).toBeNull();
    expect(blurRadius(0)).toBe(28);
    expect(blurRadius(10)).toBe(0);
  });

  it('progress counts from the start of the timer, without pauses or extra time', () => {
    expect(revealProgress(clock({ endsAt: NOW + 15_000 }), q, NOW)).toBe(0.25);
    expect(revealProgress(clock({ remainingMs: 5_000 }), q, NOW)).toBe(0.75);
    expect(revealProgress(clock({ limitMs: 35_000, remainingMs: 25_000 }), q, NOW)).toBe(0.5);
    expect(revealProgress(clock({ phase: 'locked', endsAt: NOW + 15_000 }), q, NOW)).toBe(1);
    expect(revealProgress(clock({ endsAt: NOW + 30_000 }), q, NOW)).toBe(0);
  });

  it('a long clip widens the window', () => {
    const long = { timeLimit: 20, audio: { duration: 30, clip: null } };
    expect(publicWindowMs(long)).toBe(50_000);
    expect(revealProgress(clock({ limitMs: 50_000, endsAt: NOW + 25_000 }), long, NOW)).toBe(0.5);
  });

  it('publicWindowMs matches answerWindowMs from shared', () => {
    const file = { source: 'file' as const, url: '/uploads/ab.mp3', start: 0, duration: 30 };
    const short = { source: 'file' as const, url: '/uploads/ab.mp3', start: 0, duration: 5 };
    for (const [timeLimit, audio] of [[20, undefined], [20, file], [20, short]] as const) {
      expect(publicWindowMs({ timeLimit, audio: audio ? { duration: audio.duration, clip: null } : null })).toBe(answerWindowMs({ timeLimit, audio }));
    }
  });
});
