// @vitest-environment jsdom
import type { AdminList, AdminQuizRow } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const open = () =>
  render(
    <MemoryRouter initialEntries={['/admin/quizzes']}>
      <Routes>
        <Route path="/admin/quizzes" element={<AdminQuizzes />} />
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
