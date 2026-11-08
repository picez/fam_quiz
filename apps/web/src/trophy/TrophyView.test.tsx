// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadViewer, webglAvailable } from './loadViewer';
import { TrophyView } from './TrophyView';

vi.mock('./loadViewer', () => ({ loadViewer: vi.fn(), webglAvailable: vi.fn() }));

const load = vi.mocked(loadViewer);
const webgl = vi.mocked(webglAvailable);

beforeEach(() => {
  load.mockReset();
  webgl.mockReset();
  webgl.mockReturnValue(true);
  load.mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const gold = { kind: 'cup', material: 'gold' } as const;
const flush = () => act(async () => {});

describe('TrophyView', () => {
  it('without WebGL shows the emoji in the material colour and never loads the viewer', async () => {
    webgl.mockReturnValue(false);
    render(<TrophyView trophy={gold} size="card" spin interactive={false} />);
    await flush();
    const icon = document.querySelector('.trophy-fallback') as HTMLElement;
    expect(icon.textContent).toBe('🏆');
    expect(icon.getAttribute('aria-label')).toBe('Золотий кубок');
    expect(icon.style.color).not.toBe('');
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector('model-viewer')).toBeNull();
  });

  it('keeps the emoji when the viewer module fails to load', async () => {
    load.mockResolvedValue(false);
    render(<TrophyView trophy={gold} size="card" spin interactive={false} />);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
    expect(document.querySelector('model-viewer')).toBeNull();
  });

  it('shows the baked family model for a grail without decor', async () => {
    render(<TrophyView trophy={{ kind: 'grail', material: 'gold' }} size="card" spin interactive={false} />);
    await flush();
    expect(document.querySelector('model-viewer[src="/models/grail-family.glb"]')).not.toBeNull();
  });

  it('puts a model-viewer of the kind once the module is ready', async () => {
    render(<TrophyView trophy={{ kind: 'medal', material: 'silver' }} size="stage" spin interactive />);
    await flush();
    const viewer = document.querySelector('model-viewer')!;
    expect(viewer.getAttribute('src')).toBe('/models/medal.glb');
    expect(viewer.getAttribute('alt')).toBe('Срібна медаль');
    expect(viewer.hasAttribute('auto-rotate')).toBe(true);
    expect(viewer.hasAttribute('camera-controls')).toBe(true);
    expect(viewer.hasAttribute('disable-zoom')).toBe(true);
  });

  it('keeps the emoji until the model loads and brings it back on an error', async () => {
    render(<TrophyView trophy={gold} size="stage" spin interactive={false} />);
    await flush();
    const viewer = document.querySelector('model-viewer')!;
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
    expect(viewer.classList.contains('is-loading')).toBe(true);
    await act(async () => {
      viewer.dispatchEvent(new Event('load'));
    });
    expect(document.querySelector('.trophy-fallback')).toBeNull();
    expect(viewer.classList.contains('is-loading')).toBe(false);
    await act(async () => {
      viewer.dispatchEvent(new Event('error'));
    });
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
    expect(viewer.classList.contains('is-loading')).toBe(true);
  });

  it('does not spin under reduced motion and has no camera controls when not interactive', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    render(<TrophyView trophy={gold} size="phone" spin interactive={false} />);
    await flush();
    const viewer = document.querySelector('model-viewer')!;
    expect(viewer.hasAttribute('auto-rotate')).toBe(false);
    expect(viewer.hasAttribute('camera-controls')).toBe(false);
  });

  it('paints every material of the model on load', async () => {
    render(<TrophyView trophy={{ kind: 'star', material: 'bronze' }} size="card" spin={false} interactive={false} />);
    await flush();
    const viewer = document.querySelector('model-viewer')! as HTMLElement & { model?: unknown };
    const material = () => ({
      pbrMetallicRoughness: { setBaseColorFactor: vi.fn(), setMetallicFactor: vi.fn(), setRoughnessFactor: vi.fn() },
    });
    const materials = [material(), material()];
    viewer.model = { materials };
    await act(async () => {
      viewer.dispatchEvent(new Event('load'));
    });
    for (const { pbrMetallicRoughness: pbr } of materials) {
      expect(pbr.setBaseColorFactor).toHaveBeenCalledWith('#B0703A');
      expect(pbr.setMetallicFactor).toHaveBeenCalledWith(1);
      expect(pbr.setRoughnessFactor).toHaveBeenCalledWith(0.35);
    }
    expect(viewer.hasAttribute('auto-rotate')).toBe(false);
  });
});
