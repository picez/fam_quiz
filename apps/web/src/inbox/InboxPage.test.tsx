// @vitest-environment jsdom
import type { InboxItem } from '@quiz/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { getInbox, markInboxRead, me } from '../api';
import { InboxPage } from './InboxPage';
import { setInboxUnread, useInboxBadge } from './useInboxBadge';

vi.mock('../api', () => ({ me: vi.fn(), getInbox: vi.fn(), markInboxRead: vi.fn() }));
vi.mock('./useInboxBadge', () => ({ setInboxUnread: vi.fn(), useInboxBadge: vi.fn(() => 0), refreshInbox: vi.fn() }));

const OK = { ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false } as const;
const OUT = { ok: false, error: 'unauthorized' } as const;

const broadcast = (over: Partial<Extract<InboxItem, { kind: 'broadcast' }>> = {}): InboxItem => ({
  id: 'i1',
  at: '2026-11-22T10:00:00.000Z',
  read: false,
  kind: 'broadcast',
  title: 'Субота',
  text: 'Гра о 19:00',
  url: null,
  ...over,
});
const reply: InboxItem = {
  id: 'i2',
  at: '2026-11-21T09:00:00.000Z',
  read: true,
  kind: 'problem_reply',
  reply: 'Виправили, дякуємо!',
  problem: { id: 'p1', at: '2026-11-20T08:00:00.000Z', text: 'Кнопка не натискається' },
};

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}
const open = () =>
  render(
    <MemoryRouter initialEntries={['/inbox']}>
      <Routes>
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="*" element={<p>інше</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

beforeEach(() => {
  forgetAccount();
  vi.mocked(me).mockReset();
  vi.mocked(me).mockResolvedValue(OK);
  vi.mocked(getInbox).mockReset();
  vi.mocked(markInboxRead).mockReset();
  vi.mocked(markInboxRead).mockResolvedValue({ ok: true, unread: 0 });
  vi.mocked(setInboxUnread).mockReset();
  vi.mocked(useInboxBadge).mockReset();
  vi.mocked(useInboxBadge).mockReturnValue(0);
});
afterEach(cleanup);

describe('InboxPage (70)', () => {
  it('a guest goes to the login with a way back', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    open();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Finbox'));
    expect(getInbox).not.toHaveBeenCalled();
  });

  it('an empty inbox says so', async () => {
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [], unread: 0 });
    open();
    expect(await screen.findByText('Тут з\'являться повідомлення від адміністрації й відповіді на твої звернення.')).toBeTruthy();
    expect(markInboxRead).not.toHaveBeenCalled();
    // 80: порожній список пропонує дію — сторінку «Як грати».
    expect(screen.getByRole('link', { name: 'Як грати' }).getAttribute('href')).toBe('/help/play');
  });

  it('shows a broadcast and a reply, the unread one is marked «Нове»', async () => {
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [broadcast(), reply], unread: 1 });
    open();
    const card = (await screen.findByText('Субота')).closest('li') as HTMLElement;
    expect(card.classList.contains('is-new')).toBe(true);
    expect(within(card).getByText('Нове')).toBeTruthy();
    expect(within(card).getByText('Гра о 19:00')).toBeTruthy();
    expect(within(card).getByText('Від адміністрації')).toBeTruthy();
    expect(card.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-22T10:00:00.000Z');

    const answer = screen.getByText('Відповідь на твоє повідомлення').closest('li') as HTMLElement;
    expect(answer.classList.contains('is-new')).toBe(false);
    expect(within(answer).queryByText('Нове')).toBeNull();
    expect(within(answer).getByText('Ти писав(-ла): Кнопка не натискається')).toBeTruthy();
    expect(within(answer).getByText('Виправили, дякуємо!')).toBeTruthy();
    expect(within(answer).getByRole('link', { name: 'Усі мої повідомлення' }).getAttribute('href')).toBe('/report');
  });

  it('marks everything up to the newest shown as read once, and the badge drops', async () => {
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [broadcast(), reply], unread: 1 });
    open();
    await screen.findByText('Субота');
    await waitFor(() => expect(markInboxRead).toHaveBeenCalledTimes(1));
    expect(markInboxRead).toHaveBeenCalledWith('2026-11-22T10:00:00.000Z');
    await waitFor(() => expect(setInboxUnread).toHaveBeenCalledWith(0));
    // На цьому показі позначка «Нове» лишається.
    expect(screen.getByText('Нове')).toBeTruthy();
  });

  it('nothing unread: no read request', async () => {
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [reply], unread: 0 });
    open();
    await screen.findByText('Відповідь на твоє повідомлення');
    expect(markInboxRead).not.toHaveBeenCalled();
  });

  it('a site path is a link, https opens safely in a new tab, anything else is not a link (isAnnouncementUrl)', async () => {
    vi.mocked(getInbox).mockResolvedValue({
      ok: true,
      items: [
        broadcast({ id: 'a', title: 'Своє', url: '/library' }),
        broadcast({ id: 'b', title: 'Зовнішнє', url: 'https://example.com/x' }),
        broadcast({ id: 'c', title: 'Небезпечне', url: 'javascript:alert(1)' }),
        broadcast({ id: 'd', title: 'Чуже', url: '//evil.test/x' }),
      ],
      unread: 0,
    });
    open();
    const card = async (title: string) => (await screen.findByText(title)).closest('li') as HTMLElement;
    expect((await card('Своє')).querySelector('a')?.getAttribute('href')).toBe('/library');
    const outside = (await card('Зовнішнє')).querySelector('a')!;
    expect(outside.getAttribute('href')).toBe('https://example.com/x');
    expect(outside.getAttribute('rel')).toBe('noopener noreferrer');
    expect(outside.getAttribute('target')).toBe('_blank');
    expect((await card('Небезпечне')).querySelector('a')).toBeNull();
    expect((await card('Чуже')).querySelector('a')).toBeNull();
  });

  it('a service worker signal reads the list again', async () => {
    const worker = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
    try {
      vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [reply], unread: 0 });
      open();
      await screen.findByText('Відповідь на твоє повідомлення');
      vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [broadcast({ title: 'Свіже' }), reply], unread: 1 });
      worker.dispatchEvent(new MessageEvent('message', { data: { type: 'quiz:inbox' } }));
      expect(await screen.findByText('Свіже')).toBeTruthy();
      expect(getInbox).toHaveBeenCalledTimes(2);
    } finally {
      delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    }
  });

  it('an error offers a retry', async () => {
    vi.mocked(getInbox).mockResolvedValueOnce({ ok: false, error: 'offline' });
    open();
    expect(await screen.findByRole('alert')).toBeTruthy();
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [broadcast()], unread: 0 });
    const retry = screen.getByRole('button', { name: 'Спробувати ще раз' });
    // Кнопка — як інші кнопки застосунку (.btn), а не гола кнопка браузера.
    expect(retry.classList.contains('btn')).toBe(true);
    retry.click();
    expect(await screen.findByText('Субота')).toBeTruthy();
  });

  it('the unread-count poll seeing more than the list knows reads the list again', async () => {
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [reply], unread: 0 });
    const view = open();
    await screen.findByText('Відповідь на твоє повідомлення');
    expect(getInbox).toHaveBeenCalledTimes(1);
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [broadcast({ title: 'Свіже' }), reply], unread: 1 });
    vi.mocked(useInboxBadge).mockReturnValue(1);
    view.rerender(
      <MemoryRouter initialEntries={['/inbox']}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Свіже')).toBeTruthy();
    expect(getInbox).toHaveBeenCalledTimes(2);
  });

  it('the badge matching what the list shows (or dropping after mark-read) does not reload', async () => {
    vi.mocked(useInboxBadge).mockReturnValue(1);
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [broadcast(), reply], unread: 1 });
    open();
    await screen.findByText('Субота');
    await waitFor(() => expect(setInboxUnread).toHaveBeenCalledWith(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getInbox).toHaveBeenCalledTimes(1);
  });
});

describe('InboxPage: added to a group (72)', () => {
  it('says «Тебе додали до групи» with the group title and links to the group', async () => {
    const added: InboxItem = { id: 'g1', at: '2026-11-22T11:00:00.000Z', read: false, kind: 'group_added', group: { id: 'abc/1', title: 'Карпатські вечори' } };
    vi.mocked(getInbox).mockResolvedValue({ ok: true, items: [added, reply], unread: 1 });
    open();
    const card = (await screen.findByText('Тебе додали до групи «Карпатські вечори»')).closest('li') as HTMLElement;
    expect(card.classList.contains('is-new')).toBe(true);
    expect(within(card).getByText('Від адміністрації')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Відкрити групу' }).getAttribute('href')).toBe('/profile/groups/abc%2F1');
  });
});
