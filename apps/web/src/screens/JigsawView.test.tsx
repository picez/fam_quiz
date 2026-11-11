// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jigsawTabs, type PlayerJigsaw, type PublicJigsaw, type PublicQuestion } from '@quiz/shared';
import { t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { JigsawPlay, JigsawReveal } from './JigsawView';

const JIGSAW: PublicJigsaw = { photo: '/uploads/0123456789abcdef0123.jpg', aspect: '4:3', focus: { x: 0.5, y: 0.5 }, rows: 3, cols: 4, tabs: jigsawTabs(3, 4, 1), preview: false };
const infoOf = (over: Partial<PlayerJigsaw> = {}): PlayerJigsaw => ({ placed: [], held: [], done: false, canPlace: true, seq: 0, timeMs: null, result: null, ...over });
const questionOf = (jigsaw: Partial<PublicJigsaw> = {}) => ({ type: 'jigsaw', text: 'Пазл', jigsaw: { ...JIGSAW, ...jigsaw } }) as unknown as PublicQuestion;

/** Рамка 304 × 228 у (0, 0): клітинка 76 × 76. Решта елементів — нульові прямокутники в (0, 0). */
const CELL = 76;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const frame = this.classList.contains('jigsaw-frame');
    const width = frame ? 304 : 0;
    const height = frame ? 228 : 0;
    return { left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(over: { info?: PlayerJigsaw; jigsaw?: Partial<PublicJigsaw>; team?: boolean; send?: Send } = {}) {
  const send = over.send ?? vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: true }));
  const view = render(<JigsawPlay info={over.info ?? infoOf()} question={questionOf(over.jigsaw)} questionIndex={2} actorId="p1" paused={false} timeUp={false} send={send} team={over.team} />);
  return { send, ...view };
}

const pieceEl = (piece: number) => document.querySelector<HTMLElement>(`.jigsaw-pile [data-piece="${piece}"]`)!;
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 10, clientY: 10 });
};
/** Тягне шматочок так, щоб лівий верхній кут ядра впав у клітинку (col, row) рамки. */
function dragTo(el: HTMLElement, col: number, row: number) {
  // Елемент має нульовий прямокутник у (0, 0): палець на (0, 0) — це центр ядра, тож кут ядра — (−38, −38).
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
  const x = col * CELL + CELL / 2;
  const y = row * CELL + CELL / 2;
  fireEvent.pointerMove(el, { pointerId: 1, clientX: x / 2, clientY: y / 2 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: x, clientY: y });
}
/** Тапами повертає шматочок до rot. */
function turnTo(piece: number, rot: number) {
  for (let i = 0; i < 4 && pieceEl(piece).dataset.rot !== String(rot); i += 1) tap(pieceEl(piece));
  expect(pieceEl(piece).dataset.rot).toBe(String(rot));
}

describe('JigsawPlay', () => {
  it('shows every piece in the pile', () => {
    mount();
    expect(document.querySelectorAll('.jigsaw-pile .jigsaw-piece')).toHaveLength(12);
    expect(screen.getByLabelText(t('jigsawFrame'))).toBeTruthy();
  });

  it('a tap turns a piece', () => {
    mount();
    const el = document.querySelector<HTMLElement>('.jigsaw-pile [data-rot="0"]')!;
    const piece = Number(el.dataset.piece);
    tap(el);
    expect(pieceEl(piece).dataset.rot).toBe('1');
  });

  it('an upright piece dropped on its place snaps with the round-local number', () => {
    const { send } = mount();
    turnTo(5, 0);
    dragTo(pieceEl(5), 1, 1);
    expect(send).toHaveBeenCalledWith('player:jigsaw', { questionIndex: 2, piece: 5, x: 1, y: 1, rot: 0 });
    expect(document.querySelector('.jigsaw-frame [data-piece="5"].is-placed')).toBeTruthy();
    expect(pieceEl(5)).toBeNull();
  });

  it('a turned piece does not snap', () => {
    const { send } = mount();
    turnTo(5, 1);
    dragTo(pieceEl(5), 1, 1);
    expect(send).not.toHaveBeenCalled();
    // Лежить на рамці, де відпустили, вільний.
    expect(document.querySelector('.jigsaw-frame [data-piece="5"].is-loose')).toBeTruthy();
  });

  it('a piece dropped off the frame goes back to the pile', () => {
    const { send } = mount();
    const el = pieceEl(5);
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 500 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 500 });
    expect(send).not.toHaveBeenCalled();
    expect(pieceEl(5)).toBeTruthy();
  });

  it("a teammate's held piece cannot be taken", () => {
    const { send } = mount({ info: infoOf({ held: [{ piece: 5, tone: '2' }] }), team: true });
    const el = pieceEl(5);
    expect(el.className).toContain('is-held');
    expect(el.className).toContain('by-2');
    const rot = el.dataset.rot;
    tap(el);
    expect(pieceEl(5).dataset.rot).toBe(rot);
    dragTo(pieceEl(5), 1, 1);
    expect(send).not.toHaveBeenCalled();
    expect(pieceEl(5)).toBeTruthy();
  });

  it('a dragged piece in a team says it is held', () => {
    const { send } = mount({ team: true });
    const el = pieceEl(3);
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 30, clientY: 30 });
    expect(send).toHaveBeenCalledWith('player:jigsaw-hold', { questionIndex: 2, piece: 3 });
    expect(document.querySelector('[data-dragging="3"]')).toBeTruthy();
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 30, clientY: 600 });
    expect(document.querySelector('[data-dragging]')).toBeNull();
  });

  it('a drag redraws only the lifted piece', async () => {
    // Фото «завантажується» одразу: шматочки малюються з нього.
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(900);
    vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLImageElement) {
      queueMicrotask(() => this.onload?.(new Event('load')));
    });
    vi.stubGlobal('Path2D', class {});
    const drawImage = vi.fn();
    const noop = () => undefined;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, setTransform: noop, clearRect: noop, translate: noop, save: noop, restore: noop, clip: noop, fill: noop, stroke: noop } as never);
    mount();
    await act(async () => undefined);
    expect(drawImage).toHaveBeenCalledTimes(12);
    const el = pieceEl(3);
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 20, clientY: 20 });
    // Перший рух: з'являється лише шматочок у пальці.
    expect(drawImage).toHaveBeenCalledTimes(13);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 60, clientY: 60 });
    expect(drawImage).toHaveBeenCalledTimes(13);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 60, clientY: 600 });
    vi.unstubAllGlobals();
  });

  it('a piece turns from the keyboard', () => {
    mount();
    const el = document.querySelector<HTMLElement>('.jigsaw-pile [data-rot="0"]')!;
    const piece = Number(el.dataset.piece);
    expect(el.tabIndex).toBe(0);
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(pieceEl(piece).dataset.rot).toBe('1');
    fireEvent.keyDown(pieceEl(piece), { key: ' ' });
    expect(pieceEl(piece).dataset.rot).toBe('2');
  });

  it('pieces are not inside an image role', () => {
    mount();
    turnTo(5, 1);
    dragTo(pieceEl(5), 1, 1);
    const onFrame = document.querySelector('.jigsaw-frame [data-piece="5"]')!;
    expect(onFrame.closest('[role="img"]')).toBeNull();
  });

  it('the preview shows only when allowed', () => {
    mount();
    expect(screen.queryByAltText(t('jigsawPreview'))).toBeNull();
    cleanup();
    mount({ jigsaw: { preview: true } });
    expect(screen.getByAltText(t('jigsawPreview'))).toBeTruthy();
  });

  it('fits 320 px', () => {
    for (const jigsaw of [{}, { aspect: '1:1', rows: 6, cols: 6, tabs: jigsawTabs(6, 6, 3) }, { aspect: '3:4', rows: 4, cols: 3, tabs: jigsawTabs(4, 3, 2) }] as Partial<PublicJigsaw>[]) {
      mount({ jigsaw });
      const frame = document.querySelector<HTMLElement>('.jigsaw-frame')!;
      expect(parseFloat(frame.style.width)).toBeLessThanOrEqual(304);
      for (const slot of document.querySelectorAll<HTMLElement>('.jigsaw-slot')) expect(parseFloat(slot.style.width)).toBeLessThanOrEqual(320);
      for (const piece of document.querySelectorAll<HTMLElement>('.jigsaw-piece')) expect(parseFloat(piece.style.width)).toBeLessThanOrEqual(320);
      cleanup();
    }
  });

  it('nothing moves while paused', () => {
    const send = vi.fn<Send>();
    render(<JigsawPlay info={infoOf()} question={questionOf()} questionIndex={2} actorId="p1" paused timeUp={false} send={send} />);
    const rot = pieceEl(5).dataset.rot;
    tap(pieceEl(5));
    dragTo(pieceEl(5), 1, 1);
    expect(pieceEl(5).dataset.rot).toBe(rot);
    expect(send).not.toHaveBeenCalled();
  });

  it('a finished jigsaw says the time', () => {
    mount({ info: infoOf({ placed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], done: true, canPlace: false, timeMs: 47_300 }) });
    expect(screen.getByRole('status').textContent).toContain('47,3');
    expect(document.querySelector('.jigsaw-pile')).toBeNull();
  });
});

describe('JigsawReveal', () => {
  it('shows my placed pieces over the faint picture', () => {
    render(<JigsawReveal mine={infoOf({ placed: [0, 1, 2] })} question={questionOf()} />);
    expect(document.querySelectorAll('.jigsaw-frame .is-placed')).toHaveLength(3);
    expect(document.querySelector('.jigsaw-ghost')).toBeTruthy();
    expect(screen.getByText(t('jigsawAnswerPart', { placed: 3, total: 12 }))).toBeTruthy();
  });
});
