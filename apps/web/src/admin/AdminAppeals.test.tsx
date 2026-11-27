// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAppeals } from './AdminAppeals';
import { adminErrors, adminProblems, adminProblemsBadge, adminReports } from './admin-api';

vi.mock('./admin-api', () => ({ adminProblemsBadge: vi.fn(), adminProblems: vi.fn(), adminReports: vi.fn(), adminErrors: vi.fn(), adminReportedQuiz: vi.fn() }));

const empty = { ok: true as const, data: { rows: [], page: 1, pages: 1, total: 0 } };

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}</output>;
}
const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/appeals/*" element={<AdminAppeals />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 0, reports: 0, complaints: 0 } });
  vi.mocked(adminReports).mockResolvedValue(empty);
  vi.mocked(adminProblems).mockResolvedValue(empty);
  vi.mocked(adminErrors).mockResolvedValue(empty);
});
afterEach(cleanup);

describe('AdminAppeals (70)', () => {
  it('the bare address opens the complaints', async () => {
    open('/admin/appeals');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/appeals/complaints'));
    expect(await screen.findByText('Відкритих скарг немає.')).toBeTruthy();
  });

  it('three links in the agreed order, the active one is current', async () => {
    open('/admin/appeals/problems');
    const nav = await screen.findByRole('navigation', { name: 'Розділи звернень' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Скарги на вікторини й профілі', 'Повідомлення про проблеми', 'Збої сервера']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/admin/appeals/complaints', '/admin/appeals/problems', '/admin/appeals/errors']);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page', null]);
    expect(await screen.findByText('Повідомлень немає.')).toBeTruthy();
  });

  it('each link has its own counter', async () => {
    vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 1, reports: 2, complaints: 3 } });
    open('/admin/appeals/errors');
    const nav = await screen.findByRole('navigation', { name: 'Розділи звернень' });
    const complaints = await within(nav).findByRole('link', { name: 'Скарги на вікторини й профілі, нових: 3' });
    expect(complaints.querySelector('.menu-badge')?.textContent).toBe('3');
    expect(within(nav).getByRole('link', { name: 'Повідомлення про проблеми, нових: 2' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Збої сервера, нових: 1' })).toBeTruthy();
  });

  it('a zero counter shows no badge', async () => {
    open('/admin/appeals/errors');
    const nav = await screen.findByRole('navigation', { name: 'Розділи звернень' });
    await waitFor(() => expect(adminProblemsBadge).toHaveBeenCalled());
    expect(nav.querySelector('.menu-badge')).toBeNull();
  });

  it('the bare address opens the first sub-tab that has new items (70)', async () => {
    vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 1, reports: 2, complaints: 0 } });
    open('/admin/appeals');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/appeals/problems'));
    cleanup();
    vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: true, data: { errors: 1, reports: 0, complaints: 0 } });
    open('/admin/appeals');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/appeals/errors'));
    cleanup();
    vi.mocked(adminProblemsBadge).mockResolvedValue({ ok: false, error: 'offline' });
    open('/admin/appeals');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/appeals/complaints'));
  });

  it('an unknown sub-address goes to the complaints', async () => {
    open('/admin/appeals/nope');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/appeals/complaints'));
  });
});
