// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ACHIEVEMENTS, levelProgress, type OwnProfile, type PrizeContent, type PrizeItem } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrize, deletePrize, getMyProfile, getShowcasePins, me, myPrizes, pinToShowcase, updatePrize } from '../api';
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
vi.mock('../editor/ImageField', () => ({ ImageField: () => <div /> }));
vi.mock('../trophy/loadViewer', () => ({ loadViewer: vi.fn(async () => false), webglAvailable: () => false }));

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

const open = () =>
  render(
    <MemoryRouter initialEntries={['/prizes']}>
      <Routes>
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
      </Routes>
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

  it('lists prizes; a reserved one says it is in a game and cannot be edited', async () => {
    open();
    expect(await screen.findByText('Кубок року')).toBeTruthy();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).not.toContain('У грі');
    expect(cards[1]!.textContent).toContain('У грі');
    expect(screen.getAllByRole('button', { name: 'Змінити' }).map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true]);
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

  it('deleting the prize open in the editor closes the editor', async () => {
    vi.mocked(deletePrize).mockResolvedValue({ ok: true });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Змінити' })[0]!);
    expect(screen.getByLabelText('Назва')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити' })[0]!);
    await waitFor(() => expect(screen.queryByLabelText('Назва')).toBeNull());
  });

  it('a refused delete shows the error and keeps the card', async () => {
    vi.mocked(deletePrize).mockResolvedValue({ ok: false, error: 'prize_in_game' });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити' })[0]!);
    expect((await screen.findByRole('alert')).textContent).toBe('Приз лежить у грі — зніми його з місця, щоб змінити.');
    expect(screen.getByText('Кубок року')).toBeTruthy();
  });

  it('a new prize goes through the editor to createPrize and joins the list', async () => {
    vi.mocked(createPrize).mockResolvedValue({ ok: true, ...item('p3', 'Новий') });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getByRole('button', { name: 'Новий приз' }));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Новий' } });
    fireEvent.click(screen.getByLabelText('Диплом'));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(createPrize).toHaveBeenCalledWith(content('Новий')));
    expect(await screen.findByText('Новий')).toBeTruthy();
  });

  it('edit saves through updatePrize', async () => {
    vi.mocked(updatePrize).mockResolvedValue({ ok: true, ...item('p1', 'Кубок 2') });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Змінити' })[0]!);
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Кубок 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(updatePrize).toHaveBeenCalledWith('p1', content('Кубок 2')));
    expect(await screen.findByText('Кубок 2')).toBeTruthy();
  });

  it('a save refused with invalid_payload and a reason shows a readable message', async () => {
    vi.mocked(createPrize).mockResolvedValue({ ok: false, error: 'invalid_payload:prize_empty' });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getByRole('button', { name: 'Новий приз' }));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Х' } });
    fireEvent.click(screen.getByLabelText('Диплом'));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toContain('Увімкни хоча б одну опцію.');
  });
});
