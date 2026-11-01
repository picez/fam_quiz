// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STICKERS } from '@quiz/shared';
import { GUEST_FAVORITES_KEY, useFavoriteStickers } from './useFavoriteStickers';

const a = STICKERS[0].id;
const b = STICKERS[1].id;

type Reply = { status: number; body?: unknown };

/** fetch-мок: GET і PUT відповідають з окремих черг. */
function stubFetch(get: Reply, put: Reply = { status: 200, body: { favorites: [] } }) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const reply = init?.method === 'PUT' ? put : get;
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useFavoriteStickers (13a)', () => {
  it('loads nothing until load() is called', () => {
    const fetchMock = stubFetch({ status: 401, body: { error: 'unauthorized' } });
    const { result } = renderHook(() => useFavoriteStickers());
    expect(result.current.favorites).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a guest keeps the favourites on the device', async () => {
    const fetchMock = stubFetch({ status: 401, body: { error: 'unauthorized' } });
    const first = renderHook(() => useFavoriteStickers());
    act(() => first.result.current.load());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => first.result.current.toggle(a));
    await waitFor(() => expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBe(JSON.stringify([a])));
    expect(first.result.current.favorites).toEqual([a]);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);

    const second = renderHook(() => useFavoriteStickers());
    act(() => second.result.current.load());
    await waitFor(() => expect(second.result.current.favorites).toEqual([a]));
  });

  it('rubbish in the guest key reads as an empty list', async () => {
    stubFetch({ status: 401, body: { error: 'unauthorized' } });
    localStorage.setItem(GUEST_FAVORITES_KEY, '{not json');
    const { result } = renderHook(() => useFavoriteStickers());
    act(() => result.current.load());
    await act(async () => {});
    expect(result.current.favorites).toEqual([]);
    localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify({ a: 1 }));
    const other = renderHook(() => useFavoriteStickers());
    act(() => other.result.current.load());
    await act(async () => {});
    expect(other.result.current.favorites).toEqual([]);
  });

  it('an account saves the new list to the profile and gets the old one back when saving fails', async () => {
    const fetchMock = stubFetch({ status: 200, body: { favorites: [b] } }, { status: 200, body: { favorites: [a, b] } });
    const { result } = renderHook(() => useFavoriteStickers());
    act(() => result.current.load());
    await waitFor(() => expect(result.current.favorites).toEqual([b]));

    await act(async () => result.current.toggle(a));
    expect(result.current.favorites).toEqual([a, b]);
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT') as unknown as [string, RequestInit];
    expect(put[0]).toBe('/api/me/stickers');
    expect(JSON.parse(String(put[1].body))).toEqual({ favorites: [a, b] });
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBeNull();
  });

  it('a failed save puts the previous list back without an error', async () => {
    stubFetch({ status: 200, body: { favorites: [b] } }, { status: 500, body: { error: 'internal' } });
    const { result } = renderHook(() => useFavoriteStickers());
    act(() => result.current.load());
    await waitFor(() => expect(result.current.favorites).toEqual([b]));
    await act(async () => result.current.toggle(a));
    await waitFor(() => expect(result.current.favorites).toEqual([b]));
  });

  it('never sends more than 40 favourites', async () => {
    const forty = STICKERS.slice(1, 41).map((s) => s.id);
    const fetchMock = stubFetch({ status: 200, body: { favorites: forty } }, { status: 200, body: { favorites: [] } });
    const { result } = renderHook(() => useFavoriteStickers());
    act(() => result.current.load());
    await waitFor(() => expect(result.current.favorites).toHaveLength(40));
    await act(async () => result.current.toggle(a));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT') as unknown as [string, RequestInit];
    const sent = (JSON.parse(String(put[1].body)) as { favorites: string[] }).favorites;
    expect(sent).toHaveLength(40);
    expect(sent[0]).toBe(a);
    expect(sent).not.toContain(forty[39]);
  });

  it('a list that could not be read is never saved anywhere', async () => {
    const fetchMock = stubFetch({ status: 500, body: { error: 'internal' } }, { status: 200, body: { favorites: [a] } });
    const { result } = renderHook(() => useFavoriteStickers());
    act(() => result.current.load());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => result.current.toggle(a));
    // Дотик ☆ пробує прочитати ще раз; знову 500 — нічого не змінюється.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBeNull();
    expect(result.current.favorites).toEqual([]);
  });
});
