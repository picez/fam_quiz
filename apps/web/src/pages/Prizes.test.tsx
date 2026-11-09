// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ACHIEVEMENTS, levelProgress, type OwnProfile, type PrizeContent, type PrizeItem } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePrize, getMyProfile, getShowcasePins, me, myPrizes, pinToShowcase } from '../api';
import { Prizes } from './Prizes';

vi.mock('../api', () => ({
  me: vi.fn(),
  getMyProfile: vi.fn(),
  myPrizes: vi.fn(),
  createPrize: vi.fn(),
  updatePrize: vi.fn(),
  deletePrize: vi.fn(),
  getShowcasePins: vi.fn(),
  pinToShowcase: vi.fn(),
  unpinFromShowcase: vi.fn(),
}));
vi.mock('../trophy/loadEngine', () => ({ loadTrophyEngine: vi.fn(async () => null), webglAvailable: () => false }));

const content = (name: string, over: Partial<PrizeContent> = {}): PrizeContent => ({
  name,
  trophy: null,
  engraving: null,
  real: null,
  title: null,
  diploma: true,
  ...over,
});
const item = (id: string, name: string, over: Partial<PrizeItem> = {}): PrizeItem => ({
  id,
  content: content(name),
  status: 'free',
  createdAt: '2026-11-01T10:00:00.000Z',
  ...over,
});

const profile: OwnProfile = {
  id: 'u1',
  nickname: 'Олена',
  avatar: null,
  email: 'o@example.com',
  stats: { games: 0, wins: 0, accuracy: null, quizzes: 0, hosted: 0, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null },
  achievements: ACHIEVEMENTS.map((id) => ({ id, earned: false, earnedAt: null })),
  quizzes: [],
  wins: [],
  friends: [],
  showcase: { title: null, awards: [], pins: { prizes: [], achievements: [] } },
  level: { progress: levelProgress(0), unlocked: [], next: [], looks: { color: null, frame: null, badge: null, photo: null, font: null } },
  likes: { author: 0, host: 0, player: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: profile });
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(myPrizes).mockResolvedValue({ ok: true, data: [item('p1', 'Кубок року'), item('p2', 'Піца', { status: 'reserved' })] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const open = () =>
  render(
    <MemoryRouter initialEntries={['/prizes']}>
      <Routes>
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

describe('Prizes', () => {
  it('is the profile sub-page «Призи» with the won awards above the store', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Призи' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад' }).getAttribute('href')).toBe('/profile');
    expect(await screen.findByText('Нагород поки немає — їх вручають у іграх із призами.')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Нагороди', 'Мої призи']);
  });

  it('shows the won awards', async () => {
    vi.mocked(getMyProfile).mockResolvedValue({
      ok: true,
      data: {
        ...profile,
        showcase: {
          title: null,
          pins: { prizes: [], achievements: [] },
          awards: [{ id: 'a1', place: 1, quizTitle: 'Столиці', nickname: 'Олена', awardedAt: '2026-10-30T10:00:00.000Z', content: { trophy: null, engraving: null, real: { text: 'Піца', photoUrl: null }, title: null, diploma: false } }],
        },
      },
    });
    open();
    expect(await screen.findByText('🎁 Піца')).toBeTruthy();
    expect(screen.queryByText('Нагород поки немає — їх вручають у іграх із призами.')).toBeNull();
  });

  it('a won award has «📌 На вітрину»; a tap pins it and the button turns into «Прибрати з вітрини»', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    vi.mocked(getMyProfile).mockResolvedValue({
      ok: true,
      data: {
        ...profile,
        showcase: {
          title: null,
          pins: { prizes: [], achievements: [] },
          awards: [{ id, place: 1, quizTitle: 'Столиці', nickname: 'Олена', awardedAt: '2026-10-30T10:00:00.000Z', content: { trophy: null, engraving: null, real: { text: 'Піца', photoUrl: null }, title: null, diploma: false } }],
        },
      },
    });
    vi.mocked(pinToShowcase).mockResolvedValue({ ok: true, data: { prizes: [id], achievements: [] } });
    open();
    const pin = await screen.findByRole('button', { name: /^📌 На вітрину: / });
    expect(pin.hasAttribute('aria-pressed')).toBe(false);
    expect(pin.textContent).toBe('📌 На вітрину');
    fireEvent.click(pin);
    await waitFor(() => expect(pinToShowcase).toHaveBeenCalledWith({ kind: 'prize', id }));
    const unpin = await screen.findByRole('button', { name: /^📌 Прибрати з вітрини: / });
    expect(unpin.hasAttribute('aria-pressed')).toBe(false);
    expect(getShowcasePins).not.toHaveBeenCalled();
  });

  it('a refused pin says why above the awards', async () => {
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
    const card = (id: string) => ({ id, place: 1 as const, quizTitle: 'Столиці', nickname: 'Олена', awardedAt: '2026-10-30T10:00:00.000Z', content: { trophy: null, engraving: null, real: { text: 'Піца', photoUrl: null }, title: null, diploma: false } });
    vi.mocked(getMyProfile).mockResolvedValue({
      ok: true,
      data: { ...profile, showcase: { title: null, pins: { prizes: ids.slice(0, 3), achievements: [] }, awards: ids.map(card) } },
    });
    open();
    const buttons = await screen.findAllByRole('button', { name: /^📌 / });
    fireEvent.click(buttons[3]!);
    expect((await screen.findByRole('status')).textContent).toBe('На вітрині вже 3 кубки — спершу прибери один.');
    expect(pinToShowcase).not.toHaveBeenCalled();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('lists prizes; a reserved one says it is in a game', async () => {
    open();
    expect(await screen.findByText('Кубок року')).toBeTruthy();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).not.toContain('У грі');
    expect(cards[1]!.textContent).toContain('У грі');
  });

  it('reserved prize is viewed, not edited', async () => {
    open();
    await screen.findByText('Кубок року');
    const [free, reserved] = screen.getAllByRole('listitem');
    expect(within(free!).getByRole('button', { name: 'Змінити' })).toBeTruthy();
    expect(within(free!).queryByRole('button', { name: 'Переглянути' })).toBeNull();
    expect(within(reserved!).queryByRole('button', { name: 'Змінити' })).toBeNull();
    fireEvent.click(within(reserved!).getByRole('button', { name: 'Переглянути' }));
    expect(screen.getByTestId('where').textContent).toBe('/profile/prizes/p2');
  });

  it('a prize reserved by a saved game says so', async () => {
    vi.mocked(myPrizes).mockResolvedValue({ ok: true, data: [item('p2', 'Піца', { status: 'reserved', inSavedGame: true })] });
    open();
    await screen.findByText('Піца');
    expect(screen.getByText('У збереженій грі')).toBeTruthy();
    expect(screen.queryByText('У грі')).toBeNull();
  });

  it('shows the empty text', async () => {
    vi.mocked(myPrizes).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText('Призів ще немає. Створи перший — і клади його на місця в лобі.')).toBeTruthy();
  });

  it('delete asks first, then removes the card', async () => {
    vi.mocked(deletePrize).mockResolvedValue({ ok: true });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити' })[0]!);
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Кубок року')).toBeNull());
    expect(deletePrize).toHaveBeenCalledWith('p1');
  });

  it('a refused delete shows the error and keeps the card', async () => {
    vi.mocked(deletePrize).mockResolvedValue({ ok: false, error: 'prize_in_game' });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити' })[0]!);
    expect((await screen.findByRole('alert')).textContent).toBe('Приз лежить у грі — зніми його з місця, щоб змінити.');
    expect(screen.getByText('Кубок року')).toBeTruthy();
  });

  it('new opens the studio', async () => {
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getByRole('button', { name: 'Новий приз' }));
    expect(screen.getByTestId('where').textContent).toBe('/profile/prizes/new');
  });

  it('edit opens the studio', async () => {
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getByRole('button', { name: 'Змінити' }));
    expect(screen.getByTestId('where').textContent).toBe('/profile/prizes/p1');
  });
});
