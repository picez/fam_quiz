// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_INFO, type AchievementCard, type AchievementsPage } from '@quiz/shared';
import { getAchievements, getMyAchievements, getShowcasePins, me, pinToShowcase, setHideAnti } from '../api';
import { errorText } from '../i18n';
import { formatDay } from '../format';
import { Achievements } from './Achievements';

vi.mock('../api', () => ({ me: vi.fn(), getMyAchievements: vi.fn(), getAchievements: vi.fn(), getShowcasePins: vi.fn(), pinToShowcase: vi.fn(), unpinFromShowcase: vi.fn(), setHideAnti: vi.fn() }));

const EARNED: Record<string, string | null> = { fast_answer: '2026-10-29T10:00:00.000Z', first_game: null };

const card = (id: AchievementCard['id'], own: boolean): AchievementCard => {
  const goal = ACHIEVEMENT_INFO[id].goal;
  const earned = id in EARNED;
  return {
    id,
    earned,
    earnedAt: earned ? (EARNED[id] ?? null) : null,
    progress: own && goal !== null ? { current: id === 'games_10' ? 1 : 0, goal } : null,
  };
};

const mine: AchievementsPage = {
  profile: { id: 'u1', nickname: 'Олена', avatar: null },
  own: true,
  earned: 2,
  total: 71,
  items: ACHIEVEMENTS.map((id) => card(id, true)),
};

const theirs: AchievementsPage = {
  profile: { id: 'u2', nickname: 'Оля', avatar: null },
  own: false,
  earned: 2,
  total: 71,
  items: ACHIEVEMENTS.filter((id) => id in EARNED).map((id) => card(id, false)),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getMyAchievements).mockResolvedValue({ ok: true, data: mine });
  vi.mocked(getAchievements).mockResolvedValue({ ok: true, data: theirs });
  vi.mocked(getShowcasePins).mockResolvedValue({ ok: true, data: { prizes: [], achievements: ['first_game'] } });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p>{`на ${location.pathname}${location.search}`}</p>;
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/profile/:id/achievements" element={<Achievements />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

/** Картка за назвою; заголовок закритої ще й каже читачеві екрана «ще не отримано». */
const cardOf = (name: string) => screen.getByRole('heading', { level: 3, name: new RegExp(`^${name}(, ще не отримано)?$`) }).closest('li') as HTMLElement;

describe('Achievements, own page', () => {
  it('shows the count and the groups in order, the anti group last (12j)', async () => {
    const { container } = open('/achievements');
    expect(await screen.findByText('Отримано 2 з 71')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Досягнення' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Перші кроки',
      'Влучність',
      'Швидкість',
      'Формати',
      'Бафи й дебафи',
      'Компанія',
      'Ведення й авторство',
      'Антидосягнення',
    ]);
    expect(container.querySelectorAll('.achievement-card')).toHaveLength(71);
    expect(getMyAchievements).toHaveBeenCalled();
  });

  it('an earned card has its joke, the condition and the date', async () => {
    open('/achievements');
    await screen.findByText('Отримано 2 з 71');
    const fast = cardOf('Швидкі пальці');
    expect(fast.classList.contains('is-locked')).toBe(false);
    expect(within(fast).getByRole('heading', { level: 3 }).textContent).toBe('Швидкі пальці');
    expect(within(fast).getByText('Відповідь є, а запитання ще не дочитане. Сміливо!')).toBeTruthy();
    expect(within(fast).getByText('Правильна відповідь швидше ніж за 2 с')).toBeTruthy();
    expect(within(fast).getByText(`Отримано ${formatDay('2026-10-29T10:00:00.000Z')}`)).toBeTruthy();
    expect(within(fast).getByText('Отримано 29 жовтня 2026')).toBeTruthy();
    expect(within(cardOf('Перша гра')).getByText('Отримано давно')).toBeTruthy();
  });

  it('a locked counted card is grey with its progress, a locked one-off has none', async () => {
    open('/achievements');
    await screen.findByText('Отримано 2 з 71');
    const games = cardOf('10 ігор');
    expect(games.classList.contains('is-locked')).toBe(true);
    // Назву картки не підмінено: «ще не отримано» — прихований текст у заголовку.
    expect(games.hasAttribute('aria-label')).toBe(false);
    expect(within(games).getByRole('heading', { level: 3 }).textContent).toBe('10 ігор, ще не отримано');
    expect(within(games).getByText(', ще не отримано').classList.contains('sr-only')).toBe(true);
    const bar = games.querySelector('progress');
    expect(bar?.getAttribute('value')).toBe('1');
    expect(bar?.getAttribute('max')).toBe('10');
    expect(within(games).getByText('1 / 10')).toBeTruthy();
    expect(within(games).queryByText(/Отримано/)).toBeNull();
    const sniper = cardOf('Снайперська точність');
    expect(sniper.classList.contains('is-locked')).toBe(true);
    expect(sniper.querySelector('progress')).toBeNull();
  });

  it('only earned cards have the 📌 button; a tap pins the achievement', async () => {
    vi.mocked(pinToShowcase).mockResolvedValue({ ok: true, data: { prizes: [], achievements: ['first_game', 'fast_answer'] } });
    open('/achievements');
    await screen.findByText('Отримано 2 з 71');
    expect(within(cardOf('10 ігор')).queryByRole('button')).toBeNull();
    const first = await within(cardOf('Перша гра')).findByRole('button', { name: '📌 Прибрати з вітрини: Перша гра' });
    expect(first.hasAttribute('aria-pressed')).toBe(false);
    const fast = within(cardOf('Швидкі пальці')).getByRole('button', { name: '📌 На вітрину: Швидкі пальці' });
    expect(fast.hasAttribute('aria-pressed')).toBe(false);
    expect(screen.getAllByRole('button', { name: /^📌 / })).toHaveLength(2);
    fireEvent.click(fast);
    await waitFor(() => expect(pinToShowcase).toHaveBeenCalledWith({ kind: 'achievement', id: 'fast_answer' }));
    expect(await within(cardOf('Швидкі пальці')).findByRole('button', { name: '📌 Прибрати з вітрини: Швидкі пальці' })).toBeTruthy();
  });

  it('a visitor goes to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/achievements');
    expect(await screen.findByText('на /login?next=%2Fachievements')).toBeTruthy();
  });

  it('an ended session goes to sign in too', async () => {
    vi.mocked(getMyAchievements).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/achievements');
    expect(await screen.findByText('на /login?next=%2Fachievements')).toBeTruthy();
  });
});

describe('Achievements, another player', () => {
  it('shows the name linked to the profile and only earned cards without progress', async () => {
    const { container } = open('/profile/u2/achievements');
    const title = await screen.findByRole('heading', { level: 1, name: 'Досягнення: Оля' });
    expect(within(title).getByRole('link', { name: 'Оля' }).getAttribute('href')).toBe('/profile/u2');
    expect(getAchievements).toHaveBeenCalledWith('u2');
    expect(container.querySelectorAll('.achievement-card')).toHaveLength(2);
    expect(container.querySelectorAll('.is-locked')).toHaveLength(0);
    expect(container.querySelector('progress')).toBeNull();
  });

  it('shows no title while loading, so «Досягнення» never flashes before «Досягнення: Оля»', async () => {
    let finish: (value: Awaited<ReturnType<typeof getAchievements>>) => void = () => undefined;
    vi.mocked(getAchievements).mockReturnValue(new Promise((done) => (finish = done)));
    open('/profile/u2/achievements');
    expect(await screen.findByText('Завантажуємо…')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('link', { name: 'Назад' }).getAttribute('href')).toBe('/profile/u2');
    finish({ ok: true, data: theirs });
    await screen.findByRole('heading', { level: 1, name: 'Досягнення: Оля' });
  });

  it('has no 📌 buttons and does not ask for pins', async () => {
    open('/profile/u2/achievements');
    await screen.findByRole('heading', { level: 1, name: 'Досягнення: Оля' });
    expect(screen.queryByRole('button', { name: /📌/ })).toBeNull();
    expect(getShowcasePins).not.toHaveBeenCalled();
  });

  it('opens for a visitor without an account', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/profile/u2/achievements');
    expect(await screen.findByRole('heading', { level: 1, name: 'Досягнення: Оля' })).toBeTruthy();
  });

  it('says so when nothing is earned yet', async () => {
    vi.mocked(getAchievements).mockResolvedValue({ ok: true, data: { ...theirs, earned: 0, items: [] } });
    open('/profile/u2/achievements');
    expect(await screen.findByText('Ще жодного досягнення. Усе попереду!')).toBeTruthy();
  });

  it('an unknown profile is not found', async () => {
    vi.mocked(getAchievements).mockResolvedValue({ ok: false, error: 'not_found' });
    open('/profile/nobody/achievements');
    expect(await screen.findByText('Такого профілю немає.')).toBeTruthy();
  });
});

describe('Achievements, styles', () => {
  const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
  const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
  /** Тіло першого правила з точно цим селектором у styles.css; немає — null. */
  const rule = (selector: string) => {
    const start = css.indexOf(`\n${selector} {`);
    return start < 0 ? null : css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  };

  it('a locked card greys only its icon: the text keeps its contrast', () => {
    const card = rule('.achievement-card.is-locked') ?? '';
    expect(card).not.toContain('filter');
    expect(card).not.toContain('opacity');
    const icon = rule('.achievement-card.is-locked .achievement-icon');
    expect(icon).toContain('filter: grayscale(1);');
    expect(icon).toContain('opacity');
  });
});

describe('Achievements: the anti group (12j)', () => {
  const withDebt = (own: boolean, hideAnti?: boolean): AchievementsPage => {
    const base = own ? mine : theirs;
    const items = base.items.map((item) => (item.id === 'in_debt' ? { ...item, earned: true, earnedAt: '2026-11-14T10:00:00.000Z', progress: null } : item));
    const page = { ...base, earned: 2, total: 71, items: own ? items : [...items, { id: 'in_debt' as const, earned: true, earnedAt: '2026-11-14T10:00:00.000Z', progress: null }] };
    return hideAnti === undefined ? page : { ...page, hideAnti };
  };

  it('own page: anti cards framed, the switch unchecked; a tap saves at once and says «Збережено»', async () => {
    vi.mocked(getMyAchievements).mockResolvedValue({ ok: true, data: withDebt(true, false) });
    vi.mocked(setHideAnti).mockResolvedValue({ ok: true, data: { hideAnti: true } });
    open('/achievements');
    await screen.findByText('Отримано 2 з 71');
    expect(cardOf('У мінусі').className).toBe('achievement-card is-anti');
    expect(cardOf('Нуль без палички').className).toBe('achievement-card is-locked is-anti');
    expect(cardOf('Перша гра').className).toBe('achievement-card');
    const toggle = screen.getByRole('checkbox', { name: 'Ховати антидосягнення від інших' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(toggle.closest('section')?.querySelector('h2')?.textContent).toBe('Антидосягнення');
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(setHideAnti).toHaveBeenCalledWith(true);
    expect(await screen.findByText('Збережено')).toBeTruthy();
    expect(toggle.checked).toBe(true);
  });

  it('a failed save puts the switch back and says why', async () => {
    vi.mocked(getMyAchievements).mockResolvedValue({ ok: true, data: withDebt(true, false) });
    vi.mocked(setHideAnti).mockResolvedValue({ ok: false, error: 'offline' });
    open('/achievements');
    await screen.findByText('Отримано 2 з 71');
    const toggle = screen.getByRole('checkbox', { name: 'Ховати антидосягнення від інших' }) as HTMLInputElement;
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.checked).toBe(false));
    expect(screen.getByText(errorText('offline'))).toBeTruthy();
  });

  it('someone else’s page has no switch', async () => {
    vi.mocked(getAchievements).mockResolvedValue({ ok: true, data: withDebt(false) });
    open('/profile/u2/achievements');
    await screen.findByText('Отримано 2 з 71');
    expect(cardOf('У мінусі').className).toBe('achievement-card is-anti');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
