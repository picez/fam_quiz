// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, LEVEL_REWARDS, LEVEL_REWARDS_TOP, levelProgress, type OwnProfile } from '@quiz/shared';
import { getMyProfile, me } from '../../api';
import { forgetAccount } from '../../useAccount';
import { forgetMyProfile } from '../../profile/useMyProfile';
import { ProfileLevels } from './ProfileLevels';

vi.mock('../../api', () => ({ me: vi.fn(), getMyProfile: vi.fn() }));

let xp = 0;
while (levelProgress(xp).level < 12) xp += 10;
xp += 5;
const progress = levelProgress(xp);
const rewardLevels = new Set(LEVEL_REWARDS.map((r) => r.level));

const mine = {
  id: 'u1',
  nickname: 'Олена',
  avatar: null,
  level: {
    progress,
    unlocked: [{ level: 2, reward: LEVEL_REWARDS.find((r) => r.level === 2)!.reward, at: '2026-11-04T12:00:00.000Z' }],
    next: [],
    looks: { color: null, frame: null, badge: null, photo: null, font: null, effect: null },
  },
  achievements: ACHIEVEMENTS.map((id) => ({ id, earned: false, earnedAt: null })),
} as unknown as OwnProfile;

beforeEach(() => {
  forgetAccount();
  forgetMyProfile();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: mine });
});
afterEach(cleanup);

const open = async () => {
  const view = render(
    <MemoryRouter initialEntries={['/profile/levels']}>
      <ProfileLevels />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Нагороди за рівні' });
  await waitFor(() => expect(document.querySelector('ol.level-map')).toBeTruthy());
  return view;
};
const rows = () => [...document.querySelectorAll<HTMLElement>('ol.level-map > li')];

describe('ProfileLevels', () => {
  it('lists all levels: opened ones coloured, the current marked, the future silhouettes', async () => {
    await open();
    const all = rows();
    expect(all).toHaveLength(LEVEL_REWARDS_TOP);
    for (const row of all.slice(0, 12)) expect(row.classList.contains('is-future')).toBe(false);
    const current = all[11]!;
    expect(current.classList.contains('is-current')).toBe(true);
    expect(within(current).getByText('Ви тут')).toBeTruthy();
    expect(within(current).getByText(`Ще ${progress.nextAt - progress.xp} досвіду до рівня 13`)).toBeTruthy();
    const future = all[12]!;
    expect(future.classList.contains('is-future')).toBe(true);
    expect(within(future).getByText('з рівня 13')).toBeTruthy();
    expect(future.classList.contains('is-current')).toBe(false);
  });

  it('a level without a reward says it is only experience', async () => {
    const empty = Array.from({ length: LEVEL_REWARDS_TOP }, (_, i) => i + 1).find((n) => !rewardLevels.has(n));
    if (empty === undefined) return;
    await open();
    expect(within(rows()[empty - 1]!).getByText('Лише досвід')).toBeTruthy();
  });

  it('an opened level shows the date it was received', async () => {
    await open();
    expect(within(rows()[1]!).getByText('Отримано 04.11.2026')).toBeTruthy();
  });

  it('shows the level bar on top without the link to itself', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'Рівень 12', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Усі нагороди/ })).toBeNull();
  });
});
