// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FEED_POLL_MS } from '@quiz/shared';
import type { CalendarEvent } from '@quiz/shared';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelCalendarEvent,
  createCalendarEvent,
  getCalendar,
  getFeedBadge,
  getPushKey,
  listQuizzes,
  markCalendarSeen,
  me,
  openCalendarGame,
  requestCalendarEvent,
} from '../api';
import { loadHost, loadLastGame } from '../storage';
import { FEED_CHANGED } from '../useFeedBadge';
import { Calendar } from './Calendar';

vi.mock('../api', () => ({
  me: vi.fn(),
  getFeedBadge: vi.fn(),
  getCalendar: vi.fn(),
  markCalendarSeen: vi.fn(),
  listQuizzes: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  cancelCalendarEvent: vi.fn(),
  requestCalendarEvent: vi.fn(),
  withdrawCalendarRequest: vi.fn(),
  decideCalendarRequest: vi.fn(),
  openCalendarGame: vi.fn(),
  getPushKey: vi.fn(async () => ({ ok: true, publicKey: null })),
}));
vi.mock('../push/push-client', () => ({
  browserEnv: vi.fn(() => ({})),
  pushSupport: vi.fn(() => 'supported'),
  currentSubscription: vi.fn(async () => null),
  sameKey: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));
vi.mock('../calendar/calendar-time', async (orig) => ({ ...(await orig<typeof import('../calendar/calendar-time')>()), viewerZone: () => 'Europe/Kyiv' }));

const host = { id: 'h', nickname: 'Іра', avatar: null };
const ev = (id: string, startsAt: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: `Подія ${id}`,
  startsAt,
  host,
  mine: false,
  quiz: { id: null, title: 'Україна' },
  state: 'planned',
  editedAt: null,
  cancelledAt: null,
  approved: 0,
  myRequest: null,
  requests: null,
  joinCode: null,
  ...over,
});
const page = (events: CalendarEvent[]) => ({ ok: true as const, events, asOf: '2026-11-02T10:00:00.000Z' });

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}
const show = () =>
  render(
    <MemoryRouter initialEntries={['/feed/calendar']}>
      <Routes>
        <Route path="/feed/calendar" element={<Calendar />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 });
  vi.mocked(markCalendarSeen).mockResolvedValue({ ok: true });
  vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [{ id: 'q1', title: 'Україна', description: '', questionCount: 5, updatedAt: '2026-11-01T10:00:00.000Z' }] });
  vi.mocked(getCalendar).mockResolvedValue(page([ev('e1', '2026-11-07T17:00:00.000Z')]));
});
afterEach(cleanup);

describe('Calendar', () => {
  it('offers to turn notifications on above the list when push is available', async () => {
    vi.mocked(getPushKey).mockResolvedValueOnce({ ok: true, publicKey: 'KEY' });
    show();
    const button = await screen.findByRole('button', { name: 'Увімкнути сповіщення' });
    expect(screen.queryByRole('heading', { name: 'Сповіщення' })).toBeNull();
    const card = await screen.findByText('Подія e1');
    expect(button.compareDocumentPosition(card) &Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('groups by day in the viewer zone and sorts by time', async () => {
    vi.mocked(getCalendar).mockResolvedValue(
      page([ev('a', '2026-11-07T17:00:00.000Z'), ev('b', '2026-11-07T22:30:00.000Z'), ev('c', '2026-11-08T09:00:00.000Z')]),
    );
    show();
    await screen.findByText('Подія a');
    const days = document.querySelectorAll('section.calendar-day');
    expect(days).toHaveLength(2);
    expect(within(days[0] as HTMLElement).getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(days[0]!.querySelectorAll('li.calendar-card')).toHaveLength(1);
    expect(days[1]!.querySelectorAll('li.calendar-card')).toHaveLength(2);
    expect(days[1]!.textContent).toContain('Подія b');
  });

  it('marks the first load seen and announces it; the tab is current', async () => {
    const changed = vi.fn();
    window.addEventListener(FEED_CHANGED, changed);
    show();
    await screen.findByText('Подія e1');
    await waitFor(() => expect(markCalendarSeen).toHaveBeenCalledWith('2026-11-02T10:00:00.000Z'));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    window.removeEventListener(FEED_CHANGED, changed);
    expect(screen.getByRole('link', { name: 'Календар' }).getAttribute('aria-current')).toBe('page');
  });

  it('asking reloads the list', async () => {
    vi.mocked(requestCalendarEvent).mockResolvedValue({ ok: true, status: 'pending' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Хочу взяти участь' }));
    await waitFor(() => expect(requestCalendarEvent).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(getCalendar).toHaveBeenCalledTimes(2));
  });

  it('opening the game saves the tokens and goes to the panel', async () => {
    vi.mocked(getCalendar).mockResolvedValue(page([ev('e1', '2026-11-07T17:00:00.000Z', { mine: true, requests: [], quiz: { id: 'q1', title: 'Україна' } })]));
    vi.mocked(openCalendarGame).mockResolvedValue({ ok: true, gameId: 'g', code: '123456', hostToken: 'H', stageToken: 'S' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Відкрити гру' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/host/123456'));
    expect(loadHost('123456')).toEqual({ hostToken: 'H', stageToken: 'S' });
    expect(loadLastGame()).toBe('123456');
  });

  it('cancelling needs a confirm', async () => {
    vi.mocked(getCalendar).mockResolvedValue(page([ev('e1', '2026-11-07T17:00:00.000Z', { mine: true, requests: [], quiz: { id: 'q1', title: 'Україна' } })]));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Скасувати подію' }));
    expect(confirm).toHaveBeenCalledWith('Скасувати «Подія e1»? Учасники побачать, що гри не буде.');
    expect(cancelCalendarEvent).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    vi.mocked(cancelCalendarEvent).mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати подію' }));
    await waitFor(() => expect(cancelCalendarEvent).toHaveBeenCalledWith('e1'));
    confirm.mockRestore();
  });

  it('shows a refusal in an alert', async () => {
    vi.mocked(requestCalendarEvent).mockResolvedValue({ ok: false, error: 'request_rejected' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Хочу взяти участь' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Ведучий уже відхилив запит.');
  });

  it('empty state', async () => {
    vi.mocked(getCalendar).mockResolvedValue(page([]));
    show();
    await screen.findByText("Тут з'являться ігри, які плануєш ти й друзі.");
  });

  it('planning: form, save, create and reload', async () => {
    vi.mocked(createCalendarEvent).mockResolvedValue({ ok: true } as never);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Запланувати гру' }));
    fireEvent.change(await screen.findByLabelText('Назва'), { target: { value: 'Вечір' } });
    fireEvent.change(screen.getByLabelText('Дата й час'), { target: { value: '2099-11-07T19:00' } });
    fireEvent.change(screen.getByLabelText('Вікторина'), { target: { value: 'q1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(createCalendarEvent).toHaveBeenCalledWith({ title: 'Вечір', startsAt: '2099-11-07T17:00:00.000Z', quizId: 'q1' }));
    await waitFor(() => expect(getCalendar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByLabelText('Назва')).toBeNull());
  });

  describe('while the page stays open', () => {
    const setVisibility = (value: 'visible' | 'hidden') =>
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-11-02T10:00:00.000Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
      setVisibility('visible');
    });

    it('asks again every poll while a game starts within six hours, so «Приєднатися» appears', async () => {
      vi.mocked(getCalendar).mockResolvedValue(page([ev('e1', '2026-11-02T12:00:00.000Z', { myRequest: 'approved' })]));
      show();
      await screen.findByText('Подія e1');
      expect(getCalendar).toHaveBeenCalledTimes(1);
      vi.mocked(getCalendar).mockResolvedValue(page([ev('e1', '2026-11-02T12:00:00.000Z', { myRequest: 'approved', state: 'open', joinCode: '123456' })]));
      await act(async () => {
        vi.advanceTimersByTime(FEED_POLL_MS);
      });
      await waitFor(() => expect(getCalendar).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('link', { name: 'Приєднатися' })).toBeTruthy();
    });

    it('does not poll when every game is far away, but asks on coming back to the tab', async () => {
      show();
      await screen.findByText('Подія e1');
      await act(async () => {
        vi.advanceTimersByTime(FEED_POLL_MS * 2);
      });
      expect(getCalendar).toHaveBeenCalledTimes(1);
      setVisibility('hidden');
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(getCalendar).toHaveBeenCalledTimes(1);
      setVisibility('visible');
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await waitFor(() => expect(getCalendar).toHaveBeenCalledTimes(2));
    });

    it('a decision that lights the badge while open is reloaded and marked seen', async () => {
      show();
      await screen.findByText('Подія e1');
      await waitFor(() => expect(markCalendarSeen).toHaveBeenCalledTimes(1));
      vi.mocked(getCalendar).mockResolvedValue({ ...page([ev('e1', '2026-11-07T17:00:00.000Z')]), asOf: '2026-11-02T10:01:00.000Z' });
      vi.mocked(getFeedBadge).mockResolvedValueOnce({ ok: true, events: 0, requests: 0, decisions: 1 });
      await act(async () => {
        vi.advanceTimersByTime(FEED_POLL_MS);
      });
      await waitFor(() => expect(markCalendarSeen).toHaveBeenCalledWith('2026-11-02T10:01:00.000Z'));
    });
  });

  it('a guest goes to login', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    show();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login'));
  });
});
