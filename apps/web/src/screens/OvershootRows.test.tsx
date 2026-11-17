// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
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
    render(<OvershootRows rows={rows} />);
    expect(screen.getByText(t('overshootRowsTitle'))).toBeTruthy();
    expect(textOf(rowOf('Оля'))).toBe('Оля 85 +1000');
    expect(textOf(rowOf('Петро'))).toBe('Петро 80 0');
    expect(textOf(rowOf('Тарас'))).toBe(`Тарас 90 ${t('overshootOver')}`);
    expect(rowOf('Тарас').className).toContain('overshoot-over');
    expect(rowOf('Оля').className).not.toContain('overshoot-over');
    // Межа стоїть між тими, хто знизу, і тими, хто перебільшив.
    const items = [...document.querySelectorAll('.overshoot-rows > li')].map((li) => li.textContent);
    expect(items[2]).toBe('');
  });

  it('no limit line when nobody overshot; the own row stands out', () => {
    render(<OvershootRows rows={rows.slice(0, 2)} mine="p2" />);
    expect(document.querySelector('.overshoot-limit')).toBeNull();
    expect(rowOf('Петро').className).toContain('is-me');
  });

  it('more than 12 rows go into columns on the stage', () => {
    const many = (n: number): OvershootRow[] => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, nickname: `n${i}`, value: 80 + i, over: 80 + i > 88, points: 0 }));
    const { unmount } = render(<OvershootRows rows={many(12)} />);
    expect(document.querySelector('.overshoot-rows')!.className).not.toContain('is-many');
    unmount();
    render(<OvershootRows rows={many(13)} />);
    expect(document.querySelector('.overshoot-rows')!.className).toContain('is-many');
    const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
    const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
    expect(css).toMatch(/\.stage \.overshoot-rows\.is-many \{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.stage \.overshoot-rows\.is-many \.overshoot-limit \{[^}]*grid-column:\s*1 \/ -1/);
  });
});
