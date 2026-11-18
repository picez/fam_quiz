// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { OwnProfile } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, ApiData } from '../api';
import { getMyProfile } from '../api';
import type { AccountState } from '../useAccount';
import { useAccount } from '../useAccount';
import { forgetMyProfile, useMyProfile } from './useMyProfile';

vi.mock('../api', () => ({ getMyProfile: vi.fn() }));
vi.mock('../useAccount', () => ({ useAccount: vi.fn() }));

const account = (id: string): AccountState => ({
  status: 'signed-in',
  account: { id, name: id, email: `${id}@example.com`, admin: false, locale: null, easyMode: false } as Account,
});
const profileOf = (games: number, id = 'a'): OwnProfile => ({ id, stats: { games } }) as unknown as OwnProfile;

function deferred() {
  let resolve!: (value: ApiData<OwnProfile>) => void;
  const promise = new Promise<ApiData<OwnProfile>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const gamesOf = (state: ReturnType<typeof useMyProfile>['state']) => (state.status === 'ready' ? state.data.stats.games : state.status);

beforeEach(() => {
  forgetMyProfile();
  vi.mocked(getMyProfile).mockReset();
  vi.mocked(useAccount).mockReturnValue(account('a'));
});
afterEach(cleanup);

describe('useMyProfile', () => {
  it('a second page shows the last profile at once and then the fresh one', async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce({ ok: true, data: profileOf(3) });
    const first = renderHook(() => useMyProfile());
    await waitFor(() => expect(gamesOf(first.result.current.state)).toBe(3));
    first.unmount();

    const second = deferred();
    vi.mocked(getMyProfile).mockReturnValueOnce(second.promise);
    const next = renderHook(() => useMyProfile());
    expect(gamesOf(next.result.current.state)).toBe(3);
    await act(async () => second.resolve({ ok: true, data: profileOf(4) }));
    await waitFor(() => expect(gamesOf(next.result.current.state)).toBe(4));
    expect(getMyProfile).toHaveBeenCalledTimes(2);
  });

  it('another account never sees the cached profile', async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce({ ok: true, data: profileOf(3) });
    const first = renderHook(() => useMyProfile());
    await waitFor(() => expect(gamesOf(first.result.current.state)).toBe(3));
    first.unmount();

    vi.mocked(useAccount).mockReturnValue(account('b'));
    const pending = deferred();
    vi.mocked(getMyProfile).mockReturnValueOnce(pending.promise);
    const next = renderHook(() => useMyProfile());
    expect(next.result.current.state.status).toBe('loading');
    await act(async () => pending.resolve({ ok: true, data: profileOf(7, 'b') }));
    await waitFor(() => expect(gamesOf(next.result.current.state)).toBe(7));
  });

  it('the cache is labelled by the profile id, so a stale account never earns another profile', async () => {
    // useAccount still says A, but the cookie belongs to B: the response is B's profile.
    vi.mocked(getMyProfile).mockResolvedValueOnce({ ok: true, data: profileOf(5, 'b') });
    const first = renderHook(() => useMyProfile());
    await waitFor(() => expect(gamesOf(first.result.current.state)).toBe(5));
    first.unmount();

    // A signs in again later: B's data must not be served to A.
    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(() => undefined));
    const next = renderHook(() => useMyProfile());
    expect(next.result.current.state.status).toBe('loading');
  });

  it('cached: false never starts from the cache', async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce({ ok: true, data: profileOf(3) });
    const first = renderHook(() => useMyProfile());
    await waitFor(() => expect(gamesOf(first.result.current.state)).toBe(3));
    first.unmount();

    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(() => undefined));
    const editor = renderHook(() => useMyProfile({ cached: false }));
    expect(editor.result.current.state.status).toBe('loading');
  });

  it('forgetMyProfile drops the cache', async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce({ ok: true, data: profileOf(3) });
    const first = renderHook(() => useMyProfile());
    await waitFor(() => expect(gamesOf(first.result.current.state)).toBe(3));
    first.unmount();

    forgetMyProfile();
    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(() => undefined));
    const next = renderHook(() => useMyProfile());
    expect(next.result.current.state.status).toBe('loading');
  });

  it('a reload drops the cache so another page never shows the stale edit', async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce({ ok: true, data: profileOf(3) });
    const first = renderHook(() => useMyProfile());
    await waitFor(() => expect(gamesOf(first.result.current.state)).toBe(3));
    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(() => undefined));
    act(() => first.result.current.reload());

    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(() => undefined));
    const other = renderHook(() => useMyProfile());
    expect(other.result.current.state.status).toBe('loading');
  });

  it('an instance re-rendering with old data does not put it back in the cache after a reload', async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce({ ok: true, data: profileOf(3) });
    const first = renderHook(() => useMyProfile());
    await waitFor(() => expect(gamesOf(first.result.current.state)).toBe(3));
    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(() => undefined));
    act(() => first.result.current.reload());
    first.rerender();

    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(() => undefined));
    const other = renderHook(() => useMyProfile());
    expect(other.result.current.state.status).toBe('loading');
  });
});
