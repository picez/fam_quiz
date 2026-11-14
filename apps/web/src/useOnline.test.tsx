// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me } from './api';
import { t } from './i18n';
import { WithMenu } from './menu/WithMenu';
import { useOnline } from './useOnline';

vi.mock('./api', () => ({
  me: vi.fn(),
  getMyInvites: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  getGroupInvites: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  getFeedBadge: vi.fn().mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 }),
}));

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const go = (value: boolean) =>
  act(() => {
    online = value;
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });

describe('useOnline', () => {
  it('starts from navigator.onLine and follows the online and offline events', () => {
    online = false;
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
    go(true);
    expect(result.current).toBe(true);
    go(false);
    expect(result.current).toBe(false);
  });

  it('removes its listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOnline());
    unmount();
    const types = remove.mock.calls.map(([type]) => type);
    expect(types).toContain('online');
    expect(types).toContain('offline');
  });
});

describe('the menu pages while offline', () => {
  const page = () =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<WithMenu />}>
            <Route path="/" element={<p>Головна</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

  it('shows «Немає інтернету…» as a status while offline and hides it when the connection is back', async () => {
    page();
    await screen.findByText('Головна');
    expect(screen.queryByText(t('netOffline'))).toBeNull();
    go(false);
    const banner = screen.getByText(t('netOffline'));
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.className).toBe('banner is-offline');
    go(true);
    expect(screen.queryByText(t('netOffline'))).toBeNull();
  });
});
