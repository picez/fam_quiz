// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me } from '../api';
import { Admin } from './Admin';
import { adminStats } from './admin-api';

vi.mock('../api', () => ({ me: vi.fn() }));
vi.mock('./admin-api', () => ({ adminStats: vi.fn() }));

const stats = {
  users: { total: 12, new7: 3, new30: 5, online: 2 },
  games: { live: 1, today: 4, days7: 9, days30: 20 },
  quizzes: { total: 7 },
  topQuizzes: [{ id: 'q', title: 'Карпати', author: 'Оля', games: 6 }],
};

const open = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

const account = (admin: boolean) => ({ ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('Admin', () => {
  it('sends a non-admin home without asking for stats', async () => {
    vi.mocked(me).mockResolvedValue(account(false));
    open();
    expect(await screen.findByText('головна')).toBeTruthy();
    expect(adminStats).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor home', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('головна')).toBeTruthy();
    expect(adminStats).not.toHaveBeenCalled();
  });

  it('sends an admin home when the server answers not_found', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    vi.mocked(adminStats).mockResolvedValue({ ok: false, error: 'not_found' });
    open();
    expect(await screen.findByText('головна')).toBeTruthy();
  });

  it('shows the stats and the four section links', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    vi.mocked(adminStats).mockResolvedValue({ ok: true, data: stats });
    open();
    const total = await screen.findByText('Користувачів усього');
    expect(total.nextElementSibling?.textContent).toBe('12');
    expect(screen.getByText('Онлайн зараз').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Завершено сьогодні').nextElementSibling?.textContent).toBe('4');
    expect(screen.getByText('«Карпати» — Оля, ігор: 6')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Розділи адмінки' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(4);
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Статистика' }).getAttribute('aria-current')).toBe('page'));
    expect(within(nav).getByRole('link', { name: 'Користувачі' }).getAttribute('aria-current')).toBeNull();
  });
});
