// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { OvershootRow } from '@quiz/shared';
import { t } from '../i18n';
import { OvershootRows } from './OvershootRows';

afterEach(cleanup);

const rows: OvershootRow[] = [
  { playerId: 'p1', nickname: 'Оля', value: 85, over: false, points: 1000 },
  { playerId: 'p2', nickname: 'Петро', value: 80, over: false, points: 0 },
  { playerId: 'p3', nickname: 'Тарас', value: 90, over: true, points: 0 },
];

const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
const textOf = (el: HTMLElement) => [...el.children].map((child) => child.textContent).join(' ');

describe('OvershootRows (37d)', () => {
  it('marks who overshot', () => {
    render(<OvershootRows rows={rows} correct={88} />);
    expect(screen.getByText(t('overshootRowsTitle'))).toBeTruthy();
    expect(textOf(rowOf('Оля'))).toBe('Оля 85 +1000');
    expect(textOf(rowOf('Петро'))).toBe('Петро 80 0');
    expect(textOf(rowOf('Тарас'))).toBe(`Тарас 90 ${t('overshootOver')}`);
    expect(rowOf('Тарас').className).toContain('overshoot-over');
    expect(rowOf('Оля').className).not.toContain('overshoot-over');
    // Межа стоїть між тими, хто знизу, і тими, хто перебільшив.
    const items = [...document.querySelectorAll('.overshoot-rows > li')].map((li) => li.textContent);
    expect(items[2]).toBe(t('overshootCorrect', { correct: 88 }));
  });

  it('no limit line when nobody overshot; the own row stands out', () => {
    render(<OvershootRows rows={rows.slice(0, 2)} correct={88} mine="p2" />);
    expect(document.querySelector('.overshoot-limit')).toBeNull();
    expect(rowOf('Петро').className).toContain('is-me');
  });
});
