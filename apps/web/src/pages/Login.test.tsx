// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signUp } from '../api';
import { Login } from './Login';

vi.mock('../api', () => ({ signIn: vi.fn(), signUp: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const open = (entry = '/login') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/quizzes" element={<p>мої вікторини</p>} />
        <Route path="/host/:code" element={<p>пульт</p>} />
      </Routes>
    </MemoryRouter>,
  );

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Login', () => {
  it('is titled for hosts and players alike', () => {
    open('/login?next=%2Fplay%2F123456');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Вхід');
    expect(screen.queryByText(/для ведучого/)).toBeNull();
  });

  it('signs in and opens the quiz list', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: true });
    open();
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(signIn).toHaveBeenCalledWith('o@example.com', 'password1');
  });

  it('returns to the page that asked for sign-in', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: true });
    open('/login?next=%2Fhost%2F123456');
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
  });

  it('ignores a next address that leads to another site', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: true });
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', 'quizzes']) {
      open(`/login?next=${encodeURIComponent(next)}`);
      fill('Email', 'o@example.com');
      fill('Пароль', 'password1');
      fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
      expect(await screen.findByText('мої вікторини'), next).toBeTruthy();
      cleanup();
    }
  });

  it('explains a wrong password in plain words', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: false, error: 'bad_credentials' });
    open();
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Неправильний email або пароль.');
    expect(screen.queryByText('мої вікторини')).toBeNull();
  });

  it('registers a new host with a name', async () => {
    vi.mocked(signUp).mockResolvedValue({ ok: true });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Створити акаунт' }));
    fill('Ваше ім’я', 'Олена');
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Зареєструватися' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(signUp).toHaveBeenCalledWith('Олена', 'o@example.com', 'password1');
  });

  it('explains a taken email and a short password', async () => {
    vi.mocked(signUp).mockResolvedValueOnce({ ok: false, error: 'email_taken' });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Створити акаунт' }));
    fill('Ваше ім’я', 'Олена');
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Зареєструватися' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Акаунт із таким email уже існує. Спробуйте увійти.');

    fill('Пароль', '1234567');
    expect((screen.getByRole('button', { name: 'Зареєструватися' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
