// @vitest-environment jsdom
import type { AdminQuizCheck, QuizCheckIssue } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkQuiz } from './admin-api';
import { QuizCheckButton, QuizCheckPanel } from './QuizCheck';

vi.mock('./admin-api', () => ({ checkQuiz: vi.fn() }));

const issue = (over: Partial<QuizCheckIssue>): QuizCheckIssue => ({ code: 'media_missing', round: 0, questionId: 'q1', question: 'Найдовша річка?', detail: '/uploads/aaaaaaaaaaaaaaaa.jpg', ...over });
const result = (issues: QuizCheckIssue[]): AdminQuizCheck => ({
  quizId: 'z1',
  checkedAt: '2026-11-19T10:00:00.000Z',
  errors: issues.filter((i) => i.code === 'media_missing' || i.code === 'autopilot_blocked').length,
  warnings: issues.filter((i) => i.code === 'short_timer').length,
  issues,
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const panel = (onIssue = vi.fn()) =>
  render(
    <MemoryRouter initialEntries={['/x']}>
      <Routes>
        <Route path="/x" element={<QuizCheckPanel quizId="z1" onIssue={onIssue} />} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('QuizCheckPanel', () => {
  it('all good', async () => {
    vi.mocked(checkQuiz).mockResolvedValue({ ok: true, data: result([]) });
    panel();
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('Усе добре');
    expect(checkQuiz).toHaveBeenCalledWith('z1');
  });

  it('groups errors and warnings', async () => {
    const issues = [
      issue({}),
      issue({ code: 'autopilot_blocked', round: 1, questionId: null, question: null, detail: 'think_words' }),
      issue({ code: 'short_timer', round: 1, questionId: 'q2', question: 'Найвища гора?', detail: '20' }),
    ];
    vi.mocked(checkQuiz).mockResolvedValue({ ok: true, data: result(issues) });
    const onIssue = vi.fn();
    panel(onIssue);
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    const errors = (await screen.findByRole('heading', { name: 'Помилки' })).parentElement as HTMLElement;
    expect(within(errors).getAllByRole('listitem')).toHaveLength(2);
    expect(errors.textContent).toContain('У «Думай інакше» є питання без слів ведучого');
    expect(errors.textContent).toContain('Раунд 1');
    const warnings = screen.getByRole('heading', { name: 'Попередження' }).parentElement as HTMLElement;
    expect(within(warnings).getAllByRole('listitem')).toHaveLength(1);
    expect(warnings.textContent).toContain('Таймер 20 с — менше 25 с');
    expect(warnings.textContent).toContain('Раунд 2');
    expect(warnings.textContent).toContain('Найвища гора?');
    // Без questionId кнопки «До запитання» немає.
    expect(within(errors).getAllByRole('button', { name: 'До запитання' })).toHaveLength(1);
    fireEvent.click(within(errors).getByRole('button', { name: 'До запитання' }));
    expect(onIssue).toHaveBeenCalledWith(issues[0]);
  });

  it('labels spares and duels', async () => {
    vi.mocked(checkQuiz).mockResolvedValue({ ok: true, data: result([issue({ round: null })]) });
    panel();
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    expect((await screen.findByText(/Запасні й дуелі/)).textContent).toContain('Запасні й дуелі');
  });

  it('is busy while the request is on its way', async () => {
    let finish: (value: Awaited<ReturnType<typeof checkQuiz>>) => void = () => undefined;
    vi.mocked(checkQuiz).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    panel();
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    const busy = await screen.findByRole('button', { name: 'Перевіряємо…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, data: result([]) });
    await screen.findByText('Усе добре');
  });

  it('goes home on not_found and shows other errors as an alert', async () => {
    vi.mocked(checkQuiz).mockResolvedValueOnce({ ok: false, error: 'network' });
    panel();
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
    vi.mocked(checkQuiz).mockResolvedValueOnce({ ok: false, error: 'not_found' });
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    expect(await screen.findByText('головна')).toBeTruthy();
  });
});

describe('QuizCheckButton', () => {
  it('shows the summary and tells when it is done', async () => {
    vi.mocked(checkQuiz).mockResolvedValue({ ok: true, data: result([issue({}), issue({ code: 'autopilot_blocked', detail: 'think_words' }), issue({ code: 'short_timer', detail: '20' })]) });
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <QuizCheckButton quizId="z1" onDone={onDone} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити' }));
    expect((await screen.findByRole('status')).textContent).toBe('Помилок: 2 · попереджень: 1');
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('says all good for a clean quiz', async () => {
    vi.mocked(checkQuiz).mockResolvedValue({ ok: true, data: result([]) });
    render(
      <MemoryRouter>
        <QuizCheckButton quizId="z1" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити' }));
    expect((await screen.findByRole('status')).textContent).toBe('Усе добре');
  });
});
