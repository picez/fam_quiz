// @vitest-environment jsdom
import type { JSX } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me } from '../api';
import { Admin } from './Admin';
import { adminCharts, adminErrors, adminFeed, adminGroup, adminHealth, adminProblems, adminProblemsBadge, adminReportedQuiz, adminReports, adminStats, resolveServerError } from './admin-api';

vi.mock('../api', () => ({ me: vi.fn() }));
vi.mock('./admin-api', () => ({ adminStats: vi.fn(), adminCharts: vi.fn(), adminHealth: vi.fn(), adminProblemsBadge: vi.fn(), adminProblems: vi.fn(), adminReports: vi.fn(), adminReportedQuiz: vi.fn(), adminErrors: vi.fn(), resolveServerError: vi.fn(), adminFeed: vi.fn(), adminGroup: vi.fn(), searchBotPeople: vi.fn() }));

const stats = {
  users: { total: 12, new7: 3, new30: 5, online: 2 },
  games: { live: 1, today: 4, days7: 9, days30: 20 },
  quizzes: { total: 7 },
  topQuizzes: [{ id: 'q', title: 'Карпати', author: 'Оля', games: 6 }],
};

function Where(): JSX.Element {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}
const where = () => screen.getByTestId('where').textContent;

const open = (path = '/admin') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

const account = (admin: boolean) => ({ ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminCharts).mockResolvedValue({ ok: false, error: 'offline' });
  vi.mocked(adminHealth).mockResolvedValue({ ok: false, error: 'offline' });
  vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 0, reports: 0, complaints: 0 } });
  vi.mocked(adminReports).mockResolvedValue({ ok: false, error: 'offline' });
  vi.mocked(adminProblems).mockResolvedValue({ ok: false, error: 'offline' });
  vi.mocked(adminErrors).mockResolvedValue({ ok: false, error: 'offline' });
  vi.mocked(adminReportedQuiz).mockResolvedValue({ ok: false, error: 'offline' });
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

  it('67: the admin page has the tabs and the body as two blocks for the wide layout', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    vi.mocked(adminStats).mockResolvedValue({ ok: true, data: stats });
    const { container } = open();
    await screen.findByText('Користувачів усього');
    const main = container.querySelector('main.admin-page')!;
    expect(main.querySelector(':scope > nav.admin-tabs')).not.toBeNull();
    expect(main.querySelector(':scope > .admin-body')?.textContent).toContain('Користувачів усього');
  });

  it('shows the stats and the twelve section links', async () => {
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
    expect(links.map((link) => link.textContent)).toEqual(['Статистика', 'Живі ігри', 'Користувачі', 'Вікторини', 'Звернення', 'Оголошення', 'Розсилка', 'Стрічка', 'Групи', 'Журнал', 'Копії', 'Бот']);
    expect(within(nav).getByRole('link', { name: 'Звернення' }).getAttribute('href')).toBe('/admin/appeals');
    expect(within(nav).queryByRole('link', { name: 'Збої' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Скарги' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Копії' }).getAttribute('href')).toBe('/admin/backups');
    expect(nav.querySelector('.menu-badge')).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Бот' }).getAttribute('href')).toBe('/admin/bot');
    expect(within(nav).getByRole('link', { name: 'Розсилка' }).getAttribute('href')).toBe('/admin/broadcast');
    expect(within(nav).getByRole('link', { name: 'Живі ігри' }).getAttribute('href')).toBe('/admin/live');
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Статистика' }).getAttribute('aria-current')).toBe('page'));
    expect(within(nav).getByRole('link', { name: 'Користувачі' }).getAttribute('aria-current')).toBeNull();
  });

  it('shows complaints, open problems and new errors as one badge on the appeals tab', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    vi.mocked(adminStats).mockResolvedValue({ ok: true, data: stats });
    vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 1, reports: 2, complaints: 3 } });
    open();
    const nav = await screen.findByRole('navigation', { name: 'Розділи адмінки' });
    const badge = await waitFor(() => {
      const found = nav.querySelector('.menu-badge');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(badge.textContent).toBe('6');
    expect(badge.getAttribute('aria-label')).toBe('Звернення, нових: 6');
    expect(badge.closest('a')?.getAttribute('href')).toBe('/admin/appeals');
    expect(nav.querySelectorAll('.menu-badge')).toHaveLength(1);
    expect(adminProblemsBadge).toHaveBeenCalled();
  });

  it('drops the badge right after an error is resolved, without navigating', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 3, reports: 0, complaints: 0 } });
    vi.mocked(adminErrors).mockResolvedValue({
      ok: true,
      data: {
        rows: [{ id: 'e1', where: 'http', what: null, event: null, name: 'Error', message: 'boom', stack: null, count: 1, dayCount: 1, firstAt: '2026-11-20T08:00:00.000Z', lastAt: '2026-11-20T08:00:00.000Z', status: 'new', resolvedBy: null, resolvedAt: null }],
        page: 1,
        pages: 1,
        total: 1,
      },
    });
    vi.mocked(resolveServerError).mockResolvedValue({ ok: true });
    open('/admin/appeals/errors');
    const nav = await screen.findByRole('navigation', { name: 'Розділи адмінки' });
    await waitFor(() => expect(nav.querySelector('.menu-badge')?.textContent).toBe('3'));
    vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 2, reports: 0, complaints: 0 } });
    fireEvent.click(await screen.findByRole('button', { name: 'Позначити як вирішене' }));
    await waitFor(() => expect(nav.querySelector('.menu-badge')?.textContent).toBe('2'));
  });

  it('old addresses lead to the new ones without an extra history step (70)', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    const cases: [string, string][] = [
      ['/admin/reports', '/admin/appeals/complaints'],
      ['/admin/reports/quiz/e1', '/admin/appeals/complaints/quiz/e1'],
      ['/admin/errors', '/admin/appeals/errors'],
      ['/admin/errors?view=reports', '/admin/appeals/problems'],
      ['/admin/errors?view=reports&page=3', '/admin/appeals/problems'],
      ['/admin/appeals', '/admin/appeals/complaints'],
    ];
    for (const [from, to] of cases) {
      open(from);
      await waitFor(() => expect(where(), from).toBe(to));
      cleanup();
    }
  });

  it('puts «Стрічка» and «Групи» before «Журнал» and opens their pages (63)', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    vi.mocked(adminFeed).mockResolvedValue({ ok: true, data: { rows: [], total: 0, page: 1, pages: 1 } });
    open('/admin/feed');
    const nav = await screen.findByRole('navigation', { name: 'Розділи адмінки' });
    expect(within(nav).getByRole('link', { name: 'Стрічка' }).getAttribute('href')).toBe('/admin/feed');
    expect(within(nav).getByRole('link', { name: 'Групи' }).getAttribute('href')).toBe('/admin/groups');
    const names = within(nav).getAllByRole('link').map((link) => link.textContent);
    expect(names.indexOf('Групи')).toBe(names.indexOf('Стрічка') + 1);
    expect(names.indexOf('Журнал')).toBe(names.indexOf('Групи') + 1);
    expect(await screen.findByText('Подій немає.')).toBeTruthy();
    expect(adminFeed).toHaveBeenCalledWith({ page: 1 });
    cleanup();
    vi.mocked(adminGroup).mockResolvedValue({
      ok: true,
      data: {
        group: { id: 'g1', name: 'Родина Квіткових', emoji: '🌻', owner: { id: 'u2', nickname: 'Оля' }, members: 2, items: 0, createdAt: '2026-11-14T10:00:00.000Z', hidden: null },
        members: [],
        items: { rows: [], total: 0, page: 1, pages: 1 },
      },
    });
    open('/admin/groups/g1');
    expect(await screen.findByRole('heading', { name: '🌻 Родина Квіткових' })).toBeTruthy();
    expect(adminGroup).toHaveBeenCalledWith('g1', 1);
  });

  it('scrolls the active section link into view in the one-row tab strip (63)', async () => {
    vi.mocked(me).mockResolvedValue(account(true));
    vi.mocked(adminFeed).mockResolvedValue({ ok: true, data: { rows: [], total: 0, page: 1, pages: 1 } });
    const scrolled: Element[] = [];
    const scroll = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scroll });
    try {
      open('/admin/feed');
      const nav = await screen.findByRole('navigation', { name: 'Розділи адмінки' });
      const active = within(nav).getByRole('link', { name: 'Стрічка' });
      await waitFor(() => expect(scrolled).toContain(active));
      expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest', inline: 'nearest' }));
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
