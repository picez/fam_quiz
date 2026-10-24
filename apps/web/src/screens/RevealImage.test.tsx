// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blurRadius, pixelColumns } from '../reveal';
import { RevealImage } from './RevealImage';

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), imageSmoothingEnabled: true })) as never;
});
afterEach(cleanup);

describe('RevealImage', () => {
  it('pixels draw into a canvas with the stage', () => {
    const { container } = render(<RevealImage url="/a.png" mode="pixels" stage={3} />);
    expect(container.querySelector('canvas.reveal-canvas[data-stage="3"]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('draws the small version with pixelColumns(stage) columns and caps the canvas size', async () => {
    const calls: unknown[][] = [];
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: (...args: unknown[]) => calls.push(args), imageSmoothingEnabled: true })) as never;
    class FakeImage {
      naturalWidth = 3000;
      naturalHeight = 1500;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const { container } = render(<RevealImage url="/a.png" mode="pixels" stage={3} />);
    await waitFor(() => expect(calls).toHaveLength(2));
    vi.unstubAllGlobals();
    const columns = pixelColumns(3)!;
    expect(calls[0].slice(3, 5)).toEqual([columns, Math.round(columns / 2)]);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(600);
  });

  it('blur sets the filter by the stage', () => {
    const { container } = render(<RevealImage url="/a.png" mode="blur" stage={3} />);
    expect(container.querySelector('img')!.style.filter).toBe(`blur(${blurRadius(3)}px)`);
    expect(container.querySelector('.reveal-frame')).not.toBeNull();
  });

  it('the last stage is the plain original', () => {
    for (const mode of ['pixels', 'blur'] as const) {
      const { container } = render(<RevealImage url="/a.png" mode={mode} stage={10} />);
      expect(container.querySelector('canvas')).toBeNull();
      expect(container.querySelector('img')!.style.filter).toBe('');
      cleanup();
    }
  });

  it('no mode is the usual picture; no url is nothing', () => {
    const { container } = render(<RevealImage url="/a.png" mode={null} stage={2} />);
    expect(container.querySelector('img.question-image')).not.toBeNull();
    expect(container.querySelector('[data-stage]')).toBeNull();
    cleanup();
    expect(render(<RevealImage url={null} mode="blur" stage={2} />).container.innerHTML).toBe('');
  });
});
