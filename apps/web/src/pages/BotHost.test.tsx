// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostView } from '@quiz/shared';
import { botHostAccess, botManual } from '../admin/admin-api';
import { RETRY_MS, type Status } from '../live/useGame';
import { BotHost } from './BotHost';

const { game, auths } = vi.hoisted(() => ({
  game: { current: null as unknown },
  auths: [] as unknown[],
}));

vi.mock('../admin/admin-api', () => ({ botHostAccess: vi.fn(), botManual: vi.fn() }));
vi.mock('../live/useGame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../live/useGame')>()),
  useGame: (auth: unknown) => {
    auths.push(auth);
    return auth === null ? { ...(game.current as object), status: 'connecting', view: null } : game.current;
  },
}));
vi.mock('../live/useLiveWatch', () => ({ useLiveWatch: () => [true, vi.fn()] }));
vi.mock('../live/NetSignal', () => ({ NetSignal: () => null }));
vi.mock('../screens/HostScreen', () => ({
  HostScreen: (props: { botHost?: boolean; code: string }) => <p>{`HostScreen ${props.code} ${props.botHost === true ? 'bot' : 'plain'}`}</p>,
}));

const hostView = (botHost: { manual: boolean; mine: boolean }, phase = 'lobby'): HostView => ({ role: 'host', phase, botHost }) as unknown as HostView;
const setGame = (status: Status, view: HostView | null = null) => {
  game.current = { status, view, closed: null, quality: 'good', offsetMs: 0, stageOnline: true, audioCommand: null, tilts: {}, drafts: null, reactions: [], drawing: null, send: vi.fn(), forgetLive: vi.fn() };
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auths.length = 0;
  setGame('connecting');
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/bot-host/123456']}>
      <Routes>
        <Route path="/bot-host/:code" element={<BotHost />} />
      </Routes>
    </MemoryRouter>,
  );
const granted = { ok: true as const, hostToken: 'h1', stageToken: 's1' };

describe('BotHost', () => {
  it('a 404 shows «no access» with a link back to the bot tab', async () => {
    vi.mocked(botHostAccess).mockResolvedValue({ ok: false, error: 'not_found' });
    open();
    expect(await screen.findByText('Ця кімната не бота або ти не адмін')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'До вкладки «Бот»' }).getAttribute('href')).toBe('/admin/bot');
  });

  it('a token opens the real host screen with botHost, kept out of localStorage', async () => {
    vi.mocked(botHostAccess).mockResolvedValue(granted);
    setGame('live', hostView({ manual: false, mine: false }));
    open();
    expect(await screen.findByText('HostScreen 123456 bot')).toBeTruthy();
    expect(auths).toContainEqual({ code: '123456', role: 'host', token: 'h1' });
    expect(localStorage.length).toBe(0);
    expect(screen.getByRole('status').textContent).toContain('Гру веде бот');
  });

  it('the bar tells who drives the game and the button flips the mode', async () => {
    vi.mocked(botHostAccess).mockResolvedValue(granted);
    vi.mocked(botManual).mockResolvedValue({ ok: true });
    setGame('live', hostView({ manual: false, mine: false }));
    const { unmount } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Взяти керування' }));
    expect(botManual).toHaveBeenCalledWith('123456', true);
    unmount();
    setGame('live', hostView({ manual: true, mine: true }));
    open();
    expect((await screen.findByRole('status')).textContent).toContain('Керуєш ти');
    fireEvent.click(screen.getByRole('button', { name: 'Віддати боту' }));
    expect(botManual).toHaveBeenLastCalledWith('123456', false);
  });

  it('another admin holding the game is named, and a failed switch shows the error', async () => {
    vi.mocked(botHostAccess).mockResolvedValue(granted);
    vi.mocked(botManual).mockResolvedValue({ ok: false, error: 'not_found' });
    setGame('live', hostView({ manual: true, mine: false }));
    open();
    expect((await screen.findByRole('status')).textContent).toContain('Керує інший адмін');
    fireEvent.click(screen.getByRole('button', { name: 'Віддати боту' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('no bar on the finish', async () => {
    vi.mocked(botHostAccess).mockResolvedValue(granted);
    setGame('live', hostView({ manual: false, mine: false }, 'finished'));
    open();
    await screen.findByText('HostScreen 123456 bot');
    expect(screen.queryByRole('button', { name: 'Взяти керування' })).toBeNull();
  });

  it('asks again once after unauthorized, the second time in a row means the game is gone', async () => {
    vi.mocked(botHostAccess).mockResolvedValue(granted);
    setGame('live', hostView({ manual: false, mine: false }));
    const view = render(
      <MemoryRouter initialEntries={['/bot-host/123456']}>
        <Routes>
          <Route path="/bot-host/:code" element={<BotHost />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('HostScreen 123456 bot');
    expect(botHostAccess).toHaveBeenCalledTimes(1);
    setGame('unauthorized');
    view.rerender(
      <MemoryRouter initialEntries={['/bot-host/123456']}>
        <Routes>
          <Route path="/bot-host/:code" element={<BotHost />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(botHostAccess).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Цієї гри вже немає/)).toBeTruthy();
    expect(botHostAccess).toHaveBeenCalledTimes(2);
    expect(localStorage.length).toBe(0);
  });

  it('a restarting server is asked again after RETRY_MS', async () => {
    vi.useFakeTimers();
    vi.mocked(botHostAccess).mockResolvedValueOnce({ ok: false, error: 'restarting' }).mockResolvedValue(granted);
    open();
    await act(async () => {});
    expect(botHostAccess).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_MS);
    });
    expect(botHostAccess).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
