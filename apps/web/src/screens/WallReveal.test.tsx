// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { WallReveal } from './WallReveal';
import { WallTable } from './WallTable';

afterEach(cleanup);

const names = ['Річки', 'Міста', 'Гори', 'Озера'];
const wall: Extract<Question, { type: 'wall' }> = {
  id: 'w',
  type: 'wall',
  text: 'Стіна',
  imageUrl: null,
  video: null,
  timeLimit: 90,
  points: 1000,
  mistakes: 3,
  groups: names.map((name, g) => ({ id: `g${g}`, name, tiles: [0, 1, 2, 3].map((n) => ({ id: `t${g}${n}`, text: `${name}${n}` })) })),
};

describe('WallReveal', () => {
  it('shows a row per group with its name and tiles, colours in group order', () => {
    const { container } = render(<WallReveal question={wall} />);
    const rows = [...container.querySelectorAll('li')];
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(names);
    expect(rows[1].textContent).toContain('Міста0, Міста1, Міста2, Міста3');
    rows.forEach((row, index) => expect(row.classList.contains(`wall-color-${index}`)).toBe(true));
  });

  it('the big variant is marked for the stage', () => {
    const { container } = render(<WallReveal question={wall} big />);
    expect(container.querySelector('.wall-reveal.is-big')).not.toBeNull();
  });
});

describe('WallTable', () => {
  it('lists players with groups, mistakes, solved and locked marks, and points on the reveal', () => {
    render(
      <WallTable
        info={{
          groupCount: 4,
          rows: [
            { playerId: 'p1', nickname: 'Олена', found: 4, mistakes: 1, locked: false, solved: true, points: 750, tiles: null },
            { playerId: 'p2', nickname: 'Тарас', found: 2, mistakes: 3, locked: true, solved: false, points: 500, tiles: null },
          ],
        }}
      />,
    );
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('склав')).toBeTruthy();
    expect(screen.getByText('замкнено')).toBeTruthy();
    expect(screen.getByText('4 / 4')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Бали' })).toBeTruthy();
  });

  it('the player column has a visually hidden header', () => {
    const { container } = render(<WallTable info={{ groupCount: 3, rows: [] }} />);
    expect(container.querySelector('th .sr-only')?.textContent).toBe('Гравець');
  });

  it('on the stage 30 players show the best rows and a +K ще line instead of clipping silently', () => {
    const rows = Array.from({ length: 30 }, (_, n) => ({ playerId: `p${n}`, nickname: `Гравець${n}`, found: 3, mistakes: n, locked: false, solved: false, points: 750, tiles: null }));
    const { container } = render(<WallTable info={{ groupCount: 4, rows }} compact />);
    expect(container.querySelectorAll('tbody tr:not(.wall-table-more)')).toHaveLength(14);
    expect(screen.getByText('Гравець0')).toBeTruthy();
    expect(screen.queryByText('Гравець14')).toBeNull();
    expect(screen.getByText('+16 ще')).toBeTruthy();
    expect(container.querySelector('.wall-table.is-compact.is-tight')).not.toBeNull();
  });

  it('on the stage a few players are all shown without the remainder line', () => {
    const rows = Array.from({ length: 5 }, (_, n) => ({ playerId: `p${n}`, nickname: `Гравець${n}`, found: 1, mistakes: 0, locked: false, solved: false, points: null, tiles: null }));
    const { container } = render(<WallTable info={{ groupCount: 4, rows }} compact />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(container.querySelector('.is-tight')).toBeNull();
    expect(screen.queryByText(/ще$/)).toBeNull();
  });

  it('has no points column while the points are unknown', () => {
    render(<WallTable info={{ groupCount: 3, rows: [{ playerId: 'p1', nickname: 'Олена', found: 1, mistakes: 0, locked: false, solved: false, points: null, tiles: null }] }} />);
    expect(screen.queryByRole('columnheader', { name: 'Бали' })).toBeNull();
  });
});
