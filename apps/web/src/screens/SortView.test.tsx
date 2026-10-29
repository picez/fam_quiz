// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerSort, PublicQuestion, Question, SortInfo, SortLive, SortTilt } from '@quiz/shared';
import type { Send } from '../live/types';
import { SortBoard, SortPlay, SortReveal, SortStage, SortWatch, columnOffset, liveTilt, swipeTarget, tiltOf, tiltVars, useTiltSender, zoneOffset, zonePositions } from './SortView';

const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');

/** Тіло першого правила з точно цим селектором у styles.css. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

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
  orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
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
  watched: false,
  marks: null,
  live: null,
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

  it('a late reply to a timed-out move does not free a newer move in flight', async () => {
    const replies: ((value: { ok: true }) => void)[] = [];
    const send = vi.fn<Send>(() => new Promise((r) => replies.push(r)));
    play(2, playerSort(), send);
    fireEvent.click(zone('left'));
    expect(send).toHaveBeenCalledTimes(1);
    // Перша відповідь не прийшла: через 3 с картка знову приймає хід.
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.click(zone('right'));
    expect(send).toHaveBeenCalledTimes(2);
    // Запізніла відповідь на перший хід не звільняє другий.
    await act(async () => replies[0]({ ok: true }));
    fireEvent.click(zone('right'));
    expect(send).toHaveBeenCalledTimes(2);
    await act(async () => replies[1]({ ok: true }));
    fireEvent.click(zone('right'));
    expect(send).toHaveBeenCalledTimes(3);
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
    // Відлік — смуга внизу середини, картка не під шаром і лежить над тонуванням.
    expect(document.querySelector('.sort-lock')?.contains(card())).toBe(false);
    expect(document.querySelector('.sort-lock-text')?.textContent).toBe('Помилка! Підвисання: 3 с');
    expect(document.querySelector('.sort-center')?.contains(document.querySelector('.sort-lock'))).toBe(true);
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

describe('SortBoard and SortReveal', () => {
  const rows: SortInfo['rows'] = [
    { playerId: 'p1', nickname: 'Анна', sorted: 4, misses: 0, timeMs: 8000, points: null },
    { playerId: 'p2', nickname: 'Богдан', sorted: 1, misses: 1, timeMs: null, points: null },
  ];
  const info = (over: Partial<SortInfo> = {}): SortInfo => ({ total: 4, rows, winner: null, words: null, live: null, ...over });
  const items = () => [...document.querySelectorAll('.sort-board li')].map((li) => li.textContent ?? '');

  it('SortBoard keeps rows steady', () => {
    const { rerender } = render(<SortBoard sort={info()} reveal={false} />);
    expect(items()).toHaveLength(2);
    expect(items()[0]).toContain('Анна');
    expect(items()[0]).toContain('4/4');
    expect(items()[0]).toContain('8,0 с');
    expect(items()[1]).toContain('1/4');
    expect(items()[1]).toContain('помилок: 1');
    rerender(<SortBoard sort={info({ rows: [rows[0], { ...rows[1], sorted: 4, timeMs: 12000, misses: 0 }] })} reveal={false} />);
    expect(items()).toHaveLength(2);
    expect(items()[1]).toContain('12,0 с');
    expect(items()[1]).not.toContain('помилок');
    expect(document.querySelector('.sort-board')?.textContent).not.toContain('+');
    rerender(<SortBoard sort={info({ rows: [{ ...rows[0], points: 400 }, { ...rows[1], points: 100 }] })} reveal />);
    expect(items()[0]).toContain('+400');
    expect(items()[1]).toContain('+100');
  });

  it('SortBoard keeps every cell in place and draws a progress bar per row', () => {
    const cells = () => [...document.querySelectorAll('.sort-board li')].map((li) => li.children.length);
    const shares = () => [...document.querySelectorAll<HTMLElement>('.sort-bar-fill')].map((fill) => fill.style.getPropertyValue('--sort-share'));
    const { rerender } = render(<SortBoard sort={info()} reveal={false} />);
    expect(cells()).toEqual([6, 6]);
    expect(shares()).toEqual(['1', '0.25']);
    expect(document.querySelectorAll('.sort-bar[aria-hidden="true"]')).toHaveLength(2);
    rerender(<SortBoard sort={info({ rows: [{ ...rows[0], points: 400 }, { ...rows[1], sorted: 3, points: 300 }] })} reveal />);
    expect(cells()).toEqual([6, 6]);
    expect(shares()).toEqual(['1', '0.75']);
  });

  const full: Extract<Question, { type: 'sort' }> = {
    id: 'q1',
    type: 'sort',
    text: 'Розкладіть',
    imageUrl: null,
    video: null,
    timeLimit: 60,
    points: 100,
    lockSeconds: 3,
    categories: [
      { id: 'c1', text: 'Овочі' },
      { id: 'c2', text: 'Фрукти' },
    ],
    words: [
      { id: 'w1', text: 'Морква', categoryId: 'c1' },
      { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
      { id: 'w3', text: 'Буряк', categoryId: 'c1' },
      { id: 'w4', text: 'Груша', categoryId: 'c2' },
    ],
  };

  it('SortReveal groups words by category', () => {
    render(<SortReveal categories={full.categories} question={full} />);
    const cols = [...document.querySelectorAll('.sort-reveal-col')];
    const text = (col: Element) => `${col.querySelector('h3')?.textContent}: ${[...col.querySelectorAll('li')].map((li) => li.textContent).join(', ')}`;
    expect(cols.map(text)).toEqual(['Овочі: Морква, Буряк', 'Фрукти: Яблуко, Груша']);
  });

  it('SortReveal without a question shows only the names', () => {
    render(<SortReveal categories={full.categories} question={null} />);
    expect(document.querySelectorAll('.sort-reveal-col h3')).toHaveLength(2);
    expect(document.querySelectorAll('.sort-reveal-col li')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Морква');
  });

  it('a watcher on the board sees the categories, all words and who sorts', () => {
    const row = (nickname: string, sorted: number) => ({ playerId: 'p2', nickname, sorted, misses: 0, timeMs: null, points: null });
    const words = (texts: string[]) => texts.map((text, index) => ({ id: `w${index + 1}`, text }));
    render(<SortWatch question={sortQuestion(4)} info={{ total: 4, rows: [row('Оля', 2)], winner: null, words: words(['Буряк', 'Груша', 'Морква', 'Яблуко']), live: null }} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(within(screen.getByRole('list', { name: 'Слова' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Буряк', 'Груша', 'Морква', 'Яблуко']);
    expect(document.querySelector('ul.chips.sort-words')).not.toBeNull();
    expect(screen.getByText('Оля сортує слова')).toBeTruthy();
    expect(screen.getByText('2 з 4')).toBeTruthy();
  });

  it('a watcher without words gets no word list', () => {
    render(<SortWatch question={sortQuestion(2)} info={{ total: 4, rows: [], winner: null, words: null, live: null }} />);
    expect(document.querySelector('.sort-words')).toBeNull();
  });

  it('three and four categories get equal zones', () => {
    expect(rule(".sort-arena[data-zones='4']")).toContain('grid-template-rows: repeat(3, minmax(0, 1fr))');
    expect(rule(".sort-arena[data-zones='3']")).toContain('grid-template-rows: repeat(2, minmax(0, 1fr))');
    expect(css).toContain(".sort-arena[data-zones='3'],\n.sort-arena[data-zones='4'] {\n  grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(css).toContain(".sort-arena[data-zones='3'] .sort-zone[data-pos='left'],\n.sort-arena[data-zones='4'] .sort-zone[data-pos='left'] {\n  grid-column: 1;\n  grid-row: 2;");
  });

  it('in the narrow middle of three or four zones the card is tighter, so a word like «Смородина» fits a 360 px phone whole', () => {
    const tight = ".sort-arena[data-zones='3'] .sort-card,\n.sort-arena[data-zones='4'] .sort-card {\n  padding-inline: 0.375rem;\n  font-size: 1rem;\n}";
    expect(css).toContain(tight);
    // Після загального правила картки — інакше воно перекриває.
    expect(css.indexOf(tight)).toBeGreaterThan(css.indexOf('\n.sort-card {'));
  });
});

describe('tilt sending (11d)', () => {
  const cats = CATEGORIES.slice(0, 2);
  const LR: ('left' | 'right')[] = ['left', 'right'];

  it('tiltOf follows the dominant axis, or the zone under the finger', () => {
    expect(tiltOf(60, 5, LR, cats, null)).toEqual({ categoryId: 'c2', amount: 0.5 });
    expect(tiltOf(-200, 0, LR, cats, null)).toEqual({ categoryId: 'c1', amount: 1 });
    expect(tiltOf(5, 4, LR, cats, null)).toEqual({ categoryId: null, amount: 0 });
    expect(tiltOf(0, -80, LR, cats, null)).toEqual({ categoryId: null, amount: 0 });
    expect(tiltOf(10, 0, LR, cats, 'left')).toEqual({ categoryId: 'c1', amount: 1 });
  });

  describe('useTiltSender', () => {
    const right = { categoryId: 'c2', amount: 0.5 };
    const left = { categoryId: 'c1', amount: 0.25 };

    it('sends the latest value once per window, with a trailing send', () => {
      const send = okSend();
      const { result } = renderHook(() => useTiltSender(send, true, 'w1'));
      result.current({ categoryId: 'c2', amount: 0.1 });
      vi.advanceTimersByTime(30);
      result.current(left);
      vi.advanceTimersByTime(30);
      result.current(right);
      expect(send).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith('player:sort-tilt', { wordId: 'w1', ...right });
    });

    it('does not repeat the same value', () => {
      const send = okSend();
      const { result } = renderHook(() => useTiltSender(send, true, 'w1'));
      result.current(right);
      vi.advanceTimersByTime(100);
      result.current(right);
      vi.advanceTimersByTime(100);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('release sends the centre at once and drops the pending tail', () => {
      const send = okSend();
      const { result } = renderHook(() => useTiltSender(send, true, 'w1'));
      result.current(right);
      vi.advanceTimersByTime(100);
      result.current(left);
      result.current.release();
      expect(send).toHaveBeenLastCalledWith('player:sort-tilt', { wordId: 'w1', categoryId: null, amount: 0 });
      expect(send).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(300);
      expect(send).toHaveBeenCalledTimes(2);
      result.current.release();
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('a new move on the same word (a miss on the last one) sends the same tilt again', () => {
      const send = okSend();
      const { result, rerender } = renderHook(({ seq }) => useTiltSender(send, true, 'w1', seq), { initialProps: { seq: 3 } });
      result.current(right);
      vi.advanceTimersByTime(100);
      expect(send).toHaveBeenCalledTimes(1);
      rerender({ seq: 4 });
      result.current(right);
      vi.advanceTimersByTime(100);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('a tilt the server found too soon is sent again with the next window', async () => {
      const send = vi.fn<Send>().mockResolvedValueOnce({ ok: false, error: 'too_soon' }).mockResolvedValue({ ok: true });
      const { result } = renderHook(() => useTiltSender(send, true, 'w1'));
      result.current(right);
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(send).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith('player:sort-tilt', { wordId: 'w1', ...right });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('after another refusal the same value is no repeat any more', async () => {
      const send = vi.fn<Send>().mockResolvedValueOnce({ ok: false, error: 'sort_locked' }).mockResolvedValue({ ok: true });
      const { result } = renderHook(() => useTiltSender(send, true, 'w1'));
      result.current(right);
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(send).toHaveBeenCalledTimes(1);
      result.current(right);
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('sends nothing when inactive, and a new word drops the tail', () => {
      const off = okSend();
      const inactive = renderHook(() => useTiltSender(off, false, 'w1'));
      inactive.result.current(right);
      vi.advanceTimersByTime(300);
      expect(off).not.toHaveBeenCalled();

      const send = okSend();
      const { result, rerender } = renderHook(({ id }) => useTiltSender(send, true, id), { initialProps: { id: 'w1' } });
      result.current(right);
      rerender({ id: 'w2' });
      vi.advanceTimersByTime(300);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('SortPlay', () => {
    it('sends the tilt while dragging and releases a drop without a move', () => {
      const { send } = play(2, playerSort({ watched: true }));
      fireEvent.pointerDown(card(), { pointerId: 1, clientX: 100, clientY: 300 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 180, clientY: 300 });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(send).toHaveBeenCalledWith('player:sort-tilt', { wordId: 'w1', categoryId: 'c2', amount: 0.65 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 105, clientY: 300 });
      fireEvent.pointerUp(card(), { pointerId: 1, clientX: 105, clientY: 300 });
      expect(send).toHaveBeenLastCalledWith('player:sort-tilt', { wordId: 'w1', categoryId: null, amount: 0 });
      expect(send).not.toHaveBeenCalledWith('player:sort', expect.anything());
    });

    it('12h: upside down a swipe goes to the zone the finger points at, and the card follows the finger', () => {
      const send = okSend();
      render(
        <div className="is-flip">
          <SortPlay question={sortQuestion(2)} sort={playerSort()} paused={false} offsetMs={0} send={send} />
        </div>,
      );
      fireEvent.pointerDown(card(), { pointerId: 1, clientX: 100, clientY: 300 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 200, clientY: 310 });
      // Повернута картка: зсув у її власних координатах протилежний.
      expect(card().style.transform).toBe('translate(-100px, -10px)');
      fireEvent.pointerUp(card(), { pointerId: 1, clientX: 200, clientY: 310 });
      // Праворуч на екрані — це ліва зона повернутої арени.
      expect(send).toHaveBeenCalledWith('player:sort', { wordId: 'w1', categoryId: 'c1' });
    });

    it('a move cancels the tail instead of releasing', () => {
      const { send } = play(2, playerSort({ watched: true }));
      fireEvent.pointerDown(card(), { pointerId: 1, clientX: 100, clientY: 300 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 200, clientY: 300 });
      fireEvent.pointerUp(card(), { pointerId: 1, clientX: 200, clientY: 300 });
      expect(send).toHaveBeenCalledWith('player:sort', { wordId: 'w1', categoryId: 'c2' });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(send).not.toHaveBeenCalledWith('player:sort-tilt', expect.anything());
    });

    it('a refused move sends the card back to the centre for the watchers', async () => {
      const send = vi.fn<Send>((event) => Promise.resolve(event === 'player:sort' ? { ok: false, error: 'sort_locked' } : { ok: true }));
      play(2, playerSort({ watched: true }), send);
      fireEvent.pointerDown(card(), { pointerId: 1, clientX: 100, clientY: 300 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 150, clientY: 300 });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(send).toHaveBeenLastCalledWith('player:sort-tilt', { wordId: 'w1', categoryId: 'c2', amount: 0.4 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 200, clientY: 300 });
      await act(async () => {
        fireEvent.pointerUp(card(), { pointerId: 1, clientX: 200, clientY: 300 });
      });
      expect(send).toHaveBeenCalledWith('player:sort', { wordId: 'w1', categoryId: 'c2' });
      expect(send).toHaveBeenLastCalledWith('player:sort-tilt', { wordId: 'w1', categoryId: null, amount: 0 });
    });

    it('a drop on a zone that cannot take the move (paused mid-drag) releases the tilt', () => {
      const send = okSend();
      const { rerender } = play(2, playerSort({ watched: true }), send);
      fireEvent.pointerDown(card(), { pointerId: 1, clientX: 100, clientY: 300 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 200, clientY: 300 });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(send).toHaveBeenLastCalledWith('player:sort-tilt', { wordId: 'w1', categoryId: 'c2', amount: 0.85 });
      rerender(<SortPlay question={sortQuestion(2)} sort={playerSort({ watched: true })} paused offsetMs={0} send={send} />);
      fireEvent.pointerUp(card(), { pointerId: 1, clientX: 200, clientY: 300 });
      expect(send).not.toHaveBeenCalledWith('player:sort', expect.anything());
      expect(send).toHaveBeenLastCalledWith('player:sort-tilt', { wordId: 'w1', categoryId: null, amount: 0 });
    });

    it('sends no tilt where nobody watches', () => {
      const { send } = play(2, playerSort({ watched: false }));
      fireEvent.pointerDown(card(), { pointerId: 1, clientX: 100, clientY: 300 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 180, clientY: 300 });
      fireEvent.pointerUp(card(), { pointerId: 1, clientX: 105, clientY: 300 });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(send).not.toHaveBeenCalledWith('player:sort-tilt', expect.anything());
    });
  });
});

describe('watching a live sort (11d)', () => {
  const WORDS = [
    { id: 'w1', text: 'Морква' },
    { id: 'w2', text: 'Яблуко' },
    { id: 'w3', text: 'Буряк' },
    { id: 'w4', text: 'Груша' },
  ];
  const liveOf = (over: Partial<SortLive> = {}): SortLive => ({
    sorterId: 'p1',
    nickname: 'Анна',
    card: { id: 'w3', text: 'Буряк' },
    missed: null,
    lockedUntil: null,
    lockRemainingMs: null,
    sorted: 0,
    total: 4,
    misses: 0,
    timeMs: null,
    seq: 1,
    columns: [
      { id: 'c1', words: [] },
      { id: 'c2', words: [] },
    ],
    last: null,
    marks: null,
    ...over,
  });
  const infoOf = (live: SortLive | null): SortInfo => ({
    total: 4,
    rows: [{ playerId: 'p1', nickname: 'Анна', sorted: live?.sorted ?? 0, total: 4, misses: 0, timeMs: null, points: null } as SortInfo['rows'][number]],
    winner: null,
    words: [...WORDS].sort((a, b) => a.text.localeCompare(b.text, 'uk')),
    live,
  });
  const tiltOfs = (over: Partial<SortTilt> = {}): Record<string, SortTilt> => ({
    p1: { sorterId: 'p1', wordId: 'w3', toward: 'c2', amount: 0.6, seq: 1, ...over },
  });
  const watch = (live: SortLive, tilts: Record<string, SortTilt> = {}, paused = false) => (
    <SortWatch question={sortQuestion(2)} info={infoOf(live)} live={live} tilts={tilts} paused={paused} offsetMs={0} />
  );
  const liveCard = () => document.querySelector<HTMLElement>('.sort-live-card');
  const zoneByText = (text: string) => [...document.querySelectorAll('.sort-zone')].find((el) => el.querySelector('.sort-zone-name')?.firstChild?.textContent === text)!;
  const colByText = (text: string) => [...document.querySelectorAll('.sort-reveal-col')].find((el) => el.querySelector('h3')?.textContent === text)!;

  it('liveTilt gives the tilt only for the same move and word', () => {
    const live = liveOf();
    expect(liveTilt(live, tiltOfs(), false)?.toward).toBe('c2');
    expect(liveTilt(live, tiltOfs({ seq: 0 }), false)).toBeNull();
    expect(liveTilt(live, tiltOfs({ wordId: 'w1' }), false)).toBeNull();
    expect(liveTilt(live, tiltOfs(), true)).toBeNull();
    expect(liveTilt(live, tiltOfs({ toward: null }), false)).toBeNull();
    expect(liveTilt(live, {}, false)).toBeNull();
  });

  it('tiltVars, zoneOffset and columnOffset', () => {
    expect(tiltVars(zoneOffset('left'), 0.5)).toEqual({ '--tilt-x': -1, '--tilt-y': 0, '--tilt': 0.5 });
    expect(zoneOffset('bottom')).toEqual({ x: 0, y: 1 });
    expect(columnOffset(0, 4)).toEqual({ x: -0.75, y: 1 });
    expect(columnOffset(3, 4)).toEqual({ x: 0.75, y: 1 });
  });

  it('a watcher sees the card, not an interactive one', () => {
    render(watch(liveOf()));
    expect(liveCard()?.textContent).toBe('Буряк');
    expect(liveCard()?.getAttribute('aria-label')).toBe('Зараз на картці: Буряк');
    expect(document.querySelector('.sort-card')).toBeNull();
    expect(document.querySelectorAll('button.sort-zone')).toHaveLength(0);
    expect(screen.getByText('Анна сортує слова')).toBeTruthy();
  });

  it('the team line names the team', () => {
    render(<SortWatch question={sortQuestion(2)} info={infoOf(liveOf({ nickname: 'Червоні' }))} team />);
    expect(screen.getByText('Команда «Червоні» сортує слова')).toBeTruthy();
  });

  it('the tilt highlights the zone and sets the variables; a stale one does not', () => {
    const { rerender } = render(watch(liveOf(), tiltOfs()));
    expect(zoneByText('Фрукти').classList.contains('is-toward')).toBe(true);
    expect(zoneByText('Овочі').classList.contains('is-toward')).toBe(false);
    expect(liveCard()?.getAttribute('data-toward')).toBe('c2');
    expect(liveCard()?.getAttribute('style')).toContain('--tilt: 0.6');
    expect(liveCard()?.classList.contains('is-tilting')).toBe(true);
    rerender(watch(liveOf(), tiltOfs({ seq: 0 })));
    expect(zoneByText('Фрукти').classList.contains('is-toward')).toBe(false);
  });

  it('the zones count placed words, no columns while playing, the folded chips lose placed words and the card', () => {
    const live = liveOf({
      sorted: 1,
      columns: [
        { id: 'c1', words: [{ id: 'w1', text: 'Морква' }] },
        { id: 'c2', words: [] },
      ],
    });
    render(watch(live));
    expect(document.querySelector('.sort-reveal')).toBeNull();
    expect(zoneByText('Овочі').querySelector('.sort-zone-name')?.textContent).toBe('Овочі · 1');
    expect(zoneByText('Фрукти').querySelector('.sort-zone-name')?.textContent).toBe('Фрукти · 0');
    const rest = document.querySelector('details.sort-rest')!;
    expect(rest.hasAttribute('open')).toBe(false);
    expect(rest.querySelector('summary')?.textContent).toBe('Ще 2 слова');
    expect([...rest.querySelectorAll('.sort-words li')].map((li) => li.textContent)).toEqual(['Груша', 'Яблуко']);
  });

  it('the chips leave out the missed word during the lock', () => {
    render(watch(liveOf({ card: { id: 'w2', text: 'Яблуко' }, missed: { id: 'w3', text: 'Буряк' }, misses: 1, lockedUntil: Date.now() + 3000 })));
    expect([...document.querySelectorAll('.sort-words li')].map((li) => li.textContent)).toEqual(['Груша', 'Морква']);
    expect(document.querySelector('summary')?.textContent).toBe('Ще 2 слова');
  });

  it('a hit flies into its column and lands with a tick', () => {
    const { rerender } = render(watch(liveOf({ seq: 1, last: { wordId: 'w1', text: 'Морква', to: 'c1', hit: true } })));
    expect(liveCard()?.classList.contains('is-flying')).toBe(false);
    expect(document.querySelector('.sort-zone-landed')).toBeNull();
    rerender(
      watch(
        liveOf({
          seq: 2,
          sorted: 1,
          last: { wordId: 'w3', text: 'Буряк', to: 'c1', hit: true },
          card: { id: 'w2', text: 'Яблуко' },
          columns: [
            { id: 'c1', words: [{ id: 'w3', text: 'Буряк' }] },
            { id: 'c2', words: [] },
          ],
        }),
      ),
    );
    expect(liveCard()?.classList.contains('is-flying')).toBe(true);
    expect(liveCard()?.getAttribute('data-to')).toBe('c1');
    expect(liveCard()?.textContent).toBe('Буряк');
    expect(zoneByText('Овочі').querySelector('.sort-zone-landed')?.textContent).toBe('Буряк✓');
    expect(zoneByText('Овочі').querySelector('.sort-zone-name')?.textContent).toBe('Овочі · 1');
    expect(zoneByText('Фрукти').querySelector('.sort-zone-landed')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(liveCard()?.classList.contains('is-flying')).toBe(false);
    expect(liveCard()?.textContent).toBe('Яблуко');
    expect(document.querySelector('.sort-zone-landed')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1050);
    });
    expect(document.querySelector('.sort-zone-landed')).toBeNull();
  });

  it('a miss shakes red, lights the zone and shows the lock countdown', () => {
    const { rerender } = render(watch(liveOf({ seq: 1 })));
    rerender(
      watch(
        liveOf({
          seq: 2,
          misses: 1,
          missed: { id: 'w3', text: 'Буряк' },
          lockedUntil: Date.now() + 3000,
          last: { wordId: 'w3', text: 'Буряк', to: 'c2', hit: false },
        }),
      ),
    );
    expect(liveCard()?.classList.contains('is-miss')).toBe(true);
    expect(zoneByText('Фрукти').classList.contains('is-toward')).toBe(true);
    expect(document.querySelector('.sort-lock-text')?.textContent).toBe('Помилка! Підвисання: 3 с');
    // Відлік глядача не озвучується щосекунди: статус — один раз, на початку підвисання.
    expect(document.querySelector('.sort-lock')?.getAttribute('aria-live')).toBe('off');
    expect(document.querySelector('.sort-lock-text')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Помилка, підвисання 3 с');
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(liveCard()?.classList.contains('is-miss')).toBe(false);
    expect(document.querySelector('.sort-lock')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelector('.sort-lock-text')?.textContent).toBe('Помилка! Підвисання: 2 с');
    expect(screen.getByRole('status').textContent).toBe('Помилка, підвисання 3 с');
  });

  it('no stale lock or shake once the card is gone', () => {
    const { rerender } = render(watch(liveOf({ seq: 1 })));
    rerender(
      watch(
        liveOf({
          seq: 2,
          card: null,
          misses: 1,
          missed: { id: 'w3', text: 'Буряк' },
          lockedUntil: Date.now() + 3000,
          last: { wordId: 'w3', text: 'Буряк', to: 'c2', hit: false },
        }),
      ),
    );
    expect(liveCard()).toBeNull();
    expect(document.querySelector('.sort-lock')).toBeNull();
  });

  it('reduced motion: no flight, the landed mark stays', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    const { rerender } = render(watch(liveOf({ seq: 1 })));
    rerender(
      watch(
        liveOf({
          seq: 2,
          last: { wordId: 'w3', text: 'Буряк', to: 'c1', hit: true },
          columns: [
            { id: 'c1', words: [{ id: 'w3', text: 'Буряк' }] },
            { id: 'c2', words: [] },
          ],
        }),
      ),
    );
    expect(liveCard()?.classList.contains('is-flying')).toBe(false);
    expect(document.querySelector('.sort-zone-landed')).not.toBeNull();
  });

  it('the reveal marks wrong tries and words left undone', () => {
    const reveal = {
      type: 'sort',
      words: [
        { id: 'w1', text: 'Морква', categoryId: 'c1' },
        { id: 'w4', text: 'Груша', categoryId: 'c2' },
        { id: 'w3', text: 'Буряк', categoryId: 'c1' },
      ],
    } as unknown as Extract<Question, { type: 'sort' }>;
    render(
      <SortReveal
        categories={CATEGORIES.slice(0, 2)}
        question={reveal}
        marks={[
          { wordId: 'w1', misses: 2, late: false },
          { wordId: 'w4', misses: 0, late: true },
        ]}
      />,
    );
    const carrot = [...document.querySelectorAll('li')].find((li) => li.textContent?.startsWith('Морква'))!;
    const mark = carrot.querySelector('.sort-mark')!;
    expect(mark.textContent).toBe('✗2');
    expect(mark.getAttribute('aria-label')).toBe('Помилок на слові: 2');
    const pear = [...document.querySelectorAll('li')].find((li) => li.textContent?.startsWith('Груша'))!;
    expect(pear.classList.contains('is-late')).toBe(true);
    expect(pear.textContent).toContain('не встиг');
    const beet = [...document.querySelectorAll('li')].find((li) => li.textContent === 'Буряк')!;
    expect(beet.querySelector('.sort-mark, .sort-late')).toBeNull();
  });

  describe('SortStage', () => {
    const stage = (live: SortLive, reveal: Extract<Question, { type: 'sort' }> | null = null, tilts: Record<string, SortTilt> = {}) => (
      <SortStage question={sortQuestion(2)} info={infoOf(live)} live={live} reveal={reveal} tilts={tilts} paused={false} offsetMs={0} />
    );

    it('shows the card, filling columns and the chips while playing', () => {
      render(stage(liveOf({ sorted: 1, columns: [{ id: 'c1', words: [{ id: 'w1', text: 'Морква' }] }, { id: 'c2', words: [] }] })));
      const root = document.querySelector('.stage-sort-live')!;
      expect(root.querySelector('.sort-live-card')?.textContent).toBe('Буряк');
      expect(root.querySelector('.sort-reveal.is-live')).not.toBeNull();
      expect(root.querySelector('.sort-reveal.is-open')).toBeNull();
      // Слово на картці чипом не дублюється.
      expect([...root.querySelectorAll('.sort-words li')].map((li) => li.textContent)).toEqual(['Груша', 'Яблуко']);
      expect(root.querySelector('.sort-watching')?.textContent).toBe('Анна сортує слова');
    });

    it('a flying word is no chip either, and the header-named stage has no strip line', () => {
      const { rerender } = render(stage(liveOf({ seq: 1 })));
      rerender(
        <SortStage
          question={sortQuestion(2)}
          info={infoOf(liveOf())}
          live={liveOf({ seq: 2, card: { id: 'w2', text: 'Яблуко' }, misses: 1, last: { wordId: 'w4', text: 'Груша', to: 'c1', hit: false } })}
          reveal={null}
          tilts={{}}
          paused={false}
          offsetMs={0}
          headed
        />,
      );
      expect([...document.querySelectorAll('.sort-words li')].map((li) => li.textContent)).toEqual(['Буряк', 'Морква']);
      expect(document.querySelector('.sort-watching')).toBeNull();
    });

    it('the stage tilt nudges the card down only a little; the full reach is for the flight', () => {
      expect(rule('.stage-sort-live .sort-live-card')).toContain('--tilt-y-cap: 0.5;');
      expect(rule('.stage-sort-live .sort-live-card.is-flying')).toContain('--tilt-y-cap: 1;');
      expect(css).toContain('min(var(--tilt, 0), var(--tilt-y-cap, 1))');
    });

    it('a tilt toward a column highlights it and sets the column offset', () => {
      render(stage(liveOf(), undefined, tiltOfs()));
      expect(colByText('Фрукти').classList.contains('is-toward')).toBe(true);
      expect(liveCard()?.getAttribute('style')).toContain('--tilt-x: 0.5');
    });

    it('the reveal shows the open columns with marks, no card and no chips', () => {
      const reveal = { type: 'sort', words: [{ id: 'w1', text: 'Морква', categoryId: 'c1' }] } as unknown as Extract<Question, { type: 'sort' }>;
      render(stage(liveOf({ card: null, marks: [{ wordId: 'w1', misses: 1, late: false }] }), reveal));
      expect(document.querySelector('.sort-reveal.is-open .sort-mark')?.textContent).toBe('✗1');
      expect(liveCard()).toBeNull();
      expect(document.querySelector('.sort-words')).toBeNull();
    });
  });

  it('without live the watcher is as before', () => {
    render(<SortWatch question={sortQuestion(2)} info={infoOf(null)} />);
    expect(document.querySelector('.sort-live-card')).toBeNull();
    expect(document.querySelector('.sort-reveal.is-live')).toBeNull();
    expect(document.querySelectorAll('.sort-words li')).toHaveLength(4);
  });
});
