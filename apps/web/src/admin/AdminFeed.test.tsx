// @vitest-environment jsdom
import type { AdminFeedRow } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { feedText } from '../feed/feed-text';
import { AdminFeed } from './AdminFeed';

const rows: AdminFeedRow[] = [
  { id: 'e1', at: '2026-11-19T10:00:00.000Z', who: { id: 'u1', nickname: 'Оля' }, data: { kind: 'level', level: 12 }, likes: 3, hidden: null },
  {
    id: 'e2',
    at: '2026-11-18T10:00:00.000Z',
    who: { id: 'u2', nickname: 'Петро' },
    data: { kind: 'prize', place: 1, name: 'Кубок', title: 'Писанки', nickTitle: null },
    likes: 0,
    hidden: { at: '2026-11-19T11:00:00.000Z' },
  },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  void init;
  if (url.startsWith('/api/admin/feed?')) return json({ rows, total: 2, page: 1, pages: 1 });
  if (url.endsWith('/hidden')) return json({ changed: true });
  return json({ error: 'not_found' }, 404);
});
const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url, method: init?.method ?? 'GET', body: init?.body }));
const reads = () => calls().filter((call) => call.method === 'GET' && call.url.startsWith('/api/admin/feed?'));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = () =>
  render(
    <MemoryRouter>
      <AdminFeed />
    </MemoryRouter>,
  );

describe('AdminFeed (63)', () => {
  it('lists events with hide and show', async () => {
    open();
    const first = (await screen.findByText(feedText(rows[0]!.data), { exact: false })).closest('li')!;
    expect(within(first).getByRole('link', { name: 'Оля' }).getAttribute('href')).toBe('/admin/users/u1');
    expect(within(first).getByText('❤️ 3')).toBeTruthy();
    expect(within(first).queryByText('Приховано')).toBeNull();
    const second = screen.getByText(feedText(rows[1]!.data), { exact: false }).closest('li')!;
    expect(within(second).getByText('Приховано')).toBeTruthy();
    expect(within(second).getByRole('button', { name: 'Показати' })).toBeTruthy();
    expect(reads().map((call) => call.url)).toEqual(['/api/admin/feed?page=1']);

    fireEvent.click(within(first).getByRole('button', { name: 'Сховати' }));
    await waitFor(() => expect(calls().some((call) => call.method === 'PUT')).toBe(true));
    const put = calls().find((call) => call.method === 'PUT')!;
    expect(put.url).toBe('/api/admin/feed/e1/hidden');
    expect(JSON.parse(String(put.body))).toEqual({ hidden: true });
    await waitFor(() => expect(reads()).toHaveLength(2));

    fireEvent.click(await screen.findByRole('button', { name: 'Показати' }));
    await waitFor(() => expect(calls().filter((call) => call.method === 'PUT')).toHaveLength(2));
    expect(JSON.parse(String(calls().filter((call) => call.method === 'PUT')[1]!.body))).toEqual({ hidden: false });

    fireEvent.change(screen.getByLabelText('Вид'), { target: { value: 'prize' } });
    await waitFor(() => expect(reads().at(-1)!.url).toContain('kind=prize&page=1'));
  });

  it('keeps the error line mounted and says the error after a failed action', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return json({ error: 'not_found_x' }, 409);
      return json({ rows, total: 2, page: 1, pages: 1 });
    });
    const { container } = open();
    await screen.findByText('Оля');
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Сховати' }));
    await waitFor(() => expect(alert.textContent).not.toBe(''));
  });

  it('says when there are no events', async () => {
    fetchMock.mockImplementation(async () => json({ rows: [], total: 0, page: 1, pages: 1 }));
    open();
    expect(await screen.findByText('Подій немає.')).toBeTruthy();
  });
});
