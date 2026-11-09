// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EMPTY_DECOR, STICKERS, type Inscription, type StickerPlace, type TrophyDecor, type TrophyKind } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StickerPicker } from './StickerPicker';

afterEach(cleanup);

const photo = { url: '/uploads/aaaaaaaaaaaaaaaa.jpg', crop: { x: 0.5, y: 0.5, scale: 1 } };
const medallion = { photos: [photo], photoPlace: 'medallion' as const };
const back: Inscription = { place: 'back', text: 'x', font: null, look: 'engraved', color: '#3a2a0e' };
const first = (series: string) => STICKERS.find((s) => s.series === series)!;
const open = STICKERS.filter((s) => s.series === 'nya');
/** Наліпки на місцях: id — відкриті наліпки першої серії по черзі. */
const stickers = (...places: StickerPlace[]) => places.map((place, i) => ({ id: open[i]!.id, place }));
const decorOf = (over: Partial<TrophyDecor>): TrophyDecor => ({ ...EMPTY_DECOR, ...over });

function show(kind: TrophyKind, decor: TrophyDecor, { level = 1, kept }: { level?: number; kept?: readonly string[] } = {}) {
  const onPick = vi.fn();
  render(<StickerPicker kind={kind} decor={decor} level={level} onPick={onPick} kept={kept} />);
  return onPick;
}

const addButton = () => screen.getByRole('button', { name: '+ Додати наліпку' }) as HTMLButtonElement;
const dialog = () => screen.getByRole('dialog');
const places = () => within(dialog()).getByRole('group', { name: 'Куди наліпити' });
const radio = (name: string) => within(places()).getByRole('radio', { name: new RegExp(`^${name}`) }) as HTMLInputElement;
const done = () => within(dialog()).getByRole('button', { name: 'Готово' }) as HTMLButtonElement;
const rows = () => screen.queryAllByRole('listitem').filter((li) => li.classList.contains('studio-sticker-row'));

describe('StickerPicker', () => {
  it('adds a sticker through the dialog on a free place', () => {
    const onPick = show('cup', decorOf(medallion));
    fireEvent.click(addButton());
    expect(within(dialog()).getByRole('heading', { name: 'Нова наліпка' })).toBeTruthy();
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(dialog().getAttribute('aria-labelledby')).toBe(within(dialog()).getByRole('heading', { name: 'Нова наліпка' }).id);
    expect(done().disabled).toBe(true);
    const nya = first('nya');
    const cell = within(within(dialog()).getByRole('group', { name: 'Наліпка' })).getByRole('button', { name: nya.id });
    expect(cell.querySelector('img')!.getAttribute('src')).toBe(`/stickers/${nya.id}.${nya.ext}`);
    expect(cell.querySelector('img')!.getAttribute('loading')).toBe('lazy');
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    const front = radio('Спереду');
    expect(front.disabled).toBe(true);
    expect(front.closest('label')!.textContent).toContain('Зайнято: Медальйон спереду');
    expect(document.getElementById(front.getAttribute('aria-describedby')!)!.textContent).toBe('Зайнято: Медальйон спереду');
    // За замовчуванням — перше вільне місце.
    expect(radio('Ззаду').checked).toBe(true);
    expect(done().disabled).toBe(false);
    fireEvent.click(radio('Ліворуч'));
    fireEvent.click(done());
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenLastCalledWith('left', nya.id, undefined);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('locked stickers show their level and cannot be picked', () => {
    show('medal', decorOf({}), { level: 1 });
    fireEvent.click(addButton());
    const grid = within(dialog()).getByRole('group', { name: 'Наліпка' });
    const nyaa = first('nyaa');
    const cell = within(grid).getByRole('button', { name: `${nyaa.id} 🔒 з рівня 3` }) as HTMLButtonElement;
    expect(cell.disabled).toBe(true);
    expect(cell.querySelector('[aria-hidden="true"]')!.textContent).toBe('🔒 3');
    expect(cell.querySelector('.sr-only:last-child')!.textContent).toBe('🔒 з рівня 3');
    // Закриті наліпки не вантажать свої gif.
    expect(cell.querySelector('img')).toBeNull();
    expect(within(grid).queryByAltText(nyaa.id)).toBeNull();
    expect((within(grid).getByRole('button', { name: first('nya').id }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('kept stickers and the one being changed stay pickable', () => {
    const nyaa = STICKERS.filter((s) => s.series === 'nyaa');
    show('medal', decorOf({ stickers: [{ id: nyaa[1]!.id, place: 'back' }] }), { level: 1, kept: [nyaa[0]!.id] });
    fireEvent.click(addButton());
    let grid = within(dialog()).getByRole('group', { name: 'Наліпка' });
    expect((within(grid).getByRole('button', { name: nyaa[0]!.id }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(grid).queryByRole('button', { name: nyaa[1]!.id })).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Скасувати' }));
    fireEvent.click(within(rows()[0]!).getByRole('button', { name: 'Змінити' }));
    expect(within(dialog()).getByRole('heading', { name: 'Змінити наліпку' })).toBeTruthy();
    grid = within(dialog()).getByRole('group', { name: 'Наліпка' });
    const current = within(grid).getByRole('button', { name: nyaa[1]!.id }) as HTMLButtonElement;
    expect(current.disabled).toBe(false);
    expect(current.getAttribute('aria-pressed')).toBe('true');
  });

  it('lists added stickers with the moved place', () => {
    const decor = decorOf({ ...medallion, stickers: stickers('front') });
    const onPick = show('cup', decor);
    const [row] = rows();
    expect(rows()).toHaveLength(1);
    expect(row!.querySelector('img')!.getAttribute('alt')).toBe(open[0]!.id);
    expect(row!.querySelector('img')!.getAttribute('width')).toBe('32');
    expect(row!.textContent).toContain('Ліворуч');
    expect(row!.textContent).toContain('Місце «Спереду» зайняте (Медальйон спереду), тому тут: «Ліворуч».');
    fireEvent.click(within(row!).getByRole('button', { name: 'Прибрати' }));
    expect(onPick).toHaveBeenLastCalledWith('front', null);
  });

  it('change keeps its own place free', () => {
    const onPick = show('cup', decorOf({ ...medallion, stickers: stickers('front') }));
    fireEvent.click(within(rows()[0]!).getByRole('button', { name: 'Змінити' }));
    expect(radio('Ліворуч').disabled).toBe(false);
    expect(radio('Праворуч').disabled).toBe(false);
    expect(radio('Спереду').disabled).toBe(true);
    expect(radio('Ліворуч').checked).toBe(true);
    fireEvent.click(radio('Праворуч'));
    fireEvent.click(done());
    expect(onPick).toHaveBeenLastCalledWith('right', open[0]!.id, 'front');
  });

  it('a sticker on its own place changes without from', () => {
    const onPick = show('cup', decorOf({ stickers: stickers('back') }));
    fireEvent.click(within(rows()[0]!).getByRole('button', { name: 'Змінити' }));
    expect(radio('Ззаду').checked).toBe(true);
    fireEvent.click(within(within(dialog()).getByRole('group', { name: 'Наліпка' })).getByRole('button', { name: open[3]!.id }));
    fireEvent.click(done());
    expect(onPick).toHaveBeenLastCalledWith('back', open[3]!.id, undefined);
  });

  it('a dropped sticker says it does not fit', () => {
    const onPick = show('star', decorOf({ ...medallion, inscriptions: [back], stickers: stickers('front', 'back', 'left', 'right', 'base-left') }));
    const dropped = rows().find((li) => li.textContent!.includes('Не вміщується'))!;
    expect(dropped.textContent).toContain('Не вміщується: «Ззаду» зайняте (Зворот), вільного місця немає.');
    fireEvent.click(within(dropped).getByRole('button', { name: 'Прибрати' }));
    expect(onPick).toHaveBeenLastCalledWith('back', null);
  });

  it('add is disabled when there is no room or the limit is reached', () => {
    show('cup', decorOf({ stickers: stickers('front', 'back', 'left', 'right', 'base-left', 'base-right') }));
    expect(addButton().disabled).toBe(true);
    const max = 'Наліпок уже 6 — більше не можна.';
    expect(screen.getByText(max)).toBeTruthy();
    expect(document.getElementById(addButton().getAttribute('aria-describedby')!)!.textContent).toBe(max);
    cleanup();
    show('star', decorOf({ ...medallion, inscriptions: [back], stickers: stickers('front', 'base-left') }));
    expect(addButton().disabled).toBe(true);
    expect(screen.getByText('Вільних місць немає — приберіть щось, щоб додати наліпку.')).toBeTruthy();
    cleanup();
    show('cup', decorOf({}));
    expect(addButton().disabled).toBe(false);
    expect(addButton().hasAttribute('aria-describedby')).toBe(false);
  });

  it('only shown stickers are listed after a shape change', () => {
    show('medal', decorOf({ stickers: stickers('base-left') }));
    expect(rows()).toHaveLength(0);
    fireEvent.click(addButton());
    expect(within(places()).getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual(['Спереду', 'Ззаду', 'Ліворуч', 'Праворуч']);
  });

  it('Escape and Cancel close without a pick', () => {
    const onPick = show('cup', decorOf({}));
    fireEvent.click(addButton());
    expect(document.activeElement).toBe(dialog());
    fireEvent.click(within(dialog()).getByRole('button', { name: first('nya').id }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(addButton());
    fireEvent.click(addButton());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Скасувати' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(addButton());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Tab stays inside the dialog', () => {
    show('cup', decorOf({}));
    fireEvent.click(addButton());
    const cancel = within(dialog()).getByRole('button', { name: 'Скасувати' });
    fireEvent.click(within(dialog()).getByRole('button', { name: first('nya').id }));
    done().focus();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(done());
    cancel.focus();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(document.activeElement).toBe(done());
  });
});
