// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostAccess } from '../api';
import { loadHost, saveHost } from '../storage';
import { RETRY_MS } from '../live/useGame';
import { Host } from './Host';

const { auths } = vi.hoisted(() => ({ auths: [] as unknown[] }));

vi.mock('socket.io-client', () => ({
  io: (options: { auth: unknown }) => {
    auths.push(options.auth);
    return { connected: false, active: true, on() { return this; }, emit() {}, connect() {}, close() {} };
  },
}));
vi.mock('../api', () => ({ hostAccess: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auths.length = 0;
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

describe('Host', () => {
  it('uses the tokens remembered on this device without asking the server', async () => {
    saveHost('123456', { hostToken: 'local-host', stageToken: 'local-stage' });
    open();
    expect(await screen.findByText('Підключаємося…')).toBeTruthy();
    expect(hostAccess).not.toHaveBeenCalled();
    expect(auths).toEqual([{ code: '123456', role: 'host', token: 'local-host' }]);
  });

  it('asks the server for the tokens on a new device and remembers them', async () => {
    vi.mocked(hostAccess).mockResolvedValue({ ok: true, hostToken: 'from-server', stageToken: 'stage' });
    open();
    // Сокет відкривається лише після відповіді сервера з токенами.
    await waitFor(() => expect(auths).toEqual([{ code: '123456', role: 'host', token: 'from-server' }]));
    expect(hostAccess).toHaveBeenCalledWith('123456');
    expect(loadHost('123456')).toEqual({ hostToken: 'from-server', stageToken: 'stage' });
    expect(screen.getByText('Підключаємося…')).toBeTruthy();
  });

  it('offers to sign in when the server does not recognise the host', async () => {
    vi.mocked(hostAccess).mockResolvedValue({ ok: false, error: 'game_not_found' });
    open();
    expect(await screen.findByText(/немає доступу до пульта цієї гри/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Увійти' }).getAttribute('href')).toBe('/login?next=%2Fhost%2F123456');
    expect(auths).toEqual([]);
  });

  it('asks again after a restart answer instead of denying access', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(hostAccess)
        .mockResolvedValueOnce({ ok: false, error: 'restarting' })
        .mockResolvedValue({ ok: true, hostToken: 'from-server', stageToken: 'stage' });
      open();
      await act(async () => {});
      expect(auths).toEqual([]);
      expect(screen.queryByText(/немає доступу до пульта/)).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RETRY_MS);
      });
      expect(hostAccess).toHaveBeenCalledTimes(2);
      expect(auths).toEqual([{ code: '123456', role: 'host', token: 'from-server' }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
