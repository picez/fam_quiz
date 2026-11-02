// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPushKey } from '../api';
import { currentSubscription, disablePush, enablePush, pushSupport, sameKey } from './push-client';
import { PushSettings } from './PushSettings';

vi.mock('../api', () => ({ getPushKey: vi.fn() }));
vi.mock('./push-client', () => ({
  browserEnv: vi.fn(() => ({})),
  pushSupport: vi.fn(),
  currentSubscription: vi.fn(),
  sameKey: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));

const setPermission = (permission: string) => Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPushKey).mockResolvedValue({ ok: true, publicKey: 'KEY' });
  vi.mocked(pushSupport).mockReturnValue('supported');
  vi.mocked(currentSubscription).mockResolvedValue(null);
  vi.mocked(sameKey).mockReturnValue(true);
  vi.mocked(enablePush).mockResolvedValue('on');
  vi.mocked(disablePush).mockResolvedValue(undefined);
  setPermission('default');
});
afterEach(cleanup);

describe('PushSettings', () => {
  it('renders nothing when the server has no key', async () => {
    vi.mocked(getPushKey).mockResolvedValue({ ok: true, publicKey: null });
    const { container } = render(<PushSettings />);
    await waitFor(() => expect(getPushKey).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the browser cannot push', async () => {
    vi.mocked(pushSupport).mockReturnValue('unsupported');
    const { container } = render(<PushSettings />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
  });

  it('turns on with a tap and off again', async () => {
    render(<PushSettings />);
    expect(await screen.findByText(/Нагадаємо за годину/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Сповіщення' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Увімкнути сповіщення' }));
    expect(await screen.findByText('Сповіщення увімкнено на цьому пристрої.')).toBeTruthy();
    expect(enablePush).toHaveBeenCalledWith('KEY');
    fireEvent.click(screen.getByRole('button', { name: 'Вимкнути' }));
    expect(await screen.findByRole('button', { name: 'Увімкнути сповіщення' })).toBeTruthy();
    expect(disablePush).toHaveBeenCalled();
  });

  it('disables the button while enabling', async () => {
    let finish: (v: 'on') => void = () => undefined;
    vi.mocked(enablePush).mockReturnValue(new Promise((r) => (finish = r)));
    render(<PushSettings />);
    const button = await screen.findByRole('button', { name: 'Увімкнути сповіщення' });
    fireEvent.click(button);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    finish('on');
    await screen.findByText('Сповіщення увімкнено на цьому пристрої.');
  });

  it('says so when permission is denied', async () => {
    vi.mocked(enablePush).mockResolvedValue('denied');
    render(<PushSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Увімкнути сповіщення' }));
    expect(await screen.findByText(/заборонено в налаштуваннях браузера/)).toBeTruthy();
  });

  it('stays quietly off when the prompt is dismissed', async () => {
    vi.mocked(enablePush).mockResolvedValue('dismissed');
    render(<PushSettings />);
    const button = await screen.findByRole('button', { name: 'Увімкнути сповіщення' });
    fireEvent.click(button);
    await waitFor(() => expect(enablePush).toHaveBeenCalled());
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Увімкнути сповіщення' })).toBeTruthy();
  });

  it('styles «Вимкнути» as a secondary button', async () => {
    vi.mocked(currentSubscription).mockResolvedValue({} as PushSubscription);
    setPermission('granted');
    render(<PushSettings />);
    const off = await screen.findByRole('button', { name: 'Вимкнути' });
    expect(off.className).toBe('btn btn-quiet');
  });

  it('shows the denied note at once when the browser already denies', async () => {
    setPermission('denied');
    render(<PushSettings />);
    expect(await screen.findByText(/заборонено в налаштуваннях браузера/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('alerts when enabling fails', async () => {
    vi.mocked(enablePush).mockResolvedValue('failed');
    render(<PushSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Увімкнути сповіщення' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Не вдалося увімкнути сповіщення. Спробуй ще раз.');
  });

  it('shows only the hint on an iPhone tab', async () => {
    vi.mocked(pushSupport).mockReturnValue('ios-home-screen');
    render(<PushSettings />);
    expect(await screen.findByText(/На початковий екран/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('quietly resubscribes after the key changed (permission already granted)', async () => {
    setPermission('granted');
    const old = { unsubscribe: vi.fn(async () => true) };
    vi.mocked(currentSubscription).mockResolvedValue(old as never);
    vi.mocked(sameKey).mockReturnValue(false);
    render(<PushSettings />);
    expect(await screen.findByText('Сповіщення увімкнено на цьому пристрої.')).toBeTruthy();
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(enablePush).toHaveBeenCalledWith('KEY');
  });

  it('shows on when there is a subscription with the same key', async () => {
    setPermission('granted');
    vi.mocked(currentSubscription).mockResolvedValue({} as never);
    render(<PushSettings />);
    expect(await screen.findByText('Сповіщення увімкнено на цьому пристрої.')).toBeTruthy();
    expect(enablePush).not.toHaveBeenCalled();
  });

  it('compact: nothing when on, a bare button when off', async () => {
    setPermission('granted');
    vi.mocked(currentSubscription).mockResolvedValue({} as never);
    const on = render(<PushSettings compact />);
    await new Promise((r) => setTimeout(r, 0));
    expect(on.container.innerHTML).toBe('');
    on.unmount();
    setPermission('default');
    vi.mocked(currentSubscription).mockResolvedValue(null);
    render(<PushSettings compact />);
    expect(await screen.findByRole('button', { name: 'Увімкнути сповіщення' })).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
