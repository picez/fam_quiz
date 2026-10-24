// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blurRadius } from '../reveal';
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
