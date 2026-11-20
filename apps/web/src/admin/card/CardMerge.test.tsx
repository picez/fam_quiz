// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { emptyMergeSummary, type AccountMergePreview, type AdminUserDetail, type AdminUserRow, type MergeSide } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUser } from '../AdminUser';

type Call = { method: string; url: string; body: unknown };
type Reply = { status: number; data?: unknown } | undefined;

const row = (over: Partial<AdminUserRow> = {}): AdminUserRow => ({
  id: 'u2',
  nickname: 'Оля',
  email: 'olya@example.com',
  createdAt: '2026-09-01T10:00:00.000Z',
  games: 5,
  quizzes: 1,
  admin: false,
  banned: null,
  ...over,
});
const other = row({ id: 'u3', nickname: 'Ольга', email: 'olga@example.com' });
const detail = (user: AdminUserRow): AdminUserDetail => ({
  user,
  stock: [],
  awards: [],
  title: null,
  card: {
    overview: { avatar: null, registeredAt: '2026-09-01T10:00:00.000Z', lastSeenAt: null, level: 2, xp: 300, games: 5, wins: 2, quizzes: 1, friends: 3, groups: 1 },
    achievements: [],
    blocked: [],
    games: [],
    quizzes: [],
    bans: [],
    xp: [],
  },
});
const side = (user: AdminUserRow, over: Partial<MergeSide> = {}): MergeSide => ({ id: user.id, nickname: user.nickname, email: user.email, avatar: null, level: 2, xp: 300, logins: ['credential'], ...over });
const preview = (primary: AdminUserRow, secondary: AdminUserRow, over: Partial<AccountMergePreview> = {}): AccountMergePreview => ({
  primary: side(primary),
  secondary: side(secondary, { level: 3, xp: 600, logins: ['google'] }),
  confirm: secondary.nickname ?? secondary.email,
  refusal: null,
  summary: { ...emptyMergeSummary(), games: 3, xp: 600, friends: 2, sameGames: 1, sameFriends: 1, logins: ['google'] },
  after: { level: 4, xp: 900 },
  ...over,
});

let calls: Call[];
let reply: (call: Call) => Reply;

const sent = (method: string, url: string) => calls.filter((call) => call.method === method && call.url === url);

beforeEach(() => {
  calls = [];
  reply = () => undefined;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Call = { method: init?.method ?? 'GET', url: String(url), body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) };
      calls.push(call);
      const answer = reply(call) ?? defaultReply(call);
      return new Response(answer.status === 204 ? null : JSON.stringify(answer.data), { status: answer.status, headers: { 'content-type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function defaultReply(call: Call): { status: number; data?: unknown } {
  if (call.method === 'GET' && call.url === '/api/admin/users/u2') return { status: 200, data: detail(row()) };
  if (call.method === 'GET' && call.url === '/api/admin/users/u3') return { status: 200, data: detail(other) };
  if (call.method === 'GET' && call.url.startsWith('/api/admin/users?q=')) return { status: 200, data: { rows: [row(), other], total: 2, page: 1, pages: 1 } };
  if (call.method === 'GET' && call.url === '/api/admin/users/u2/merge/u3') return { status: 200, data: preview(row(), other) };
  if (call.method === 'GET' && call.url === '/api/admin/users/u3/merge/u2') return { status: 200, data: preview(other, row()) };
  return { status: 404, data: { error: 'not_found' } };
}

const open = () =>
  render(
    <MemoryRouter initialEntries={['/admin/users/u2']}>
      <Routes>
        <Route path="/admin/users/:id" element={<AdminUser />} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

const mergeSection = async () => (await screen.findByRole('heading', { name: 'Об\'єднати з іншим акаунтом' })).closest('section') as HTMLElement;

/** Знаходить «Ольга» пошуком і вибирає її; повертає розділ. */
async function choose(): Promise<HTMLElement> {
  open();
  const merge = await mergeSection();
  fireEvent.change(within(merge).getByLabelText('Знайти акаунт (нік чи email)'), { target: { value: 'Ол' } });
  fireEvent.click(await within(merge).findByRole('button', { name: /olga@example\.com/ }));
  await within(merge).findByText(/^Разом: /);
  return merge;
}

describe('CardMerge (66)', () => {
  it('finds another account, shows what moves and the logins, and enables merge only after the exact nickname', async () => {
    open();
    const merge = await mergeSection();
    const search = within(merge).getByLabelText('Знайти акаунт (нік чи email)');
    fireEvent.change(search, { target: { value: 'О' } });
    // Один символ — не шукає.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(calls.filter((call) => call.url.startsWith('/api/admin/users?q='))).toEqual([]);
    fireEvent.change(search, { target: { value: 'Ол' } });
    const found = await within(merge).findByRole('button', { name: /olga@example\.com/ });
    expect(calls.filter((call) => call.url.startsWith('/api/admin/users?q='))).toHaveLength(1);
    expect(calls.find((call) => call.url.startsWith('/api/admin/users?q='))!.url).toBe(`/api/admin/users?q=${encodeURIComponent('Ол')}&page=1`);
    // Поточного акаунта серед знайдених немає.
    expect(within(merge).queryByRole('button', { name: /olya@example\.com/ })).toBeNull();
    fireEvent.click(found);

    expect(await within(merge).findByText('Разом: рівень 4, досвід 900')).toBeTruthy();
    expect(sent('GET', '/api/admin/users/u2/merge/u3')).toHaveLength(1);
    expect((within(merge).getByRole('radio', { name: 'Головним лишається: Оля' }) as HTMLInputElement).checked).toBe(true);
    expect(within(merge).getByText('Перейде на головний: ігор: 3, досвіду: 600, друзів: 2')).toBeTruthy();
    expect(within(merge).getByText('Злиються: тих самих ігор: 1, спільних друзів: 1')).toBeTruthy();
    expect(within(merge).getByText('Способи входу: Пошта й пароль')).toBeTruthy();
    expect(within(merge).getByText('Способи входу: Google')).toBeTruthy();
    expect(within(merge).getByText('Рівень 3 · 600 XP')).toBeTruthy();
    expect(within(merge).queryByText(/перестане діяти/)).toBeNull();

    const button = within(merge).getByRole('button', { name: 'Об\'єднати' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const type = within(merge).getByLabelText('Щоб підтвердити, введи нік акаунта, що зникне: Ольга');
    fireEvent.change(type, { target: { value: 'Ольг' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(type, { target: { value: ' Ольга ' } });
    expect(button.disabled).toBe(false);
  });

  it('swapping the primary asks again with the ids swapped', async () => {
    const merge = await choose();
    fireEvent.click(within(merge).getByRole('radio', { name: 'Головним лишається: Ольга' }));
    await waitFor(() => expect(sent('GET', '/api/admin/users/u3/merge/u2')).toHaveLength(1));
    expect(await within(merge).findByLabelText('Щоб підтвердити, введи нік акаунта, що зникне: Оля')).toBeTruthy();
    expect((within(merge).getByRole('radio', { name: 'Головним лишається: Ольга' }) as HTMLInputElement).checked).toBe(true);
  });

  it('a refusal shows its reason and no merge button', async () => {
    reply = (call) => (call.url === '/api/admin/users/u2/merge/u3' ? { status: 200, data: preview(row(), other, { refusal: 'merge_live', summary: null, after: null }) } : undefined);
    open();
    const merge = await mergeSection();
    fireEvent.change(within(merge).getByLabelText('Знайти акаунт (нік чи email)'), { target: { value: 'Ол' } });
    fireEvent.click(await within(merge).findByRole('button', { name: /olga@example\.com/ }));
    expect(await within(merge).findByText('Хтось із двох зараз у живій грі — спробуй після гри')).toBeTruthy();
    expect(within(merge).queryByRole('button', { name: 'Об\'єднати' })).toBeNull();
    expect(within(merge).queryByText(/^Перейде на головний/)).toBeNull();
  });

  it('a dropped password is warned about', async () => {
    reply = (call) =>
      call.url === '/api/admin/users/u2/merge/u3'
        ? { status: 200, data: preview(row(), other, { summary: { ...emptyMergeSummary(), games: 1, passwordDropped: true } }) }
        : undefined;
    const merge = await choose();
    const warning = within(merge).getByText('Пароль акаунта Ольга перестане діяти: входити паролем головного (адресою будь-якого з двох).');
    expect(warning.className).toContain('error');
  });

  it('after the merge it opens the primary card', async () => {
    reply = (call) =>
      call.method === 'POST' && call.url === '/api/admin/users/u3/merge' ? { status: 200, data: { primaryId: 'u3', summary: emptyMergeSummary() } } : undefined;
    const merge = await choose();
    fireEvent.click(within(merge).getByRole('radio', { name: 'Головним лишається: Ольга' }));
    fireEvent.change(await within(merge).findByLabelText('Щоб підтвердити, введи нік акаунта, що зникне: Оля'), { target: { value: 'Оля' } });
    fireEvent.click(within(merge).getByRole('button', { name: 'Об\'єднати' }));
    await waitFor(() => expect(sent('GET', '/api/admin/users/u3')).toHaveLength(1));
    expect(window.confirm).toHaveBeenCalledWith('Об\'єднати Оля з Ольга? Це не скасувати.');
    expect(sent('POST', '/api/admin/users/u3/merge')[0]!.body).toEqual({ secondaryId: 'u2', confirm: 'Оля' });
    await waitFor(() => expect(within(document.querySelector('.admin-list') as HTMLElement).getByText('olga@example.com')).toBeTruthy());
    expect(screen.queryByText(/^Разом: /)).toBeNull();
  });

  it('merging into this card rereads it', async () => {
    reply = (call) =>
      call.method === 'POST' && call.url === '/api/admin/users/u2/merge' ? { status: 200, data: { primaryId: 'u2', summary: emptyMergeSummary() } } : undefined;
    const merge = await choose();
    fireEvent.change(within(merge).getByLabelText('Щоб підтвердити, введи нік акаунта, що зникне: Ольга'), { target: { value: 'Ольга' } });
    fireEvent.click(within(merge).getByRole('button', { name: 'Об\'єднати' }));
    await waitFor(() => expect(sent('GET', '/api/admin/users/u2')).toHaveLength(2));
    expect(sent('POST', '/api/admin/users/u2/merge')[0]!.body).toEqual({ secondaryId: 'u3', confirm: 'Ольга' });
    await waitFor(() => expect(within(merge).queryByText(/^Разом: /)).toBeNull());
  });

  it('a failed merge says why', async () => {
    reply = (call) => (call.method === 'POST' ? { status: 409, data: { error: 'merge_banned' } } : undefined);
    const merge = await choose();
    fireEvent.change(within(merge).getByLabelText('Щоб підтвердити, введи нік акаунта, що зникне: Ольга'), { target: { value: 'Ольга' } });
    fireEvent.click(within(merge).getByRole('button', { name: 'Об\'єднати' }));
    expect(await within(merge).findByText('Спершу розбань')).toBeTruthy();
  });
});
