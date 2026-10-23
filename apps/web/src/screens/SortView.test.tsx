// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerSort, PublicQuestion } from '@quiz/shared';
import type { Send } from '../live/types';
import { SortPlay, swipeTarget, zonePositions } from './SortView';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const CATEGORIES = [
  { id: 'c1', text: 'Овочі' },
  { id: 'c2', text: 'Фрукти' },
  { id: 'c3', text: 'Ягоди' },
  { id: 'c4', text: 'Горіхи' },
];

const sortQuestion = (count: number): PublicQuestion => ({
  type: 'sort',
  text: 'Розкладіть',
  imageUrl: null,
  video: null,
  timeLimit: 60,
  points: 100,
  choices: [],
  right: [],
  orderLabels: null,
  chain: null,
  sort: { categories: CATEGORIES.slice(0, count), total: 4, lockSeconds: 3 },
});

const playerSort = (patch: Partial<PlayerSort> = {}): PlayerSort => ({
  card: { id: 'w1', text: 'Морква' },
  sorted: 0,
  total: 4,
  misses: 0,
  lockedUntil: null,
  lockRemainingMs: null,
  missed: null,
  canSort: true,
  timeMs: null,
  ...patch,
});

const okSend = () => vi.fn<Send>().mockResolvedValue({ ok: true });

function play(count: number, sort: PlayerSort = playerSort(), send: Send = okSend(), paused = false) {
  const utils = render(<SortPlay question={sortQuestion(count)} sort={sort} paused={paused} offsetMs={0} send={send} />);
  return { ...utils, send };
}

const zone = (pos: string) => document.querySelector<HTMLButtonElement>(`.sort-zone[data-pos="${pos}"]`)!;
const card = () => document.querySelector<HTMLElement>('.sort-card')!;

describe('SortView', () => {
  it('zonePositions and swipeTarget', () => {
    expect(zonePositions(2)).toEqual(['left', 'right']);
    expect(zonePositions(3)).toEqual(['left', 'right', 'top']);
    expect(zonePositions(4)).toEqual(['left', 'right', 'top', 'bottom']);
    expect(swipeTarget(-80, 10, zonePositions(2))).toBe('left');
    expect(swipeTarget(5, -90, zonePositions(2))).toBeNull();
    expect(swipeTarget(5, -90, zonePositions(3))).toBe('top');
    expect(swipeTarget(30, 20, zonePositions(4))).toBeNull();
    expect(swipeTarget(0, 70, zonePositions(4))).toBe('bottom');
    expect(swipeTarget(65, 0, zonePositions(2))).toBe('right');
  });

  it('shows the zones on the edges and the card in the middle', () => {
    play(4);
    expect([...document.querySelectorAll('.sort-zone')].map((el) => el.getAttribute('data-pos'))).toEqual(['left', 'right', 'top', 'bottom']);
    expect(screen.getByRole('button', { name: 'Категорія «Овочі»' })).toBe(zone('left'));
    expect(screen.getByRole('button', { name: 'Категорія «Фрукти»' })).toBe(zone('right'));
    expect(screen.getByRole('button', { name: 'Категорія «Ягоди»' })).toBe(zone('top'));
    expect(screen.getByRole('button', { name: 'Категорія «Горіхи»' })).toBe(zone('bottom'));
    expect(card().textContent).toBe('Морква');
    expect(card().getAttribute('aria-label')).toBe('Слово: Морква');
    expect(document.querySelector('.sort-progress')?.textContent).toBe('0 з 4');
    expect(screen.getByText('Перетягніть слово в категорію, торкніться її або натисніть стрілку.')).toBeTruthy();
  });

  it('a tap on a zone sends the move once', async () => {
    let resolve: (value: { ok: true }) => void = () => {};
    const send = vi.fn<Send>(() => new Promise((r) => (resolve = r)));
    play(2, playerSort(), send);
    fireEvent.click(zone('right'));
    expect(send).toHaveBeenCalledWith('player:sort', { wordId: 'w1', categoryId: 'c2' });
    fireEvent.click(zone('right'));
    fireEvent.click(zone('left'));
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true }));
    fireEvent.click(zone('left'));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('arrow keys pick the zone in that position', async () => {
    const { send } = play(3);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(send).toHaveBeenLastCalledWith('player:sort', { wordId: 'w1', categoryId: 'c1' });
    await act(async () => {});
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(send).toHaveBeenLastCalledWith('player:sort', { wordId: 'w1', categoryId: 'c2' });
    await act(async () => {});
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(send).toHaveBeenLastCalledWith('player:sort', { wordId: 'w1', categoryId: 'c3' });
    await act(async () => {});
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('dragging the card onto a zone or swiping sends the move, a short drag springs back', async () => {
    const { send } = play(2);
    fireEvent.pointerDown(card(), { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(card(), { pointerId: 1, clientX: 180, clientY: 300 });
    expect(card().style.transform).toContain('translate(');
    fireEvent.pointerUp(card(), { pointerId: 1, clientX: 180, clientY: 300 });
    expect(send).not.toHaveBeenCalled();
    expect(card().style.transform).toBe('');
    fireEvent.pointerDown(card(), { pointerId: 2, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(card(), { pointerId: 2, clientX: 100, clientY: 300 });
    fireEvent.pointerUp(card(), { pointerId: 2, clientX: 100, clientY: 300 });
    expect(send).toHaveBeenCalledWith('player:sort', { wordId: 'w1', categoryId: 'c1' });
  });

  it('a mistake shakes the card and locks with a countdown', () => {
    const send = okSend();
    const { rerender } = play(2, playerSort(), send);
    const next = (patch: Partial<PlayerSort>) =>
      rerender(<SortPlay question={sortQuestion(2)} sort={playerSort(patch)} paused={false} offsetMs={0} send={send} />);
    next({ card: { id: 'w2', text: 'Яблуко' }, misses: 1, missed: { id: 'w1', text: 'Морква' }, lockedUntil: Date.now() + 3000 });
    expect(card().classList.contains('is-shaking')).toBe(true);
    expect(card().textContent).toBe('Морква');
    expect(document.querySelector('.sort-lock')?.textContent).toBe('Помилка! Підвисання: 3 с');
    expect(zone('left').disabled).toBe(true);
    expect(zone('right').disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(send).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(document.querySelector('.sort-lock')?.textContent).toBe('Помилка! Підвисання: 2 с');
    act(() => vi.advanceTimersByTime(2000));
    expect(document.querySelector('.sort-lock')).toBeNull();
    expect(zone('left').disabled).toBe(false);
    expect(card().textContent).toBe('Яблуко');
    expect(card().classList.contains('is-shaking')).toBe(false);
  });

  it('the layout keeps its size while locked and after the last word', () => {
    const send = okSend();
    const { rerender } = play(4, playerSort(), send);
    const arena = document.querySelector('.sort-arena')!;
    const progress = document.querySelector('.sort-progress')!;
    const cls = arena.className;
    rerender(
      <SortPlay
        question={sortQuestion(4)}
        sort={playerSort({ misses: 1, missed: { id: 'w1', text: 'Морква' }, lockedUntil: Date.now() + 3000 })}
        paused={false}
        offsetMs={0}
        send={send}
      />,
    );
    expect(document.querySelector('.sort-arena')).toBe(arena);
    expect(arena.className).toBe(cls);
    expect(document.querySelector('.sort-progress')).toBe(progress);
    rerender(
      <SortPlay question={sortQuestion(4)} sort={playerSort({ card: null, sorted: 4, timeMs: 8000, canSort: false })} paused={false} offsetMs={0} send={send} />,
    );
    expect(document.querySelector('.sort-arena')).toBe(arena);
    expect(arena.className).toBe(cls);
    expect(document.querySelector('.sort-progress')).toBe(progress);
    expect(progress.textContent).toBe('4 з 4');
    expect(screen.getByText('Усі слова відсортовано за 8,0 с')).toBeTruthy();
    expect(zone('left').disabled).toBe(true);
  });

  it('reduced motion: no shake, the countdown still shows', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    const send = okSend();
    const { rerender } = play(2, playerSort(), send);
    rerender(
      <SortPlay
        question={sortQuestion(2)}
        sort={playerSort({ misses: 1, missed: { id: 'w1', text: 'Морква' }, lockedUntil: Date.now() + 3000 })}
        paused={false}
        offsetMs={0}
        send={send}
      />,
    );
    expect(card().classList.contains('is-shaking')).toBe(false);
    expect(document.querySelector('.sort-lock')?.textContent).toBe('Помилка! Підвисання: 3 с');
  });

  it('paused: zones are off and the lock shows the saved remainder', () => {
    const { send } = play(2, playerSort({ misses: 1, missed: { id: 'w1', text: 'Морква' }, lockRemainingMs: 2000, canSort: false }), okSend(), true);
    expect(document.querySelector('.sort-lock')?.textContent).toBe('Помилка! Підвисання: 2 с');
    expect(zone('left').disabled).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(document.querySelector('.sort-lock')?.textContent).toBe('Помилка! Підвисання: 2 с');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(send).not.toHaveBeenCalled();
  });

  it('a lock using the server clock offset', () => {
    // Годинник телефона відстає на 10 с: lockedUntil у часі сервера.
    render(
      <SortPlay
        question={sortQuestion(2)}
        sort={playerSort({ misses: 1, missed: { id: 'w1', text: 'Морква' }, lockedUntil: Date.now() + 10_000 + 2000 })}
        paused={false}
        offsetMs={10_000}
        send={okSend()}
      />,
    );
    expect(document.querySelector('.sort-lock')?.textContent).toBe('Помилка! Підвисання: 2 с');
  });
});
