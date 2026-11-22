// @vitest-environment jsdom
import type { AdminMetricBucket, AdminMetricPeriod, AdminMetrics as Metrics, AdminMetricsSummary } from '@quiz/shared';
import type { JSX } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatDay } from '../format';
import { AdminMetrics, periodFrom } from './AdminMetrics';
import { adminMetrics } from './admin-api';

vi.mock('./admin-api', () => ({ adminMetrics: vi.fn() }));

const dayOf = (n: number) => new Date(Date.UTC(2026, 9, 21 + n)).toISOString().slice(0, 10);
const bucket = (n: number, days = 1): AdminMetricBucket => ({
  start: days === 7 ? new Date(Date.UTC(2026, 10, 17 - 7 * (51 - n))).toISOString().slice(0, 10) : dayOf(n),
  days,
  active: n,
  players: n,
  games: n === 0 ? 0 : n + 1,
  finished: n,
  aborted: 0,
  hosted: n % 2,
  autopilot: n % 3 === 0 ? 0 : 1,
  bot: n === 5 ? 2 : 0,
  completion: n === 0 ? null : 50,
  returns: n < 7 ? null : 40,
  avgPlayers: n === 0 ? null : 2.5,
  gameMin: n * 10,
  playerMin: n * 25,
  newUsers: n % 4 === 0 ? 1 : 0,
  newQuizzes: n % 5 === 0 ? 1 : 0,
  editorMin: n * 3,
});

const summary = (over: Partial<AdminMetricsSummary> = {}): AdminMetricsSummary => ({
  games: 12,
  finished: 10,
  completion: 83.3,
  avgPlayers: 2.5,
  medianGameMin: 80,
  avgGameMin: 75,
  gameHours: 12.5,
  playerHours: 31,
  hosted: 6,
  autopilot: 4,
  bot: 2,
  newUsers: 3,
  activation: 66.7,
  dau: 1.5,
  wau: 4,
  mau: 6,
  stickiness: 25,
  editorHours: 2.5,
  editorSessions: 5,
  editorSessionMin: 30,
  editors: 2,
  newQuizzes: 1,
  ...over,
});

function metrics(period: AdminMetricPeriod = 30, over: Partial<Metrics> = {}): Metrics {
  const week = period === 365;
  return {
    period,
    bucket: week ? 'week' : 'day',
    buckets: Array.from({ length: week ? 52 : period }, (_, n) => bucket(n, week ? 7 : 1)),
    summary: summary(),
    previous: summary({ games: 10 }),
    trackedSince: '2026-11-20',
    topQuizzes: [
      { id: 'q1', title: 'Карпати', author: 'Оля', games: 6, avgPlayers: 3, avgMin: 42 },
      { id: 'q2', title: 'Море', author: '', games: 2, avgPlayers: null, avgMin: null },
    ],
    roundTypes: [
      { type: 'classic', games: 8 },
      { type: 'blitz', games: 2 },
    ],
    questionTypes: [{ type: 'single', plays: 40 }],
    questionTypesGames: 10,
    hours: Array.from({ length: 24 }, (_, h) => (h === 19 ? 5 : h === 9 ? 1 : 0)),
    topEditors: [{ userId: 'u1', nickname: 'Оля', minutes: 80, sessions: 3 }],
    computedAt: '2026-11-19T09:55:00.000Z',
    ...over,
  };
}

function Where(): JSX.Element {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function Back(): JSX.Element {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      back
    </button>
  );
}

const show = (path = '/admin') =>
  render(
    <MemoryRouter initialEntries={['/start', path]} initialIndex={1}>
      <AdminMetrics />
      <Where />
      <Back />
    </MemoryRouter>,
  );

const tile = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!;
const cardTitles = () => [...document.querySelectorAll('.admin-metric-charts figure.chart-card h3')].map((h) => h.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminMetrics).mockImplementation(async (period) => ({ ok: true, data: metrics(period) }));
});
afterEach(cleanup);

describe('periodFrom', () => {
  it('accepts only the known periods', () => {
    expect(periodFrom('7')).toBe(7);
    expect(periodFrom('365')).toBe(365);
    expect(periodFrom('5')).toBe(30);
    expect(periodFrom(null)).toBe(30);
  });
});

describe('AdminMetrics', () => {
  it('reads 30 days by default and switches the period in the address', async () => {
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(adminMetrics).toHaveBeenCalledWith(30);
    expect((screen.getByRole('radio', { name: '30 днів' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('group', { name: 'Період' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '7 днів' }));
    expect(screen.getByTestId('where').textContent).toBe('/admin?period=7');
    expect(adminMetrics).toHaveBeenLastCalledWith(7);
    // Поки читається новий період, видно попередні числа (приглушені) і рядок «Завантажуємо…».
    expect(document.querySelector('.admin-metrics-loading[role="status"]')!.textContent).toBe('Завантажуємо…');
    expect(tile('Ігор')).toBeTruthy();
    expect(document.querySelector('.admin-metrics-body.is-loading')).not.toBeNull();
    await act(async () => {});
    expect(screen.queryByText('Завантажуємо…')).toBeNull();
    expect(document.querySelector('.admin-metrics-body.is-loading')).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Активні гравці (акаунти, що зіграли гру)' })[0]!.closest('figure')!.querySelectorAll('table.sr-only tbody tr')).toHaveLength(7);
    // Перемикач заміняє запис історії: «Назад» веде туди, звідки прийшли, а не на попередній період.
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByTestId('where').textContent).toBe('/start');
  });

  it('opens a year from the address with week labels, and falls back to 30 days for an unknown period', async () => {
    const year = show('/admin?period=365');
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(adminMetrics).toHaveBeenCalledWith(365);
    expect((screen.getByRole('radio', { name: 'Рік' }) as HTMLInputElement).checked).toBe(true);
    const games = screen.getByRole('img', { name: 'Ігор за день' });
    expect(within(games).getByText('з 17 лист.')).toBeTruthy();
    year.unmount();
    show('/admin?period=5');
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(adminMetrics).toHaveBeenLastCalledWith(30);
  });

  it('shows KPI tiles with the change to the previous period', async () => {
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(within(tile('Ігор')).getByText('12')).toBeTruthy();
    expect(tile('Ігор').querySelector('.admin-kpi-delta')!.textContent).toBe('▲ більше на 20 % до попереднього періоду');
    expect(tile('Ігор').querySelector('.admin-kpi-delta [aria-hidden="true"]')!.textContent).toBe('▲ ');
    expect(within(tile('Типова гра (медіана)')).getByText('1 год 20 хв')).toBeTruthy();
    expect(within(tile('Гравців у грі')).getByText('2,5')).toBeTruthy();
    expect(tile('Гравців у грі').querySelector('.admin-kpi-delta')!.textContent).toBe('як у попередньому періоді');
    expect([...document.querySelectorAll('.admin-kpis dt')].map((dt) => dt.textContent)).toEqual([
      'Ігор',
      'Дограно до кінця',
      'Гравців у грі',
      'Типова гра (медіана)',
      'Годин у грі',
      'Людино-годин у грі',
      'Нових акаунтів',
      'Зіграли за 7 днів після реєстрації',
      'Активних за день (сер.)',
      'Активних за 7 днів',
      'Активних за 30 днів',
      'Залученість (день / 30 днів)',
      'Годин у редакторі',
      'Сесій редагування',
      'Середня сесія редагування',
      'Людей у редакторі',
      'Нових вікторин',
      'Ігор Квіз-бота',
    ]);
  });

  it('shows the change of a share in percentage points, not a relative percent', async () => {
    vi.mocked(adminMetrics).mockResolvedValue({ ok: true, data: metrics(30, { summary: summary({ completion: 60 }), previous: summary({ completion: 50 }) }) });
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(tile('Дограно до кінця').querySelector('.admin-kpi-delta')!.textContent).toBe('▲ більше на 10 п.п. до попереднього періоду');
  });

  it('heads the tables by day, by week for a year and by hour for the hours chart', async () => {
    const year = show('/admin?period=365');
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(within(screen.getByRole('table', { name: 'Ігор за день' })).getAllByRole('columnheader')[0]!.textContent).toBe('Тиждень');
    year.unmount();
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(within(screen.getByRole('table', { name: 'Ігор за день' })).getAllByRole('columnheader')[0]!.textContent).toBe('День');
    const hours = document.querySelector('.admin-metric-charts figure.chart-card:last-child table')!;
    expect(hours.querySelector('th')!.textContent).toBe('Година');
  });

  it('says there is nothing to compare with and shows a dash for unknown values', async () => {
    vi.mocked(adminMetrics).mockResolvedValue({ ok: true, data: metrics(30, { previous: null, summary: summary({ completion: null }) }) });
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(tile('Ігор').querySelector('.admin-kpi-delta')!.textContent).toBe('немає з чим порівняти');
    expect(within(tile('Дограно до кінця')).getByText('—')).toBeTruthy();
  });

  it('draws the charts in the agreed order, with the stacked host chart and the since hints', async () => {
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    expect(cardTitles()).toEqual([
      'Активні акаунти (заходили на сайт)',
      'Активні гравці (акаунти, що зіграли гру)',
      'Ігор за день',
      'Ігри за ведучим',
      'Дограно до кінця, %',
      'Повернення, %',
      'Гравців у грі, у середньому',
      'Час у грі, хв',
      'Нові реєстрації',
      'Час у редакторі вікторин, хв',
      'Нові вікторини',
      'Коли починають ігри (година за Києвом)',
    ]);
    const host = screen.getByRole('heading', { name: 'Ігри за ведучим' }).closest('figure')!;
    expect([...host.querySelectorAll('.chart-legend li')].map((li) => li.textContent!.split(' — ')[0])).toEqual(['Ведучий-людина', 'Автопілот', 'Квіз-бот']);
    const since = `Збирається з ${formatDay('2026-11-20T12:00:00Z')}; раніших даних немає.`;
    expect(within(screen.getByRole('heading', { name: 'Активні акаунти (заходили на сайт)' }).closest('figure')!).getByText(since)).toBeTruthy();
    expect(within(screen.getByRole('heading', { name: 'Час у редакторі вікторин, хв' }).closest('figure')!).getByText(new RegExp(since.replace(/[.()]/g, '\\$&')))).toBeTruthy();
    const hours = screen.getByRole('img', { name: 'Коли починають ігри (година за Києвом)' });
    expect(hours.querySelectorAll('.chart-bar')).toHaveLength(2);
    expect(screen.getByText(`Пораховано ${formatDate('2026-11-19T09:55:00.000Z')}; оновлюється раз на 10 хв.`)).toBeTruthy();
  });

  it('keeps the four former 30-day charts with the same titles and values', async () => {
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    const chart = (name: string) => screen.getByRole('img', { name }).closest('figure')!;
    // День із нулем — без стовпчика, але в таблиці лишається «0».
    expect(chart('Активні гравці (акаунти, що зіграли гру)').querySelectorAll('rect.chart-bar')).toHaveLength(29);
    expect(chart('Ігор за день').querySelectorAll('rect.chart-bar')).toHaveLength(29);
    expect(chart('Дограно до кінця, %').querySelectorAll('rect.chart-bar')).toHaveLength(29);
    expect(chart('Повернення, %').querySelectorAll('rect.chart-bar')).toHaveLength(23);
    expect(screen.getByText('Частка тих, хто грав 8–14 днів тому й зіграв знову за останні 7 днів.')).toBeTruthy();
    const completion = within(screen.getByRole('table', { name: 'Дограно до кінця, %' })).getAllByRole('row').slice(1);
    expect(completion).toHaveLength(30);
    expect(within(completion[0]!).getAllByRole('cell')[1]!.textContent).toBe('—');
    expect(within(completion[1]!).getAllByRole('cell')[1]!.textContent).toBe('50');
    const players = within(screen.getByRole('table', { name: 'Активні гравці (акаунти, що зіграли гру)' })).getAllByRole('row').slice(1);
    expect(within(players[0]!).getAllByRole('cell')[1]!.textContent).toBe('0');
    expect(within(players[29]!).getAllByRole('cell')[1]!.textContent).toBe('29');
  });

  it('lists top quizzes, round and question types and editors with links', async () => {
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    const card = (name: string) => screen.getByRole('heading', { name }).closest('figure')!;
    const quizzes = card('Найпопулярніші вікторини за період');
    expect(within(quizzes).getByRole('link', { name: 'Карпати' }).getAttribute('href')).toBe('/admin/quizzes/q1');
    expect(within(quizzes).getByText('Оля · гравців у середньому 3 · 42 хв')).toBeTruthy();
    const rounds = card('Типи раундів у дограних іграх');
    expect([...rounds.querySelectorAll('.hbar-name')].map((n) => n.textContent)).toEqual(['Класичний', 'Бліц']);
    const questions = card('Типи зіграних запитань');
    expect(within(questions).getByText('Один правильний варіант')).toBeTruthy();
    expect(within(questions).getByText('Пораховано з 10 останніх дограних ігор.')).toBeTruthy();
    const editors = card('Хто найбільше працював у редакторі');
    expect(within(editors).getByRole('link', { name: 'Оля' }).getAttribute('href')).toBe('/admin/users/u1');
    expect(within(editors).getByText('1 год 20 хв')).toBeTruthy();
    expect(within(editors).getByText('сесій: 3')).toBeTruthy();
  });

  it('opens a chart in the dialog with the period caption', async () => {
    show();
    await screen.findByText('Ігор', { selector: 'dt' });
    fireEvent.click(screen.getByRole('button', { name: 'Розгорнути «Ігри за ведучим»' }));
    const dialog = screen.getByRole('dialog', { name: 'Ігри за ведучим' });
    expect(within(dialog).getByText('30 днів')).toBeTruthy();
    expect(within(dialog).getByRole('img', { name: 'Ігри за ведучим' })).toBeTruthy();
  });

  it('shows the retry button when loading fails', async () => {
    vi.mocked(adminMetrics).mockResolvedValue({ ok: false, error: 'offline' });
    show();
    const retry = await screen.findByRole('button', { name: 'Спробувати ще' });
    vi.mocked(adminMetrics).mockResolvedValue({ ok: true, data: metrics() });
    fireEvent.click(retry);
    expect(await screen.findByText('Ігор', { selector: 'dt' })).toBeTruthy();
  });
});
