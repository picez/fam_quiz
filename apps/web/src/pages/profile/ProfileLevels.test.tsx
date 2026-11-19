// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, LEVEL_REWARDS, LEVEL_REWARDS_TOP, levelProgress, xpForLevel, type OwnProfile } from '@quiz/shared';
import { getMyProfile, me } from '../../api';
import { loadNickFont } from '../../nick-fonts';
import { forgetAccount } from '../../useAccount';
import { forgetMyProfile } from '../../profile/useMyProfile';
import { ProfileLevels } from './ProfileLevels';

vi.mock('../../api', () => ({ me: vi.fn(), getMyProfile: vi.fn() }));
vi.mock('../../nick-fonts', () => ({ loadNickFont: vi.fn(() => Promise.resolve()), useNickFont: vi.fn() }));

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
    // Без повтору «з рівня 13» під заголовком «Рівень 13»: замок із назвою для читача з екрана.
    expect(within(future).queryByText(/з рівня/)).toBeNull();
    expect(within(future).getByRole('img', { name: 'Ще закрито' })).toBeTruthy();
    expect(current.querySelector('.level-row-lock')).toBeNull();
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

  it('above the map the last row is «you are here» and the next level is the real one', async () => {
    const top = levelProgress(xpForLevel(43) + 5);
    vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { ...mine, level: { ...mine.level, progress: top } } as OwnProfile });
    await open();
    const all = rows();
    expect(all.filter((row) => row.classList.contains('is-current'))).toEqual([all[LEVEL_REWARDS_TOP - 1]]);
    expect(within(all[LEVEL_REWARDS_TOP - 1]!).getByText('Ви тут')).toBeTruthy();
    expect(within(all[LEVEL_REWARDS_TOP - 1]!).getByText(/до рівня 44$/)).toBeTruthy();
    expect(all.some((row) => row.classList.contains('is-future'))).toBe(false);
  });

  it('the number to the next level goes through num, like the xp card', async () => {
    const big = { ...progress, xp: 1000, levelAt: 0, nextAt: 2240 };
    vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { ...mine, level: { ...mine.level, progress: big } } as OwnProfile });
    await open();
    expect(document.querySelector('.level-row.is-current .level-row-next')?.textContent).toBe('Ще 1240 досвіду до рівня 13');
  });

  it('every nick font on the map is loaded, the future ones too', async () => {
    await open();
    const fonts = LEVEL_REWARDS.filter((row) => row.reward.kind === 'font').map((row) => (row.reward as { id: string }).id);
    expect(fonts.length).toBeGreaterThan(0);
    for (const id of fonts) expect(vi.mocked(loadNickFont)).toHaveBeenCalledWith(id);
  });

  it('nick looks are drawn on a two-letter sample, not on the long name', async () => {
    await open();
    const colour = LEVEL_REWARDS.find((row) => row.reward.kind === 'color')!;
    const art = rows()[colour.level - 1]!.querySelector('.reward-art')!;
    expect(art.querySelector('.nick-name')?.textContent).toBe('Ол');
    const photo = LEVEL_REWARDS.find((row) => row.reward.kind === 'photo');
    if (photo !== undefined) expect(rows()[photo.level - 1]!.querySelector('.reward-art .avatar-small')).toBeTruthy();
  });

  it('shows the level bar on top without the link to itself', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'Рівень 12', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Усі нагороди/ })).toBeNull();
  });
});
