// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { AdminPushSwitch } from './AdminPushSwitch';

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];

/** Сервер: /api/me — акаунт me; PUT /api/me/admin-push — статус saveStatus. */
function server(me: object, saveStatus = 200) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      if (url === '/api/me') return new Response(JSON.stringify(me));
      if (url === '/api/me/admin-push') return new Response(saveStatus === 200 ? JSON.stringify({ adminPush: (calls.at(-1)?.body as { on: boolean }).on }) : '{"error":"internal"}', { status: saveStatus });
      return new Response('{}', { status: 404 });
    }),
  );
}

const OLENA = { id: 'u1', name: 'Олена', email: 'olena@example.com', admin: false, locale: 'uk' };
const box = () => screen.getByRole('checkbox', { name: 'Оголошення від адміністраторів' }) as HTMLInputElement;

beforeEach(() => forgetAccount());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  forgetAccount();
});

describe('AdminPushSwitch', () => {
  it('on by default, switching off saves, a failure rolls back', async () => {
    server(OLENA, 500);
    render(<AdminPushSwitch />);
    await waitFor(() => expect(box().checked).toBe(true));
    expect(box().getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(box().getAttribute('aria-describedby')!)?.textContent).toContain('Інших сповіщень цей перемикач не зачіпає.');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('');
    fireEvent.click(box());
    expect(box().checked).toBe(false);
    await waitFor(() => expect(calls.find((call) => call.url === '/api/me/admin-push')).toEqual({ url: '/api/me/admin-push', method: 'PUT', body: { on: false } }));
    await waitFor(() => expect(box().checked).toBe(true));
    expect(screen.getByRole('alert').textContent).toBe('Не вдалося зберегти. Спробуй ще раз.');
  });

  it('shows the saved choice and keeps the new one after a save', async () => {
    server({ ...OLENA, adminPush: false });
    render(<AdminPushSwitch />);
    await waitFor(() => expect(box().checked).toBe(false));
    fireEvent.click(box());
    await waitFor(() => expect(calls.some((call) => call.url === '/api/me/admin-push')).toBe(true));
    await waitFor(() => expect(box().disabled).toBe(false));
    expect(box().checked).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('');
  });
});
