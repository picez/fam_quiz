// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Stage } from './Stage';

const game = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../live/useGame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../live/useGame')>()),
  useGame: () => game.current,
}));
vi.mock('../screens/StageScreen', () => ({ StageScreen: () => <div className="stage-mock" /> }));

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

const live = (phase: string) => ({
  view: { role: 'stage', phase },
  status: 'live',
  closed: null,
  offsetMs: 0,
  hostOnline: true,
  audioCommand: null,
  awardsSeq: null,
  tilts: {},
  reactions: [],
});

const open = () =>
  render(
    <MemoryRouter initialEntries={['/stage/123456#stage-token']}>
      <Routes>
        <Route path="/stage/:code" element={<Stage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Stage', () => {
  it('keeps the screen awake for the whole game, the finished ceremony too: a sleeping stage drops off the room', async () => {
    const request = vi.fn(async () => ({ released: false, release: async () => {} }));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    game.current = live('finished');
    open();
    await act(async () => {});
    expect(document.querySelector('.stage-mock')).toBeTruthy();
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('asks for no wake lock before there is a game', async () => {
    const request = vi.fn(async () => ({ released: false, release: async () => {} }));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    game.current = { ...live('lobby'), view: null, status: 'connecting' };
    open();
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
  });
});
