// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrophyEngine, TrophyMount } from './engine-types';
import type { TrophyLook } from './trophy-meta';
import { loadTrophyEngine, webglAvailable } from './loadEngine';
import { TrophyView, type TrophyViewHandle } from './TrophyView';

vi.mock('./loadEngine', () => ({ loadTrophyEngine: vi.fn(), webglAvailable: vi.fn() }));

const load = vi.mocked(loadTrophyEngine);
const webgl = vi.mocked(webglAvailable);

interface Mounted {
  host: HTMLElement;
  options: TrophyMount;
  events: { onReady(): void; onError(): void };
  dispose: ReturnType<typeof vi.fn>;
}
let mounts: Mounted[] = [];
let mountedHandles: {
  dispose: ReturnType<typeof vi.fn>;
  replayAppearance: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}[] = [];
const fakeEngine: TrophyEngine = {
  mount(host, options, events) {
    const dispose = vi.fn();
    mounts.push({ host, options, events, dispose });
    const handle = { dispose, replayAppearance: vi.fn(), update: vi.fn() };
    mountedHandles.push(handle);
    return handle;
  },
};

beforeEach(() => {
  mounts = [];
  mountedHandles = [];
  load.mockReset();
  webgl.mockReset();
  webgl.mockReturnValue(true);
  load.mockResolvedValue(fakeEngine);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const gold = { kind: 'cup', material: 'gold' } as const;
const flush = () => act(async () => {});

describe('TrophyView', () => {
  it('without WebGL shows the emoji in the material colour and never loads the engine', async () => {
    webgl.mockReturnValue(false);
    render(<TrophyView trophy={gold} size="card" spin interactive={false} />);
    await flush();
    const icon = document.querySelector('.trophy-fallback') as HTMLElement;
    expect(icon.textContent).toBe('🏆');
    expect(icon.getAttribute('aria-label')).toBe('Золотий кубок');
    expect(icon.style.color).not.toBe('');
    expect(load).not.toHaveBeenCalled();
    expect(mounts).toEqual([]);
  });

  it('keeps the emoji when the engine chunk fails to load', async () => {
    load.mockResolvedValue(null);
    render(<TrophyView trophy={gold} size="card" spin interactive={false} />);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
    expect(mounts).toEqual([]);
  });

  it('mounts with the full look', async () => {
    const trophy: TrophyLook = {
      kind: 'medal',
      material: 'silver',
      decor: {
        photos: [],
        photoPlace: 'medallion',
        frame: 'none',
        photoStyle: 'normal',
        inscriptions: [{ place: 'back', text: 'Для Оді', font: null, look: 'engraved', color: '#3a2a0e' }],
        effect: { kind: 'none' },
        appearance: 'spin',
        stickers: [],
      },
    };
    const { container } = render(<TrophyView trophy={trophy} size="stage" spin interactive />);
    await flush();
    expect(mounts).toHaveLength(1);
    const [mounted] = mounts;
    expect(mounted!.host).toBe(container.querySelector('.trophy'));
    expect(mounted!.options).toEqual({ look: trophy, size: 'stage', spin: true, interactive: true, label: 'Срібна медаль', appear: true });
  });

  it('keeps the emoji until ready and brings it back on error', async () => {
    render(<TrophyView trophy={gold} size="stage" spin interactive={false} />);
    await flush();
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
    expect(document.querySelector('.trophy.is-loading')).not.toBeNull();
    await act(async () => mounts[0]!.events.onReady());
    expect(document.querySelector('.trophy-fallback')).toBeNull();
    expect(document.querySelector('.trophy.is-loading')).toBeNull();
    await act(async () => mounts[0]!.events.onError());
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
    expect(document.querySelector('.trophy.is-loading')).not.toBeNull();
  });

  it('reduced motion turns the spin off', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    render(<TrophyView trophy={gold} size="phone" spin interactive={false} />);
    await flush();
    expect(mounts[0]!.options.spin).toBe(false);
    expect(mounts[0]!.options.interactive).toBe(false);
  });

  it('a new material or kind updates in place, disposes on unmount', async () => {
    const { rerender, unmount } = render(<TrophyView trophy={gold} size="card" spin={false} interactive={false} />);
    await flush();
    expect(mounts).toHaveLength(1);
    await act(async () => mounts[0]!.events.onReady());
    const update = mountedHandles[0]!.update;
    rerender(<TrophyView trophy={{ kind: 'cup', material: 'bronze' }} size="card" spin={false} interactive={false} />);
    await flush();
    expect(update).toHaveBeenLastCalledWith({ kind: 'cup', material: 'bronze' }, 'Бронзовий кубок');
    rerender(<TrophyView trophy={{ kind: 'medal', material: 'bronze' }} size="card" spin={false} interactive={false} />);
    await flush();
    expect(update).toHaveBeenLastCalledWith({ kind: 'medal', material: 'bronze' }, 'Бронзова медаль');
    expect(update).toHaveBeenCalledTimes(2);
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.dispose).not.toHaveBeenCalled();
    // Старий кубок видно, доки рушій не поставить новий: значок не повертається.
    expect(document.querySelector('.trophy-fallback')).toBeNull();
    // Той самий вигляд новим об'єктом — без update.
    rerender(<TrophyView trophy={{ kind: 'medal', material: 'bronze' }} size="card" spin={false} interactive={false} />);
    await flush();
    expect(update).toHaveBeenCalledTimes(2);
    unmount();
    expect(mounts[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it('a remount mounts the latest look and label', async () => {
    const { rerender } = render(<TrophyView trophy={gold} size="card" spin={false} interactive={false} />);
    await flush();
    rerender(<TrophyView trophy={{ kind: 'star', material: 'silver' }} size="card" spin={false} interactive={false} />);
    rerender(<TrophyView trophy={{ kind: 'star', material: 'silver' }} size="phone" spin={false} interactive={false} />);
    await flush();
    expect(mounts).toHaveLength(2);
    expect(mounts[1]!.options.look).toEqual({ kind: 'star', material: 'silver' });
    expect(mounts[1]!.options.label).toBe(mounts[1]!.host.querySelector('.trophy-fallback')!.getAttribute('aria-label'));
    // Новий кубок ще не намалювався: до його onReady знову значок.
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
    expect(mountedHandles[1]!.update).not.toHaveBeenCalled();
  });

  it('appear defaults to true', async () => {
    render(<TrophyView trophy={gold} size="card" spin={false} interactive={false} />);
    await flush();
    expect(mounts[0]!.options.appear).toBe(true);
  });

  it('appear false is passed', async () => {
    render(<TrophyView trophy={gold} size="card" spin={false} interactive={false} appear={false} />);
    await flush();
    expect(mounts[0]!.options.appear).toBe(false);
  });

  it('ref replays the appearance', async () => {
    const ref = createRef<TrophyViewHandle>();
    render(<TrophyView trophy={gold} size="card" spin={false} interactive={false} ref={ref} />);
    // Рушій ще не завантажений: виклик нічого не робить і не кидає.
    expect(() => ref.current!.replayAppearance()).not.toThrow();
    await flush();
    ref.current!.replayAppearance();
    expect(mountedHandles[0]!.replayAppearance).toHaveBeenCalledTimes(1);
  });

  it('a late onReady from a disposed mount does not hide the emoji', async () => {
    const { rerender } = render(<TrophyView trophy={gold} size="card" spin={false} interactive={false} />);
    await flush();
    rerender(<TrophyView trophy={gold} size="phone" spin={false} interactive={false} />);
    await flush();
    await act(async () => mounts[0]!.events.onReady());
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
  });

  it('a new look updates instead of remounting', async () => {
    const { rerender } = render(<TrophyView trophy={gold} size="view" spin={false} interactive />);
    await flush();
    await act(async () => mounts[0]!.events.onReady());
    const next: TrophyLook = {
      ...gold,
      decor: {
        photos: [],
        photoPlace: 'ring',
        frame: 'none',
        photoStyle: 'normal',
        inscriptions: [],
        effect: { kind: 'glow', color: '#ffd36b' },
        appearance: 'drop',
        stickers: [],
      },
    };
    rerender(<TrophyView trophy={next} size="view" spin={false} interactive />);
    await flush();
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.dispose).not.toHaveBeenCalled();
    expect(mountedHandles[0]!.update).toHaveBeenCalledTimes(1);
    expect(mountedHandles[0]!.update).toHaveBeenCalledWith(next, 'Золотий кубок');
    expect(document.querySelector('.trophy-fallback')).toBeNull();
    // Той самий вигляд новим об'єктом — без повторного update.
    rerender(<TrophyView trophy={{ ...next }} size="view" spin={false} interactive />);
    await flush();
    expect(mountedHandles[0]!.update).toHaveBeenCalledTimes(1);
  });

  it('a new size remounts', async () => {
    const { rerender } = render(<TrophyView trophy={gold} size="view" spin={false} interactive />);
    await flush();
    rerender(<TrophyView trophy={gold} size="card" spin={false} interactive />);
    await flush();
    expect(mounts[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(mounts).toHaveLength(2);
    expect(mounts[1]!.options.size).toBe('card');
    expect(mountedHandles[0]!.update).not.toHaveBeenCalled();
    expect(mountedHandles[1]!.update).not.toHaveBeenCalled();
  });

  it('after a failed model load the next look change remounts', async () => {
    const { rerender } = render(<TrophyView trophy={gold} size="view" spin={false} interactive />);
    await flush();
    await act(async () => mounts[0]!.events.onError());
    expect(document.querySelector('.trophy-fallback')).not.toBeNull();
    rerender(<TrophyView trophy={{ kind: 'cup', material: 'silver' }} size="view" spin={false} interactive />);
    await flush();
    expect(mountedHandles[0]!.update).not.toHaveBeenCalled();
    expect(mounts[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(mounts).toHaveLength(2);
    expect(mounts[1]!.options.look).toEqual({ kind: 'cup', material: 'silver' });
    expect(mounts[1]!.options.label).toBe('Срібний кубок');
    await act(async () => mounts[1]!.events.onReady());
    expect(document.querySelector('.trophy-fallback')).toBeNull();
    // Новий handle живий: далі знову update без перемонтування.
    rerender(<TrophyView trophy={{ kind: 'cup', material: 'bronze' }} size="view" spin={false} interactive />);
    await flush();
    expect(mounts).toHaveLength(2);
    expect(mountedHandles[1]!.update).toHaveBeenCalledWith({ kind: 'cup', material: 'bronze' }, 'Бронзовий кубок');
  });
});
