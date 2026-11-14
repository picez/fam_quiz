// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { EasyModeRoot } from './EasyModeRoot';
import { EasyModeSwitch } from './EasyModeSwitch';
import { easyModeOn, resetEasyForTests } from './easy-mode';
import { forgetAccount, useAccount } from './useAccount';

const html = () => document.documentElement;
type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];

/** Сервер: /api/me — увійшла (me) чи ні; PUT /api/me/easy — статус easyStatus. */
function server(me: object | null, easyStatus = 200) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      if (url === '/api/me') return me === null ? new Response('{"error":"unauthorized"}', { status: 401 }) : new Response(JSON.stringify(me));
      if (url === '/api/me/easy') return new Response(easyStatus === 200 ? '{"easyMode":true}' : '{"error":"internal"}', { status: easyStatus });
      return new Response('{}', { status: 404 });
    }),
  );
}

const OLENA = { id: 'u1', name: 'Олена', email: 'olena@example.com', admin: false, locale: 'uk' };

function Probe() {
  const account = useAccount();
  return <p data-testid="status">{account.status}</p>;
}

function view() {
  return render(
    <MemoryRouter initialEntries={['/play/123456']}>
      <EasyModeRoot />
      <Probe />
      <EasyModeSwitch />
    </MemoryRouter>,
  );
}

const box = () => screen.getByRole('checkbox', { name: 'Легкий режим' });

beforeEach(() => {
  forgetAccount();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetEasyForTests();
  forgetAccount();
  html().classList.remove('is-easy');
});

describe('EasyModeSwitch (31)', () => {
  it('a guest keeps the mode on the device only', async () => {
    server(null);
    view();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    const hint = document.getElementById(box().getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toContain('Діє на цьому пристрої');
    fireEvent.click(box());
    expect(localStorage.getItem('quiz:easy')).toBe('on');
    expect(html().classList.contains('is-easy')).toBe(true);
    expect((box() as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box());
    expect(localStorage.getItem('quiz:easy')).toBe('off');
    expect(html().classList.contains('is-easy')).toBe(false);
    expect(calls.some((c) => c.url === '/api/me/easy')).toBe(false);
  });

  it('an account saves to the profile; a failed save says so and the mode stays', async () => {
    server({ ...OLENA, easyMode: false }, 500);
    view();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-in'));
    expect(document.getElementById(box().getAttribute('aria-describedby') ?? '')?.textContent).toContain('Зберігається в профілі');
    fireEvent.click(box());
    await screen.findByText('Не вдалося зберегти в профілі — на цьому пристрої режим однаково діє.');
    expect(calls.find((c) => c.url === '/api/me/easy')).toEqual({ url: '/api/me/easy', method: 'PUT', body: { on: true } });
    expect(easyModeOn()).toBe(true);
    expect(html().classList.contains('is-easy')).toBe(true);
  });

  it('a profile with easyMode turns it on where the device never chose', async () => {
    server({ ...OLENA, easyMode: true });
    view();
    await waitFor(() => expect(html().classList.contains('is-easy')).toBe(true));
    expect((box() as HTMLInputElement).checked).toBe(true);
    expect(localStorage.getItem('quiz:easy')).toBeNull();
  });

  it('a device that said «off» stays off', async () => {
    localStorage.setItem('quiz:easy', 'off');
    server({ ...OLENA, easyMode: true });
    view();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-in'));
    await act(async () => undefined);
    expect(html().classList.contains('is-easy')).toBe(false);
  });
});
