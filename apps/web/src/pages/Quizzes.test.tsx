// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCode, createGame, createQuiz, deleteQuiz, listQuizzes, me, signOut } from '../api';
import { loadHost, loadLastGame, saveHost, saveLastGame } from '../storage';
import { Quizzes } from './Quizzes';

vi.mock('../api', () => ({
  me: vi.fn(),
  checkCode: vi.fn(),
  listQuizzes: vi.fn(),
  createQuiz: vi.fn(),
  deleteQuiz: vi.fn(),
  createGame: vi.fn(),
  signOut: vi.fn(),
}));

const account = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com' };
const summary = { id: 'q1', title: 'Географія', description: 'Про Україну', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(me).mockResolvedValue(account);
  vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [summary] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={['/quizzes']}>
      <Routes>
        <Route path="/quizzes" element={<Quizzes />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
        <Route path="/host/:code" element={<p>пульт</p>} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Quizzes', () => {
  it('sends a visitor without a session to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
    expect(listQuizzes).not.toHaveBeenCalled();
  });

  it('sends the host to sign in when the session ends while the list is open', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('lists the host’s quizzes', async () => {
    open();
    expect(await screen.findByText('Географія')).toBeTruthy();
    expect(screen.getByText('Запитань: 6')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Редагувати' }).getAttribute('href')).toBe('/quizzes/q1');
    expect(screen.getByRole('link', { name: 'Нова вікторина' }).getAttribute('href')).toBe('/quizzes/new');
  });

  it('invites to create the first quiz when there are none', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText(/Тут з’являться ваші вікторини/)).toBeTruthy();
  });

  it('starts a game, remembers the host tokens and opens the control panel', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Грати' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(createGame).toHaveBeenCalledWith('q1');
    expect(loadHost('123456')).toEqual({ hostToken: 'h', stageToken: 's' });
  });

  it('explains why a game could not be started', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: false, error: 'server_busy' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Грати' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Сервер перевантажений. Спробуйте за хвилину.');
  });

  it('deletes a quiz only after confirmation and reloads the list', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(deleteQuiz).mockResolvedValue({ ok: true });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити' }));
    expect(deleteQuiz).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('Видалити вікторину «Географія»? Це не можна скасувати.');

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(deleteQuiz).toHaveBeenCalledWith('q1'));
    await waitFor(() => expect(listQuizzes).toHaveBeenCalledTimes(2));
  });

  it('adds the example quiz', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q2' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Додати приклад' }));
    await waitFor(() => expect(createQuiz).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createQuiz).mock.calls[0][0].questions).toHaveLength(6);
    await waitFor(() => expect(listQuizzes).toHaveBeenCalledTimes(2));
  });

  it('signs out and returns home', async () => {
    vi.mocked(signOut).mockResolvedValue({ ok: true });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Вийти' }));
    expect(await screen.findByText('головна')).toBeTruthy();
    expect(signOut).toHaveBeenCalled();
  });
});

describe('Quizzes: a game in progress', () => {
  it('remembers the game it starts', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Грати' }));
    await screen.findByText('пульт');
    expect(loadLastGame()).toBe('123456');
  });

  it('offers a way back to a game that is still running', async () => {
    saveHost('654321', { hostToken: 'h', stageToken: 's' });
    saveLastGame('654321');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Географія' });
    open();
    const link = await screen.findByRole('link', { name: 'Повернутися до гри 654 321' });
    expect(link.getAttribute('href')).toBe('/host/654321');
    expect(checkCode).toHaveBeenCalledWith('654321');
  });

  it('forgets a game that has ended or no longer exists', async () => {
    saveHost('654321', { hostToken: 'h', stageToken: 's' });
    saveLastGame('654321');
    vi.mocked(checkCode).mockResolvedValue({ ok: false, error: 'game_not_found' });
    open();
    await screen.findByText('Географія');
    await waitFor(() => expect(loadLastGame()).toBeNull());
    expect(screen.queryByRole('link', { name: /Повернутися до гри/ })).toBeNull();

    saveLastGame('654321');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'finished', title: 'Географія' });
    cleanup();
    open();
    await screen.findByText('Географія');
    await waitFor(() => expect(loadLastGame()).toBeNull());
  });
});
