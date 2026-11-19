// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AdminQuizView, Question } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminBotQuizView, AdminQuiz, AdminReportedQuiz } from './AdminQuiz';
import { adminQuiz, adminReportedQuiz, checkQuiz, deleteQuestionAsAdmin, deleteQuizAsAdmin } from './admin-api';

vi.mock('./admin-api', () => ({ adminQuiz: vi.fn(), adminReportedQuiz: vi.fn(), checkQuiz: vi.fn(), deleteQuestionAsAdmin: vi.fn(), deleteQuizAsAdmin: vi.fn() }));

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


const IMG_A = '/uploads/aaaaaaaaaaaaaaaa.jpg';
const IMG_B = '/uploads/bbbbbbbbbbbbbbbb.png';
const rich = (questions: Question[]): AdminQuizView => {
  const v = view([], {});
  v.quiz.rounds = [{ id: 'r1', type: 'classic', title: 'Розминка', shuffleOptions: false, check: 'auto', rules, questions }] as unknown as AdminQuizView['quiz']['rounds'];
  v.effects = Object.fromEntries(questions.map((question) => [question.id, 'question' as const]));
  return v;
};
const richQuestions: Question[] = [
  { id: 's1', type: 'single', text: 'Найдовша річка?', imageUrl: IMG_A, video: null, timeLimit: 30, points: 1000, options: [{ id: 'a', text: 'Дніпро', imageUrl: IMG_B }, { id: 'b', text: 'Десна' }], correctId: 'a' },
  { id: 't1', type: 'text', text: 'Найвища гора?', imageUrl: null, video: { id: 'dQw4w9WgXcQ', start: 75 }, timeLimit: 30, points: 500, accepted: ['Говерла', 'гора Говерла'], hint: 'Чорногора' },
];
const many = (count: number): Question[] => Array.from({ length: count }, (_, i) => q(`m${i}`, `Текст m${i}`));

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

  it('shows the reported library snapshot read-only, with its date and a way back to the reports', async () => {
    vi.mocked(adminReportedQuiz).mockResolvedValue({ ok: true, data: view(['q1', 'q2'], {}) });
    render(
      <MemoryRouter initialEntries={['/reports/quiz/e1']}>
        <Routes>
          <Route path="/reports/quiz/:entryId" element={<AdminReportedQuiz />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Текст q1')).toBeTruthy();
    expect(adminReportedQuiz).toHaveBeenCalledWith('e1');
    expect(adminQuiz).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Видалити запитання' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Видалити вікторину' })).toBeNull();
    expect(screen.getByText(/^Знімок у бібліотеці від .+ — саме його бачать гравці.$/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'До списку' }).getAttribute('href')).toBe('/admin/reports');
    // Знімок — не жива вікторина: перевірка жила б іншими запитаннями.
    expect(screen.queryByRole('button', { name: 'Перевірити вікторину' })).toBeNull();
  });

  it('shows answers, spellings, hints, media, points and timers', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: rich(richQuestions) });
    open();
    await screen.findByText('Найдовша річка?');
    const card = document.getElementById('q-s1') as HTMLElement;
    const mark = within(card).getByRole('img', { name: 'Правильна відповідь' });
    expect(mark.textContent).toBe('✓');
    expect(mark.closest('li')?.textContent).toContain('Дніпро');
    expect(within(card).getAllByRole('img', { name: 'Правильна відповідь' }).length).toBe(1);
    expect(within(card).getByText('Бали: 1000 · Таймер: 30 с')).toBeTruthy();
    const pictures = [...card.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(pictures).toEqual([IMG_A, IMG_B]);
    for (const img of card.querySelectorAll('img')) expect(img.getAttribute('loading')).toBe('lazy');
    const text = document.getElementById('q-t1') as HTMLElement;
    expect(within(text).getByText('Написання: Говерла, гора Говерла')).toBeTruthy();
    expect(within(text).getByText('Підказка: Чорногора')).toBeTruthy();
    const video = within(text).getByRole('link', { name: /1:15/ });
    expect(video.getAttribute('href')).toBe('https://youtu.be/dQw4w9WgXcQ?t=75');
    expect(video.getAttribute('target')).toBe('_blank');
    expect(video.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(text).getByText(/^Бали: 500 · Без таймера \(відео\)$/)).toBeTruthy();
    const yesNo = rich([q('b1', 'Так чи ні'), { ...q('b2', 'Ще раз'), correct: false } as Question]);
    cleanup();
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: yesNo });
    open();
    await screen.findByText('Так чи ні');
    expect(within(document.getElementById('q-b1') as HTMLElement).getByText('Відповідь: Так')).toBeTruthy();
    expect(within(document.getElementById('q-b2') as HTMLElement).getByText('Відповідь: Ні')).toBeTruthy();
  });

  it('long quizzes start folded', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: rich(many(21)) });
    open();
    await screen.findByText('Текст m0');
    const folded = document.querySelector('details[data-round="0"]') as HTMLDetailsElement;
    expect(folded.open).toBe(false);
    expect(folded.querySelector('summary > h2')?.textContent).toBe('Розминка');
    expect(screen.getByRole('heading', { level: 2, name: 'Розминка' })).toBeTruthy();
    cleanup();
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: rich(many(20)) });
    open();
    await screen.findByText('Текст m0');
    expect((document.querySelector('details[data-round="0"]') as HTMLDetailsElement).open).toBe(true);
  });

  it('a quiz that is not quite the schema still shows', async () => {
    const odd = rich([{ id: 'o1', type: 'single', text: 'Без варіантів', imageUrl: null, timeLimit: 30, points: 100 } as unknown as Question]);
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: odd });
    open();
    expect(await screen.findByText('Без варіантів')).toBeTruthy();
  });

  it('the bot preview has no delete buttons and goes back to the bot tab', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: rich(richQuestions) });
    render(
      <MemoryRouter initialEntries={['/admin/bot/quizzes/z1']}>
        <Routes>
          <Route path="/admin/bot/quizzes/:id" element={<AdminBotQuizView />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Найдовша річка?')).toBeTruthy();
    expect(adminQuiz).toHaveBeenCalledWith('z1');
    expect(screen.queryByRole('button', { name: 'Видалити запитання' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Видалити вікторину' })).toBeNull();
    expect(screen.getByRole('link', { name: 'До списку' }).getAttribute('href')).toBe('/admin/bot');
    expect(screen.getByText('Написання: Говерла, гора Говерла')).toBeTruthy();
  });

  it('going to an issue opens its folded round', async () => {
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: rich(many(21)) });
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.mocked(checkQuiz).mockResolvedValue({
      ok: true,
      data: { quizId: 'z1', checkedAt: '2026-11-19T10:00:00.000Z', errors: 1, warnings: 0, issues: [{ code: 'media_missing', round: 0, questionId: 'm20', question: 'Текст m20', detail: '/uploads/aaaaaaaaaaaaaaaa.jpg' }] },
    });
    const { container } = open();
    await screen.findByRole('heading', { name: 'Карпати' });
    const round = container.querySelector('details[data-round="0"]') as HTMLDetailsElement;
    expect(round.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити вікторину' }));
    fireEvent.click(await screen.findByRole('button', { name: 'До запитання' }));
    expect(round.open).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.instances[0]).toBe(container.querySelector('#q-m20'));
    expect(document.activeElement).toBe(container.querySelector('#q-m20'));
    expect(container.querySelector('#q-m20')?.getAttribute('tabindex')).toBe('-1');
  });

  it('shows a sudoku solution and an external picture as a link', async () => {
    const sudoku = { id: 'z9', type: 'sudoku', text: 'Судоку', imageUrl: null, video: null, timeLimit: 180, points: 300, level: 'easy', seed: 1, givens: '0'.repeat(36), solution: '123456456123231564564231312645645312' } as unknown as Question;
    const external = { ...q('e1', 'Стара картинка'), imageUrl: 'https://example.com/old.jpg' } as Question;
    vi.mocked(adminQuiz).mockResolvedValue({ ok: true, data: rich([sudoku, external]) });
    open();
    await screen.findByText('Судоку');
    const grid = document.querySelector('#q-z9 pre') as HTMLElement;
    expect(grid.textContent).toBe(['123 456', '456 123', '231 564', '564 231', '312 645', '645 312'].join('\n'));
    expect(grid.getAttribute('aria-label')).toBe("Розв'язок");
    const card = document.getElementById('q-e1') as HTMLElement;
    expect(card.querySelector('img')).toBeNull();
    const link = within(card).getByRole('link', { name: 'https://example.com/old.jpg' });
    expect(link.getAttribute('href')).toBe('https://example.com/old.jpg');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
