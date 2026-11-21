// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AdminPlayerCard, AdminUserDetail, AdminUserRow, PrizeItem } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUser } from './AdminUser';

type Call = { method: string; url: string; body: unknown };
type Reply = { status: number; data?: unknown } | undefined;

const content = { name: 'Кубок', trophy: null, engraving: null, real: null, title: null, diploma: false };
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
const card = (over: Partial<AdminPlayerCard> = {}): AdminPlayerCard => ({
  overview: { avatar: '/a.png', registeredAt: '2026-09-01T10:00:00.000Z', lastSeenAt: '2026-11-01T10:00:00.000Z', level: 2, xp: 300, games: 5, wins: 2, quizzes: 1, friends: 3, groups: 1 },
  achievements: [{ id: 'first_game', earnedAt: '2026-09-02T10:00:00.000Z' }],
  blocked: ['first_win'],
  games: [{ gameId: 'g1', title: 'Карпати', startedAt: '2026-10-10T10:00:00.000Z', rank: 1, playerCount: 4, score: 1200 }],
  quizzes: [{ id: 'q1', title: 'Ліс', questions: 12, updatedAt: '2026-10-11T10:00:00.000Z' }],
  bans: [{ at: '2026-10-05T10:00:00.000Z', kind: 'ban', admin: 'Шеф', reason: 'спам' }],
  xp: [{ id: 'x1', amount: 100, note: 'За турнір', at: '2026-10-12T10:00:00.000Z' }],
  ...over,
});
const detail = (over: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  user: row(),
  stock: [],
  awards: [
    { id: 'a1', place: 1, content, quizTitle: 'Карпати', awardedAt: '2026-10-03T10:00:00.000Z', gift: null },
    { id: 'a2', place: 1, content: { ...content, name: 'Зірка' }, quizTitle: '', awardedAt: '2026-10-04T10:00:00.000Z', gift: { note: 'Дякую' } },
  ],
  title: null,
  card: card(),
  ...over,
});
const mine: PrizeItem[] = [
  { id: '11111111-1111-4111-8111-111111111111', content: { ...content, name: 'Медаль' }, status: 'free', createdAt: '2026-10-01T10:00:00.000Z' },
  { id: '22222222-2222-4222-8222-222222222222', content: { ...content, name: 'Грамота' }, status: 'reserved', createdAt: '2026-10-01T10:00:00.000Z' },
];

let calls: Call[];
let current: AdminUserDetail;
let reply: (call: Call) => Reply;

const sent = (method: string, url: string) => calls.filter((call) => call.method === method && call.url === url);

beforeEach(() => {
  calls = [];
  current = detail();
  reply = () => undefined;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Call = { method: init?.method ?? 'GET', url: String(url), body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) };
      calls.push(call);
      const special = reply(call);
      const answer = special ?? (call.method !== 'GET' ? { status: 204 } : call.url === '/api/admin/users/u2' ? { status: 200, data: current } : call.url === '/api/me/prizes' ? { status: 200, data: mine } : { status: 404, data: { error: 'not_found' } });
      return new Response(answer.status === 204 ? null : JSON.stringify(answer.data), { status: answer.status, headers: { 'content-type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={['/admin/users/u2']}>
      <Routes>
        <Route path="/admin/users/:id" element={<AdminUser />} />
        <Route path="/admin/users" element={<p>список гравців</p>} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

const section = async (name: string) => (await screen.findByRole('heading', { name })).closest('section') as HTMLElement;

/** Розділ розгорнуто (jsdom може не перемикати details від кліку — підстраховуємось). */
const opened = async (name: string) => {
  const box = await section(name);
  const details = box.querySelector('details')!;
  if (!details.open) fireEvent.click(details.querySelector('summary')!);
  details.open = true;
  return box;
};

describe('AdminUser: the player card (58)', () => {
  it('every section folds; only the overview starts open; counts in summaries (69)', async () => {
    open();
    const names = ['Огляд', 'Досягнення', 'Досвід', 'Останні ігри', 'Вікторини', 'Бани', 'Модерація', 'Призи', "Об'єднати з іншим акаунтом"];
    for (const name of names) {
      const box = await section(name);
      expect(box.querySelector('details.admin-fold'), name).toBeTruthy();
      expect(box.querySelector('details')!.open, name).toBe(name === 'Огляд');
    }
    const countOf = async (name: string) => (await section(name)).querySelector('summary .admin-fold-count')?.textContent;
    expect(await countOf('Досягнення')).toBe(String(current.card.achievements.length));
    expect(await countOf('Останні ігри')).toBe(String(current.card.games.length));
    expect(await countOf('Призи')).toBe(String(current.stock.length + current.awards.length));
    expect((await section('Досягнення')).querySelector('summary')!.textContent).toContain('забрано: 1');
    expect(await section('Видалити акаунт')).toBeTruthy();
  });

  it('an open section stays open after the card is reread (69)', async () => {
    reply = (call) => (call.method === 'POST' && call.url === '/api/admin/users/u2/xp' ? { status: 200, data: { xp: 400, level: 3 } } : undefined);
    open();
    const box = await opened('Досвід');
    fireEvent.change(within(box).getByLabelText('Зміна (від’ємне число — відняти)'), { target: { value: '100' } });
    fireEvent.change(within(box).getByLabelText('Причина (обов’язково)'), { target: { value: 'Турнір' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Додати / відняти досвід' }));
    await waitFor(() => expect(sent('GET', '/api/admin/users/u2')).toHaveLength(2));
    expect((await section('Досвід')).querySelector('details')!.open).toBe(true);
  });

  it('shows the overview', async () => {
    open();
    const overview = await section('Огляд');
    expect(screen.getAllByText('Оля').length).toBeGreaterThan(0);
    expect(screen.getByText('olya@example.com')).toBeTruthy();
    expect(within(overview).getByText('Рівень 2 · 300 XP')).toBeTruthy();
    expect(within(overview).getByText('Ігор: 5 · перемог: 2 · вікторин: 1 · друзів: 3 · груп: 1')).toBeTruthy();
    expect(within(overview).getByText(/^Зареєструвався\(-лася\): /)).toBeTruthy();
    expect(within(overview).getByText(/^Востаннє заходив\(-ла\): /)).toBeTruthy();
    expect(within(overview).getByRole('img', { name: 'Аватар Оля' }).getAttribute('src')).toBe('/a.png');
  });

  it('a player who never came back after signing up', async () => {
    current = detail({ card: card({ overview: { ...card().overview, lastSeenAt: null } }) });
    open();
    expect(await screen.findByText('Після реєстрації ще не заходив(-ла)')).toBeTruthy();
  });

  it('grants an achievement from the missing ones', async () => {
    open();
    const box = await opened('Досягнення');
    expect(within(box).getByText('Перша гра')).toBeTruthy();
    expect(within(box).getByText(/Забрано адміністратором/)).toBeTruthy();
    const pick = within(box).getByLabelText('Оберіть досягнення') as HTMLSelectElement;
    const options = Array.from(pick.options).map((option) => option.value);
    expect(options).not.toContain('first_game');
    expect(options).toContain('first_win');
    const grant = within(box).getByRole('button', { name: 'Видати досягнення' }) as HTMLButtonElement;
    expect(grant.disabled).toBe(true);
    fireEvent.change(pick, { target: { value: 'first_win' } });
    fireEvent.click(grant);
    expect(window.confirm).toHaveBeenLastCalledWith('Видати досягнення «Перша перемога» гравцеві Оля?');
    await waitFor(() => expect(sent('POST', '/api/admin/users/u2/achievements')).toHaveLength(1));
    expect(sent('POST', '/api/admin/users/u2/achievements')[0]!.body).toEqual({ achievementId: 'first_win' });
    await waitFor(() => expect(sent('GET', '/api/admin/users/u2')).toHaveLength(2));
  });

  it('picks achievements and revokes them with one confirm and one request (69)', async () => {
    current = detail({ card: card({ achievements: [{ id: 'first_game', earnedAt: '2026-09-02T10:00:00.000Z' }, { id: 'first_win', earnedAt: null }], blocked: [] }) });
    reply = (call) => (call.method === 'POST' && call.url === '/api/admin/users/u2/achievements/revoke' ? { status: 200, data: { revoked: ['first_game'], notOwned: [] } } : undefined);
    open();
    const box = await opened('Досягнення');
    expect(within(box).queryByRole('button', { name: 'Відібрати' })).toBeNull();
    const revoke = within(box).getByRole('button', { name: 'Відібрати вибрані' }) as HTMLButtonElement;
    expect(revoke.disabled).toBe(true);
    const all = within(box).getByRole('checkbox', { name: 'Вибрати всі' }) as HTMLInputElement;
    fireEvent.click(within(box).getByRole('checkbox', { name: 'Перша гра' }));
    expect(revoke.disabled).toBe(false);
    expect(all.indeterminate).toBe(true);
    fireEvent.click(all);
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
    fireEvent.click(all);
    expect((within(box).getByRole('checkbox', { name: 'Перша гра' }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(box).getByRole('checkbox', { name: 'Перша гра' }));
    fireEvent.click(revoke);
    expect(window.confirm).toHaveBeenLastCalledWith('Забрати в Оля досягнення (1): Перша гра? Досвід за них теж зникне.');
    await waitFor(() => expect(sent('POST', '/api/admin/users/u2/achievements/revoke')).toHaveLength(1));
    expect(sent('POST', '/api/admin/users/u2/achievements/revoke')[0]!.body).toEqual({ achievementIds: ['first_game'] });
    await waitFor(() => expect(sent('GET', '/api/admin/users/u2')).toHaveLength(2));
  });

  it('says how many were revoked when some were already taken (69)', async () => {
    current = detail({ card: card({ achievements: [{ id: 'first_game', earnedAt: null }, { id: 'first_win', earnedAt: null }], blocked: [] }) });
    reply = (call) => (call.method === 'POST' && call.url === '/api/admin/users/u2/achievements/revoke' ? { status: 200, data: { revoked: ['first_game'], notOwned: ['first_win'] } } : undefined);
    open();
    const box = await opened('Досягнення');
    fireEvent.click(within(box).getByRole('checkbox', { name: 'Вибрати всі' }));
    fireEvent.click(within(box).getByRole('button', { name: 'Відібрати вибрані' }));
    expect(await within(box).findByText('Відібрано 1 з 2; решту вже забрали — картку оновлено.')).toBeTruthy();
    expect(sent('POST', '/api/admin/users/u2/achievements/revoke')[0]!.body).toEqual({ achievementIds: ['first_game', 'first_win'] });
  });

  it('a declined confirm sends nothing', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    open();
    const box = await opened('Досягнення');
    fireEvent.click(within(box).getByRole('checkbox', { name: 'Перша гра' }));
    fireEvent.click(within(box).getByRole('button', { name: 'Відібрати вибрані' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });

  it('manual xp needs a reason', async () => {
    reply = (call) => (call.method === 'POST' && call.url === '/api/admin/users/u2/xp' ? { status: 409, data: { error: 'xp_below_zero' } } : undefined);
    open();
    const box = await opened('Досвід');
    expect(within(box).getByText(/За турнір/)).toBeTruthy();
    const alert = within(box).getByRole('alert');
    expect(alert.textContent).toBe('');
    const add = within(box).getByRole('button', { name: 'Додати / відняти досвід' }) as HTMLButtonElement;
    const amount = within(box).getByLabelText('Зміна (від’ємне число — відняти)');
    const reason = within(box).getByLabelText('Причина (обов’язково)');
    expect(add.disabled).toBe(true);
    fireEvent.change(amount, { target: { value: '-50' } });
    expect(add.disabled).toBe(true);
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(add.disabled).toBe(true);
    fireEvent.change(amount, { target: { value: '0' } });
    fireEvent.change(reason, { target: { value: 'Помилка' } });
    expect(add.disabled).toBe(true);
    fireEvent.change(amount, { target: { value: '-50' } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(sent('POST', '/api/admin/users/u2/xp')).toHaveLength(1));
    expect(sent('POST', '/api/admin/users/u2/xp')[0]!.body).toEqual({ amount: -50, reason: 'Помилка' });
    await waitFor(() => expect(alert.textContent).toBe('Досвід не може стати меншим за нуль.'));
  });

  it('manual xp tells the new level and rereads the card', async () => {
    reply = (call) => (call.method === 'POST' && call.url === '/api/admin/users/u2/xp' ? { status: 200, data: { xp: 400, level: 3 } } : undefined);
    open();
    const box = await opened('Досвід');
    const status = within(box).getByRole('status');
    expect(status.textContent).toBe('');
    fireEvent.change(within(box).getByLabelText('Зміна (від’ємне число — відняти)'), { target: { value: '100' } });
    fireEvent.change(within(box).getByLabelText('Причина (обов’язково)'), { target: { value: 'Турнір' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Додати / відняти досвід' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Змінити досвід гравця Оля на +100?');
    await waitFor(() => expect(status.textContent).toBe('Тепер: рівень 3, 400 XP'));
    await waitFor(() => expect(sent('GET', '/api/admin/users/u2')).toHaveLength(2));
  });

  it('games link to the admin game view, quizzes to the quiz view', async () => {
    open();
    const games = await section('Останні ігри');
    expect(within(games).getByRole('link', { name: 'Карпати' }).getAttribute('href')).toBe('/admin/games/g1');
    expect(within(games).getByText(/місце 1 з 4 · 1200 балів/)).toBeTruthy();
    const quizzes = await section('Вікторини');
    expect(within(quizzes).getByRole('link', { name: 'Ліс' }).getAttribute('href')).toBe('/admin/quizzes/q1');
    const bans = await section('Бани');
    expect(within(bans).getByText(/заблоковано · Шеф/)).toBeTruthy();
    expect(within(bans).getByText('Причина: спам')).toBeTruthy();
  });

  it('empty lists say so', async () => {
    current = detail({ card: card({ achievements: [], blocked: [], games: [], quizzes: [], bans: [], xp: [] }) });
    open();
    expect(await screen.findByText('Досягнень поки немає')).toBeTruthy();
    expect(screen.getByText('Ігор ще немає')).toBeTruthy();
    expect(screen.getByText('Вікторин ще немає')).toBeTruthy();
    expect(screen.getByText('Блокувань не було')).toBeTruthy();
  });

  it('resets nickname and avatar through the moderation action', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Скинути нік' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Скинути нік гравця Оля до типового?');
    await waitFor(() => expect(sent('POST', '/api/admin/reports/profile/u2')).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Скинути аватар' }));
    await waitFor(() => expect(sent('POST', '/api/admin/reports/profile/u2')).toHaveLength(2));
    expect(sent('POST', '/api/admin/reports/profile/u2').map((call) => call.body)).toEqual([{ action: 'reset_nickname' }, { action: 'reset_avatar' }]);
  });

  it('an admin has no moderation buttons and no delete section', async () => {
    current = detail({ user: row({ admin: true }) });
    open();
    await section('Огляд');
    expect(screen.queryByRole('button', { name: 'Скинути нік' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Скинути аватар' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Видалити акаунт' })).toBeNull();
  });

  it('gifts one of my prizes with a note and revokes a gift', async () => {
    open();
    const box = await opened('Призи');
    expect(within(box).getByRole('link', { name: 'Створити новий приз' }).getAttribute('href')).toBe('/profile/prizes/new?back=/admin/users/u2');
    const pick = (await within(box).findByLabelText('Оберіть приз зі свого складу')) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(pick.options).map((option) => option.textContent)).toEqual(expect.arrayContaining(['Медаль', 'Грамота'])));
    const gift = within(box).getByRole('button', { name: 'Подарувати приз' }) as HTMLButtonElement;
    expect(gift.disabled).toBe(true);
    fireEvent.change(pick, { target: { value: mine[0]!.id } });
    fireEvent.change(within(box).getByLabelText('Підпис (необов’язково)'), { target: { value: '  З днем народження  ' } });
    fireEvent.click(gift);
    expect(window.confirm).toHaveBeenLastCalledWith('Подарувати приз «Медаль» гравцеві Оля?');
    await waitFor(() => expect(sent('POST', '/api/admin/users/u2/gifts')).toHaveLength(1));
    expect(sent('POST', '/api/admin/users/u2/gifts')[0]!.body).toEqual({ prizeId: mine[0]!.id, note: 'З днем народження' });

    expect(within(box).getByText(/^Подарунок від адміністратора · .* · Дякую$/)).toBeTruthy();
    fireEvent.click(within(box).getByRole('checkbox', { name: 'Зірка' }));
    fireEvent.click(within(box).getByRole('button', { name: 'Прибрати вибрані' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Прибрати з вітрини Оля (1): Зірка? Скасувати не можна.');
    await waitFor(() => expect(sent('DELETE', '/api/admin/gifts/a2')).toHaveLength(1));
  });

  it('removes a gift and a game award from the showcase with one confirm (69)', async () => {
    open();
    const box = await opened('Призи');
    const confirms = vi.mocked(window.confirm).mock.calls.length;
    fireEvent.click(within(box).getByRole('checkbox', { name: 'Вибрати всі' }));
    const remove = within(box).getByRole('button', { name: 'Прибрати вибрані' });
    fireEvent.click(remove);
    expect(vi.mocked(window.confirm).mock.calls.length).toBe(confirms + 1);
    await waitFor(() => expect(sent('DELETE', '/api/admin/gifts/a2')).toHaveLength(1));
    await waitFor(() => expect(sent('DELETE', '/api/admin/awards/a1')).toHaveLength(1));
  });

  it('a gift without a note sends null', async () => {
    reply = (call) => (call.method === 'POST' && call.url === '/api/admin/users/u2/gifts' ? { status: 201, data: { id: 'a9' } } : undefined);
    open();
    const box = await opened('Призи');
    const pick = (await within(box).findByLabelText('Оберіть приз зі свого складу')) as HTMLSelectElement;
    await waitFor(() => expect(pick.options.length).toBeGreaterThan(1));
    fireEvent.change(pick, { target: { value: mine[1]!.id } });
    fireEvent.click(within(box).getByRole('button', { name: 'Подарувати приз' }));
    await waitFor(() => expect(sent('POST', '/api/admin/users/u2/gifts')).toHaveLength(1));
    expect(sent('POST', '/api/admin/users/u2/gifts')[0]!.body).toEqual({ prizeId: mine[1]!.id, note: null });
  });

  it('deleting needs the exact nickname', async () => {
    open();
    const box = await opened('Видалити акаунт');
    const remove = within(box).getByRole('button', { name: 'Видалити акаунт' }) as HTMLButtonElement;
    const typed = within(box).getByLabelText('Введіть нік «Оля», щоб підтвердити');
    expect(remove.disabled).toBe(true);
    fireEvent.change(typed, { target: { value: 'оля' } });
    expect(remove.disabled).toBe(true);
    fireEvent.change(typed, { target: { value: 'Оля' } });
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    expect(window.confirm).toHaveBeenLastCalledWith('Видалити акаунт Оля назавжди? Скасувати це не можна.');
    expect(await screen.findByText('список гравців')).toBeTruthy();
    expect(sent('DELETE', '/api/admin/users/u2')[0]!.body).toEqual({ confirm: 'Оля' });
    expect(sent('GET', '/api/admin/users/u2')).toHaveLength(1);
  });

  it('a person without a nickname is confirmed by email; a mismatch error stays on the card', async () => {
    current = detail({ user: row({ nickname: null }) });
    reply = (call) => (call.method === 'DELETE' && call.url === '/api/admin/users/u2' ? { status: 400, data: { error: 'confirm_mismatch' } } : undefined);
    open();
    const box = await opened('Видалити акаунт');
    fireEvent.change(within(box).getByLabelText('Введіть нік «olya@example.com», щоб підтвердити'), { target: { value: 'olya@example.com' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Видалити акаунт' }));
    await waitFor(() => expect(within(box).getByRole('alert').textContent).toBe('Нік не збігається — акаунт не видалено.'));
    expect(screen.queryByText('список гравців')).toBeNull();
  });

  it('an achievement or gift already taken in another tab keeps the card, says so and rereads it', async () => {
    reply = (call) =>
      call.method === 'POST' && call.url === '/api/admin/users/u2/achievements/revoke'
        ? { status: 404, data: { error: 'achievement_not_owned' } }
        : call.method === 'DELETE' && call.url === '/api/admin/gifts/a2'
          ? { status: 404, data: { error: 'gift_not_found' } }
          : undefined;
    open();
    const box = await opened('Досягнення');
    fireEvent.click(within(box).getByRole('checkbox', { name: 'Перша гра' }));
    fireEvent.click(within(box).getByRole('button', { name: 'Відібрати вибрані' }));
    expect(await within(box).findByText('Цього досягнення в гравця вже немає — картку оновлено.')).toBeTruthy();
    await waitFor(() => expect(sent('GET', '/api/admin/users/u2')).toHaveLength(2));
    const prizes = await opened('Призи');
    fireEvent.click(within(prizes).getByRole('checkbox', { name: 'Зірка' }));
    fireEvent.click(within(prizes).getByRole('button', { name: 'Прибрати вибрані' }));
    expect(await within(prizes).findByText('Зроблено 0 з 1; решти вже не було — картку оновлено.')).toBeTruthy();
    await waitFor(() => expect(sent('GET', '/api/admin/users/u2')).toHaveLength(3));
    expect(screen.queryByText('головна')).toBeNull();
  });

  it('a failed reread after an action says the card is stale', async () => {
    let reads = 0;
    reply = (call) => {
      if (call.method !== 'GET' || call.url !== '/api/admin/users/u2') return undefined;
      reads += 1;
      return reads === 1 ? { status: 200, data: current } : { status: 500, data: { error: 'internal' } };
    };
    open();
    const box = await opened('Досягнення');
    expect(screen.queryByText('Не вдалося оновити; показано останні дані.')).toBeNull();
    fireEvent.click(within(box).getByRole('checkbox', { name: 'Перша гра' }));
    reply = (call) => {
      if (call.method === 'POST') return { status: 200, data: { revoked: ['first_game'], notOwned: [] } };
      if (call.method !== 'GET' || call.url !== '/api/admin/users/u2') return undefined;
      reads += 1;
      return reads === 1 ? { status: 200, data: current } : { status: 500, data: { error: 'internal' } };
    };
    fireEvent.click(within(box).getByRole('button', { name: 'Відібрати вибрані' }));
    expect((await screen.findByText('Не вдалося оновити; показано останні дані.')).getAttribute('role')).toBe('status');
  });

  it('a balancing xp line is named in the interface language, not by the server', async () => {
    current = detail({ card: card({ xp: [{ id: 'x2', amount: 80, note: '', at: '2026-10-12T10:00:00.000Z', balance: true }] }) });
    open();
    const box = await opened('Досвід');
    expect(within(box).getByText('Вирівнювання до нуля після зняття досягнення')).toBeTruthy();
  });
});
