// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuiz, getQuiz, me, updateQuiz } from '../api';
import { demoQuiz } from '../demo-quiz';
import { EditQuiz } from './EditQuiz';

vi.mock('../api', () => ({ me: vi.fn(), getQuiz: vi.fn(), createQuiz: vi.fn(), updateQuiz: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
});
afterEach(cleanup);

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/quizzes/new" element={<EditQuiz />} />
        <Route path="/quizzes/:id" element={<EditQuiz />} />
        <Route path="/quizzes" element={<p>мої вікторини</p>} />
        <Route path="/login" element={<p>сторінка входу</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('EditQuiz', () => {
  it('loads a saved quiz, saves the changes and returns to the list', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    vi.mocked(updateQuiz).mockResolvedValue({ ok: true, id: 'q1' });
    open('/quizzes/q1');

    const title = (await screen.findByLabelText('Назва вікторини')) as HTMLInputElement;
    expect(title.value).toBe(demoQuiz.title);
    fireEvent.change(title, { target: { value: 'Нова назва' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(updateQuiz).toHaveBeenCalledWith('q1', expect.objectContaining({ title: 'Нова назва' }));
    expect(createQuiz).not.toHaveBeenCalled();
  });

  it('creates a new quiz', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q9' });
    open('/quizzes/new');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(createQuiz).toHaveBeenCalledWith(expect.objectContaining({ title: 'Гра' }));
    expect(getQuiz).not.toHaveBeenCalled();
  });

  it('keeps the editor open and explains when saving fails', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: false, error: 'offline' });
    open('/quizzes/new');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Немає зв’язку із сервером.'));
    expect((screen.getByLabelText('Назва вікторини') as HTMLInputElement).value).toBe('Гра');
  });

  it('sends the host to sign in when the session has ended', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/quizzes/q1');
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('says so when the quiz does not exist', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: false, error: 'not_found' });
    open('/quizzes/q1');
    expect((await screen.findByRole('alert')).textContent).toBe('Не знайдено.');
  });
});

describe('EditQuiz: unsaved work', () => {
  const title = async () => (await screen.findByLabelText('Назва вікторини')) as HTMLInputElement;

  it('restores an unsaved new quiz after the page is reloaded', async () => {
    open('/quizzes/new');
    fireEvent.change(await title(), { target: { value: 'Чернетка' } });
    cleanup();

    open('/quizzes/new');
    expect((await title()).value).toBe('Чернетка');
    expect(screen.getByRole('status').textContent).toBe('Відновлено незбережені зміни.');
  });

  it('restores an emptied number field as empty, not as a wrong number', async () => {
    open('/quizzes/new');
    await title();
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'numeric' } });
    fireEvent.change(screen.getByLabelText('Правильне число'), { target: { value: '' } });
    cleanup();

    open('/quizzes/new');
    await title();
    expect((screen.getByLabelText('Правильне число') as HTMLInputElement).value).toBe('');
  });

  it('forgets the draft once the quiz is saved', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q9' });
    open('/quizzes/new');
    fireEvent.change(await title(), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await screen.findByText('мої вікторини');
    cleanup();

    open('/quizzes/new');
    expect((await title()).value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the work when the session ends during save and brings it back after signing in', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/quizzes/new');
    fireEvent.change(await title(), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
    cleanup();

    open('/quizzes/new');
    expect((await title()).value).toBe('Гра');
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Так?');
  });

  it('restores unsaved changes to a saved quiz instead of the saved version', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    open('/quizzes/q1');
    fireEvent.change(await title(), { target: { value: 'Змінена назва' } });
    cleanup();

    open('/quizzes/q1');
    expect((await title()).value).toBe('Змінена назва');
  });

  it('keeps drafts of different quizzes apart', async () => {
    open('/quizzes/new');
    fireEvent.change(await title(), { target: { value: 'Нова чернетка' } });
    cleanup();

    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    open('/quizzes/q1');
    expect((await title()).value).toBe(demoQuiz.title);
  });
});
