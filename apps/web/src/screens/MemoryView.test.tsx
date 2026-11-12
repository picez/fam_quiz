// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryCellView, PlayerMemory, PublicMemory, PublicQuestion } from '@quiz/shared';
import { t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { MemoryPlay, MemoryReveal, memoryTextSize } from './MemoryView';

const MEMORY: PublicMemory = { id: 'q-mem', grid: '3x4', cols: 3, rows: 4, total: 6, pairs: null };
const questionOf = (memory: Partial<PublicMemory> = {}) => ({ type: 'memory', text: 'Знайдіть пари', memory: { ...MEMORY, ...memory } }) as unknown as PublicQuestion;
const closed = (n = 12): (MemoryCellView | null)[] => new Array<MemoryCellView | null>(n).fill(null);
const card = (text: string, state: MemoryCellView['state'], tone: string | null = null, imageUrl: string | null = null): MemoryCellView => ({ text, imageUrl, state, tone });
const infoOf = (over: Partial<PlayerMemory> = {}): PlayerMemory => ({
  cells: closed(),
  pairs: 0,
  total: 6,
  moves: 0,
  done: false,
  canFlip: true,
  busy: null,
  closesInMs: null,
  seq: 0,
  timeMs: null,
  result: null,
  ...over,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const cardsEls = () => [...document.querySelectorAll<HTMLElement>('.memory-card')];

function mount(over: { info?: PlayerMemory; send?: ReturnType<typeof vi.fn<Send>>; question?: PublicQuestion } = {}) {
  const send = over.send ?? vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: true }));
  const view = render(<MemoryPlay info={over.info ?? infoOf()} question={over.question ?? questionOf()} questionIndex={0} paused={false} timeUp={false} send={send} />);
  return { send, ...view };
}

describe('MemoryPlay', () => {
  it('closed cards show no content', () => {
    const cells = closed();
    cells[3] = card('Київ', 'open');
    mount({ info: infoOf({ cells }) });
    expect(cardsEls()).toHaveLength(12);
    expect(screen.getByText('Київ')).toBeTruthy();
    const backs = cardsEls().filter((el) => el.classList.contains('is-closed'));
    expect(backs).toHaveLength(11);
    for (const back of backs) {
      expect(back.textContent).toBe('');
      expect(back.querySelector('img')).toBeNull();
    }
    expect(backs[0].getAttribute('aria-label')).toBe(t('memoryCardClosed', { n: 1 }));
    expect(screen.getByText(t('memoryProgress', { found: 0, total: 6 }))).toBeTruthy();
  });

  it('a tap on a closed card flips it and sends the cell', async () => {
    const { send } = mount();
    await act(async () => fireEvent.click(cardsEls()[4]));
    expect(send).toHaveBeenCalledWith('player:memory', { questionIndex: 0, cell: 4 });
    expect(cardsEls()[4].classList.contains('is-pending')).toBe(true);
    expect(cardsEls()[4].textContent).toBe('');
  });

  it('text size follows the length', () => {
    expect(memoryTextSize('Рим')).toBe('l');
    expect(memoryTextSize('Буенос-Айрес')).toBe('m');
    expect(memoryTextSize('Сполучені Штати Америки..')).toBe('s');
    const cells = closed();
    cells[0] = card('Рим', 'open');
    mount({ info: infoOf({ cells }) });
    expect(cardsEls()[0].querySelector('.memory-text-l')).toBeTruthy();
  });

  it('a picture half shows as an image', () => {
    const cells = closed();
    cells[2] = card('', 'open', null, '/uploads/0123456789abcdef0001.png');
    mount({ info: infoOf({ cells }) });
    const img = cardsEls()[2].querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/uploads/0123456789abcdef0001.png');
    expect(img.classList.contains('memory-img')).toBe(true);
    expect(cssSection()).toMatch(/\.memory-img \{[^}]*object-fit:\s*contain/);
  });

  it('a wrong pair is red and a match green in a teammate tone', () => {
    const cells = closed();
    cells[0] = card('Київ', 'matched', '3');
    cells[5] = card('Україна', 'matched', '3');
    cells[1] = card('Варшава', 'shown');
    cells[7] = card('Франція', 'shown');
    mount({ info: infoOf({ cells, pairs: 1, closesInMs: 800, canFlip: false }) });
    expect(cardsEls()[1].classList.contains('is-shown')).toBe(true);
    expect(cardsEls()[0].classList.contains('is-matched')).toBe(true);
    expect(cardsEls()[0].classList.contains('by-3')).toBe(true);
    const css = cssSection();
    expect(css).toMatch(/\.memory-card\.is-shown \{[^}]*border-color:\s*var\(--wrong\)/);
    expect(css).toMatch(/\.memory-card\.is-matched \{[^}]*border-color:\s*var\(--by, var\(--correct\)\)/);
  });

  it('a teammate move disables the grid', () => {
    const { send } = mount({ info: infoOf({ busy: { nickname: 'Оля', tone: '2' }, canFlip: false }) });
    const busy = screen.getByText(t('memoryBusy', { name: 'Оля' }));
    expect(busy.classList.contains('by-2')).toBe(true);
    expect(cardsEls().every((el) => el.getAttribute('aria-disabled') === 'true')).toBe(true);
    fireEvent.click(cardsEls()[0]);
    expect(send).not.toHaveBeenCalled();
  });

  it('all found says so with the time and takes no taps', () => {
    const { send } = mount({ info: infoOf({ done: true, canFlip: false, pairs: 6, timeMs: 41_500 }) });
    expect(screen.getByRole('status').textContent).toBe(t('memoryDoneIn', { time: '41,5' }));
    fireEvent.click(cardsEls()[0]);
    expect(send).not.toHaveBeenCalled();
  });

  it('a paused question takes no taps', () => {
    const send = vi.fn<Send>();
    render(<MemoryPlay info={infoOf()} question={questionOf()} questionIndex={0} paused timeUp={false} send={send} />);
    fireEvent.click(cardsEls()[0]);
    expect(send).not.toHaveBeenCalled();
  });

  it('closed leaves the status line to the heading', () => {
    render(<MemoryPlay info={infoOf({ done: true, canFlip: false, timeMs: 41_500 })} question={questionOf()} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} closed />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('fits 320 px', () => {
    mount({ question: questionOf({ grid: '4x5', cols: 4, rows: 5, total: 10 }), info: infoOf({ cells: closed(20), total: 10 }) });
    expect(cardsEls()).toHaveLength(20);
    const grid = document.querySelector<HTMLElement>('.memory-grid')!;
    expect(grid.style.getPropertyValue('--cols')).toBe('4');
    expect(grid.style.getPropertyValue('--rows')).toBe('5');
    // Жодної фіксованої ширини в розмітці.
    for (const el of document.querySelectorAll<HTMLElement>('.memory-play, .memory-grid, .memory-card')) expect(el.style.width).toBe('');
    const css = cssSection();
    for (const [, value, unit] of css.matchAll(/(?:^|[\s;{])(?:min-|max-)?width:\s*([\d.]+)(px|rem)/g)) {
      expect(Number(value) * (unit === 'rem' ? 16 : 1)).toBeLessThanOrEqual(320);
    }
    const gap = Number(/--memory-gap:\s*([\d.]+)px/.exec(css)![1]);
    expect(css).toMatch(/\.memory-play \{[^}]*container-type:\s*inline-size/);
    expect(css).toMatch(/--memory-card:\s*min\(calc\(\(100cqi - \(var\(--cols\) - 1\) \* var\(--memory-gap\)\) \/ var\(--cols\)\), calc\(\(100dvh - 190px\) \/ var\(--rows\)\)\);/);
    expect(css).toMatch(/\.memory-grid \{[^}]*grid-template-columns:\s*repeat\(var\(--cols\), var\(--memory-card\)\)/);
    expect(css).toMatch(/\.memory-card \{[^}]*aspect-ratio:\s*1/);
    // Те саме, що рахує браузер: поле телефона не ширше за 320 − 2·12, висота 568.
    const cols = 4;
    const rows = 5;
    const inline = 320 - 2 * 12;
    const size = Math.min((inline - (cols - 1) * gap) / cols, (568 - 190) / rows);
    expect(size).toBeLessThanOrEqual((320 - 2 * 12 - 3 * 6) / 4);
    expect(cols * size + (cols - 1) * gap).toBeLessThanOrEqual(320);
    expect(rows * size + (rows - 1) * gap).toBeLessThanOrEqual(568 - 190 + (rows - 1) * gap);
  });

  it('another memory in the same slot starts afresh', async () => {
    const send = vi.fn<Send>(() => new Promise<SendResult>(() => undefined));
    const props = { info: infoOf(), questionIndex: 0, paused: false, timeUp: false, send };
    const view = render(<MemoryPlay {...props} question={questionOf()} />);
    await act(async () => fireEvent.click(cardsEls()[4]));
    expect(cardsEls()[4].classList.contains('is-pending')).toBe(true);
    view.rerender(<MemoryPlay {...props} question={questionOf({ id: 'q-other' })} />);
    expect(cardsEls()[4].classList.contains('is-pending')).toBe(false);
  });
});

describe('MemoryReveal', () => {
  it('reveal shows every card', () => {
    const names = ['Київ', 'Україна', 'Варшава', 'Польща', 'Париж', 'Франція', 'Токіо', 'Японія', 'Оттава', 'Канада', 'Рим', 'Італія'];
    const cells = names.map((name, i) => card(name, i < 2 ? 'matched' : 'shown'));
    render(<MemoryReveal mine={infoOf({ cells, pairs: 1, canFlip: false, result: { points: 0 } })} question={questionOf()} />);
    expect(cardsEls()).toHaveLength(12);
    for (const name of names) expect(screen.getByText(name)).toBeTruthy();
    // Невідкриті на розкритті — не помилка: без червоної рамки.
    expect(document.querySelector('.memory-grid')!.classList.contains('is-reveal')).toBe(true);
    expect(cssSection()).toMatch(/\.memory-grid\.is-reveal \.memory-card\.is-shown \{[^}]*border-color:\s*var\(--line/);
    expect(screen.getByText(t('memoryProgress', { found: 1, total: 6 }))).toBeTruthy();
  });
});

function cssSection(): string {
  const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
  const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
  const start = css.indexOf("/* «Пам'ять»: телефон (29f)");
  expect(start).toBeGreaterThan(0);
  return css.slice(start, css.indexOf("/* «Пам'ять»: кінець телефона */"));
}
