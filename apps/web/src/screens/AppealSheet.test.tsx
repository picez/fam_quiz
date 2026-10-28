// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppealView, PlayerAppeal } from '@quiz/shared';
import type { Send } from '../live/types';
import { AppealSheet } from './AppealSheet';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

const appeal = (over: Partial<AppealView> = {}): AppealView => ({
  id: 1,
  by: { playerId: 'p2', nickname: 'Оля' },
  reason: 'grade',
  answer: { type: 'text', value: 'Одеська' },
  question: {
    id: 'q',
    text: 'Місто біля моря?',
    imageUrl: null,
    video: null,
    timeLimit: 20,
    points: 1000,
    type: 'text',
    accepted: ['Одеса'],
  },
  points: 200,
  endsAt: 1_030_000,
  remainingMs: null,
  yes: 1,
  no: 0,
  waiting: 1,
  outcome: null,
  undone: false,
  ...over,
});

const mine = (over: Partial<PlayerAppeal> = {}): PlayerAppeal => ({
  left: 2,
  reasons: [],
  block: null,
  voter: true,
  vote: null,
  ...over,
});

function show(
  options: {
    view?: AppealView;
    mine?: PlayerAppeal;
    paused?: boolean;
    send?: Send;
    onError?: (message: string | null) => void;
  } = {},
) {
  const send = options.send ?? (vi.fn().mockResolvedValue({ ok: true }) as unknown as Send);
  const onError = options.onError ?? vi.fn();
  const utils = render(<AppealSheet view={options.view ?? appeal()} mine={options.mine ?? mine()} teams={false} paused={options.paused ?? false} offsetMs={0} send={send} onError={onError} />);
  return { send, onError, ...utils };
}

describe('AppealSheet', () => {
  it('shows the title, the question, the counts and the countdown in a bottom sheet', () => {
    show();
    const sheet = document.querySelector('section.appeal-sheet');
    expect(sheet).not.toBeNull();
    expect(screen.getByRole('heading', { name: '⚖️ Оля оскаржує' })).toBeTruthy();
    expect(screen.getByText('Відповідь «Одеська», правильна — «Одеса». Зарахувати?')).toBeTruthy();
    expect(screen.getByText('так 1 · ні 0 · ще думає 1')).toBeTruthy();
    expect(screen.getByText('0:30')).toBeTruthy();
  });

  it('sends a yes vote', async () => {
    const { send } = show();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Так' })));
    expect(send).toHaveBeenCalledWith('player:appeal-vote', {
      appealId: 1,
      yes: true,
    });
  });

  it('marks the own vote and says it can change', () => {
    show({ mine: mine({ vote: true }) });
    expect(screen.getByRole('button', { name: 'Так' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Ні' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Твій голос: так · можна змінити до кінця')).toBeTruthy();
  });

  it('changes a yes into a no', async () => {
    const { send } = show({ mine: mine({ vote: true }) });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Ні' })));
    expect(send).toHaveBeenCalledWith('player:appeal-vote', {
      appealId: 1,
      yes: false,
    });
  });

  it('announces the title once after it appears', () => {
    show();
    expect(document.querySelector('.appeal-sheet .sr-only[aria-live="polite"]')?.textContent).toBe('⚖️ Оля оскаржує');
  });

  it('locks the buttons while paused, says why, sends nothing and keeps the time left', async () => {
    const { send } = show({
      paused: true,
      view: appeal({ endsAt: null, remainingMs: 21_000 }),
    });
    const yes = screen.getByRole('button', { name: 'Так' });
    expect(yes.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Ні' }).getAttribute('aria-disabled')).toBe('true');
    expect(yes.getAttribute('title')).toBe('Пауза: голосувати можна після неї');
    expect(screen.getByText('Пауза: голосувати можна після неї')).toBeTruthy();
    await act(async () => void fireEvent.click(yes));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('0:21')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText('0:21')).toBeTruthy();
  });

  it('counts down by the server clock', () => {
    show();
    expect(screen.getByText('0:30')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByText('0:29')).toBeTruthy();
  });

  it('reports a refused vote', async () => {
    const onError = vi.fn();
    const send = vi.fn().mockResolvedValue({
      ok: false,
      error: 'vote_closed',
    }) as unknown as Send;
    show({ send, onError });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Ні' })));
    expect(onError).toHaveBeenCalledWith('Голосування вже закінчилося.');
  });

  it('sends nothing on a second tap before the reply, then unlocks', async () => {
    let reply: (value: { ok: true }) => void = () => undefined;
    const send = vi.fn(() => new Promise((resolve) => (reply = resolve))) as unknown as Send;
    show({ send });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Так' })));
    expect(screen.getByRole('button', { name: 'Ні' }).getAttribute('aria-disabled')).toBe('true');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Ні' })));
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => reply({ ok: true }));
    expect(screen.getByRole('button', { name: 'Ні' }).getAttribute('aria-disabled')).toBe('false');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Ні' })));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('names a team appellant through «Команда»', () => {
    render(<AppealSheet view={appeal({ by: { playerId: 'team-r', nickname: 'Червоні' } })} mine={mine()} teams paused={false} offsetMs={0} send={vi.fn() as unknown as Send} onError={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '⚖️ Команда «Червоні» оскаржує' })).toBeTruthy();
  });
});
