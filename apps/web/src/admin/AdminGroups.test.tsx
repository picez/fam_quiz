// @vitest-environment jsdom
import type { AdminGroupRow } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGroups } from './AdminGroups';

const rows: AdminGroupRow[] = [
  { id: 'g1', name: 'Родина Квіткових', emoji: '🌻', owner: { id: 'u1', nickname: 'Оля' }, members: 3, items: 4, createdAt: '2026-11-14T10:00:00.000Z', hidden: { at: '2026-11-19T10:00:00.000Z', reason: 'Образлива назва' } },
  { id: 'g2', name: 'Друзі з класу', emoji: '🎓', owner: null, members: 1, items: 0, createdAt: '2026-11-15T10:00:00.000Z', hidden: null },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetchMock = vi.fn(async (url: string) => {
  void url;
  return json({ rows, total: 2, page: 1, pages: 1 });
});
const urls = () => fetchMock.mock.calls.map(([url]) => url);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AdminGroups (63)', () => {
  it('searches groups and links each row to its card', async () => {
    render(
      <MemoryRouter>
        <AdminGroups />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: '🌻 Родина Квіткових' });
    expect(link.getAttribute('href')).toBe('/admin/groups/g1');
    const first = link.closest('li')!;
    expect(within(first).getByText('3 людини')).toBeTruthy();
    expect(within(first).getByText('Власник: Оля')).toBeTruthy();
    expect(within(first).getByText('Приховано')).toBeTruthy();
    const second = screen.getByRole('link', { name: '🎓 Друзі з класу' }).closest('li')!;
    expect(within(second).getByText('1 людина')).toBeTruthy();
    expect(within(second).getByText('Без власника')).toBeTruthy();
    expect(within(second).queryByText('Приховано')).toBeNull();
    expect(urls()).toEqual(['/api/admin/groups?q=&page=1']);

    fireEvent.change(screen.getByLabelText('Назва групи чи нік власника'), { target: { value: ' Квіт ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Шукати' }));
    await waitFor(() => expect(urls().at(-1)).toBe(`/api/admin/groups?q=${encodeURIComponent('Квіт')}&page=1`));
  });

  it('says when nothing is found', async () => {
    fetchMock.mockImplementation(async () => json({ rows: [], total: 0, page: 1, pages: 1 }));
    render(
      <MemoryRouter>
        <AdminGroups />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Груп не знайдено.')).toBeTruthy();
  });
});
