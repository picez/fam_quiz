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
    // Рядок стану є з першого показу, порожній: програма читання екрана оголошує зміну тексту, а не новий вузол.
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    await waitFor(() => expect(status.textContent).toBe('Усе добре'));
    expect(screen.getByRole('status')).toBe(status);
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
    expect(screen.getByRole('status').textContent).toBe('Помилок: 2 · попереджень: 1');
    expect(within(errors).getAllByRole('listitem')).toHaveLength(2);
    // Шлях ізольовано (FSI … PDI): в арабській «/» і «.» не переставляються.
    expect(errors.textContent).toContain('Файл \u2068/uploads/aaaaaaaaaaaaaaaa.jpg\u2069 не знайдено у сховищі');
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

  it('labels an issue of the whole quiz, and the duel timer as duels', async () => {
    const whole = issue({ code: 'schema', round: null, questionId: null, question: null, detail: 'title: Too small' });
    const duelTimer = issue({ code: 'short_timer', round: null, questionId: null, question: null, detail: '20' });
    const duelSchema = issue({ code: 'schema', round: null, questionId: null, question: null, detail: 'duels.stake: Too big' });
    vi.mocked(checkQuiz).mockResolvedValue({ ok: true, data: result([whole, duelSchema, duelTimer]) });
    panel();
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    const items = await screen.findAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.meta')?.textContent)).toEqual(['Уся вікторина', 'Запасні й дуелі', 'Запасні й дуелі']);
  });

  it('a blocked address has its own text', async () => {
    vi.mocked(checkQuiz).mockResolvedValue({ ok: true, data: result([issue({ code: 'media_blocked', detail: 'http://10.0.0.5/x.jpg' })]) });
    panel();
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    const item = await screen.findByRole('listitem');
    expect(item.textContent).toContain('Адреса веде у внутрішню мережу, її не перевіряли: \u2068http://10.0.0.5/x.jpg\u2069');
    expect(item.textContent).not.toContain('blocked');
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
    await waitFor(() => expect(screen.getByRole('status').textContent).toBeTruthy());
    expect(screen.getByRole('status').className).toContain('error');
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
        <QuizCheckButton quizId="z1" title="Карпати" onDone={onDone} />
      </MemoryRouter>,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    // Кнопок у списку багато: у назві — вікторина.
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити: Карпати' }));
    await waitFor(() => expect(status.textContent).toBe('Помилок: 2 · попереджень: 1'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('says all good for a clean quiz', async () => {
    vi.mocked(checkQuiz).mockResolvedValue({ ok: true, data: result([]) });
    render(
      <MemoryRouter>
        <QuizCheckButton quizId="z1" title="Карпати" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити: Карпати' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Усе добре'));
  });
});
