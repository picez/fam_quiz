// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me } from '../api';
import { Admin } from './Admin';
import { adminCharts, adminHealth, adminProblemsBadge, adminStats } from './admin-api';

vi.mock('../api', () => ({ me: vi.fn() }));
vi.mock('./admin-api', () => ({ adminStats: vi.fn(), adminCharts: vi.fn(), adminHealth: vi.fn(), adminProblemsBadge: vi.fn() }));

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
  vi.mocked(adminCharts).mockResolvedValue({ ok: false, error: 'offline' });
  vi.mocked(adminHealth).mockResolvedValue({ ok: false, error: 'offline' });
  vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 0, reports: 0 } });
});
afterEach(cleanup);

describe('Admin', () => {
  it('sends a non-admin home without asking for stats', async () => {
    vi.mocked(me).mockResolvedValue(account(false));
    open();
    expect(await screen.findByText('головна')).toBeTruthy();
    expect(adminStats).not.toHaveBeenCalled();
    expect(adminProblemsBadge).not.toHaveBeenCalled();
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

  it('shows the stats and the eleven section links', async () => {
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
    expect(links.map((link) => link.textContent)).toEqual(['Статистика', 'Живі ігри', 'Користувачі', 'Вікторини', 'Скарги', 'Оголошення', 'Розсилка', 'Журнал', 'Збої', 'Копії', 'Бот']);
    expect(within(nav).getByRole('link', { name: 'Збої' }).getAttribute('href')).toBe('/admin/errors');
    expect(within(nav).getByRole('link', { name: 'Копії' }).getAttribute('href')).toBe('/admin/backups');
    expect(nav.querySelector('.menu-badge')).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Бот' }).getAttribute('href')).toBe('/admin/bot');
    expect(within(nav).getByRole('link', { name: 'Розсилка' }).getAttribute('href')).toBe('/admin/broadcast');
    expect(within(nav).getByRole('link', { name: 'Живі ігри' }).getAttribute('href')).toBe('/admin/live');
    expect(within(nav).getByRole('link', { name: 'Скарги' }).getAttribute('href')).toBe('/admin/reports');
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Статистика' }).getAttribute('aria-current')).toBe('page'));
    expect(within(nav).getByRole('link', { name: 'Користувачі' }).getAttribute('aria-current')).toBeNull();
  });

  it('shows new errors and open reports as a badge on the errors tab', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    vi.mocked(adminStats).mockResolvedValue({ ok: true, data: stats });
    vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 2, reports: 1 } });
    open();
    const nav = await screen.findByRole('navigation', { name: 'Розділи адмінки' });
    const badge = await waitFor(() => {
      const found = nav.querySelector('.menu-badge');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(badge.textContent).toBe('3');
    expect(badge.getAttribute('aria-label')).toBe('Збої, нових: 3');
    expect(badge.closest('a')?.getAttribute('href')).toBe('/admin/errors');
    expect(adminProblemsBadge).toHaveBeenCalled();
  });
});
