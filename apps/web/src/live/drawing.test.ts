import { describe, expect, it } from 'vitest';
import type { DrawingEvent, GameView, Stroke } from '@quiz/shared';
import { needsSync, reduceDrawing, type DrawingModel } from './drawing';

const stroke = (x: number): Stroke => ({ c: 0, w: 1, p: [x, x] });
const sync = (rev: number, strokes: Stroke[], questionIndex = 2): DrawingEvent => ({ kind: 'sync', questionIndex, rev, strokes });
const ops = (rev: number, op: Extract<DrawingEvent, { kind: 'ops' }>['op'], questionIndex = 2): DrawingEvent => ({ kind: 'ops', questionIndex, rev, op });
const viewAt = (questionIndex: number, rev: number | null) => ({ questionIndex, ...(rev === null ? {} : { drawing: { rev } }) }) as unknown as GameView;

describe('drawing model (28c)', () => {
  it('sync replaces and ops follow rev', () => {
    let model = reduceDrawing(null, sync(3, [stroke(1), stroke(2), stroke(3)]));
    expect(model).toEqual({ questionIndex: 2, rev: 3, strokes: [stroke(1), stroke(2), stroke(3)], stale: false });
    model = reduceDrawing(model, ops(4, { op: 'more', index: 2, p: [9, 9] }));
    expect(model.rev).toBe(4);
    expect(model.strokes[2]!.p).toEqual([3, 3, 9, 9]);
    const same = reduceDrawing(model, ops(4, { op: 'more', index: 2, p: [9, 9] }));
    expect(same).toBe(model);
    const ahead = reduceDrawing(model, ops(6, { op: 'undo' }));
    expect(ahead.stale).toBe(true);
    expect(ahead.strokes).toEqual(model.strokes);
    expect(reduceDrawing(model, ops(5, { op: 'clear' }, 1))).toBe(model);
    // sync знімає stale.
    expect(reduceDrawing(ahead, sync(6, [])).stale).toBe(false);
  });

  it('the first op of a fresh drawing needs no sync, a later one without a model does', () => {
    expect(reduceDrawing(null, ops(1, { op: 'begin', c: 1, w: 0, p: [5, 5] }))).toEqual({ questionIndex: 2, rev: 1, strokes: [{ c: 1, w: 0, p: [5, 5] }], stale: false });
    expect(reduceDrawing(null, ops(3, { op: 'undo' })).stale).toBe(true);
  });

  it('needsSync', () => {
    const model: DrawingModel = { questionIndex: 2, rev: 3, strokes: [], stale: false };
    expect(needsSync(model, viewAt(2, 5))).toBe(true);
    expect(needsSync(model, viewAt(2, 3))).toBe(false);
    expect(needsSync(model, viewAt(2, 2))).toBe(false);
    expect(needsSync(model, viewAt(3, 1))).toBe(true);
    expect(needsSync(null, viewAt(2, 1))).toBe(true);
    expect(needsSync({ ...model, stale: true }, viewAt(2, 3))).toBe(true);
    // Не «Малюнок» — нічого просити.
    expect(needsSync(model, viewAt(3, null))).toBe(false);
  });
});
