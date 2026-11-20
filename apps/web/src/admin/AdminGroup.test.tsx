// @vitest-environment jsdom
import type { AdminGroupDetail } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGroup } from './AdminGroup';

const G = '11111111-1111-4111-8111-111111111111';
const detail = (over: Partial<AdminGroupDetail['group']> = {}): AdminGroupDetail => ({
  group: { id: G, name: 'Родина Квіткових', emoji: '🌻', owner: { id: 'u1', nickname: 'Оля' }, members: 3, items: 2, createdAt: '2026-11-14T10:00:00.000Z', hidden: null, ...over },
  members: [
    { id: 'u1', nickname: 'Оля', role: 'owner', joinedAt: '2026-11-14T10:00:00.000Z', banned: false },
    { id: 'u2', nickname: 'Петро', role: 'member', joinedAt: '2026-11-15T10:00:00.000Z', banned: false },
    { id: 'u3', nickname: 'Богдан', role: 'member', joinedAt: '2026-11-16T10:00:00.000Z', banned: true },
  ],
  items: {
    rows: [
      { id: 'i1', kind: 'story', text: 'Як тато заблукав у лісі', author: 'Петро', surprise: true, createdAt: '2026-11-17T10:00:00.000Z', hidden: false },
      { id: 'i2', kind: 'fact', text: 'Бабуся свистить', author: null, surprise: false, createdAt: '2026-11-16T10:00:00.000Z', hidden: true },
    ],
    total: 2,
    page: 1,
    pages: 1,
  },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let current = detail();
let deleteAnswer: () => Response = () => new Response(null, { status: 204 });
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  if (method === 'GET') return json(current);
  if (method === 'DELETE' && url === `/api/admin/groups/${G}`) return deleteAnswer();
  if (method === 'DELETE') return json({ changed: true });
  return json({ changed: true });
});
const writes = () => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET').map(([url, init]) => ({ url, method: init!.method, body: init!.body === undefined ? undefined : JSON.parse(String(init!.body)) }));

beforeEach(() => {
  current = detail();
  deleteAnswer = () => new Response(null, { status: 204 });
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={[`/admin/groups/${G}`]}>
      <Routes>
        <Route path="/admin/groups/:id" element={<AdminGroup />} />
        <Route path="/admin/groups" element={<p>список груп</p>} />
      </Routes>
    </MemoryRouter>,
  );
const member = (name: string) => screen.getByRole('link', { name }).closest('li')!;

describe('AdminGroup (63)', () => {
  it('the group card', async () => {
    open();
    expect(await screen.findByRole('heading', { name: '🌻 Родина Квіткових' })).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/admin/groups/${G}?page=1`);
    // Члени: власника не вилучають; заблокованого не роблять власником.
    expect(within(member('Оля')).queryByRole('button', { name: 'Вилучити' })).toBeNull();
    expect(within(member('Оля')).queryByRole('button', { name: 'Зробити власником' })).toBeNull();
    expect(within(member('Оля')).getByText('керує групою')).toBeTruthy();
    expect(within(member('Петро')).getByRole('button', { name: 'Вилучити' })).toBeTruthy();
    expect(within(member('Петро')).getByRole('button', { name: 'Зробити власником' })).toBeTruthy();
    expect(within(member('Богдан')).getByText('заблоковано')).toBeTruthy();
    expect(within(member('Богдан')).getByRole('button', { name: 'Вилучити' })).toBeTruthy();
    expect(within(member('Богдан')).queryByRole('button', { name: 'Зробити власником' })).toBeNull();

    // Записи: сюрприз і прихований видно адміну.
    const story = screen.getByText('Як тато заблукав у лісі').closest('li')!;
    expect(within(story).getByText('Сюрприз')).toBeTruthy();
    expect(within(story).getByText('Історія')).toBeTruthy();
    const fact = screen.getByText('Бабуся свистить').closest('li')!;
    expect(within(fact).getByText('Приховано')).toBeTruthy();
    expect(within(fact).getByRole('button', { name: 'Показати' })).toBeTruthy();

    fireEvent.click(within(story).getByRole('button', { name: 'Сховати запис' }));
    await waitFor(() => expect(writes()).toEqual([{ url: `/api/admin/groups/${G}/items/i1/hidden`, method: 'PUT', body: { hidden: true } }]));

    fireEvent.click(within(member('Петро')).getByRole('button', { name: 'Вилучити' }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ url: `/api/admin/groups/${G}/members/u2`, method: 'DELETE', body: undefined }));
    expect(window.confirm).toHaveBeenCalled();

    fireEvent.click(within(member('Петро')).getByRole('button', { name: 'Зробити власником' }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ url: `/api/admin/groups/${G}/owner`, method: 'PUT', body: { userId: 'u2' } }));

    fireEvent.change(screen.getByLabelText('Причина (необов’язково, її побачить власник)'), { target: { value: 'Образлива назва' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сховати групу' }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ url: `/api/admin/groups/${G}/hidden`, method: 'PUT', body: { hidden: true, reason: 'Образлива назва' } }));
  });

  it('a declined confirmation sends nothing', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    fireEvent.click(within(member('Петро')).getByRole('button', { name: 'Вилучити' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сховати групу' }));
    expect(writes()).toEqual([]);
  });

  it('a hidden group shows its reason and «Повернути»', async () => {
    current = detail({ hidden: { at: '2026-11-19T10:00:00.000Z', reason: 'Образлива назва' } });
    open();
    expect(await screen.findByText('Причина: Образлива назва')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Сховати групу' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Повернути' }));
    await waitFor(() => expect(writes()).toEqual([{ url: `/api/admin/groups/${G}/hidden`, method: 'PUT', body: { hidden: false } }]));
  });

  it('deletes only when the typed name matches, then goes to the list', async () => {
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    const button = screen.getByRole('button', { name: 'Видалити групу' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const field = screen.getByLabelText('Введіть назву групи: «Родина Квіткових»');
    fireEvent.change(field, { target: { value: 'Родина' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '  Родина Квіткових  ' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(await screen.findByText('список груп')).toBeTruthy();
    expect(writes()).toEqual([{ url: `/api/admin/groups/${G}`, method: 'DELETE', body: { name: 'Родина Квіткових' } }]);
  });

  it('says the name mismatch from the server', async () => {
    deleteAnswer = () => json({ error: 'group_name_mismatch' }, 409);
    const { container } = open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    const alert = container.querySelector('.admin-group-delete [role="alert"]')!;
    expect(alert.textContent).toBe('');
    fireEvent.change(screen.getByLabelText('Введіть назву групи: «Родина Квіткових»'), { target: { value: 'Родина Квіткових' } });
    fireEvent.click(screen.getByRole('button', { name: 'Видалити групу' }));
    await waitFor(() => expect(alert.textContent).toBe('Назва не збігається з назвою групи.'));
    expect(screen.queryByText('список груп')).toBeNull();
  });
});
