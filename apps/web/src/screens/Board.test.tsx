// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardCellView, BoardInfo } from '@quiz/shared';
import { Board, BoardLegend } from './Board';

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
  rolls: 0,
  skipAt: null,
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
    expect([...items].map((li) => li.textContent)).toEqual(['Звичайна', 'Бліц: відповідає перший, хто натисне', '×3 — потрійна ціна']);
  });

  it('wraps the grid in a scroll box and gives every column the title row plus all cell rows', () => {
    const { container } = render(<Board board={board([cell('c1'), cell('c2'), cell('c3')], [cell('c4'), cell('c5')])} />);
    expect(container.querySelector('.gb-scroll > .gb')).not.toBeNull();
    expect((container.querySelector('.gb') as HTMLElement).style.gridTemplateRows).toBe('auto repeat(3, var(--gb-cell-h))');
    expect((container.querySelector('.gb-col') as HTMLElement).style.gridRow).toBe('span 4');
  });
});
