// @vitest-environment jsdom
import type { AdminBroadcast as Row, AdminBroadcasts } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timeText, viewerZone } from '../calendar/calendar-time';
import { AdminBroadcast } from './AdminBroadcast';

const GROUP = '7b0c8c55-4a8e-4d55-9a57-0d7c1e7c3a11';
const OLIA = 'u-olia';

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let data: AdminBroadcasts;
/** Відповідь на перегляд і на відправку; за замовчуванням — 3 людини й успіх. */
let preview: { status: number; body: unknown };
let sent: { status: number; body: unknown };

const row = (over: Partial<Row> = {}): Row => ({
  id: 'b1',
  at: '2026-11-19T08:00:00.000Z',
  admin: 'Оля',
  title: 'Субота',
  text: 'Гра о 19:00',
  url: null,
  to: { kind: 'all' },
  people: 6,
  pushPeople: 6,
  read: 0,
  delivered: 5,
  failed: 1,
  status: 'sent',
  ...over,
});

const base = (over: Partial<AdminBroadcasts> = {}): AdminBroadcasts => ({
  rows: [],
  groups: [{ id: GROUP, name: 'Малинські', emoji: '👪', members: 4 }],
  limits: { nextAt: null, lastDay: 2, dayMax: 10 },
  pushOn: true,
  ...over,
});

function server() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (url === '/api/admin/broadcasts' && (init?.method ?? 'GET') === 'GET') return json(data);
      if (url === '/api/admin/broadcasts/preview') return json(preview.body, preview.status);
      if (url === '/api/admin/broadcasts') return json(sent.body, sent.status);
      if (url.startsWith('/api/admin/bot/people?q=')) return json([{ id: OLIA, nickname: 'Оля', avatar: null }]);
      return json({ error: 'not_found' }, 404);
    }),
  );
}

const open = () =>
  render(
    <MemoryRouter>
      <AdminBroadcast />
    </MemoryRouter>,
  );
const titleField = () => screen.getByLabelText('Заголовок') as HTMLInputElement;
const textField = () => screen.getByLabelText('Текст') as HTMLTextAreaElement;
const urlField = () => screen.getByLabelText("Посилання (необов'язково)") as HTMLInputElement;
const sendButton = () => screen.getByRole('button', { name: 'Надіслати' }) as HTMLButtonElement;
const previews = () => calls.filter((call) => call.url === '/api/admin/broadcasts/preview');

beforeEach(() => {
  data = base();
  preview = { status: 200, body: { people: 3, push: 2 } };
  sent = { status: 201, body: row({ status: 'sending', delivered: 0, failed: 0 }) };
  server();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminBroadcast', () => {
  it('shows who will get it and sends to a group after a confirm', async () => {
    open();
    await screen.findByLabelText('Заголовок');
    expect(screen.getByText('За добу: 2 з 10')).toBeTruthy();
    fireEvent.change(titleField(), { target: { value: 'Нова вікторина' } });
    fireEvent.change(textField(), { target: { value: 'Заходь у бібліотеку' } });
    fireEvent.change(urlField(), { target: { value: '/library' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Родинній групі' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: GROUP } });
    expect((screen.getByRole('combobox') as HTMLSelectElement).selectedOptions[0]?.textContent).toContain('Малинські');
    await waitFor(() => expect(previews().at(-1)?.body).toEqual({ recipients: { kind: 'group', groupId: GROUP } }));
    await screen.findByText('Отримають на сайті: 3, з них сповіщенням: 2');
    const card = document.querySelector('.broadcast-preview') as HTMLElement;
    expect(within(card).getByText('Нова вікторина')).toBeTruthy();
    expect(within(card).getByText('Заходь у бібліотеку')).toBeTruthy();
    expect(within(card).getByText('/library')).toBeTruthy();
    fireEvent.click(sendButton());
    expect(window.confirm).toHaveBeenCalledWith('Надіслати «Нова вікторина»? Отримають 3 людини.');
    expect(await screen.findByText('Розсилку надіслано.')).toBeTruthy();
    const post = calls.find((call) => call.url === '/api/admin/broadcasts' && call.method === 'POST');
    expect(post?.body).toEqual({ title: 'Нова вікторина', text: 'Заходь у бібліотеку', url: '/library', recipients: { kind: 'group', groupId: GROUP } });
    await waitFor(() => expect(titleField().value).toBe(''));
    expect(textField().value).toBe('');
    expect(calls.filter((call) => call.url === '/api/admin/broadcasts' && call.method === 'GET').length).toBeGreaterThanOrEqual(2);
  });

  it('a cancelled confirm sends nothing', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    open();
    await screen.findByLabelText('Заголовок');
    fireEvent.change(titleField(), { target: { value: 'Нова вікторина' } });
    fireEvent.change(textField(), { target: { value: 'Заходь' } });
    await screen.findByText('Отримають на сайті: 3, з них сповіщенням: 2');
    fireEvent.click(sendButton());
    expect(window.confirm).toHaveBeenCalled();
    expect(calls.some((call) => call.url === '/api/admin/broadcasts' && call.method === 'POST')).toBe(false);
  });

  it('nobody disables the send', async () => {
    preview = { status: 200, body: { people: 0, push: 0 } };
    open();
    await screen.findByLabelText('Заголовок');
    fireEvent.change(titleField(), { target: { value: 'Нова вікторина' } });
    fireEvent.change(textField(), { target: { value: 'Заходь' } });
    expect(await screen.findByText('Нікому надсилати: серед адресатів немає жодного акаунта.')).toBeTruthy();
    expect(previews().at(-1)?.body).toEqual({ recipients: { kind: 'all' } });
    expect(sendButton().disabled).toBe(true);
  });

  it('a bad link and too long fields block the send', async () => {
    open();
    await screen.findByLabelText('Заголовок');
    expect(screen.getByText('0 з 60')).toBeTruthy();
    expect(screen.getByText('0 з 160')).toBeTruthy();
    expect(titleField().maxLength).toBe(60);
    expect(textField().maxLength).toBe(160);
    fireEvent.change(titleField(), { target: { value: 'я'.repeat(60) } });
    expect(screen.getByText('60 з 60')).toBeTruthy();
    fireEvent.change(textField(), { target: { value: 'Заходь' } });
    await screen.findByText('Отримають на сайті: 3, з них сповіщенням: 2');
    expect(sendButton().disabled).toBe(false);
    fireEvent.change(urlField(), { target: { value: 'http://x' } });
    expect(screen.getByText('Посилання має починатися з https:// або з /')).toBeTruthy();
    expect(urlField().getAttribute('aria-invalid')).toBe('true');
    expect(sendButton().disabled).toBe(true);
    // Вставлене довше за межу (повз maxLength) теж не йде.
    fireEvent.change(urlField(), { target: { value: '' } });
    fireEvent.change(titleField(), { target: { value: 'я'.repeat(61) } });
    expect(sendButton().disabled).toBe(true);
  });

  it('the limit shows the next time', async () => {
    const nextAt = new Date(Date.now() + 10 * 60_000).toISOString();
    sent = { status: 409, body: { error: 'broadcast_too_soon', nextAt } };
    open();
    await screen.findByLabelText('Заголовок');
    fireEvent.change(titleField(), { target: { value: 'Нова вікторина' } });
    fireEvent.change(textField(), { target: { value: 'Заходь' } });
    await screen.findByText('Отримають на сайті: 3, з них сповіщенням: 2');
    fireEvent.click(sendButton());
    const alert = await screen.findByText(/Не частіше однієї розсилки на 10 хвилин\./);
    expect(alert.closest('[role="alert"]')).toBeTruthy();
    expect(alert.closest('[role="alert"]')?.textContent).toContain(`Наступну розсилку можна о ${timeText(nextAt, viewerZone())}.`);
  });

  it('a limit from the server disables the send and says when', async () => {
    const nextAt = new Date(Date.now() + 10 * 60_000).toISOString();
    data = base({ limits: { nextAt, lastDay: 10, dayMax: 10 } });
    open();
    await screen.findByLabelText('Заголовок');
    expect(screen.getByText('За добу: 10 з 10')).toBeTruthy();
    expect(screen.getByText(`Наступну розсилку можна о ${timeText(nextAt, viewerZone())}.`)).toBeTruthy();
    fireEvent.change(titleField(), { target: { value: 'Нова вікторина' } });
    fireEvent.change(textField(), { target: { value: 'Заходь' } });
    await screen.findByText('Отримають на сайті: 3, з них сповіщенням: 2');
    expect(sendButton().disabled).toBe(true);
  });

  it('history rows: counts, sending, interrupted, a deleted group', async () => {
    data = base({
      rows: [
        row({ id: 'r1', title: 'Перша' }),
        row({ id: 'r2', title: 'Друга', status: 'sending', delivered: 0, failed: 0 }),
        row({ id: 'r3', title: 'Третя', status: 'interrupted' }),
        row({ id: 'r4', title: 'Четверта', to: { kind: 'group', groupId: '', name: 'Малинські' } }),
        row({ id: 'r5', title: 'П’ята', admin: null, to: { kind: 'people', people: [{ id: OLIA, nickname: 'Оля' }, { id: 'u2', nickname: 'Іра' }] } }),
        row({ id: 'r6', title: 'Шоста', to: { kind: 'group', groupId: '', name: null } }),
      ],
    });
    open();
    await screen.findByText('Історія розсилок');
    const card = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
    expect(within(card('Перша')).getByText('Доставлено на пристрої: 5, помилок: 1')).toBeTruthy();
    expect(within(card('Перша')).getByText('Усім')).toBeTruthy();
    expect(within(card('Перша')).getByText('У вхідних: 6, прочитали: 0; сповіщенням: 6')).toBeTruthy();
    expect(within(card('Перша')).getByText('Оля')).toBeTruthy();
    expect(within(card('Друга')).getByText('Надсилається…')).toBeTruthy();
    expect(within(card('Третя')).getByText(/^Перервано/)).toBeTruthy();
    expect(within(card('Четверта')).getByText('Група «Малинські»')).toBeTruthy();
    expect(within(card('П’ята')).getByText('Вибрані: Оля, Іра')).toBeTruthy();
    expect(within(card('Шоста')).getByText('Групу видалено')).toBeTruthy();
  });

  it('an empty history says so', async () => {
    open();
    expect(await screen.findByText('Розсилок ще не було.')).toBeTruthy();
  });

  it('chooses people by nickname', async () => {
    open();
    await screen.findByLabelText('Заголовок');
    fireEvent.click(screen.getByRole('radio', { name: 'Вибраним людям' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ол' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Оля' }));
    await waitFor(() => expect(previews().at(-1)?.body).toEqual({ recipients: { kind: 'people', userIds: [OLIA] } }));
    expect(calls.some((call) => call.url === `/api/admin/bot/people?q=${encodeURIComponent('Ол')}`)).toBe(true);
    expect(await screen.findByText('Отримають на сайті: 3, з них сповіщенням: 2')).toBeTruthy();
  });

  it('push off on the server still allows an inbox broadcast', async () => {
    data = base({ pushOn: false, rows: [row({ title: 'Давня', pushPeople: 2, read: 4 })] });
    open();
    expect(await screen.findByText('Сповіщення на сервері не налаштовано — розсилка прийде лише у «Вхідні» на сайті.')).toBeTruthy();
    fireEvent.change(titleField(), { target: { value: 'Нова вікторина' } });
    fireEvent.change(textField(), { target: { value: 'Заходь' } });
    await screen.findByText('Отримають на сайті: 3, з них сповіщенням: 2');
    expect(sendButton().disabled).toBe(false);
    fireEvent.click(sendButton());
    await waitFor(() => expect(calls.some((call) => call.url === '/api/admin/broadcasts' && call.method === 'POST')).toBe(true));
    expect(screen.getByText('Давня')).toBeTruthy();
  });

  it('a history row shows the inbox and push counts', async () => {
    data = base({ rows: [row({ title: 'Давня', people: 6, pushPeople: 2, read: 4 })] });
    open();
    expect(await screen.findByText('У вхідних: 6, прочитали: 4; сповіщенням: 2')).toBeTruthy();
  });
});
