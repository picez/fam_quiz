// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawingInfo, PlayerDrawing, Stroke } from '@quiz/shared';
import type { DrawingModel } from '../live/drawing';
import { DRAW_FLUSH_MS } from '../live/pen';
import type { Send, SendResult } from '../live/types';
import { DRAWING_MISS_MS, DrawingBoard, DrawingGuess, DrawingPad, DrawingReveal, DrawingTeamWatch } from './DrawingView';

const fakeContext = () =>
  new Proxy({}, { get: (target: Record<string, unknown>, key: string) => (key in target ? target[key] : () => undefined), set: (target, key: string, value) => ((target[key] = value), true) });

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeContext()) as never;
  // Полотно 400×300 у лівому верхньому куті.
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const drawer: PlayerDrawing = { role: 'drawer', word: 'соняшник', guessed: false, canDraw: true, canGuess: false, points: null };
const guesser: PlayerDrawing = { role: 'guesser', word: null, guessed: false, canDraw: false, canGuess: true, points: null };
const model = (strokes: Stroke[] = [], rev = 0): DrawingModel => ({ questionIndex: 0, rev, strokes, stale: false });

/** Ack, що відповідає, коли тест скаже. */
function deferred() {
  const answers: ((result: SendResult) => void)[] = [];
  const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => answers.push(resolve)));
  return { send, answer: async (result: SendResult, at = answers.length - 1) => act(async () => answers[at]!(result)) };
}

const surface = () => document.querySelector('.drawing-surface') as HTMLElement;
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('DrawingPad (28c)', () => {
  it('the drawer sees the word and the tools', () => {
    render(<DrawingPad info={drawer} model={model()} paused={false} timeUp={false} send={vi.fn<Send>()} requestSync={vi.fn()} />);
    expect(screen.getByText('соняшник')).toBeTruthy();
    expect(screen.getByText('Ваше слово')).toBeTruthy();
    const colors = screen.getAllByRole('button', { name: /^Колір \d$/ });
    expect(colors).toHaveLength(8);
    expect(colors[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(colors[1]!.getAttribute('aria-pressed')).toBe('false');
    for (const name of ['Тонка', 'Середня', 'Товста', 'Гумка', 'Крок назад', 'Очистити']) expect(screen.getByRole('button', { name })).toBeTruthy();
    fireEvent.click(colors[3]!);
    expect(colors[3]!.getAttribute('aria-pressed')).toBe('true');
    expect(colors[0]!.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Гумка' }));
    expect(screen.getByRole('button', { name: 'Гумка' }).getAttribute('aria-pressed')).toBe('true');
    // Гумка за замовчуванням — найтовща.
    expect(screen.getByRole('button', { name: 'Товста' }).getAttribute('aria-pressed')).toBe('true');
    expect((document.querySelector('canvas') as HTMLCanvasElement).style.touchAction).toBe('none');
    expect(surface().style.touchAction).toBe('none');
  });

  it('drawing sends begin then more, one batch in flight', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    render(<DrawingPad info={drawer} model={model()} paused={false} timeUp={false} send={send} requestSync={vi.fn()} />);
    fireEvent.pointerDown(surface(), { pointerId: 1, button: 0, clientX: 40, clientY: 30 });
    for (let i = 1; i <= 20; i += 1) fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 40 + i * 10, clientY: 30 + i * 5 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBe('player:draw');
    expect(send.mock.calls[0]![1]).toEqual({ op: 'begin', c: 0, w: 1, p: [100, 100] });
    wait(DRAW_FLUSH_MS * 3);
    // Ack ще не прийшов — другого пакета немає.
    expect(send).toHaveBeenCalledTimes(1);
    // Лінія вже на полотні художника.
    expect(document.querySelector('canvas')!.getAttribute('data-points')).toBe('21');
    await answer({ ok: true });
    wait(DRAW_FLUSH_MS);
    expect(send).toHaveBeenCalledTimes(2);
    const more = send.mock.calls[1]![1] as { op: string; index: number; p: number[] };
    expect(more.op).toBe('more');
    expect(more.index).toBe(0);
    expect(more.p).toHaveLength(40);
    fireEvent.pointerUp(surface(), { pointerId: 1 });
    await answer({ ok: true });
    wait(DRAW_FLUSH_MS * 3);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a refused op resyncs', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const requestSync = vi.fn();
    render(<DrawingPad info={drawer} model={model()} paused={false} timeUp={false} send={send} requestSync={requestSync} />);
    fireEvent.pointerDown(surface(), { pointerId: 1, button: 0, clientX: 40, clientY: 30 });
    await answer({ ok: false, error: 'drawing_stale' });
    expect(requestSync).toHaveBeenCalledTimes(1);
  });

  it('a full drawing says so and resyncs', async () => {
    const { send, answer } = deferred();
    const requestSync = vi.fn();
    render(<DrawingPad info={drawer} model={model()} paused={false} timeUp={false} send={send} requestSync={requestSync} />);
    fireEvent.pointerDown(surface(), { pointerId: 1, button: 0, clientX: 40, clientY: 30 });
    await answer({ ok: false, error: 'drawing_full' });
    expect(requestSync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Малюнок завеликий — зітріть щось')).toBeTruthy();
  });

  it('the own strokes are not doubled by the server model, and an idle pad follows the server', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const { rerender } = render(<DrawingPad info={drawer} model={model()} paused={false} timeUp={false} send={send} requestSync={vi.fn()} />);
    fireEvent.pointerDown(surface(), { pointerId: 1, button: 0, clientX: 40, clientY: 30 });
    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 80, clientY: 60 });
    // Сервер розсилає свій begin і художникові; поки перо опущене, локальна модель його не бере.
    rerender(<DrawingPad info={drawer} model={model([{ c: 0, w: 1, p: [100, 100] }], 1)} paused={false} timeUp={false} send={send} requestSync={vi.fn()} />);
    expect(document.querySelector('canvas')!.getAttribute('data-strokes')).toBe('1');
    expect(document.querySelector('canvas')!.getAttribute('data-points')).toBe('2');
    fireEvent.pointerUp(surface(), { pointerId: 1 });
    await answer({ ok: true });
    wait(DRAW_FLUSH_MS);
    rerender(<DrawingPad info={drawer} model={model([{ c: 0, w: 1, p: [100, 100, 200, 200] }], 2)} paused={false} timeUp={false} send={send} requestSync={vi.fn()} />);
    await answer({ ok: true });
    expect(document.querySelector('canvas')!.getAttribute('data-strokes')).toBe('1');
    expect(document.querySelector('canvas')!.getAttribute('data-points')).toBe('2');
    // Знімок сервера (повернення художника, sync) — без власних незавершених штрихів — замінює полотно.
    rerender(<DrawingPad info={drawer} model={model([{ c: 2, w: 0, p: [1, 1] }, { c: 3, w: 2, p: [5, 5, 9, 9] }], 7)} paused={false} timeUp={false} send={send} requestSync={vi.fn()} />);
    expect(document.querySelector('canvas')!.getAttribute('data-strokes')).toBe('2');
  });

  it('undo and clear go to the server', async () => {
    const { send, answer } = deferred();
    const two = [{ c: 0, w: 1, p: [1, 1] }, { c: 1, w: 1, p: [2, 2] }];
    const pad = (m: DrawingModel, paused = false) => <DrawingPad info={paused ? { ...drawer, canDraw: false } : drawer} model={m} paused={paused} timeUp={false} send={send} requestSync={vi.fn()} />;
    const { rerender } = render(pad(model(two, 2)));
    fireEvent.click(screen.getByRole('button', { name: 'Крок назад' }));
    expect(send).toHaveBeenLastCalledWith('player:draw', { op: 'undo' });
    expect(document.querySelector('canvas')!.getAttribute('data-strokes')).toBe('1');
    // Сервер розсилає подію раніше за ack.
    rerender(pad(model(two.slice(0, 1), 3)));
    await answer({ ok: true });
    expect(document.querySelector('canvas')!.getAttribute('data-strokes')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Очистити' }));
    expect(send).toHaveBeenLastCalledWith('player:draw', { op: 'clear' });
    expect(document.querySelector('canvas')!.getAttribute('data-strokes')).toBe('0');
    rerender(pad(model([], 4)));
    await answer({ ok: true });
    expect(document.querySelector('canvas')!.getAttribute('data-strokes')).toBe('0');
    rerender(pad(model([{ c: 0, w: 1, p: [1, 1] }], 5), true));
    expect((screen.getByRole('button', { name: 'Крок назад' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Очистити' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole('button', { name: /^Колір/ })[0] as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.drawing-pad')!.classList.contains('is-off')).toBe(true);
    const calls = send.mock.calls.length;
    fireEvent.pointerDown(surface(), { pointerId: 1, button: 0, clientX: 40, clientY: 30 });
    expect(send).toHaveBeenCalledTimes(calls);
  });

  it('an ack before the model keeps the own canvas, the model that caught up replaces it', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const pad = (m: DrawingModel) => <DrawingPad info={drawer} model={m} paused={false} timeUp={false} send={send} requestSync={vi.fn()} />;
    const { rerender } = render(pad(model()));
    const canvas = () => document.querySelector('canvas')!;
    // Крапка: лише begin.
    fireEvent.pointerDown(surface(), { pointerId: 1, button: 0, clientX: 40, clientY: 30 });
    fireEvent.pointerUp(surface(), { pointerId: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    // Ack прийшов раніше, ніж useGame перемалював модель: модель rev 0 ще без крапки — полотно не відкочується.
    await answer({ ok: true });
    expect(canvas().getAttribute('data-strokes')).toBe('1');
    expect(canvas().getAttribute('data-points')).toBe('1');
    // Наступний штрих бере правильний індекс.
    fireEvent.pointerDown(surface(), { pointerId: 2, button: 0, clientX: 200, clientY: 150 });
    fireEvent.pointerUp(surface(), { pointerId: 2 });
    expect(send.mock.calls[1]![1]).toMatchObject({ op: 'begin', p: [500, 500] });
    await answer({ ok: true });
    expect(canvas().getAttribute('data-strokes')).toBe('2');
    // Модель на rev 1 ще позаду (очікуємо 2) — теж не береться.
    rerender(pad(model([{ c: 0, w: 1, p: [100, 100] }], 1)));
    expect(canvas().getAttribute('data-strokes')).toBe('2');
    // Модель наздогнала — полотно таке, як у сервера.
    rerender(pad(model([{ c: 0, w: 1, p: [100, 100] }, { c: 4, w: 2, p: [7, 7, 9, 9] }], 2)));
    expect(canvas().getAttribute('data-strokes')).toBe('2');
    expect(canvas().getAttribute('data-points')).toBe('3');
    // Далі — від rev 2: ще один ok-ack, і модель rev 3 береться.
    fireEvent.click(screen.getByRole('button', { name: 'Крок назад' }));
    await answer({ ok: true });
    rerender(pad(model([{ c: 5, w: 0, p: [3, 3] }], 3)));
    expect(canvas().getAttribute('data-points')).toBe('1');
  });

  it('undo and clear of an empty drawing send nothing', () => {
    const send = vi.fn<Send>(async () => ({ ok: true as const }));
    render(<DrawingPad info={drawer} model={model()} paused={false} timeUp={false} send={send} requestSync={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Крок назад' }));
    fireEvent.click(screen.getByRole('button', { name: 'Очистити' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('the time over stops the pen too', () => {
    const send = vi.fn<Send>(async () => ({ ok: true as const }));
    render(<DrawingPad info={drawer} model={model()} paused={false} timeUp send={send} requestSync={vi.fn()} />);
    fireEvent.pointerDown(surface(), { pointerId: 1, button: 0, clientX: 40, clientY: 30 });
    expect(send).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Крок назад' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('DrawingGuess (28c)', () => {
  it('a guess shows yes or no only', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    render(<DrawingGuess info={guesser} paused={false} timeUp={false} send={send} />);
    const field = screen.getByPlaceholderText('Що це?') as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: 'ромашка' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вгадати' }));
    // Подвійне натискання — одна спроба.
    fireEvent.click(screen.getByRole('button', { name: 'Вгадати' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:draw-guess', { text: 'ромашка' });
    await answer({ ok: false, error: 'drawing_miss' });
    expect(screen.getByText('Ні')).toBeTruthy();
    expect(field.value).toBe('');
    expect(field.disabled).toBe(false);
    expect(document.activeElement).toBe(field);
    // Без червоних тостів: лише м'який рядок.
    expect(document.querySelector('[role="alert"]')).toBeNull();
    wait(DRAWING_MISS_MS);
    expect(screen.queryByText('Ні')).toBeNull();
    fireEvent.change(field, { target: { value: 'соняшник' } });
    fireEvent.submit(field.closest('form')!);
    await answer({ ok: true });
    expect(screen.getByText('Вгадано!')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Що це?')).toBeNull();
  });

  it('too soon stays quiet and keeps the text', async () => {
    const { send, answer } = deferred();
    render(<DrawingGuess info={guesser} paused={false} timeUp={false} send={send} />);
    const field = screen.getByPlaceholderText('Що це?') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'маяк' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вгадати' }));
    await answer({ ok: false, error: 'too_soon' });
    expect(field.value).toBe('маяк');
    expect(document.querySelector('.drawing-guess-status')!.textContent).toBe('');
  });

  it('a guessed side sees only the yes, and a pause turns the field off', () => {
    const { rerender } = render(<DrawingGuess info={{ ...guesser, guessed: true, canGuess: false }} paused={false} timeUp={false} send={vi.fn<Send>()} />);
    expect(screen.getByText('Вгадано!')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Що це?')).toBeNull();
    rerender(<DrawingGuess info={{ ...guesser, canGuess: false }} paused timeUp={false} send={vi.fn<Send>()} />);
    expect((screen.getByPlaceholderText('Що це?') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Вгадати' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a teammate watches without a field', () => {
    render(<DrawingTeamWatch name="Оля" />);
    expect(screen.getByText('Малює Оля з вашої команди — ви не вгадуєте')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

const info = (over: Partial<DrawingInfo> = {}): DrawingInfo => ({
  drawerId: 'p1',
  drawerName: 'Оля',
  side: 'p1',
  rev: 3,
  guessed: 1,
  could: 3,
  word: null,
  guessers: null,
  drawerPoints: null,
  ...over,
});

describe('DrawingBoard and DrawingReveal (28c)', () => {
  it('the board tells who draws and how many guessed', () => {
    render(<DrawingBoard info={info()} />);
    expect(screen.getByText('Малює: Оля')).toBeTruthy();
    expect(screen.getByText('Вгадали 1 з 3')).toBeTruthy();
  });

  it('the reveal shows the word, the guessers with points and the drawer', () => {
    const revealed = info({ word: 'равлик', guessers: [{ id: 'p2', nickname: 'Тарас', points: 100 }, { id: 'p3', nickname: 'Ірина', points: 100 }], guessed: 2, drawerPoints: 67 });
    render(<DrawingReveal info={revealed} strokes={[{ c: 0, w: 1, p: [1, 1, 5, 5] }]} me="p3" />);
    expect(screen.getByText('Слово: равлик')).toBeTruthy();
    expect(screen.getByText('Тарас')).toBeTruthy();
    expect(screen.getByText('Ірина').closest('li')!.classList.contains('is-mine')).toBe(true);
    expect(screen.getAllByText('+100')).toHaveLength(2);
    expect(screen.getByText('Художник: Оля')).toBeTruthy();
    expect(screen.getByText('+67')).toBeTruthy();
    expect(document.querySelector('canvas')!.getAttribute('data-strokes')).toBe('1');
    cleanup();
    render(<DrawingReveal info={info({ word: 'маяк', guessers: [], guessed: 0, drawerPoints: 0 })} strokes={[]} />);
    expect(screen.getByText('Ніхто не вгадав')).toBeTruthy();
  });
});
