// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AdminUserDetail, AdminUserRow } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUser } from './AdminUser';
import { AdminUsers } from './AdminUsers';
import { adminUser, adminUsers, banUser, deleteAwardAsAdmin, deletePrizeAsAdmin, unbanUser } from './admin-api';

vi.mock('./admin-api', () => ({
  adminUsers: vi.fn(),
  adminUser: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  deletePrizeAsAdmin: vi.fn(),
  deleteAwardAsAdmin: vi.fn(),
}));

const row = (over: Partial<AdminUserRow>): AdminUserRow => ({
  id: 'u2',
  nickname: 'Оля',
  email: 'olya@example.com',
  createdAt: '2026-10-01T10:00:00.000Z',
  games: 3,
  quizzes: 1,
  admin: false,
  banned: null,
  ...over,
});
const page = (rows: AdminUserRow[], pages = 1, p = 1) => ({ ok: true as const, data: { rows, total: rows.length, page: p, pages } });
const content = { name: 'Кубок', trophy: null, engraving: 'Найкращій', real: null, title: null, diploma: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const openList = () =>
  render(
    <MemoryRouter initialEntries={['/users']}>
      <Routes>
        <Route path="/users" element={<AdminUsers />} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('AdminUsers', () => {
  it('shows cards with marks and searches', async () => {
    vi.mocked(adminUsers).mockResolvedValue(
      page([row({}), row({ id: 'u3', nickname: 'Бан', email: 'ban@example.com', banned: { at: '2026-10-05T10:00:00.000Z', reason: 'спам' } }), row({ id: 'u4', nickname: 'Шеф', email: 'chief@example.com', admin: true })]),
    );
    openList();
    expect(await screen.findByText('olya@example.com')).toBeTruthy();
    expect(screen.getAllByText('Ігор: 3').length).toBe(3);
    expect(screen.getByText(/^Заблоковано /)).toBeTruthy();
    expect(screen.getByText('Адмін')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Оля' }).getAttribute('href')).toBe('/admin/users/u2');
    fireEvent.change(screen.getByLabelText('Пошук за ніком чи email'), { target: { value: 'оля' } });
    fireEvent.click(screen.getByRole('button', { name: 'Шукати' }));
    await waitFor(() => expect(adminUsers).toHaveBeenLastCalledWith('оля', 1));
  });

  it('pages forward and disables «Далі» on the last page', async () => {
    vi.mocked(adminUsers).mockImplementation(async (_q, p) => page([row({})], 2, p));
    openList();
    expect(await screen.findByText('Сторінка 1 з 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Далі' }));
    await waitFor(() => expect(adminUsers).toHaveBeenLastCalledWith('', 2));
    expect(await screen.findByText('Сторінка 2 з 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Далі' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

const detail = (over: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  user: row({}),
  stock: [{ id: 'p1', content, status: 'free', createdAt: '2026-10-02T10:00:00.000Z' }],
  awards: [{ id: 'a1', place: 1, content, quizTitle: 'Карпати', awardedAt: '2026-10-03T10:00:00.000Z' }],
  title: null,
  ...over,
});

const openUser = () =>
  render(
    <MemoryRouter initialEntries={['/users/u2']}>
      <Routes>
        <Route path="/users/:id" element={<AdminUser />} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('AdminUser', () => {
  beforeEach(() => {
    vi.mocked(adminUser).mockResolvedValue({ ok: true, data: detail() });
  });

  it('bans with a reason after confirming, then rereads the card', async () => {
    vi.mocked(banUser).mockResolvedValue({ ok: true });
    openUser();
    fireEvent.change(await screen.findByLabelText('Причина (бачать лише адміни)'), { target: { value: 'спам' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заблокувати' }));
    await waitFor(() => expect(banUser).toHaveBeenCalledWith('u2', 'спам'));
    await waitFor(() => expect(adminUser).toHaveBeenCalledTimes(2));
  });

  it('does not ban when the confirm is declined', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    openUser();
    fireEvent.click(await screen.findByRole('button', { name: 'Заблокувати' }));
    expect(banUser).not.toHaveBeenCalled();
  });

  it('has no ban button for an admin', async () => {
    vi.mocked(adminUser).mockResolvedValue({ ok: true, data: detail({ user: row({ admin: true }) }) });
    openUser();
    expect(await screen.findByText('Адмін')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Заблокувати' })).toBeNull();
  });

  it('shows the reason and unbans a banned person', async () => {
    vi.mocked(adminUser).mockResolvedValue({ ok: true, data: detail({ user: row({ banned: { at: '2026-10-05T10:00:00.000Z', reason: 'спам' } }) }) });
    vi.mocked(unbanUser).mockResolvedValue({ ok: true });
    openUser();
    expect(await screen.findByText('Причина: спам')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Розблокувати' }));
    await waitFor(() => expect(unbanUser).toHaveBeenCalledWith('u2'));
  });

  it('shows a ban error from the server', async () => {
    vi.mocked(banUser).mockResolvedValue({ ok: false, error: 'cannot_ban_admin' });
    openUser();
    fireEvent.click(await screen.findByRole('button', { name: 'Заблокувати' }));
    expect(await screen.findByText('Адміна заблокувати не можна.')).toBeTruthy();
  });

  it('deletes a stock prize and a showcase award', async () => {
    vi.mocked(deletePrizeAsAdmin).mockResolvedValue({ ok: true });
    vi.mocked(deleteAwardAsAdmin).mockResolvedValue({ ok: true });
    openUser();
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити приз' }));
    await waitFor(() => expect(deletePrizeAsAdmin).toHaveBeenCalledWith('p1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Прибрати нагороду' }));
    await waitFor(() => expect(deleteAwardAsAdmin).toHaveBeenCalledWith('a1'));
  });

  it('goes home when the person is not found', async () => {
    vi.mocked(adminUser).mockResolvedValue({ ok: false, error: 'not_found' });
    openUser();
    expect(await screen.findByText('головна')).toBeTruthy();
  });
});
