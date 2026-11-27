// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendChallenge, SentChallenge } from '@quiz/shared';
import { forgetAccount } from '../useAccount';
import { listFriendChallenges, listSentChallenges, me } from '../api';
import { MyChallenges } from './MyChallenges';

vi.mock('../api', () => ({ me: vi.fn(), listSentChallenges: vi.fn(), listFriendChallenges: vi.fn() }));

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000 - 60_000).toISOString();
const sent = (over: Partial<SentChallenge>): SentChallenge => ({
  code: 'abcdefghjkmn',
  title: 'Географія',
  expiresAt: inDays(5),
  endedAt: null,
  active: true,
  played: 2,
  best: { nickname: 'Тарас', score: 2400 },
  ...over,
});
const fromFriend: FriendChallenge = { code: 'nmkjhgfedcba', title: 'Кіно', author: { id: 'u2', nickname: 'Оля' }, expiresAt: inDays(3) };

beforeEach(() => {
  forgetAccount();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(listSentChallenges).mockResolvedValue({ ok: true, data: [sent({}), sent({ code: 'pqrstuvwxyz2', title: 'Музика', active: false, played: 0, best: null })] });
  vi.mocked(listFriendChallenges).mockResolvedValue({ ok: true, data: [fromFriend] });
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/history/challenges']}>
      <Routes>
        <Route path="/history/challenges" element={<MyChallenges />} />
      </Routes>
    </MemoryRouter>,
  );

const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;

describe('MyChallenges (79)', () => {
  it('is the third history tab with its own heading', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Мої виклики' })).toBeTruthy();
    const tabs = within(screen.getByRole('navigation', { name: 'Історія' })).getAllByRole('link');
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual(['/history', '/me', '/history/challenges']);
    expect(tabs[2]!.getAttribute('aria-current')).toBe('page');
  });

  it('lists the challenges I sent with days left or ended, attempts, the best score and the table link', async () => {
    open();
    await screen.findByRole('heading', { level: 3, name: 'Географія' });
    const items = [...section('Надіслані').querySelectorAll('li')];
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('лишилося 5 днів');
    expect(items[0]!.textContent).toContain('зіграли 2 людини');
    expect(items[0]!.textContent).toContain('Найкраще: Тарас — 2400');
    expect(within(items[0]!).getByRole('link', { name: 'Таблиця' }).getAttribute('href')).toBe('/challenge/abcdefghjkmn');
    expect(items[1]!.textContent).toContain('Виклик завершено.');
    expect(items[1]!.textContent).not.toContain('Найкраще');
  });

  it('lists the challenges from friends with «Прийняти виклик»', async () => {
    open();
    await screen.findByRole('heading', { level: 3, name: 'Кіно' });
    const friends = section('Від друзів');
    expect(friends.textContent).toContain('від Оля');
    expect(within(friends).getByRole('link', { name: 'Прийняти виклик' }).getAttribute('href')).toBe('/challenge/nmkjhgfedcba');
  });

  it('empty lists explain where challenges come from', async () => {
    vi.mocked(listSentChallenges).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(listFriendChallenges).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText(/Ти ще не надсилав\(-ла\) викликів/)).toBeTruthy();
    expect(within(section('Надіслані')).getByRole('link', { name: 'Вікторини' }).getAttribute('href')).toBe('/quizzes');
    expect(screen.getByText('Нових викликів від друзів немає.')).toBeTruthy();
  });

  it('a failed list offers a retry', async () => {
    vi.mocked(listSentChallenges).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    expect(await screen.findByRole('button', { name: 'Спробувати ще раз' })).toBeTruthy();
  });
});
