// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCode, me } from '../api';
import { savePlayer } from '../storage';
import { Home } from './Home';

vi.mock('../api', () => ({ checkCode: vi.fn(), me: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
});
afterEach(cleanup);

function enter(code: string) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play/:code" element={<p>сторінка гри</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('Код гри'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
}

const STARTED = 'Ця гра вже почалася, приєднатися до неї не можна. Попросіть ведучого створити нову.';

describe('Home', () => {
  it('opens the game page when the game is waiting in the lobby', async () => {
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'lobby', title: 'Гра' });
    enter('123 456');
    expect(await screen.findByText('сторінка гри')).toBeTruthy();
    expect(checkCode).toHaveBeenCalledWith('123456');
  });

  it('explains that a game which has started cannot be joined', async () => {
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Гра' });
    enter('123456');
    expect((await screen.findByRole('alert')).textContent).toBe(STARTED);
    expect(screen.queryByText('сторінка гри')).toBeNull();
  });

  it('lets a returning player back into a game that has started', async () => {
    savePlayer('123456', 'saved-token');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Гра' });
    enter('123456');
    expect(await screen.findByText('сторінка гри')).toBeTruthy();
  });

  it('explains an unknown code', async () => {
    vi.mocked(checkCode).mockResolvedValue({ ok: false, error: 'game_not_found' });
    enter('123456');
    expect((await screen.findByRole('alert')).textContent).toBe('Гру з таким кодом не знайдено. Перевірте код.');
  });
});

describe('Home for a signed-in person', () => {
  it('does not repeat the menu links for a signed-in person', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(me).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('link', { name: 'Мої вікторини' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Мої ігри' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Я ведучий' })).toBeNull();
  });

  it('keeps the plain entry for a visitor', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByRole('link', { name: 'Я ведучий' })).getAttribute('href')).toBe('/quizzes');
    expect(screen.queryByRole('link', { name: 'Мої ігри' })).toBeNull();
  });
});
