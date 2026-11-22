// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyProblemReport } from '@quiz/shared';
import { resetThemeForTests, setThemeChoice } from '../theme-mode';
import { forgetAccount } from '../useAccount';
import { ProblemLink } from './ProblemLink';
import { MOMENT_KEY, momentOf, saveMoment } from './problem-moment';
import { ProblemReport } from './ProblemReport';

const ACCOUNT = { id: 'u1', name: 'Оля', email: 'o@example.com', admin: false };

interface Calls {
  posts: unknown[];
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Підмінений сервер: гість чи акаунт, відповідь на надсилання і список «Моїх повідомлень». */
function server({ signedIn = false, post = json(201, { id: 'r1' }), mine = [] as MyProblemReport[] } = {}): Calls {
  const calls: Calls = { posts: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me') return signedIn ? json(200, ACCOUNT) : json(401, { error: 'unauthorized' });
      if (url === '/api/me/problem-reports') return signedIn ? json(200, mine) : json(401, { error: 'unauthorized' });
      if (url === '/api/problem-reports' && init?.method === 'POST') {
        calls.posts.push(JSON.parse(String(init.body)));
        return post.clone();
      }
      return json(404, { error: 'not_found' });
    }),
  );
  return calls;
}

function open(path = '/report?from=/library') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/report" element={<ProblemReport />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  forgetAccount();
  localStorage.clear();
  resetThemeForTests();
  setThemeChoice('light');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetThemeForTests();
  localStorage.clear();
});

describe('ProblemReport', () => {
  it('a guest sends a report with the page snapshot', async () => {
    const calls = server();
    open();
    expect(await screen.findByText('Сторінка: /library')).toBeTruthy();
    expect(screen.getByText('Тема: світла')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('alert').textContent).toBe('');
    fireEvent.change(screen.getByLabelText('Що сталося'), { target: { value: 'Не грає музика' } });
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Дякуємо! Ми отримали повідомлення.'));
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]).toMatchObject({ text: 'Не грає музика', page: { path: '/library', theme: 'light', lang: 'uk', browser: navigator.userAgent } });
    expect(await screen.findByText('Щоб отримати відповідь, увійди перед надсиланням.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Мої повідомлення' })).toBeNull();
  });

  it('without the snapshot the page is null', async () => {
    const calls = server();
    open();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Додати відомості про сторінку' }));
    expect(screen.queryByText('Сторінка: /library')).toBeNull();
    fireEvent.change(screen.getByLabelText('Що сталося'), { target: { value: 'Кнопка не тисне' } });
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() => expect(calls.posts).toHaveLength(1));
    expect(calls.posts[0]).toEqual({ text: 'Кнопка не тисне', page: null, game: null });
  });

  describe('the game moment (70)', () => {
    const moment = () => saveMoment(momentOf('123456', 'player', { phase: 'question', round: { index: 1, title: 'Кіно' }, questionIndex: 2, question: { type: 'single', text: 'Хто зняв фільм?' } }));

    it('shows the moment among the page details and sends it; success clears it', async () => {
      const calls = server();
      moment();
      open('/report?from=/play/123456');
      expect(await screen.findByText('Гра 123456: раунд 2, запитання 3')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Що сталося'), { target: { value: 'Не рахує бали' } });
      fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));
      await waitFor(() => expect(calls.posts).toHaveLength(1));
      expect(calls.posts[0]).toMatchObject({ game: { code: '123456', role: 'player', phase: 'question', round: 1, roundTitle: 'Кіно', question: 2, type: 'single', text: 'Хто зняв фільм?' } });
      await waitFor(() => expect(localStorage.getItem(MOMENT_KEY)).toBeNull());
    });

    it('the lobby moment has its own line', async () => {
      server();
      saveMoment(momentOf('123456', 'host', { phase: 'lobby', round: null, questionIndex: -1, question: null }));
      open('/report?from=/host/123456');
      expect(await screen.findByText('Гра 123456: ще в лобі')).toBeTruthy();
    });

    it('without the checkbox the game is null', async () => {
      const calls = server();
      moment();
      open('/report?from=/play/123456');
      fireEvent.click(await screen.findByRole('checkbox', { name: 'Додати відомості про сторінку' }));
      expect(screen.queryByText(/^Гра 123456/)).toBeNull();
      fireEvent.change(screen.getByLabelText('Що сталося'), { target: { value: 'Зависло' } });
      fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));
      await waitFor(() => expect(calls.posts).toHaveLength(1));
      expect(calls.posts[0]).toMatchObject({ page: null, game: null });
    });

    it('a moment from another room is ignored', async () => {
      const calls = server();
      moment();
      open('/report?from=/play/654321');
      expect(await screen.findByText('Сторінка: /play/654321')).toBeTruthy();
      expect(screen.queryByText(/^Гра /)).toBeNull();
      fireEvent.change(screen.getByLabelText('Що сталося'), { target: { value: 'Зависло' } });
      fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));
      await waitFor(() => expect(calls.posts).toHaveLength(1));
      expect(calls.posts[0]).toMatchObject({ game: null });
    });

    it('clicking the in-game link in a new tab stores the moment, without blocking the click', () => {
      render(<ProblemLink newTab moment={() => momentOf('123456', 'host', { phase: 'lobby', round: null, questionIndex: -1, question: null })} />);
      const link = screen.getByRole('link', { name: 'Повідомити про проблему' });
      expect(fireEvent.click(link)).toBe(true);
      expect(JSON.parse(localStorage.getItem(MOMENT_KEY) ?? '{}')).toMatchObject({ code: '123456', role: 'host' });
    });
  });

  it('an account sees its messages and the admin reply', async () => {
    server({
      signedIn: true,
      mine: [
        { id: 'r2', at: '2026-11-19T10:00:00.000Z', text: 'Не видно таблиці', status: 'open', reply: null, repliedAt: null },
        { id: 'r1', at: '2026-11-18T10:00:00.000Z', text: '<b>Зникла</b> музика', status: 'resolved', reply: 'Виправили, дякуємо!', repliedAt: '2026-11-18T12:00:00.000Z' },
      ],
    });
    open();
    expect(await screen.findByRole('heading', { name: 'Мої повідомлення' })).toBeTruthy();
    expect(await screen.findByText('Вирішене')).toBeTruthy();
    expect(screen.getByText('Відкрите')).toBeTruthy();
    expect(screen.getByText('Відповідь адміністратора: Виправили, дякуємо!')).toBeTruthy();
    // Текст гравця — як текст, не розмітка.
    expect(screen.getByText('<b>Зникла</b> музика')).toBeTruthy();
    expect(screen.queryByText('Щоб отримати відповідь, увійди перед надсиланням.')).toBeNull();
  });

  it('too many is a clear error', async () => {
    server({ post: json(429, { error: 'too_many' }) });
    open();
    const box = (await screen.findByLabelText('Що сталося')) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'а'.repeat(1000) } });
    expect(screen.getByText('1000 з 1000')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'а'.repeat(1001) } });
    expect(box.value).toHaveLength(1000);
    expect(screen.getByText('1000 з 1000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Забагато повідомлень. Спробуй пізніше.'));
  });

  it('all guests at once is the busy error', async () => {
    server({ post: json(429, { error: 'problem_busy' }) });
    open();
    fireEvent.change(await screen.findByLabelText('Що сталося'), { target: { value: 'Щось' } });
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Зараз забагато повідомлень. Спробуй за годину.'));
  });
});
