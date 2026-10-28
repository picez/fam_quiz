import { describe, expect, it } from 'vitest';
import type { AwayMark } from '@quiz/shared';
// Стилі читаються з диска (Vitest підміняє CSS порожнім рядком); типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { awayMarkText, stageAwayText } from './away-text';

const mark = (over: Partial<AwayMark> = {}): AwayMark => ({ personId: 'p1', nickname: 'Оля', ms: 4000, count: 1, out: false, ...over });

describe('awayMarkText', () => {
  it('names the seconds and how many times', () => {
    expect(awayMarkText(mark({ ms: 12_400, count: 2 }), false)).toBe('🙈 поза грою 12 с (2 рази)');
    expect(awayMarkText(mark({ ms: 5000, count: 5 }), false)).toBe('🙈 поза грою 5 с (5 разів)');
    expect(awayMarkText(mark(), false)).toBe('🙈 поза грою 4 с (1 раз)');
  });

  it('the times follow Ukrainian plurals past ten: 11, 12 разів; 21 раз; 22 рази', () => {
    expect(awayMarkText(mark({ count: 11 }), false)).toBe('🙈 поза грою 4 с (11 разів)');
    expect(awayMarkText(mark({ count: 12 }), false)).toBe('🙈 поза грою 4 с (12 разів)');
    expect(awayMarkText(mark({ count: 21 }), false)).toBe('🙈 поза грою 4 с (21 раз)');
    expect(awayMarkText(mark({ count: 22 }), false)).toBe('🙈 поза грою 4 с (22 рази)');
  });

  it('says the person is out now, with the closed time when there is some', () => {
    expect(awayMarkText(mark({ out: true, ms: 0, count: 0 }), false)).toBe('🙈 зараз поза грою');
    expect(awayMarkText(mark({ out: true, ms: 4000, count: 1 }), false)).toBe('🙈 зараз поза грою · 4 с (1 раз)');
  });

  it('puts the name first in a team row', () => {
    expect(awayMarkText(mark(), true)).toBe('🙈 Оля: поза грою 4 с (1 раз)');
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

describe('stage away line styles', () => {
  it('one ellipsised line next to the counter', () => {
    // Тести запускаються з кореня репозиторію або з apps/web.
    const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
    const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
    const start = css.indexOf('\n.bar > .away-line {');
    expect(start).toBeGreaterThanOrEqual(0);
    const body = css.slice(start, css.indexOf('}', start));
    for (const line of ['margin-left: auto;', 'min-width: 0;', 'max-width: 45%;', 'overflow: hidden;', 'text-overflow: ellipsis;', 'white-space: nowrap;', 'color: var(--signal);']) {
      expect(body).toContain(line);
    }
  });
});
