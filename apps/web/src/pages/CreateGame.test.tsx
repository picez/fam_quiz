// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { createGame, createQuiz, getGroups, listQuizzes, me, pickLeague } from '../api';
import { demoQuiz } from '../demo-quiz';
import { loadHost, loadLastGame } from '../storage';
import { CreateGame } from './CreateGame';

vi.mock('../api', () => ({
  me: vi.fn(),
  checkCode: vi.fn(),
  listQuizzes: vi.fn(),
  createQuiz: vi.fn(),
  createGame: vi.fn(),
  getGroups: vi.fn(),
  pickLeague: vi.fn(),
}));

const account = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false };
const summary = { id: 'q1', title: 'Географія', description: 'Про Україну', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z', createdAt: '2026-10-12T10:00:00.000Z', folderId: null };

beforeEach(() => {
  // Відома людина (stale-while-revalidate) не переходить з тесту в тест.
  forgetAccount();
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(me).mockResolvedValue(account);
  vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [summary] });
});
afterEach(cleanup);

const open = (path = '/create') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/create" element={<CreateGame />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
        <Route path="/host/:code" element={<p>пульт</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('CreateGame', () => {
  const group = { id: 'g1', name: 'Родина', emoji: '🌻' as const, description: '', role: 'member' as const, people: 4, items: 0, joinedAt: '2026-11-14T10:00:00.000Z' };
  const started = { ok: true as const, code: '123456', hostToken: 'h', stageToken: 's', gameId: 'x' };

  it('79: ?group= of my group says the game goes to its league and picks it right after the start', async () => {
    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [group], invites: [] });
    vi.mocked(createGame).mockResolvedValue(started as never);
    vi.mocked(pickLeague).mockResolvedValue({ ok: true, data: { groupId: 'g1', groups: [] } });
    open('/create?group=g1');
    expect(await screen.findByText('Бали гри підуть у лігу групи «Родина». Змінити можна в лобі.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Почати гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(pickLeague).toHaveBeenCalledWith('123456', 'g1');
  });

  it('79: a failed league pick still opens the host screen', async () => {
    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [group], invites: [] });
    vi.mocked(createGame).mockResolvedValue(started as never);
    vi.mocked(pickLeague).mockResolvedValue({ ok: false, error: 'offline' });
    open('/create?group=g1');
    await screen.findByText(/лігу групи/);
    fireEvent.click(await screen.findByRole('button', { name: 'Почати гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
  });

  it('79: ?group= of a group I am not in is ignored', async () => {
    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [group], invites: [] });
    vi.mocked(createGame).mockResolvedValue(started as never);
    open('/create?group=g9');
    fireEvent.click(await screen.findByRole('button', { name: 'Почати гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(screen.queryByText(/лігу групи/)).toBeNull();
    expect(pickLeague).not.toHaveBeenCalled();
  });

  it('79: no ?group= — the groups are not even asked', async () => {
    open();
    await screen.findByRole('button', { name: 'Почати гру' });
    expect(getGroups).not.toHaveBeenCalled();
  });

  it('a failed list shows the error with a retry, not an endless «Завантажуємо…» (76)', async () => {
    vi.mocked(listQuizzes).mockResolvedValueOnce({ ok: false, error: 'offline' });
    open();
    expect((await screen.findByRole('alert')).textContent).toBe('Немає зв’язку із сервером.');
    expect(screen.queryByText('Завантажуємо…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Географія' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a failed start keeps the list on screen (76)', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Почати гру' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Немає зв’язку із сервером.');
    expect(screen.getByRole('heading', { level: 2, name: 'Географія' })).toBeTruthy();
  });

  it('lists the quizzes with their question count and links back home and to the full list', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Провести гру' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'Географія' })).toBeTruthy();
    expect(screen.getByText('Запитань: 6')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад: Головна' }).getAttribute('href')).toBe('/');
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
    expect(await screen.findByText('Тут з’являться твої вікторини. Створи першу або додай приклад.')).toBeTruthy();
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
