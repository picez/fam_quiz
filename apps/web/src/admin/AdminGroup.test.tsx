// @vitest-environment jsdom
import type { AdminGroupDetail } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGroup } from './AdminGroup';

const G = '11111111-1111-4111-8111-111111111111';
const detail = (over: Partial<AdminGroupDetail['group']> = {}): AdminGroupDetail => ({
  group: { id: G, name: 'Родина Квіткових', emoji: '🌻', owner: { id: 'u1', nickname: 'Оля' }, members: 3, items: 2, createdAt: '2026-11-14T10:00:00.000Z', hidden: null, ...over },
  members: [
    { id: 'u1', nickname: 'Оля', role: 'owner', joinedAt: '2026-11-14T10:00:00.000Z', banned: false },
    { id: 'u2', nickname: 'Петро', role: 'member', joinedAt: '2026-11-15T10:00:00.000Z', banned: false },
    { id: 'u3', nickname: 'Богдан', role: 'member', joinedAt: '2026-11-16T10:00:00.000Z', banned: true },
  ],
  items: {
    rows: [
      { id: 'i1', kind: 'story', text: 'Як тато заблукав у лісі', author: 'Петро', surprise: true, createdAt: '2026-11-17T10:00:00.000Z', hidden: false },
      { id: 'i2', kind: 'fact', text: 'Бабуся свистить', author: null, surprise: false, createdAt: '2026-11-16T10:00:00.000Z', hidden: true },
    ],
    total: 2,
    page: 1,
    pages: 1,
  },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let current = detail();
let deleteAnswer: () => Response = () => new Response(null, { status: 204 });
// 72: пошук людей і відповіді на POST (додати учасника чи запис)
let people: { id: string; nickname: string; avatar: null }[] = [];
let postAnswer: () => Response = () => json({ changed: true });
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  if (method === 'GET' && url.startsWith('/api/admin/bot/people')) return json(people);
  if (method === 'GET') return json(current);
  if (method === 'POST') return postAnswer();
  if (method === 'DELETE' && url === `/api/admin/groups/${G}`) return deleteAnswer();
  if (method === 'DELETE') return json({ changed: true });
  return json({ changed: true });
});
const writes = () => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET').map(([url, init]) => ({ url, method: init!.method, body: init!.body === undefined ? undefined : JSON.parse(String(init!.body)) }));

beforeEach(() => {
  current = detail();
  deleteAnswer = () => new Response(null, { status: 204 });
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={[`/admin/groups/${G}`]}>
      <Routes>
        <Route path="/admin/groups/:id" element={<AdminGroup />} />
        <Route path="/admin/groups" element={<p>список груп</p>} />
      </Routes>
    </MemoryRouter>,
  );
const member = (name: string) => screen.getByRole('link', { name }).closest('li')!;

describe('AdminGroup (63)', () => {
  it('the group card', async () => {
    open();
    expect(await screen.findByRole('heading', { name: '🌻 Родина Квіткових' })).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/admin/groups/${G}?page=1`);
    // Члени: власника не вилучають; заблокованого не роблять власником.
    expect(within(member('Оля')).queryByRole('button', { name: 'Вилучити' })).toBeNull();
    expect(within(member('Оля')).queryByRole('button', { name: 'Зробити власником' })).toBeNull();
    expect(within(member('Оля')).getByText('керує групою')).toBeTruthy();
    expect(within(member('Петро')).getByRole('button', { name: 'Вилучити' })).toBeTruthy();
    expect(within(member('Петро')).getByRole('button', { name: 'Зробити власником' })).toBeTruthy();
    expect(within(member('Богдан')).getByText('заблоковано')).toBeTruthy();
    expect(within(member('Богдан')).getByRole('button', { name: 'Вилучити' })).toBeTruthy();
    expect(within(member('Богдан')).queryByRole('button', { name: 'Зробити власником' })).toBeNull();

    // Записи: сюрприз і прихований видно адміну.
    const story = screen.getByText('Як тато заблукав у лісі').closest('li')!;
    expect(within(story).getByText('Сюрприз')).toBeTruthy();
    expect(within(story).getByText('Історія')).toBeTruthy();
    const fact = screen.getByText('Бабуся свистить').closest('li')!;
    expect(within(fact).getByText('Приховано')).toBeTruthy();
    expect(within(fact).getByRole('button', { name: 'Показати' })).toBeTruthy();

    fireEvent.click(within(story).getByRole('button', { name: 'Сховати запис' }));
    await waitFor(() => expect(writes()).toEqual([{ url: `/api/admin/groups/${G}/items/i1/hidden`, method: 'PUT', body: { hidden: true } }]));

    fireEvent.click(within(member('Петро')).getByRole('button', { name: 'Вилучити' }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ url: `/api/admin/groups/${G}/members/u2`, method: 'DELETE', body: undefined }));
    expect(window.confirm).toHaveBeenCalled();

    fireEvent.click(within(member('Петро')).getByRole('button', { name: 'Зробити власником' }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ url: `/api/admin/groups/${G}/owner`, method: 'PUT', body: { userId: 'u2' } }));

    fireEvent.change(screen.getByLabelText('Причина (необов’язково, її побачить власник)'), { target: { value: 'Образлива назва' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сховати групу' }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ url: `/api/admin/groups/${G}/hidden`, method: 'PUT', body: { hidden: true, reason: 'Образлива назва' } }));
  });

  it('a declined confirmation sends nothing', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    fireEvent.click(within(member('Петро')).getByRole('button', { name: 'Вилучити' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сховати групу' }));
    expect(writes()).toEqual([]);
  });

  it('a hidden group shows its reason and «Повернути»', async () => {
    current = detail({ hidden: { at: '2026-11-19T10:00:00.000Z', reason: 'Образлива назва' } });
    open();
    expect(await screen.findByText('Причина: Образлива назва')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Сховати групу' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Повернути' }));
    await waitFor(() => expect(writes()).toEqual([{ url: `/api/admin/groups/${G}/hidden`, method: 'PUT', body: { hidden: false } }]));
  });

  it('deletes only when the typed name matches, then goes to the list', async () => {
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    const button = screen.getByRole('button', { name: 'Видалити групу' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const field = screen.getByLabelText('Введіть назву групи: «Родина Квіткових»');
    fireEvent.change(field, { target: { value: 'Родина' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '  Родина Квіткових  ' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(await screen.findByText('список груп')).toBeTruthy();
    expect(writes()).toEqual([{ url: `/api/admin/groups/${G}`, method: 'DELETE', body: { name: 'Родина Квіткових' } }]);
  });

  it('says the name mismatch from the server', async () => {
    deleteAnswer = () => json({ error: 'group_name_mismatch' }, 409);
    const { container } = open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    const alert = container.querySelector('.admin-group-delete [role="alert"]')!;
    expect(alert.textContent).toBe('');
    fireEvent.change(screen.getByLabelText('Введіть назву групи: «Родина Квіткових»'), { target: { value: 'Родина Квіткових' } });
    fireEvent.click(screen.getByRole('button', { name: 'Видалити групу' }));
    await waitFor(() => expect(alert.textContent).toBe('Назва не збігається з назвою групи.'));
    expect(screen.queryByText('список груп')).toBeNull();
  });
});

describe('AdminGroup: adding (72)', () => {
  const addSection = () => screen.getByRole('heading', { name: 'Додати учасника' }).closest('section')!;
  const itemBlock = () => screen.getByRole('heading', { name: 'Новий запис' }).closest('div')!;
  const gets = () => fetchMock.mock.calls.filter(([url, init]) => (init?.method ?? 'GET') === 'GET' && String(url).startsWith(`/api/admin/groups/${G}`)).length;

  async function pickMarta() {
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    fireEvent.change(within(addSection()).getByLabelText('Пошук за ніком'), { target: { value: 'Ма' } });
    fireEvent.click(await within(addSection()).findByRole('button', { name: 'Марта' }));
  }

  beforeEach(() => {
    people = [{ id: 'u9', nickname: 'Марта', avatar: null }];
    postAnswer = () => json({ changed: true, pushed: false });
  });

  it('adds a found person after the confirmation; says the notice went to «Вхідні»; reloads and clears the pick', async () => {
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    const button = within(addSection()).getByRole('button', { name: 'Додати до групи' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await pickMarta();
    expect(button.disabled).toBe(false);
    const before = gets();
    fireEvent.click(button);
    expect(window.confirm).toHaveBeenCalledWith('Додати Марта до групи «Родина Квіткових»?');
    await waitFor(() => expect(writes()).toEqual([{ url: `/api/admin/groups/${G}/members`, method: 'POST', body: { userId: 'u9' } }]));
    expect(await within(addSection()).findByRole('status')).toHaveProperty('textContent', 'Марта тепер у групі. Сповіщення — у «Вхідних»; пуш-сповіщень у людини немає.');
    await waitFor(() => expect(gets()).toBe(before + 1));
    expect(within(addSection()).queryByRole('button', { name: /Марта/ })).toBeNull();
  });

  it('with a push the status says both; a declined confirmation sends nothing', async () => {
    postAnswer = () => json({ changed: true, pushed: true });
    open();
    await pickMarta();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(within(addSection()).getByRole('button', { name: 'Додати до групи' }));
    expect(writes()).toEqual([]);
    fireEvent.click(within(addSection()).getByRole('button', { name: 'Додати до групи' }));
    await waitFor(() => expect(within(addSection()).getByRole('status').textContent).toBe('Марта тепер у групі. Сповіщення — у «Вхідних» і пушем.'));
  });

  it('a refusal shows in the section alert and reloads the card', async () => {
    postAnswer = () => json({ error: 'already_member' }, 409);
    open();
    await pickMarta();
    const before = gets();
    fireEvent.click(within(addSection()).getByRole('button', { name: 'Додати до групи' }));
    await waitFor(() => expect(within(addSection()).getByRole('alert').textContent).toBe('Ця людина вже в групі.'));
    await waitFor(() => expect(gets()).toBe(before + 1));
  });

  it('a full group has no search, only the limit', async () => {
    current = detail({ members: 30 });
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    expect(within(addSection()).getByText('Група повна: 30 людей.')).toBeTruthy();
    expect(within(addSection()).queryByLabelText('Пошук за ніком')).toBeNull();
  });

  it('a new record from the bot: kind, text, «про кого» from the unbanned members, year', async () => {
    postAnswer = () => json({ id: 'i9' }, 201);
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    const block = itemBlock();
    const button = within(block).getByRole('button', { name: 'Додати запис' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(within(block).getByLabelText('Цитата'));
    fireEvent.change(within(block).getByLabelText('Текст'), { target: { value: '  Хто рано встає, тому Бог дає  ' } });
    // Заблокованого Богдана в «Про кого» немає.
    expect(within(block).queryByLabelText('Богдан')).toBeNull();
    fireEvent.click(within(block).getByLabelText('Петро'));
    fireEvent.change(within(block).getByLabelText('Рік'), { target: { value: '19' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(within(block).getByLabelText('Рік'), { target: { value: '1998' } });
    expect(button.disabled).toBe(false);
    const before = gets();
    fireEvent.click(button);
    await waitFor(() =>
      expect(writes()).toEqual([
        { url: `/api/admin/groups/${G}/items`, method: 'POST', body: { kind: 'quote', text: 'Хто рано встає, тому Бог дає', about: [{ kind: 'member', userId: 'u2' }], answer: null, year: 1998, photo: null, surprise: false } },
      ]),
    );
    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(within(block).getByRole('status').textContent).toBe('Запис додано.'));
    expect((within(block).getByLabelText('Текст') as HTMLTextAreaElement).value).toBe('');
    expect((within(block).getByLabelText('Петро') as HTMLInputElement).checked).toBe(false);
    await waitFor(() => expect(gets()).toBe(before + 1));
  });

  it('«про кого» stops at five; a server reason shows its text', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, nickname: `Родич ${i}`, role: 'member' as const, joinedAt: '2026-11-15T10:00:00.000Z', banned: false }));
    current = { ...detail(), members: many };
    postAnswer = () => json({ error: 'invalid_payload', reason: 'item_text' }, 400);
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    const block = itemBlock();
    for (let i = 0; i < 5; i++) fireEvent.click(within(block).getByLabelText(`Родич ${i}`));
    expect((within(block).getByLabelText('Родич 5') as HTMLInputElement).disabled).toBe(true);
    expect((within(block).getByLabelText('Родич 0') as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(within(block).getByLabelText('Текст'), { target: { value: 'Текст' } });
    fireEvent.click(within(block).getByRole('button', { name: 'Додати запис' }));
    await waitFor(() => expect(within(block).getByRole('alert').textContent).toBe('Текст — від 1 до 1000 символів.'));
  });

  it('500 records: no form, only the limit', async () => {
    current = detail({ items: 500 });
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    expect(within(itemBlock()).getByText('У групі вже 500 записів — нового не додати.')).toBeTruthy();
    expect(within(itemBlock()).queryByRole('button', { name: 'Додати запис' })).toBeNull();
  });

  it('a hidden group: both sections say to restore it first', async () => {
    current = detail({ hidden: { at: '2026-11-19T10:00:00.000Z', reason: null } });
    open();
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    expect(within(addSection()).getByText('Групу приховано — спершу поверни її.')).toBeTruthy();
    expect(within(itemBlock()).getByText('Групу приховано — спершу поверни її.')).toBeTruthy();
    expect(within(addSection()).queryByLabelText('Пошук за ніком')).toBeNull();
    expect(within(itemBlock()).queryByRole('button', { name: 'Додати запис' })).toBeNull();
  });
});
