// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPushKey, me } from '../api';
import { forgetAccount } from '../useAccount';
import { currentSubscription, enablePush, type BrowserEnv } from './push-client';
import { PUSH_INVITE_KEY } from './push-invite';
import { PushInvite } from './PushInvite';

vi.mock('../api', () => ({ getPushKey: vi.fn(), me: vi.fn() }));
vi.mock('./push-client', async (original) => ({ ...(await original<typeof import('./push-client')>()), currentSubscription: vi.fn(), enablePush: vi.fn() }));

const ENV: BrowserEnv = { prod: true, serviceWorker: true, pushManager: true, notification: true, userAgent: 'x', platform: 'Win32', maxTouchPoints: 0, standalone: false };
const NOW = 1_800_000_000_000;
const OK = { ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false } as const;
const setPermission = (permission: string) => Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });
const show = (env: BrowserEnv = ENV) => render(<PushInvite env={env} now={() => NOW} />);
const gone = async () => {
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText('Не пропускай новини')).toBeNull();
};

beforeEach(() => {
  forgetAccount();
  localStorage.clear();
  vi.mocked(me).mockReset();
  vi.mocked(me).mockResolvedValue(OK);
  vi.mocked(getPushKey).mockReset();
  vi.mocked(getPushKey).mockResolvedValue({ ok: true, publicKey: 'KEY' });
  vi.mocked(currentSubscription).mockReset();
  vi.mocked(currentSubscription).mockResolvedValue(null);
  vi.mocked(enablePush).mockReset();
  vi.mocked(enablePush).mockResolvedValue('on');
  setPermission('default');
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('PushInvite (70)', () => {
  it('an account without a subscription sees it, and the time of showing is remembered', async () => {
    show();
    expect(await screen.findByRole('region', { name: 'Не пропускай новини' })).toBeTruthy();
    expect(screen.getByText(/Увімкни сповіщення/)).toBeTruthy();
    expect(localStorage.getItem(PUSH_INVITE_KEY)).toBe(String(NOW));
  });

  it('a guest sees nothing', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    show();
    await gone();
    expect(localStorage.getItem(PUSH_INVITE_KEY)).toBeNull();
  });

  it('denied permission, an existing subscription, or a server without a key show nothing', async () => {
    setPermission('denied');
    show();
    await gone();
    cleanup();
    setPermission('default');
    vi.mocked(currentSubscription).mockResolvedValue({} as PushSubscription);
    show();
    await gone();
    cleanup();
    vi.mocked(currentSubscription).mockResolvedValue(null);
    vi.mocked(getPushKey).mockResolvedValue({ ok: true, publicKey: null });
    show();
    await gone();
  });

  it('shown 3 days ago: nothing and no request at all', async () => {
    localStorage.setItem(PUSH_INVITE_KEY, String(NOW - 3 * 86_400_000));
    show();
    await gone();
    expect(me).not.toHaveBeenCalled();
    expect(getPushKey).not.toHaveBeenCalled();
  });

  it('a build that cannot push (not prod) shows nothing and asks nothing', async () => {
    show({ ...ENV, prod: false });
    await gone();
    expect(me).not.toHaveBeenCalled();
    expect(getPushKey).not.toHaveBeenCalled();
  });

  it('«Не зараз» hides it', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Не зараз' }));
    expect(screen.queryByText('Не пропускай новини')).toBeNull();
  });

  it('«Увімкнути» turns notifications on and says so', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Увімкнути' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Сповіщення увімкнено.'));
    expect(enablePush).toHaveBeenCalledWith('KEY');
    expect(screen.queryByRole('button', { name: 'Увімкнути' })).toBeNull();
  });

  it('a refused permission shows the same text as the profile', async () => {
    vi.mocked(enablePush).mockResolvedValue('denied');
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Увімкнути' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).not.toBe(''));
    expect(screen.getByRole('status').textContent).not.toBe('Сповіщення увімкнено.');
  });

  it('blocked storage (localStorage throws on access) renders nothing instead of breaking the page', async () => {
    const blocked = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    try {
      expect(() => show()).not.toThrow();
      await gone();
      expect(getPushKey).not.toHaveBeenCalled();
    } finally {
      blocked.mockRestore();
    }
  });
});
