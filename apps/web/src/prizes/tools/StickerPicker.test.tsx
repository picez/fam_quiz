// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { STICKERS, type TrophyDecor, type TrophyKind } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StickerPicker } from './StickerPicker';

afterEach(cleanup);

function open(kind: TrophyKind, { level = 1, stickers = [], kept }: { level?: number; stickers?: TrophyDecor['stickers']; kept?: readonly string[] } = {}) {
  const onPick = vi.fn();
  render(<StickerPicker kind={kind} stickers={stickers} level={level} onPick={onPick} kept={kept} />);
  return onPick;
}

const first = (series: string) => STICKERS.find((s) => s.series === series)!;
const placeButtons = () => screen.getAllByRole('button', { expanded: false });

describe('StickerPicker', () => {
  it('places follow the kind', () => {
    open('medal');
    expect(placeButtons().map((b) => b.textContent)).toEqual(['Спереду', 'Ззаду', 'Ліворуч', 'Праворуч']);
    cleanup();
    open('cup');
    expect(placeButtons()).toHaveLength(6);
    expect(screen.getByRole('button', { name: /Основа праворуч/ })).toBeTruthy();
  });

  it('pick and clear', () => {
    const onPick = open('medal');
    const front = screen.getByRole('button', { name: /Спереду/ });
    fireEvent.click(front);
    expect(front.getAttribute('aria-expanded')).toBe('true');
    const grid = screen.getByRole('group', { name: /Спереду/ });
    const nya = first('nya');
    const cell = within(grid).getByRole('button', { name: nya.id });
    expect(cell.querySelector('img')!.getAttribute('src')).toBe(`/stickers/${nya.id}.${nya.ext}`);
    fireEvent.click(cell);
    expect(onPick).toHaveBeenLastCalledWith('front', nya.id);
    fireEvent.click(within(screen.getByRole('group', { name: /Спереду/ })).getByRole('button', { name: 'Без наліпки' }));
    expect(onPick).toHaveBeenLastCalledWith('front', null);
  });

  it('shows the current sticker on its place', () => {
    const nya = first('nya');
    open('medal', { stickers: [{ id: nya.id, place: 'back' }] });
    const back = screen.getByRole('button', { name: /Ззаду/ });
    expect(back.querySelector('img')!.getAttribute('alt')).toBe(nya.id);
    fireEvent.click(back);
    expect(within(screen.getByRole('group', { name: /Ззаду/ })).getByRole('button', { name: nya.id }).getAttribute('aria-pressed')).toBe('true');
  });

  it('locked series', () => {
    open('medal', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Спереду/ }));
    const grid = screen.getByRole('group', { name: /Спереду/ });
    const nyaa = first('nyaa');
    const cell = within(grid).getByAltText(nyaa.id).closest('button')!;
    expect(cell.disabled).toBe(true);
    expect(cell.querySelector('[aria-hidden="true"]')!.textContent).toBe('🔒 3');
    expect(cell.querySelector('.sr-only')!.textContent).toBe('🔒 з рівня 3');
    expect((within(grid).getByRole('button', { name: first('nya').id }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a sticker kept in this prize stays pickable', () => {
    const nyaa = first('nyaa');
    open('medal', { level: 1, kept: [nyaa.id] });
    fireEvent.click(screen.getByRole('button', { name: /Ліворуч/ }));
    const grid = screen.getByRole('group', { name: /Ліворуч/ });
    expect((within(grid).getByRole('button', { name: nyaa.id }) as HTMLButtonElement).disabled).toBe(false);
  });
});
