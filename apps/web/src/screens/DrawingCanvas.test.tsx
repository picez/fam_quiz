// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAWING_BACKGROUND, DRAWING_COLORS, DRAWING_ERASER, type Stroke } from '@quiz/shared';
import { DrawingCanvas } from './DrawingCanvas';

/** Фальшивий 2D-контекст: пише, що й яким кольором малювали. */
function fakeContext() {
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    styles: [] as string[],
  };
  ctx.stroke.mockImplementation(() => ctx.styles.push(ctx.strokeStyle));
  return ctx;
}

let ctx: ReturnType<typeof fakeContext>;
beforeEach(() => {
  ctx = fakeContext();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
});
afterEach(cleanup);

const line = (c: number, ...p: number[]): Stroke => ({ c, w: 1, p });

describe('DrawingCanvas (28c)', () => {
  it('tells the strokes and points it shows and keeps 4:3', () => {
    const { container } = render(<DrawingCanvas strokes={[line(0, 0, 0, 10, 10), line(1, 5, 5)]} label="Малюнок" />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Малюнок');
    expect(canvas.dataset.strokes).toBe('2');
    expect(canvas.dataset.points).toBe('3');
    expect(canvas.width * 3).toBe(canvas.height * 4);
    expect(ctx.lineCap).toBe('round');
    // Штрих з однієї точки — крапка.
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('draws new points only, and redraws everything after an undo', () => {
    const first = [line(0, 0, 0, 10, 10)];
    const { container, rerender } = render(<DrawingCanvas strokes={first} label="Малюнок" />);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    ctx.moveTo.mockClear();
    rerender(<DrawingCanvas strokes={[line(0, 0, 0, 10, 10, 20, 20), line(2, 30, 30, 40, 40)]} label="Малюнок" />);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    // Лише новий відрізок старого штриха й новий штрих.
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
    expect(container.querySelector('canvas')!.dataset.points).toBe('5');
    rerender(<DrawingCanvas strokes={[line(0, 0, 0, 10, 10, 20, 20)]} label="Малюнок" />);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    expect(container.querySelector('canvas')!.dataset.strokes).toBe('1');
  });

  it('redraws when the last stroke was replaced by another of the same color, width and length', () => {
    const { rerender } = render(<DrawingCanvas strokes={[line(0, 0, 0, 10, 10)]} label="Малюнок" />);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    // Крок назад і новий штрих в одному рендері (чи sync з одним штрихом): старі пікселі мусять зникнути.
    rerender(<DrawingCanvas strokes={[line(0, 500, 500, 600, 600, 700, 700)]} label="Малюнок" />);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    // Той самий штрих, що лише виріс, — дорисовується.
    rerender(<DrawingCanvas strokes={[line(0, 500, 500, 600, 600, 700, 700, 800, 800)]} label="Малюнок" />);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
  });

  it('draws the live stroke on top and paints the eraser with the background', () => {
    const { container } = render(<DrawingCanvas strokes={[line(0, 0, 0, 10, 10)]} live={line(DRAWING_ERASER, 5, 5, 9, 9)} label="Малюнок" />);
    expect(container.querySelector('canvas')!.dataset.strokes).toBe('2');
    expect(ctx.styles).toEqual([DRAWING_COLORS[0], DRAWING_BACKGROUND]);
  });
});
