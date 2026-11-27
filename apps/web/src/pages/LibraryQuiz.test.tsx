// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LibraryDetail } from '@quiz/shared';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { createGame, me } from '../api';
import { loadHost } from '../storage';
import { copyLibrary, libraryQuiz, likeLibrary, sendReport } from '../library/library-api';
import { LibraryQuiz } from './LibraryQuiz';

vi.mock('../api', () => ({ me: vi.fn(), createGame: vi.fn() }));
vi.mock('../library/library-api', () => ({ libraryQuiz: vi.fn(), likeLibrary: vi.fn(), copyLibrary: vi.fn(), sendReport: vi.fn() }));

const detail = (over: Partial<LibraryDetail> = {}): LibraryDetail => ({
  id: 'e1',
  title: 'Річки України',
  description: 'Перший рядок\nДругий рядок',
  author: 'Олена',
  questionCount: 6,
  roundTypes: ['classic'],
  language: 'uk',
  likes: 3,
  plays: 2,
  rounds: [{ title: 'Річки', type: 'classic' }, { title: '', type: 'blitz' }],
  openedAt: '2026-10-12T10:00:00.000Z',
  updatedAt: '2026-10-12T10:00:00.000Z',
  ...over,
});
const OLENA = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false };

const show = () =>
  render(
    <MemoryRouter initialEntries={['/library/e1']}>
      <Routes>
        <Route path="/library/:id" element={<LibraryQuiz />} />
        <Route path="/host/:code" element={<p>пульт</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  forgetAccount();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue(OLENA);
  vi.mocked(libraryQuiz).mockResolvedValue({ ok: true, data: detail() });
  vi.mocked(likeLibrary).mockResolvedValue({ ok: true, data: { likes: 4, liked: true } });
  vi.mocked(copyLibrary).mockResolvedValue({ ok: true, data: { id: 'q9' } });
  vi.mocked(sendReport).mockResolvedValue({ ok: true });
  vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
});
afterEach(cleanup);

describe('LibraryQuiz', () => {
  it('a failed load offers «Спробувати ще раз» and a way back to the library (76)', async () => {
    vi.mocked(libraryQuiz).mockResolvedValueOnce({ ok: false, error: 'offline' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Спробувати ще раз' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Річки України' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад: Бібліотека' }).getAttribute('href')).toBe('/library');
    expect(document.title).toBe('Річки України · Вікторина');
  });

  it('shows the description, the rounds and a note that questions stay hidden', async () => {
    show();
    expect(await screen.findByRole('heading', { level: 1, name: 'Річки України' })).toBeTruthy();
    expect(screen.getByText(/Перший рядок/).textContent).toBe('Перший рядок\nДругий рядок');
    expect(screen.getByRole('heading', { level: 2, name: 'Раунди' })).toBeTruthy();
    const rounds = within(screen.getByRole('list', { name: 'Раунди' })).getAllByRole('listitem');
    expect(rounds.map((r) => r.textContent)).toEqual(['Річки — Класичний', 'Бліц']);
    expect(screen.getByText('Запитань і відповідей тут не видно — щоб не підглядати.')).toBeTruthy();
    expect(screen.getByText('Автор: Олена')).toBeTruthy();
  });

  it('never asks for the questions of the quiz', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    show();
    await screen.findByRole('heading', { level: 1 });
    expect(spy).not.toHaveBeenCalled();
    expect(libraryQuiz).toHaveBeenCalledWith('e1');
    spy.mockRestore();
  });

  it('«Провести гру» copies the quiz and starts hosting the copy at once (77)', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Провести гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(copyLibrary).toHaveBeenCalledWith('e1');
    expect(createGame).toHaveBeenCalledWith('q9');
    expect(loadHost('123456')).toEqual({ hostToken: 'h', stageToken: 's' });
  });

  it('«Провести гру» reuses an earlier copy without copying again (77)', async () => {
    vi.mocked(libraryQuiz).mockResolvedValue({ ok: true, data: detail({ hostQuizId: 'q5' }) });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Провести гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(copyLibrary).not.toHaveBeenCalled();
    expect(createGame).toHaveBeenCalledWith('q5');
  });

  it('the author hosts the own quiz from its library page (77)', async () => {
    vi.mocked(libraryQuiz).mockResolvedValue({ ok: true, data: detail({ mine: true, hostQuizId: 'q1' }) });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Провести гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(copyLibrary).not.toHaveBeenCalled();
    expect(createGame).toHaveBeenCalledWith('q1');
  });

  it('a failed start after copying keeps the copy link and explains (77)', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: false, error: 'server_busy' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Провести гру' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Сервер перевантажений. Спробуйте за хвилину.');
    expect(screen.getByRole('link', { name: 'Відкрити копію' }).getAttribute('href')).toBe('/quizzes/q9');
    // Повторне «Провести гру» бере ту саму копію.
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    fireEvent.click(screen.getByRole('button', { name: 'Провести гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(copyLibrary).toHaveBeenCalledTimes(1);
    expect(createGame).toHaveBeenLastCalledWith('q9');
  });

  it('a guest gets «Увійти, щоб провести» that returns to this page (77)', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    show();
    const link = await screen.findByRole('link', { name: 'Увійти, щоб провести' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Flibrary%2Fe1');
    expect(screen.queryByRole('button', { name: 'Провести гру' })).toBeNull();
  });

  it('likes and updates the counter', async () => {
    show();
    const like = await screen.findByRole('button', { name: /Подобається/ });
    expect(like.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(like);
    await vi.waitFor(() => expect(likeLibrary).toHaveBeenCalledWith('e1', true));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Подобається/ }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: /Подобається/ }).textContent).toContain('4');
  });

  it('copies into My quizzes and links to the copy', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Копіювати собі' }));
    expect(await screen.findByText('Скопійовано в «Мої вікторини»')).toBeTruthy();
    expect(copyLibrary).toHaveBeenCalledWith('e1');
    expect(screen.getByRole('link', { name: 'Відкрити копію' }).getAttribute('href')).toBe('/quizzes/q9');
  });

  it('asks a guest to sign in with one link and offers no buttons (78)', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    show();
    await screen.findByRole('link', { name: 'Увійти, щоб провести' });
    const signIns = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/login'));
    expect(signIns.map((link) => link.getAttribute('href'))).toEqual(['/login?next=%2Flibrary%2Fe1']);
    expect(screen.queryByText('Увійди, щоб копіювати, вподобати чи поскаржитись')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Копіювати собі' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Подобається/ })).toBeNull();
  });

  it('offers the author neither like nor copy', async () => {
    vi.mocked(libraryQuiz).mockResolvedValue({ ok: true, data: detail({ mine: true }) });
    show();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Копіювати собі' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Подобається/ })).toBeNull();
  });

  it('opens the report dialog for an account and reports the quiz entry', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Поскаржитись' }));
    expect(screen.getByRole('dialog', { name: 'Скарга' })).toBeTruthy();
    expect(sendReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Спам'));
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));
    await vi.waitFor(() => expect(sendReport).toHaveBeenCalledWith({ target: { kind: 'quiz', entryId: 'e1' }, reason: 'spam' }));
  });

  it('offers no report button to a guest or to the author', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    show();
    await screen.findByRole('link', { name: 'Увійти, щоб провести' });
    expect(screen.queryByRole('button', { name: 'Поскаржитись' })).toBeNull();
    cleanup();
    forgetAccount();
    vi.mocked(me).mockResolvedValue(OLENA);
    vi.mocked(libraryQuiz).mockResolvedValue({ ok: true, data: detail({ mine: true }) });
    show();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Поскаржитись' })).toBeNull();
  });

  it('says not found for a missing quiz', async () => {
    vi.mocked(libraryQuiz).mockResolvedValue({ ok: false, error: 'not_found' });
    show();
    expect((await screen.findByRole('alert')).textContent).toBe('Не знайдено.');
  });

  it('explains copying your own quiz', async () => {
    vi.mocked(copyLibrary).mockResolvedValue({ ok: false, error: 'library_own' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Копіювати собі' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Це твоя вікторина — вона вже є в «Мої вікторини».');
  });
});
