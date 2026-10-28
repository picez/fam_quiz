// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Standing } from '@quiz/shared';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { TableButton } from './TableSheet';
import { teamsView } from './team-test-view';

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
    render(<TableButton table={{ rows, full: true, firstRound: 0 }} meId="p1" breakdown={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    const sheet = screen.getByRole('dialog', { name: 'Таблиця' });
    expect(Array.from(sheet.querySelectorAll('tr.score-row')).map((tr) => tr.textContent)).toEqual(['1Петро300', '2Оля100']);
    expect(sheet.querySelector('.is-me')?.textContent).toContain('Оля');
    fireEvent.click(sheet);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a column per round', () => {
    const withRounds = rows.map((row, i) => ({ ...row, rounds: i === 0 ? [100, 200] : [50, 50] }));
    render(<TableButton table={{ rows: withRounds, full: true, firstRound: 0 }} meId="p1" breakdown={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    const sheet = screen.getByRole('dialog');
    expect(Array.from(sheet.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['#', 'Учасник', 'Р1', 'Р2', 'Σ']);
  });

  it('only the own row opens its breakdown and the sheet stays open', () => {
    const breakdown = { parts: [{ source: 'answers' as const, plus: 400, minus: 0 }], plus: 400, minus: 0 };
    render(<TableButton table={{ rows, full: true, firstRound: 0 }} meId="p1" breakdown={breakdown} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    const sheet = screen.getByRole('dialog');
    const toggles = sheet.querySelectorAll('button.score-row-toggle');
    expect(toggles).toHaveLength(1);
    expect(toggles[0].closest('tr')!.textContent).toContain('Оля');
    fireEvent.click(toggles[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(sheet).getByText('Відповіді')).toBeTruthy();
    expect(sheet.querySelector('.score-breakdown-sum')!.textContent).toBe('Плюс 400 · мінус 0');
  });

  it('a tap on the sheet title still closes it', () => {
    render(<TableButton table={{ rows, full: true, firstRound: 0 }} meId="p1" breakdown={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    fireEvent.click(screen.getByRole('heading', { name: 'Таблиця' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('without a breakdown there is no button', () => {
    render(<TableButton table={{ rows, full: true, firstRound: 0 }} meId="p1" breakdown={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    expect(screen.getByRole('dialog').querySelector('button.score-row-toggle')).toBeNull();
  });

  it('Escape closes the sheet', () => {
    render(<TableButton table={{ rows, full: true, firstRound: 0 }} meId="p1" breakdown={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes the sheet even when focus has left it; the dialog itself can take focus', () => {
    render(<TableButton table={{ rows, full: true, firstRound: 0 }} meId="p1" breakdown={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    expect(screen.getByRole('dialog').getAttribute('tabindex')).toBe('-1');
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Після закриття — без зайвих слухачів: Escape нічого не ламає.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Таблиця' }));
  });

  it('focus stays inside the open sheet: Tab and Shift+Tab come back to «Закрити»', () => {
    render(<TableButton table={{ rows, full: true, firstRound: 0 }} meId="p1" breakdown={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    const sheet = screen.getByRole('dialog');
    const close = within(sheet).getByRole('button', { name: 'Закрити' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
    sheet.focus();
    expect(document.activeElement).toBe(sheet);
    fireEvent.keyDown(sheet, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  it('with the table hidden till the end it shows only one’s own place', () => {
    const breakdown = { parts: [{ source: 'host' as const, plus: 100, minus: 0 }], plus: 100, minus: 0 };
    render(<TableButton table={{ rows: [rows[1]], full: false, firstRound: 0 }} meId="p1" breakdown={breakdown} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    const sheet = screen.getByRole('dialog');
    expect(sheet.querySelectorAll('tr.score-row')).toHaveLength(1);
    expect(screen.getByText('Повна таблиця — наприкінці гри.')).toBeTruthy();
    fireEvent.click(sheet.querySelector('button.score-row-toggle')!);
    expect(within(sheet).getByText('Ведучий')).toBeTruthy();
  });

  it('in a team game the people stand under the team name', () => {
    render(<TableButton table={{ rows: [{ participantId: 'team-b', nickname: 'Сині', score: 300, totalTimeMs: 0, rank: 1 }], full: true, firstRound: 0 }} meId="team-b" teams={teamsView()} breakdown={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця' }));
    const row = screen.getByRole('dialog').querySelector('.score-table tr.score-row')!;
    expect(row.querySelector('.standing-members')!.textContent).toBe('Оля, Петро, Ната');
  });

  it('the sheet is a fixed layer', () => {
    expect(rule('.table-sheet')).toContain('position: fixed');
    expect(rule('.stage-menu')).toContain('position: fixed');
  });
});
