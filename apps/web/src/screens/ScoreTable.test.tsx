// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScoreBreakdown } from '@quiz/shared';
import { RoundHighlights, ScoreTable, type ScoreRow } from './ScoreTable';
import { teamsView } from './team-test-view';

afterEach(cleanup);

const rows: ScoreRow[] = [
  { participantId: 'a', nickname: 'Оля', rank: 1, score: 50, rounds: [1050, -1000] },
  { participantId: 'b', nickname: 'Петро', rank: 2, score: 0, rounds: [-1000, 1000] },
];
const breakdown: ScoreBreakdown = {
  parts: [
    { source: 'answers', plus: 1000, minus: -1000 },
    { source: 'host', plus: 50, minus: 0 },
  ],
  plus: 1050,
  minus: -1000,
};

function cells(tr: Element, selector: string): string[] {
  return Array.from(tr.querySelectorAll(selector)).map((cell) => cell.textContent ?? '');
}

describe('ScoreTable', () => {
  it('has a column per round and the total', () => {
    const { container } = render(<ScoreTable rows={rows} size="phone" breakdowns={{}} />);
    expect(cells(container.querySelector('thead tr')!, 'th')).toEqual(['#', 'Учасник', 'Р1', 'Р2', 'Σ']);
    const first = container.querySelector('tr.score-row')!;
    expect(cells(first, 'td.round')).toEqual(['1050', '−1000']);
    expect(first.querySelector('td.total')!.textContent).toBe('50');
  });

  it('a shorter rounds list leaves a dash', () => {
    const { container } = render(<ScoreTable rows={[rows[0], { ...rows[1], rounds: [5] }]} size="phone" breakdowns={{}} />);
    expect(cells(container.querySelectorAll('tr.score-row')[1], 'td.round')).toEqual(['5', '–']);
  });

  it('only a row with a breakdown opens it; tapping again closes it', () => {
    const { container } = render(<ScoreTable rows={rows} size="phone" breakdowns={{ a: breakdown }} />);
    const toggles = container.querySelectorAll('button.score-row-toggle');
    expect(toggles).toHaveLength(1);
    expect(toggles[0].closest('tr')!.getAttribute('class')).toContain('score-row');
    fireEvent.click(toggles[0]);
    const open = container.querySelector('tr.score-breakdown-row')!;
    expect(open.textContent).toContain('Плюс 1050 · мінус 1000');
    expect(open.textContent).toContain('Відповіді +1000');
    expect(open.textContent).toContain('Помилки −1000');
    expect(open.textContent).toContain('Ведучий +50');
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggles[0]);
    expect(container.querySelector('tr.score-breakdown-row')).toBeNull();
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('an empty breakdown says there are no points yet', () => {
    const { container } = render(<ScoreTable rows={rows} size="phone" breakdowns={{ a: { parts: [], plus: 0, minus: 0 } }} />);
    fireEvent.click(container.querySelector('button.score-row-toggle')!);
    expect(screen.getByText('Балів ще немає.')).toBeTruthy();
  });

  it('the own row is marked', () => {
    const { container } = render(<ScoreTable rows={rows} size="phone" breakdowns={{}} highlightId="b" />);
    expect(container.querySelector('tr.score-row.is-me')!.textContent).toContain('Петро');
  });

  it('a team shows its people under the name, a history row too', () => {
    const { container } = render(<ScoreTable rows={[{ participantId: 'team-b', nickname: 'Сині', rank: 1, score: 5 }]} size="phone" breakdowns={{}} teams={teamsView()} />);
    expect(container.querySelector('.standing-members')!.textContent).toBe('Оля, Петро, Ната');
    cleanup();
    const history = render(<ScoreTable rows={[{ participantId: 'x', nickname: 'Сині', rank: 1, score: 5, members: ['Оля', 'Ната'] }]} size="history" breakdowns={{}} />);
    expect(history.container.querySelector('.standing-members')!.textContent).toBe('Оля, Ната');
  });

  it('round titles go into the headers', () => {
    const { container } = render(<ScoreTable rows={rows} size="history" breakdowns={{}} roundTitles={['Розминка', 'Ривок']} />);
    expect(container.querySelector('th.round')!.getAttribute('title')).toBe('Розминка');
  });

  it('round highlights are null when there is neither a best nor a climb', () => {
    const flat = [
      { participantId: 'a', nickname: 'Оля', rank: 1, score: 0, totalTimeMs: 1, rounds: [0] },
      { participantId: 'b', nickname: 'Петро', rank: 1, score: 0, totalTimeMs: 1, rounds: [0] },
    ];
    const { container } = render(<RoundHighlights standings={flat} roundIndex={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('the wrap is a labelled scrollable region', () => {
    const { container } = render(<ScoreTable rows={rows} size="phone" breakdowns={{}} />);
    const wrap = container.querySelector('.score-table-wrap.is-phone')!;
    expect(wrap.getAttribute('role')).toBe('region');
    expect(wrap.getAttribute('aria-label')).toBe('Бали за раундами');
  });
});
