// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyProblemReport } from '@quiz/shared';
import { forgetAccount } from '../useAccount';
import { ProblemMine } from './ProblemMine';

const ACCOUNT = { id: 'u1', name: 'Оля', email: 'o@example.com', admin: false };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Підмінений сервер: гість чи акаунт і список «Моїх звернень» (або збій). */
function server({ signedIn = true, mine = [] as MyProblemReport[], fail = false } = {}) {
  const fetch = vi.fn(async (url: string) => {
    if (url === '/api/me') return signedIn ? json(200, ACCOUNT) : json(401, { error: 'unauthorized' });
    if (url === '/api/me/problem-reports') return fail ? json(500, { error: 'internal' }) : json(200, mine);
    return json(404, { error: 'not_found' });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function open() {
  render(
    <MemoryRouter initialEntries={['/report/mine']}>
      <Routes>
        <Route path="/report/mine" element={<ProblemMine />} />
        <Route path="*" element={<p>інше</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

beforeEach(() => forgetAccount());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProblemMine (80)', () => {
  it('lists my reports with the status and the admin reply, and leads back to the settings', async () => {
    server({
      mine: [
        { id: 'r2', at: '2026-11-19T10:00:00.000Z', text: 'Не видно таблиці', status: 'open', reply: null, repliedAt: null },
        { id: 'r1', at: '2026-11-18T10:00:00.000Z', text: '<b>Зникла</b> музика', status: 'resolved', reply: 'Виправили, дякуємо!', repliedAt: '2026-11-18T12:00:00.000Z' },
      ],
    });
    open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Мої звернення');
    const list = await screen.findByRole('region', { name: 'Мої звернення' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Вирішене')).toBeTruthy();
    expect(screen.getByText('Відкрите')).toBeTruthy();
    expect(screen.getByText('Відповідь адміністратора: Виправили, дякуємо!')).toBeTruthy();
    // Текст гравця — як текст, не розмітка.
    expect(screen.getByText('<b>Зникла</b> музика')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад: Налаштування' }).getAttribute('href')).toBe('/profile/settings');
    expect(screen.getByRole('link', { name: 'Повідомити про проблему' }).getAttribute('href')).toBe('/report?from=%2Freport%2Fmine');
  });

  it('an empty list offers to report a problem', async () => {
    server();
    open();
    expect(await screen.findByText('Звернень ще не було.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Повідомити про проблему' }).length).toBeGreaterThan(0);
  });

  it('an error has «Спробувати ще раз»', async () => {
    const fetch = server({ fail: true });
    open();
    const retry = await screen.findByRole('button', { name: 'Спробувати ще раз' });
    const before = fetch.mock.calls.filter(([url]) => url === '/api/me/problem-reports').length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetch.mock.calls.filter(([url]) => url === '/api/me/problem-reports').length).toBeGreaterThan(before));
  });

  it('a guest goes to the login with a way back', async () => {
    const fetch = server({ signedIn: false });
    open();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Freport%2Fmine'));
    expect(fetch.mock.calls.some(([url]) => url === '/api/me/problem-reports')).toBe(false);
  });
});
