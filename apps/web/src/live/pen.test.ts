import { describe, expect, it } from 'vitest';
import { DRAWING_ERASER, LIMITS, type DrawOp } from '@quiz/shared';
import { createPen } from './pen';

const points = (ops: DrawOp[]) => ops.flatMap((op) => (op.op === 'begin' || op.op === 'more' ? op.p : []));

describe('pen (28c)', () => {
  it('quantizes and thins points', () => {
    const pen = createPen(() => 0);
    pen.down(0.5004, 0.5, 0, 1);
    pen.move(0.501, 0.5); // 1 одиниця — не точка
    pen.move(0.503, 0.5); // 3 одиниці від останньої — точка
    pen.move(2, -1); // поза полотном — до краю
    const ops = pen.flush();
    expect(ops).toEqual([{ op: 'begin', c: 0, w: 1, p: [500, 500, 503, 500, 1000, 0] }]);
  });

  it('the first flush begins a stroke, the rest continue it', () => {
    const pen = createPen(() => 4);
    pen.down(0.1, 0.1, 2, 0);
    for (let i = 1; i <= 10; i += 1) pen.move(0.1 + i * 0.01, 0.1);
    const first = pen.flush();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ op: 'begin', c: 2, w: 0 });
    expect(points(first)).toHaveLength(22);
    expect(pen.flush()).toEqual([]);
    pen.move(0.5, 0.5);
    pen.up();
    expect(pen.flush()).toEqual([{ op: 'more', index: 4, p: [500, 500] }]);
    // Після up рух нічого не додає.
    pen.move(0.9, 0.9);
    expect(pen.flush()).toEqual([]);
  });

  it('a long stroke splits without a gap', () => {
    let strokes = 0;
    const pen = createPen(() => strokes);
    pen.down(0, 0, 0, 0);
    for (let i = 1; i < 450; i += 1) pen.move((i % 100) / 100, Math.floor(i / 100) / 10);
    pen.up();
    const ops = pen.flush();
    for (const op of ops) if (op.op === 'begin' || op.op === 'more') expect(op.p.length).toBeLessThanOrEqual(LIMITS.drawBatch * 2);
    const begins = ops.filter((op) => op.op === 'begin');
    expect(begins).toHaveLength(2);
    const byStroke = new Map<number, number[]>();
    let index = strokes - 1;
    for (const op of ops) {
      if (op.op === 'begin') {
        index += 1;
        byStroke.set(index, [...op.p]);
      } else if (op.op === 'more') {
        expect(op.index).toBe(index);
        byStroke.get(op.index)!.push(...op.p);
      }
    }
    strokes = byStroke.size;
    const [a, b] = [byStroke.get(0)!, byStroke.get(1)!];
    expect(a.length / 2).toBe(LIMITS.maxStrokePoints);
    expect(b.slice(0, 2)).toEqual(a.slice(-2));
    expect(a.length / 2 + b.length / 2 - 1).toBe(450);
  });

  it('a stroke that splits across flushes keeps its own indexes', () => {
    let strokes = 7;
    const pen = createPen(() => strokes);
    pen.down(0, 0, 0, 0);
    for (let i = 1; i < 10; i += 1) pen.move(i / 100, 0);
    expect(pen.flush()[0]).toMatchObject({ op: 'begin' });
    strokes = 8;
    for (let i = 10; i < 420; i += 1) pen.move((i % 100) / 100, Math.floor(i / 100) / 10);
    const ops = pen.flush();
    expect(ops.filter((op) => op.op === 'more').every((op) => op.op === 'more' && (op.index === 7 || op.index === 8))).toBe(true);
    expect(ops.filter((op) => op.op === 'begin')).toHaveLength(1);
  });

  it('an eraser stroke uses the eraser color', () => {
    const pen = createPen(() => 0);
    pen.down(0.2, 0.2, DRAWING_ERASER, 2);
    pen.up();
    expect(pen.flush()).toEqual([{ op: 'begin', c: DRAWING_ERASER, w: 2, p: [200, 200] }]);
  });
});
