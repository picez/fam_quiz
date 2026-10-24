// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicWall } from '@quiz/shared';
import { WallGrid } from './WallGrid';

afterEach(cleanup);

const wall: PublicWall = {
  tiles: Array.from({ length: 16 }, (_, i) => `Плитка ${i}`),
  size: 4,
  groupCount: 4,
  maxMistakes: 3,
};

const texts = () => [...document.querySelectorAll('.wall-tile')].map((el) => el.textContent);

describe('WallGrid', () => {
  it('shows 16 tiles in the shown order', () => {
    render(<WallGrid wall={wall} found={[]} onToggle={() => {}} />);
    expect(texts()).toEqual(wall.tiles);
    expect(document.querySelector<HTMLElement>('.wall-grid')!.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });

  it('puts a found group first as a coloured row, the rest keep their order', () => {
    render(<WallGrid wall={wall} found={[{ tiles: [3, 7, 9, 12], color: 0 }]} onToggle={() => {}} />);
    const tiles = [...document.querySelectorAll('.wall-tile')];
    expect(tiles.slice(0, 4).map((el) => el.textContent)).toEqual(['Плитка 3', 'Плитка 7', 'Плитка 9', 'Плитка 12']);
    expect(tiles.slice(0, 4).every((el) => el.classList.contains('wall-color-0') && el.classList.contains('is-found'))).toBe(true);
    expect(tiles.slice(4).map((el) => el.textContent)).toEqual(wall.tiles.filter((_, i) => ![3, 7, 9, 12].includes(i)));
    expect(tiles.slice(0, 4).every((el) => el.tagName === 'DIV')).toBe(true);
  });

  it('without onToggle the tiles are not buttons; with it they toggle by position', () => {
    const { unmount } = render(<WallGrid wall={wall} found={[]} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    unmount();
    const onToggle = vi.fn();
    render(<WallGrid wall={wall} found={[]} selected={[2]} onToggle={onToggle} />);
    expect(screen.getAllByRole('button')).toHaveLength(16);
    expect(screen.getByRole('button', { name: 'Плитка 2' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Плитка 5' }));
    expect(onToggle).toHaveBeenCalledWith(5);
  });

  it('picks the font step by the longest word', () => {
    render(<WallGrid wall={{ ...wall, tiles: ['Коротко', 'Дуже довгий текст плитки', 'Фортепіано', "Дев'ятнадцять", 'Джарилгач', ...wall.tiles.slice(5)] }} found={[]} />);
    const cls = (text: string) => screen.getByLabelText(text).className;
    expect(cls('Коротко')).not.toMatch(/is-(semi|mid|long)/);
    expect(cls('Дуже довгий текст плитки')).not.toMatch(/is-(semi|mid|long)/);
    expect(cls('Джарилгач')).toMatch(/is-semi/);
    expect(cls('Фортепіано')).toMatch(/is-mid/);
    expect(cls("Дев'ятнадцять")).toMatch(/is-long/);
  });
});
