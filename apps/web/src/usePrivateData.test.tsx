// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me, type ApiData } from './api';
import { usePrivateData } from './usePrivateData';

vi.mock('./api', () => ({ me: vi.fn() }));

const account = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com' };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function Probe({ load }: { load: () => Promise<ApiData<string[]>> }) {
  const state = usePrivateData(load);
  if (state.status === 'ready') return <p>{`${state.account.name}: ${state.data.join(', ')}`}</p>;
  if (state.status === 'error') return <p role="alert">{state.message}</p>;
  return <p>{state.status}</p>;
}

describe('usePrivateData', () => {
  it('loads the data for a signed-in person', async () => {
    vi.mocked(me).mockResolvedValue(account);
    const load = vi.fn(async () => ({ ok: true as const, data: ['а', 'б'] }));
    render(<Probe load={load} />);
    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('Олена: а, б')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not load anything for a visitor', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    const load = vi.fn(async () => ({ ok: true as const, data: [] }));
    render(<Probe load={load} />);
    expect(await screen.findByText('signed-out')).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });

  it('treats a session that ended before the data arrived as signed out', async () => {
    vi.mocked(me).mockResolvedValue(account);
    render(<Probe load={async () => ({ ok: false, error: 'unauthorized' })} />);
    expect(await screen.findByText('signed-out')).toBeTruthy();
  });

  it('explains other failures in words', async () => {
    vi.mocked(me).mockResolvedValue(account);
    render(<Probe load={async () => ({ ok: false, error: 'not_found' })} />);
    expect((await screen.findByRole('alert')).textContent).toBe('Не знайдено.');
  });
});
