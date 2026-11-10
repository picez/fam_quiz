// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { packStrokes } from '@quiz/shared';
import { HistoryDrawing } from './GameHistory';

afterEach(cleanup);

describe('HistoryDrawing (28c)', () => {
  it('shows the unpacked drawing and the drawer', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const strokes = [{ c: 0, w: 1, p: [10, 10, 500, 400, 600, 420] }, { c: 8, w: 2, p: [300, 300] }];
    render(<HistoryDrawing drawing={{ drawer: 'Оля', strokes: packStrokes(strokes) }} />);
    expect(screen.getByText('Художник: Оля')).toBeTruthy();
    const canvas = document.querySelector('canvas')!;
    expect(canvas.getAttribute('data-strokes')).toBe('2');
    expect(canvas.getAttribute('data-points')).toBe('4');
  });
});
