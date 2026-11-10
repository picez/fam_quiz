// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me, type ApiData } from './api';
import { forgetAccount, useAccount } from './useAccount';
import { usePrivateData } from './usePrivateData';

vi.mock('./api', () => ({ me: vi.fn() }));

const account = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false };

beforeEach(() => {
  vi.clearAllMocks();
  forgetAccount();
});
afterEach(cleanup);

function Who() {
  const state = useAccount();
  return <p>{state.status === 'signed-in' ? state.account.name : state.status}</p>;
}

function Data({ load }: { load: () => Promise<ApiData<string>> }) {
  const state = usePrivateData(load);
  return <p>{state.status === 'ready' ? state.data : state.status}</p>;
}

describe('useAccount', () => {
  it('asks the server once for everyone who mounts together (menu, page, private data)', async () => {
    vi.mocked(me).mockResolvedValue(account);
    render(
      <>
        <Who />
        <Who />
        <Data load={async () => ({ ok: true, data: 'дані' })} />
      </>,
    );
    expect(await screen.findByText('дані')).toBeTruthy();
    expect(me).toHaveBeenCalledTimes(1);
  });

  it('the next page starts from the known account and loads its data without waiting for /api/me', async () => {
    vi.mocked(me).mockResolvedValue(account);
    render(<Who />);
    expect(await screen.findByText('Олена')).toBeTruthy();
    cleanup();
    // Повторна перевірка сесії «зависла»: дані сторінки однаково йдуть одразу.
    vi.mocked(me).mockReturnValue(new Promise(() => {}));
    const load = vi.fn(async () => ({ ok: true as const, data: 'дані' }));
    render(<Data load={load} />);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('дані')).toBeTruthy();
  });

  it('does not remember a visitor: a sign-in elsewhere is never hidden behind a stale answer', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    render(<Who />);
    expect(await screen.findByText('anonymous')).toBeTruthy();
    cleanup();
    vi.mocked(me).mockResolvedValue(account);
    render(<Who />);
    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('Олена')).toBeTruthy();
  });

  it('forgets the account on sign-out', async () => {
    vi.mocked(me).mockResolvedValue(account);
    render(<Who />);
    expect(await screen.findByText('Олена')).toBeTruthy();
    cleanup();
    forgetAccount();
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    render(<Who />);
    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('anonymous')).toBeTruthy();
  });
});
