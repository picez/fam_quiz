import { describe, expect, it } from 'vitest';
import type { AwayMark } from '@quiz/shared';
import { awayMarkText, stageAwayText } from './away-text';

const mark = (over: Partial<AwayMark> = {}): AwayMark => ({ personId: 'p1', nickname: 'Оля', ms: 4000, count: 1, out: false, ...over });

describe('awayMarkText', () => {
  it('names the seconds and how many times', () => {
    expect(awayMarkText(mark({ ms: 12_400, count: 2 }), false)).toBe('🙈 відволікався 12 с (2 рази)');
    expect(awayMarkText(mark({ ms: 5000, count: 5 }), false)).toBe('🙈 відволікався 5 с (5 разів)');
    expect(awayMarkText(mark(), false)).toBe('🙈 відволікався 4 с (1 раз)');
  });

  it('says the person is out now, with the closed time when there is some', () => {
    expect(awayMarkText(mark({ out: true, ms: 0, count: 0 }), false)).toBe('🙈 зараз поза грою');
    expect(awayMarkText(mark({ out: true, ms: 4000, count: 1 }), false)).toBe('🙈 зараз поза грою · 4 с (1 раз)');
  });

  it('puts the name first in a team row', () => {
    expect(awayMarkText(mark(), true)).toBe('🙈 Оля: відволікався 4 с (1 раз)');
    expect(awayMarkText(mark({ out: true, ms: 0, count: 0 }), true)).toBe('🙈 Оля: зараз поза грою');
    expect(awayMarkText(mark({ out: true, ms: 3000, count: 2 }), true)).toBe('🙈 Оля: зараз поза грою · 3 с (2 рази)');
  });
});

describe('stageAwayText', () => {
  it('lists the names, empty without any', () => {
    expect(stageAwayText(['Оля', 'Петро'])).toBe('🙈 Оля, Петро');
    expect(stageAwayText([])).toBe('');
  });
});
