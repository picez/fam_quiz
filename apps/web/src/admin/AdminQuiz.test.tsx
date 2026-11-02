// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AdminQuizView, Question } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminQuiz } from './AdminQuiz';
import { adminQuiz, deleteQuestionAsAdmin, deleteQuizAsAdmin } from './admin-api';

vi.mock('./admin-api', () => ({ adminQuiz: vi.fn(), deleteQuestionAsAdmin: vi.fn(), deleteQuizAsAdmin: vi.fn() }));

const q = (id: string, text: string): Question => ({ id, type: 'boolean', text, correct: true, imageUrl: null, video: null, timeLimit: 30, points: 1000 });
const rules = { streak: false, penalty: false, partial: false, multiplier: 1 };
const view = (ids: string[], effects: AdminQuizView['effects']): AdminQuizView =>
  ({
    id: 'z1',
    author: { id: 'u2', nickname: 'Оля' },
    updatedAt: '2026-11-01T10:00:00.000Z',
    effects,
    quiz: {
      title: 'Карпати',
      description: '',
      settings: { leaderboard: 'each' },
      rounds: [{ id: 'r1', type: 'classic', title: 'Розминка', shuffleOptions: false, check: 'auto', rules, questions: ids.map((id) => q(id, `Текст ${id}`)) }],
      duels: { categories: [{ id: 'dc', title: 'Гори', questions: [{ id: 'dq', text: 'Дуельне питання', accepted: ['так'] }] }], questionsPerDuel: 1, timeLimit: 30, stake: 0 },
    },
  }) as unknown as AdminQuizView;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={['/quizzes/z1']}>
      <Routes>
        <Route path="/quizzes/:id" element={<AdminQuiz />} />
        <Route path="/admin/quizzes" element={<p>список вікторин</p>} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('AdminQuiz', () => {
  it('shows questions and duels read-only', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: view(['q1', 'q2'], { q1: 'question', q2: 'question' }) });
    open();
    expect(await screen.findByText('Текст q1')).toBeTruthy();
    expect(screen.getByText('Текст q2')).toBeTruthy();
    expect(screen.getByText('Дуельне питання')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Видалити запитання' }).length).toBe(2);
    expect(screen.getByText(/Дуелі лише для перегляду/)).toBeTruthy();
  });

  it('deletes one question and takes the quiz from the answer; the last one is off', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: view(['q1', 'q2'], { q1: 'question', q2: 'question' }) });
    vi.mocked(deleteQuestionAsAdmin).mockResolvedValue({ ok: true, data: view(['q2'], { q2: 'last_question' }) });
    open();
    await screen.findByText('Текст q1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити запитання' })[0]!);
    await waitFor(() => expect(deleteQuestionAsAdmin).toHaveBeenCalledWith('z1', 'q1'));
    await waitFor(() => expect(screen.queryByText('Текст q1')).toBeNull());
    const button = screen.getByRole('button', { name: 'Видалити запитання' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Видали вікторину цілком')).toBeTruthy();
  });

  it('does nothing when the confirm is declined', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: view(['q1', 'q2'], { q1: 'question', q2: 'question' }) });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    open();
    await screen.findByText('Текст q1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити запитання' })[0]!);
    expect(deleteQuestionAsAdmin).not.toHaveBeenCalled();
  });

  it('warns that the round goes too', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: view(['q1', 'q2'], { q1: 'round', q2: 'question' }) });
    open();
    await screen.findByText('Текст q1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити запитання' })[0]!);
    expect(vi.mocked(window.confirm).mock.calls[0]![0]).toContain('Розминка');
  });

  it('deletes the whole quiz and goes to the list', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: view(['q1', 'q2'], { q1: 'question', q2: 'question' }) });
    vi.mocked(deleteQuizAsAdmin).mockResolvedValue({ ok: true });
    open();
    await screen.findByText('Текст q1');
    fireEvent.click(screen.getByRole('button', { name: 'Видалити вікторину' }));
    await waitFor(() => expect(deleteQuizAsAdmin).toHaveBeenCalledWith('z1'));
    const text = vi.mocked(window.confirm).mock.calls[0]![0] as string;
    expect(text).toContain('Оля');
    expect(text).toContain('Зіграні ігри лишаться в історії');
    expect(await screen.findByText('список вікторин')).toBeTruthy();
  });
});
