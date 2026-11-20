// @vitest-environment jsdom
import type { AdminList, AdminProblemReport, AdminServerError } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminErrors } from './AdminErrors';

const ERROR_ID = '0b7c2f8e-5d41-4a7b-9c33-6f1e2d3c4b5a';
const OLIA = 'u-olia';

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let errors: AdminServerError[];
let reports: AdminProblemReport[];
let replied: { status: number; body: unknown };
let badgeEvents = 0;
const countBadge = () => {
  badgeEvents += 1;
};

const serverError = (over: Partial<AdminServerError> = {}): AdminServerError => ({
  id: ERROR_ID,
  where: 'http',
  what: null,
  event: 'GET /api/x',
  name: 'Error',
  message: 'boom [email]',
  stack: 'Error: boom [email]\n    at handler (apps/server/src/x.ts:10:5)',
  count: 7,
  dayCount: 3,
  firstAt: '2026-11-19T08:00:00.000Z',
  lastAt: '2026-11-20T09:30:00.000Z',
  status: 'new',
  resolvedBy: null,
  resolvedAt: null,
  ...over,
});

const report = (over: Partial<AdminProblemReport> = {}): AdminProblemReport => ({
  id: 'r1',
  at: '2026-11-20T09:00:00.000Z',
  who: { kind: 'guest' },
  text: 'Кнопка не натискається',
  page: null,
  status: 'open',
  reply: null,
  repliedAt: null,
  resolvedBy: null,
  resolvedAt: null,
  ...over,
});

const listOf = <T,>(rows: T[]): AdminList<T> => ({ rows, page: 1, pages: 1, total: rows.length });

function server() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (url.startsWith('/api/admin/errors?')) return json(listOf(errors));
      if (url === `/api/admin/errors/${ERROR_ID}/resolve`) {
        errors = [];
        return json({});
      }
      if (url.startsWith('/api/admin/problems?')) return json(listOf(reports));
      if (url.endsWith('/reply')) return json(replied.body, replied.status);
      if (url.endsWith('/resolve')) return json({});
      return json({ error: 'not_found' }, 404);
    }),
  );
}

const open = (path = '/admin/errors') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminErrors />
    </MemoryRouter>,
  );

beforeEach(() => {
  errors = [serverError()];
  reports = [];
  replied = { status: 200, body: { pushed: false } };
  badgeEvents = 0;
  window.addEventListener('admin-badge', countBadge);
  server();
});
afterEach(() => {
  window.removeEventListener('admin-badge', countBadge);
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminErrors', () => {
  it('server errors: counts, times, the stack, resolve', async () => {
    open();
    expect(await screen.findByText('Де: http')).toBeTruthy();
    expect(calls[0]).toMatchObject({ url: '/api/admin/errors?status=new&page=1', method: 'GET' });
    const card = screen.getByText('Де: http').closest('li') as HTMLElement;
    expect(within(card).getByText('Повторів: 7, за добу: 3')).toBeTruthy();
    expect(within(card).getByText(/^Уперше: .+, востаннє: .+$/)).toBeTruthy();
    expect(within(card).getByText('GET /api/x')).toBeTruthy();
    expect(within(card).getByText('Error: boom [email]')).toBeTruthy();
    const details = card.querySelector('details') as HTMLDetailsElement;
    expect(within(details).getByText('Стек')).toBeTruthy();
    expect(details.querySelector('pre')?.textContent).toContain('apps/server/src/x.ts:10:5');
    // Живі області стоять з першого показу, порожні.
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('alert').textContent).toBe('');

    fireEvent.click(within(card).getByRole('button', { name: 'Позначити як вирішене' }));
    await waitFor(() => expect(screen.queryByText('Де: http')).toBeNull());
    expect(calls.some((call) => call.url === `/api/admin/errors/${ERROR_ID}/resolve` && call.method === 'POST')).toBe(true);
    expect(await screen.findByText('Збоїв немає.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Позначено як вирішене.');
    expect(badgeEvents).toBe(1);

    errors = [serverError({ status: 'resolved', resolvedBy: 'Оля', resolvedAt: '2026-11-20T10:00:00.000Z' })];
    fireEvent.click(screen.getByRole('button', { name: 'Вирішені' }));
    await waitFor(() => expect(calls.at(-1)?.url).toBe('/api/admin/errors?status=resolved&page=1'));
    const resolved = (await screen.findByText('Де: http')).closest('li') as HTMLElement;
    expect(within(resolved).getByText(/^Вирішив\(-ла\) Оля /)).toBeTruthy();
    expect(within(resolved).queryByRole('button', { name: 'Позначити як вирішене' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Вирішені' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('player reports: guest, account with page info, deleted', async () => {
    reports = [
      report({ id: 'r1', who: { kind: 'guest' }, text: 'Гість пише' }),
      report({ id: 'r2', who: { kind: 'account', id: OLIA, nickname: 'Оля', push: true }, text: 'Оля пише', page: { path: '/play/123456', browser: 'Firefox', screen: '360x740', lang: 'uk', theme: 'light' } }),
      report({ id: 'r3', who: { kind: 'deleted' }, text: 'Хтось пише' }),
    ];
    open('/admin/errors?view=reports');
    const guest = (await screen.findByText('Гість пише')).closest('li') as HTMLElement;
    expect(calls[0]).toMatchObject({ url: '/api/admin/problems?status=open&page=1', method: 'GET' });
    expect(within(guest).getByText('Гість')).toBeTruthy();
    expect(within(guest).getByText('Без відомостей про сторінку')).toBeTruthy();
    expect(within(guest).queryByRole('button', { name: 'Відповісти' })).toBeNull();
    expect(within(guest).getByRole('button', { name: 'Вирішено' })).toBeTruthy();

    const olia = screen.getByText('Оля пише').closest('li') as HTMLElement;
    expect(within(olia).getByRole('link', { name: 'Оля' }).getAttribute('href')).toBe(`/admin/users/${OLIA}`);
    expect(within(olia).getByText('Сторінка: /play/123456')).toBeTruthy();
    expect(within(olia).getByText('Екран: 360x740')).toBeTruthy();
    expect(within(olia).getByText('Браузер: Firefox')).toBeTruthy();
    expect(within(olia).getByRole('button', { name: 'Відповісти' })).toBeTruthy();

    const gone = screen.getByText('Хтось пише').closest('li') as HTMLElement;
    expect(within(gone).getByText('Акаунт видалено')).toBeTruthy();
    expect(within(gone).queryByRole('button', { name: 'Відповісти' })).toBeNull();

    fireEvent.click(within(guest).getByRole('button', { name: 'Вирішено' }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/admin/problems/r1/resolve' && call.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Позначено як вирішене.'));
    expect(badgeEvents).toBe(1);
  });

  it('reply to an account', async () => {
    reports = [report({ id: 'r2', who: { kind: 'account', id: OLIA, nickname: 'Оля', push: false }, text: 'Оля пише' })];
    open('/admin/errors?view=reports');
    const card = (await screen.findByText('Оля пише')).closest('li') as HTMLElement;
    expect(within(card).queryByText(/Сповіщення в автора не ввімкнено/)).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Відповісти' }));
    expect(within(card).getByText('Сповіщення в автора не ввімкнено — відповідь буде на сторінці «Мої повідомлення».')).toBeTruthy();
    const field = within(card).getByLabelText('Відповідь автору') as HTMLTextAreaElement;
    expect(field.maxLength).toBe(500);
    const send = within(card).getByRole('button', { name: 'Надіслати відповідь' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'Виправили, дякуємо!' } });

    replied = { status: 409, body: { error: 'problem_replied' } };
    fireEvent.click(send);
    expect(await screen.findByText('На цю скаргу вже відповіли.')).toBeTruthy();
    const post = calls.find((call) => call.url === '/api/admin/problems/r2/reply');
    expect(post).toMatchObject({ method: 'POST', body: { text: 'Виправили, дякуємо!' } });
    expect(screen.getByRole('status').textContent).toBe('');
    expect(badgeEvents).toBe(0);
  });

  it('a successful reply closes the report', async () => {
    reports = [report({ id: 'r2', who: { kind: 'account', id: OLIA, nickname: 'Оля', push: true }, text: 'Оля пише' })];
    open('/admin/errors?view=reports');
    const card = (await screen.findByText('Оля пише')).closest('li') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Відповісти' }));
    expect(within(card).queryByText(/Сповіщення в автора не ввімкнено/)).toBeNull();
    fireEvent.change(within(card).getByLabelText('Відповідь автору'), { target: { value: 'Виправили, дякуємо!' } });
    reports = [];
    replied = { status: 200, body: { pushed: true } };
    fireEvent.click(within(card).getByRole('button', { name: 'Надіслати відповідь' }));
    expect(await screen.findByText('Скарг немає.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Відповідь надіслано.');
    expect(badgeEvents).toBe(1);
  });

  it('a reply to an author without a subscription says so', async () => {
    reports = [report({ id: 'r2', who: { kind: 'account', id: OLIA, nickname: 'Оля', push: false }, text: 'Оля пише' })];
    open('/admin/errors?view=reports');
    const card = (await screen.findByText('Оля пише')).closest('li') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Відповісти' }));
    fireEvent.change(within(card).getByLabelText('Відповідь автору'), { target: { value: 'Дякуємо!' } });
    reports = [];
    fireEvent.click(within(card).getByRole('button', { name: 'Надіслати відповідь' }));
    expect(await screen.findByText('Скарг немає.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Відповідь надіслано без сповіщення: в автора немає підписки.');
  });

  it('switches between server errors and player reports', async () => {
    open();
    await screen.findByText('Де: http');
    const nav = screen.getByRole('link', { name: 'Збої сервера' });
    expect(nav.getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('link', { name: 'Скарги гравців' }));
    expect(await screen.findByText('Скарг немає.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Скарги гравців' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Вирішені' }));
    await waitFor(() => expect(calls.at(-1)?.url).toBe('/api/admin/problems?status=resolved&page=1'));
  });
});
