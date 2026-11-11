// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrophyEngine } from './engine-types';
import { loadTrophyEngine, webglAvailable } from './loadEngine';
import { clearTrophyPictures, trophyPicture } from './picture-cache';
import { TrophyPicture } from './TrophyPicture';

vi.mock('./loadEngine', () => ({ loadTrophyEngine: vi.fn(), webglAvailable: vi.fn() }));

const load = vi.mocked(loadTrophyEngine);
const webgl = vi.mocked(webglAvailable);

const snapshot = vi.fn<NonNullable<TrophyEngine['snapshot']>>();
const mount = vi.fn<TrophyEngine['mount']>();
const fakeEngine: TrophyEngine = { mount, snapshot };

const gold = { kind: 'cup', material: 'gold' } as const;
const flush = () => act(async () => {});

beforeEach(() => {
  clearTrophyPictures();
  load.mockReset();
  webgl.mockReset();
  snapshot.mockReset();
  mount.mockReset();
  webgl.mockReturnValue(true);
  load.mockResolvedValue(fakeEngine);
  snapshot.mockResolvedValue('data:image/webp;base64,CUP');
});
afterEach(cleanup);

describe('TrophyPicture', () => {
  it('without WebGL keeps the emoji in the material colour and never loads the engine', async () => {
    webgl.mockReturnValue(false);
    render(<TrophyPicture trophy={gold} />);
    await flush();
    const icon = screen.getByRole('img', { name: 'Золотий кубок' });
    expect(icon.tagName).toBe('SPAN');
    expect(icon.textContent).toBe('🏆');
    expect(icon.style.color).not.toBe('');
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps the emoji when the engine chunk fails or the snapshot fails', async () => {
    load.mockResolvedValueOnce(null);
    const { unmount } = render(<TrophyPicture trophy={gold} />);
    await flush();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Золотий кубок' }).textContent).toBe('🏆');
    unmount();

    snapshot.mockResolvedValueOnce(null);
    render(<TrophyPicture trophy={{ kind: 'medal', material: 'silver' }} />);
    await flush();
    expect(document.querySelector('img')).toBeNull();

    cleanup();
    snapshot.mockRejectedValueOnce(new Error('lost'));
    render(<TrophyPicture trophy={{ kind: 'star', material: 'bronze' }} />);
    await flush();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows the snapshot as an <img> with the label as alt once it resolves, and never mounts a live scene', async () => {
    render(<TrophyPicture trophy={gold} />);
    expect(document.querySelector('img')).toBeNull();
    await flush();
    const img = document.querySelector('img.trophy-picture') as HTMLImageElement;
    expect(img.src).toBe('data:image/webp;base64,CUP');
    expect(img.alt).toBe('Золотий кубок');
    expect(snapshot).toHaveBeenCalledWith(gold, 'Золотий кубок');
    expect(mount).not.toHaveBeenCalled();
  });

  it('equal looks share one snapshot; a cached one shows at once', async () => {
    render(
      <>
        <TrophyPicture trophy={{ kind: 'cup', material: 'gold' }} />
        <TrophyPicture trophy={{ kind: 'cup', material: 'gold' }} />
      </>,
    );
    await flush();
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('img.trophy-picture')).toHaveLength(2);
    cleanup();
    render(<TrophyPicture trophy={{ kind: 'cup', material: 'gold' }} />);
    expect(document.querySelector('img.trophy-picture')).not.toBeNull();
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('a failed snapshot is retried on the next show', async () => {
    snapshot.mockResolvedValueOnce(null);
    expect(await trophyPicture(gold)).toBeNull();
    expect(await trophyPicture(gold)).toBe('data:image/webp;base64,CUP');
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it('snapshots run one at a time', async () => {
    const releases: ((url: string) => void)[] = [];
    snapshot.mockImplementation(() => new Promise((resolve) => releases.push(resolve)));
    const first = trophyPicture(gold);
    const second = trophyPicture({ kind: 'medal', material: 'silver' });
    await flush();
    expect(snapshot).toHaveBeenCalledTimes(1);
    releases[0]!('data:a');
    await flush();
    expect(snapshot).toHaveBeenCalledTimes(2);
    releases[1]!('data:b');
    await expect(first).resolves.toBe('data:a');
    await expect(second).resolves.toBe('data:b');
  });
});
