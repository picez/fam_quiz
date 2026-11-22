// @vitest-environment jsdom
import type { AdminList, AdminQuizRow } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminQuizzes } from './AdminQuizzes';

const row = (over: Partial<AdminQuizRow> = {}): AdminQuizRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Річки України',
  author: { id: 'u1', nickname: 'Оля' },
  authorBanned: false,
  questionCount: 12,
  games: 3,
  updatedAt: '2026-11-18T10:00:00.000Z',
  createdAt: '2026-11-01T10:00:00.000Z',
  ...over,
});
let body: AdminList<AdminQuizRow>;

beforeEach(() => {
  body = { rows: [row()], total: 1, page: 1, pages: 1 };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit = {}) => ({ status: 200, ok: true, json: async () => (init.method === 'POST' ? { quizId: 'x', checkedAt: '2026-11-19T10:00:00.000Z', errors: 2, warnings: 1, issues: [] } : body) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

const open = (url = '/admin/quizzes') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/admin/quizzes"
          element={
            <>
              <AdminQuizzes />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('AdminQuizzes', () => {
  it('shows the question count as a number, not a placeholder', async () => {
    open();
    const item = (await screen.findByRole('heading', { name: 'Річки України' })).closest('li') as HTMLElement;
    expect(item.textContent).toContain('12 запитань');
    expect(item.textContent).not.toContain('{count}');
  });

  it('uses the plural form for the count', async () => {
    body = { rows: [row({ questionCount: 1 }), row({ id: '22222222-2222-4222-8222-222222222222', title: 'Карпати', questionCount: 3 })], total: 2, page: 1, pages: 1 };
    open();
    const one = (await screen.findByRole('heading', { name: 'Річки України' })).closest('li') as HTMLElement;
    expect(one.textContent).toContain('1 запитання');
    const three = screen.getByRole('heading', { name: 'Карпати' }).closest('li') as HTMLElement;
    expect(three.textContent).toContain('3 запитання');
  });

  it('has a short check in each card that ends in a summary line', async () => {
    open();
    const item = (await screen.findByRole('heading', { name: 'Річки України' })).closest('li') as HTMLElement;
    // Кнопок і посилань у списку багато: у назві — вікторина.
    expect(within(item).getByRole('link', { name: 'Переглянути: Річки України' })).toBeTruthy();
    fireEvent.click(within(item).getByRole('button', { name: 'Перевірити: Річки України' }));
    await waitFor(() => expect(within(item).getByRole('status').textContent).toBe('Помилок: 2 · попереджень: 1'));
  });
});

describe('AdminQuizzes: dates and sort (73)', () => {
  const urls = () => vi.mocked(fetch).mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/admin/quizzes?'));
  const sortSelect = () => screen.getByRole('combobox', { name: t('quizSort') }) as HTMLSelectElement;
  const where = () => screen.getByTestId('where').textContent;

  it('shows the created and changed days on every card', async () => {
    open();
    const item = (await screen.findByRole('heading', { name: 'Річки України' })).closest('li') as HTMLElement;
    expect(within(item).getByText('Створено 1 листопада 2026 · змінено 18 листопада 2026')).toBeTruthy();
  });

  it('asks for the picked sort, keeps it in the tab address and leaves the default out', async () => {
    open();
    await screen.findByRole('heading', { name: 'Річки України' });
    expect(urls()).toEqual(['/api/admin/quizzes?q=&page=1']);
    expect(sortSelect().value).toBe('changed');
    fireEvent.change(sortSelect(), { target: { value: 'name' } });
    await waitFor(() => expect(urls()).toContain('/api/admin/quizzes?q=&page=1&sort=name'));
    expect(where()).toBe('/admin/quizzes?sort=name');
    fireEvent.change(sortSelect(), { target: { value: 'changed' } });
    expect(where()).toBe('/admin/quizzes');
  });

  it('goes back to page 1 when the sort changes', async () => {
    body = { rows: [row()], total: 40, page: 1, pages: 2 };
    open();
    fireEvent.click(await screen.findByRole('button', { name: t('adminNext') }));
    await waitFor(() => expect(urls()).toContain('/api/admin/quizzes?q=&page=2'));
    fireEvent.change(sortSelect(), { target: { value: 'old' } });
    await waitFor(() => expect(urls().at(-1)).toBe('/api/admin/quizzes?q=&page=1&sort=old'));
  });

  it('opens with the sort from the address in the first request', async () => {
    open('/admin/quizzes?sort=old');
    await screen.findByRole('heading', { name: 'Річки України' });
    expect(urls()[0]).toBe('/api/admin/quizzes?q=&page=1&sort=old');
    expect(sortSelect().value).toBe('old');
  });
});
