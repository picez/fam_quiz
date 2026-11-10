// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { createGame, createQuiz, listQuizzes, me } from '../api';
import { demoQuiz } from '../demo-quiz';
import { loadHost, loadLastGame } from '../storage';
import { CreateGame } from './CreateGame';

vi.mock('../api', () => ({
  me: vi.fn(),
  checkCode: vi.fn(),
  listQuizzes: vi.fn(),
  createQuiz: vi.fn(),
  createGame: vi.fn(),
}));

const account = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false };
const summary = { id: 'q1', title: 'Географія', description: 'Про Україну', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z' };

beforeEach(() => {
  // Відома людина (stale-while-revalidate) не переходить з тесту в тест.
  forgetAccount();
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(me).mockResolvedValue(account);
  vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [summary] });
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/create']}>
      <Routes>
        <Route path="/create" element={<CreateGame />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
        <Route path="/host/:code" element={<p>пульт</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('CreateGame', () => {
  it('lists the quizzes with their question count and links back home and to the full list', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Створити гру' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'Географія' })).toBeTruthy();
    expect(screen.getByText('Запитань: 6')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Нова вікторина' }).getAttribute('href')).toBe('/quizzes/new');
    expect(screen.getByRole('link', { name: 'Автопілот, редагування — у «Мої вікторини»' }).getAttribute('href')).toBe('/quizzes');
  });

  it('«Почати гру» creates a game, keeps the host tokens and opens the host room', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Почати гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(createGame).toHaveBeenCalledWith('q1');
    expect(loadHost('123456')).toEqual({ hostToken: 'h', stageToken: 's' });
    expect(loadLastGame()).toBe('123456');
  });

  it('shows the server error when the game cannot be created', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: false, error: 'server_busy' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Почати гру' }));
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
    expect(screen.queryByText('пульт')).toBeNull();
  });

  it('without quizzes offers a new quiz and the demo', async () => {
    vi.mocked(listQuizzes).mockResolvedValueOnce({ ok: true, data: [] }).mockResolvedValueOnce({ ok: true, data: [summary] });
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q1' });
    open();
    expect(await screen.findByText('Тут з’являться ваші вікторини. Створіть першу або додайте приклад.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Нова вікторина' }).getAttribute('href')).toBe('/quizzes/new');
    fireEvent.click(screen.getByRole('button', { name: 'Додати приклад' }));
    expect(await screen.findByRole('button', { name: 'Почати гру' })).toBeTruthy();
    expect(createQuiz).toHaveBeenCalledWith(demoQuiz);
  });

  it('sends a visitor to sign in and back here', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
    expect(listQuizzes).not.toHaveBeenCalled();
  });
});
