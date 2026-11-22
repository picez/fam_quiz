// @vitest-environment jsdom
import type { AdminReportItem } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminReports } from './AdminReports';
import { actOnProfileReport, actOnQuizReport, adminReports } from './admin-api';

vi.mock('./admin-api', () => ({ adminReports: vi.fn(), actOnQuizReport: vi.fn(), actOnProfileReport: vi.fn() }));

const quiz = (over: Partial<Extract<AdminReportItem, { kind: 'quiz' }>> = {}): AdminReportItem => ({
  kind: 'quiz',
  entryId: 'e1',
  quizId: 'q1',
  title: 'Річки України',
  author: { id: 'u1', nickname: 'Олена' },
  moderation: 'auto_hidden',
  appeal: false,
  reports: 3,
  reasons: { spam: 2, offensive: 1 },
  texts: ['Це реклама'],
  since: '2026-11-18T10:00:00.000Z',
  ...over,
});
const profile = (over: Partial<Extract<AdminReportItem, { kind: 'profile' }>> = {}): AdminReportItem => ({
  kind: 'profile',
  userId: 'u2',
  nickname: 'Богдан',
  avatar: 'a.png',
  reports: 1,
  reasons: { personal: 1 },
  texts: [],
  since: '2026-11-18T10:00:00.000Z',
  ...over,
});
const page = (rows: AdminReportItem[]) => ({ ok: true as const, data: { rows, total: rows.length, page: 1, pages: 1 } });
const open = () =>
  render(
    <MemoryRouter>
      <AdminReports />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(actOnQuizReport).mockResolvedValue({ ok: true });
  vi.mocked(actOnProfileReport).mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminReports', () => {
  it('shows a quiz with reasons, notes and the temporary-hide mark, and hides it after a confirmation', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([quiz()]));
    open();
    expect(await screen.findByText('Вікторина «Річки України» — Олена')).toBeTruthy();
    expect(screen.getByText('3 скарги')).toBeTruthy();
    expect(screen.getByText('Спам × 2')).toBeTruthy();
    expect(screen.getByText('Це реклама').closest('blockquote')?.getAttribute('dir')).toBe('auto');
    expect(screen.getByText('⏳ Тимчасово приховано: скарги на перевірці')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Переглянути вікторину' }).getAttribute('href')).toBe('/admin/appeals/complaints/quiz/e1');
    fireEvent.click(screen.getByRole('button', { name: 'Сховати вікторину' }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(actOnQuizReport).toHaveBeenCalledWith('e1', 'hide'));
    await waitFor(() => expect(adminReports).toHaveBeenCalledTimes(2));
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([quiz()]));
    vi.mocked(window.confirm).mockReturnValue(false);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Сховати вікторину' }));
    expect(actOnQuizReport).not.toHaveBeenCalled();
  });

  it('dismisses a quiz report', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([quiz()]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Відхилити скаргу' }));
    await waitFor(() => expect(actOnQuizReport).toHaveBeenCalledWith('e1', 'dismiss'));
  });

  it('shows an appeal with unhide and reject, without hide', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([quiz({ moderation: 'hidden', appeal: true, reports: 0, reasons: {}, texts: [] })]));
    open();
    expect(await screen.findByText('Автор оскаржує приховування')).toBeTruthy();
    expect(screen.getByText('🚫 Приховано модератором')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Сховати вікторину' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Відхилити скаргу' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Зняти приховування' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Зняти приховування з вікторини «Річки України»? Вона повернеться в каталог, якщо автор її не закрив.');
    await waitFor(() => expect(actOnQuizReport).toHaveBeenCalledWith('e1', 'restore'));
  });

  it('rejects an appeal with its own label and warning', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([quiz({ moderation: 'hidden', appeal: true, reports: 0, reasons: {}, texts: [] })]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Відхилити оскарження' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Відхилити оскарження «Річки України»? Вікторина лишиться прихованою, оскаржити вдруге не можна.');
    await waitFor(() => expect(actOnQuizReport).toHaveBeenCalledWith('e1', 'dismiss'));
  });

  it('reads the queue again when the active tab is clicked once more', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([]));
    render(
      <MemoryRouter initialEntries={['/admin/reports']}>
        <Link to="/admin/reports">tab</Link>
        <AdminReports />
      </MemoryRouter>,
    );
    await screen.findByText('Відкритих скарг немає.');
    expect(adminReports).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('link', { name: 'tab' }));
    await waitFor(() => expect(adminReports).toHaveBeenCalledTimes(2));
  });

  it('shows a profile with reset buttons only for what exists', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([profile(), profile({ userId: 'u3', nickname: null, avatar: null })]));
    open();
    expect(await screen.findByText('Профіль Богдан')).toBeTruthy();
    expect(screen.getByText('Профіль Гравець')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Скинути нік' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Скинути аватар' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Переглянути користувача' })[0]!.getAttribute('href')).toBe('/admin/users/u2');
    fireEvent.click(screen.getByRole('button', { name: 'Скинути нік' }));
    await waitFor(() => expect(actOnProfileReport).toHaveBeenCalledWith('u2', 'reset_nickname'));
    fireEvent.click(await screen.findByRole('button', { name: 'Скинути аватар' }));
    await waitFor(() => expect(actOnProfileReport).toHaveBeenCalledWith('u2', 'reset_avatar'));
  });

  it('says so when there is nothing open', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([]));
    open();
    expect(await screen.findByText('Відкритих скарг немає.')).toBeTruthy();
    expect(screen.getByText(/Три скарги від різних людей/)).toBeTruthy();
  });

  it('shows the error when an action fails', async () => {
    vi.mocked(adminReports).mockResolvedValue(page([profile()]));
    vi.mocked(actOnProfileReport).mockResolvedValue({ ok: false, error: 'cannot_ban_admin' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Скинути нік' }));
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
  });
});
