// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Standing } from '@quiz/shared';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { TableButton } from './TableSheet';

afterEach(cleanup);

const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

const rows: Standing[] = [
  { participantId: 'p2', nickname: 'Петро', score: 300, totalTimeMs: 0, rank: 1 },
  { participantId: 'p1', nickname: 'Оля', score: 100, totalTimeMs: 0, rank: 2 },
];

describe('TableButton', () => {
  it('«Таблиця» opens all places over the screen and one tap closes it', () => {
    render(<TableButton table={{ rows, full: true }} meId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    const sheet = screen.getByRole('dialog', { name: 'Таблиця' });
    expect(within(sheet).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1Петро300', '2Оля100']);
    expect(sheet.querySelector('.is-me')?.textContent).toContain('Оля');
    fireEvent.click(sheet);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes the sheet', () => {
    render(<TableButton table={{ rows, full: true }} meId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('with the table hidden till the end it shows only one’s own place', () => {
    render(<TableButton table={{ rows: [rows[1]], full: false }} meId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Повна таблиця — наприкінці гри.')).toBeTruthy();
  });

  it('the sheet is a fixed layer', () => {
    expect(rule('.table-sheet')).toContain('position: fixed');
    expect(rule('.stage-menu')).toContain('position: fixed');
  });
});
