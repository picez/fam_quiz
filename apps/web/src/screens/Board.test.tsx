// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardCellView, BoardInfo } from '@quiz/shared';
import { BlitzCellNotes, Board, BoardLegend } from './Board';

afterEach(cleanup);

const cell = (id: string, over: Partial<BoardCellView> = {}): BoardCellView => ({
  id,
  price: Number(id.slice(1)) * 100,
  played: false,
  mark: 'none',
  kind: 'normal',
  answerMode: 'phone',
  penalty: 'none',
  ...over,
});

const board = (cells: BoardCellView[], more: BoardCellView[] = []): BoardInfo => ({
  categories: [
    { id: 'k1', title: 'Міста', cells },
    ...(more.length > 0 ? [{ id: 'k2', title: 'Ріки', cells: more }] : []),
  ],
  order: [],
  turn: null,
  cell: null,
  dice: null,
  schedule: [],
  scheduleRepeats: false,
  skipAt: null,
  marks: (['x2', 'x3'] as const).filter((mark) => [...cells, ...more].some((cell) => cell.mark === mark)),
  marksHidden: false,
});

describe('Board', () => {
  it('paints each open cell by its look and keeps the accessible name', () => {
    render(
      <Board
        board={board([
          cell('c1', { kind: 'normal', answerMode: 'phone' }),
          cell('c2', { kind: 'blitz', answerMode: 'phone', penalty: 'all', mark: 'x2' }),
          cell('c3', { kind: 'normal', answerMode: 'voice' }),
          cell('c4', { kind: 'blitz', answerMode: 'voice' }),
          cell('c5', { played: true, kind: 'blitz' }),
        ])}
        onPick={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Міста, 100' }).className).toContain('is-normal');
    expect(screen.getByRole('button', { name: 'Міста, 200' }).className).toContain('is-blitz');
    expect(screen.getByRole('button', { name: 'Міста, 200' }).textContent).toContain('×2');
    expect(screen.getByRole('button', { name: 'Міста, 200' }).textContent).toContain('−всім');
    expect(screen.getByRole('button', { name: 'Міста, 300' }).className).toContain('is-voice');
    expect(screen.getByRole('button', { name: 'Міста, 400' }).textContent).toContain('🎤');
    expect(document.querySelector('.gb-cell.is-played')?.className).not.toContain('is-blitz');
  });

  it('the legend lists only the kinds and marks present on the board', () => {
    render(<BoardLegend board={board([cell('c1'), cell('c2', { kind: 'blitz', mark: 'x3' })])} />);
    const items = screen.getByRole('list', { name: 'Види клітинок' }).querySelectorAll('li');
    expect([...items].map((li) => li.textContent)).toEqual(['Звичайна', 'Бліц: бали першому, хто правильно відповість', '×3 — потрійна ціна']);
  });

  it('the legend still explains ×2 and ×3 when the marks are hidden, and says where they are is a surprise', () => {
    const hidden = { ...board([cell('c1'), cell('c2')]), marks: ['x2', 'x3'], marksHidden: true } as BoardInfo;
    render(<BoardLegend board={hidden} />);
    const legend = screen.getByRole('list', { name: 'Види клітинок' });
    for (const text of ['×2 — подвійна ціна', '×3 — потрійна ціна', 'Де ×2 і ×3 — сюрприз.']) expect(within(legend).getByText(text)).toBeTruthy();
    expect(document.querySelector('.gb-mark')).toBeNull();
  });

  it('the host legend has no surprise line', () => {
    render(<BoardLegend board={board([cell('c1', { mark: 'x2' })])} />);
    expect(screen.getByText('×2 — подвійна ціна')).toBeTruthy();
    expect(screen.queryByText('Де ×2 і ×3 — сюрприз.')).toBeNull();
  });

  it('the legend counts played cells and lists the voice entry', () => {
    render(<BoardLegend board={board([cell('c1', { played: true, kind: 'blitz', answerMode: 'voice' }), cell('c2', { answerMode: 'voice' })])} />);
    const items = screen.getByRole('list', { name: 'Види клітинок' }).querySelectorAll('li');
    expect([...items].map((li) => li.textContent)).toEqual(['Бліц: бали першому, хто правильно відповість', 'Відповідь уголос', '🎤 Бліц уголос']);
  });

  it('wraps the grid in a scroll box and gives every column the title row plus all cell rows', () => {
    const { container } = render(<Board board={board([cell('c1'), cell('c2'), cell('c3')], [cell('c4'), cell('c5')])} />);
    expect(container.querySelector('.gb-scroll > .gb')).not.toBeNull();
    expect((container.querySelector('.gb') as HTMLElement).style.gridTemplateRows).toBe('auto repeat(3, var(--gb-cell-h))');
    expect((container.querySelector('.gb-col') as HTMLElement).style.gridRow).toBe('span 4');
  });
});

describe('BlitzCellNotes', () => {
  const open = (): BoardInfo => ({ ...board([]), cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none', kind: 'blitz', answerMode: 'phone', penalty: 'none' } });
  it('says everyone answers at once for an instant blitz cell, else the button rule', () => {
    const { container, rerender } = render(<BlitzCellNotes board={open()} instant />);
    expect(container.textContent).toContain('Відповідають усі одразу, перевіряємо по черзі. Хто вибрав клітинку, отримує ×2');
    rerender(<BlitzCellNotes board={open()} instant={false} />);
    expect(container.textContent).toContain('Відповідає перший, хто натисне «Відповісти»');
  });
});
