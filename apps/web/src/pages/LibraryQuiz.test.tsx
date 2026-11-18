// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LibraryDetail } from '@quiz/shared';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { me } from '../api';
import { copyLibrary, libraryQuiz, likeLibrary, sendReport } from '../library/library-api';
import { LibraryQuiz } from './LibraryQuiz';

vi.mock('../api', () => ({ me: vi.fn() }));
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
});
afterEach(cleanup);

describe('LibraryQuiz', () => {
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

  it('likes and updates the counter', async () => {
    show();
    const like = await screen.findByRole('button', { name: /Подобається/ });
    expect(like.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(like);
    await vi.waitFor(() => expect(likeLibrary).toHaveBeenCalledWith('e1', true));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Подобається тобі/ }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: /Подобається тобі/ }).textContent).toContain('4');
  });

  it('copies into My quizzes and links to the copy', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Копіювати собі' }));
    expect(await screen.findByText('Скопійовано в «Мої вікторини»')).toBeTruthy();
    expect(copyLibrary).toHaveBeenCalledWith('e1');
    expect(screen.getByRole('link', { name: 'Відкрити копію' }).getAttribute('href')).toBe('/quizzes/q9');
  });

  it('asks a guest to sign in and offers no buttons', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    show();
    const hint = await screen.findByText('Увійди, щоб копіювати, вподобати чи поскаржитись');
    expect(hint.closest('p')!.querySelector('a')!.getAttribute('href')).toBe('/login?next=%2Flibrary%2Fe1');
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
    await screen.findByText('Увійди, щоб копіювати, вподобати чи поскаржитись');
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
