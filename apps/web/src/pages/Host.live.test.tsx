// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostDrafts, SortTilt } from '@quiz/shared';
import { saveHost } from '../storage';
import { Host } from './Host';

/** Сторінка пульта (12b): «наживо» маскує пакет і нахили й забуває їх на кожному перемиканні. */
const { game, screens } = vi.hoisted(() => ({
  game: {
    view: { role: 'host' } as unknown,
    status: 'live',
    hostOnline: true,
    stageOnline: true,
    audioCommand: null,
    offsetMs: 0,
    closed: null,
    tilts: {} as Record<string, unknown>,
    drafts: null as unknown,
    forgetLive: (() => {}) as () => void,
    send: (async () => ({ ok: true })) as unknown,
  },
  screens: [] as { watch: boolean; onWatch: (on: boolean) => void; drafts: unknown; tilts: unknown }[],
}));

vi.mock('../live/useGame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../live/useGame')>()),
  useGame: () => game,
}));
vi.mock('../screens/HostScreen', () => ({
  HostScreen: (props: (typeof screens)[number]) => {
    screens.push(props);
    return null;
  },
}));
vi.mock('../api', () => ({ hostAccess: vi.fn() }));

const tilt = { wordId: 'w1', seq: 1, toward: 'c1', amount: 0.5 } as unknown as SortTilt;
const batch: HostDrafts = { questionIndex: 0, trial: false, drafts: [{ id: 'p1', draft: { type: 'text', value: 'Оде' }, changes: 0, at: 1 }] };

beforeEach(() => {
  localStorage.clear();
  saveHost('123456', { hostToken: 'h', stageToken: 's' });
  screens.length = 0;
  game.tilts = { p1: tilt };
  game.drafts = batch;
  game.forgetLive = vi.fn();
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/host/123456']}>
      <Routes>
        <Route path="/host/:code" element={<Host />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Host: «👁 Наживо»', () => {
  it('on, the screen gets the drafts and tilts; off, neither, and every switch forgets them', () => {
    open();
    const first = screens.at(-1)!;
    expect(first.watch).toBe(true);
    expect(first.drafts).toBe(batch);
    expect(first.tilts).toEqual({ p1: tilt });
    const forgetLive = vi.mocked(game.forgetLive);
    const before = forgetLive.mock.calls.length;
    act(() => first.onWatch(false));
    const off = screens.at(-1)!;
    expect(off.watch).toBe(false);
    expect(off.drafts).toBeNull();
    expect(off.tilts).toEqual({});
    expect(forgetLive.mock.calls.length).toBe(before + 1);
    act(() => off.onWatch(true));
    const on = screens.at(-1)!;
    expect(on.watch).toBe(true);
    expect(on.drafts).toBe(batch);
    expect(forgetLive.mock.calls.length).toBe(before + 2);
  });

  it('remembers «off» on the device and starts masked', () => {
    open();
    act(() => screens.at(-1)!.onWatch(false));
    cleanup();
    screens.length = 0;
    open();
    expect(screens.at(-1)!.watch).toBe(false);
    expect(screens.at(-1)!.drafts).toBeNull();
  });
});
