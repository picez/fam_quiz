// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppealView } from '@quiz/shared';
import { AppealCard } from './AppealCard';

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
  question: { id: 'q', text: 'Місто біля моря?', imageUrl: null, video: null, timeLimit: 20, points: 1000, type: 'text', accepted: ['Одеса'] },
  points: 200,
  endsAt: 1_021_000,
  remainingMs: null,
  yes: 1,
  no: 0,
  waiting: 1,
  outcome: null,
  ...over,
});

const closed = (over: Partial<AppealView>) => appeal({ endsAt: null, waiting: 0, ...over });

describe('AppealCard', () => {
  it('shows an open appeal on the stage with the question, the bar, the counts and the countdown', () => {
    render(<AppealCard view={appeal()} size="stage" teams={false} offsetMs={0} />);
    const card = document.querySelector('section.appeal-card.is-stage');
    expect(card?.getAttribute('role')).toBe('status');
    expect(card?.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('heading', { name: '⚖️ Оля оскаржує' })).toBeTruthy();
    expect(screen.getByText('Відповідь «Одеська», правильна — «Одеса». Зарахувати?')).toBeTruthy();
    expect(document.querySelector('.appeal-bar')).not.toBeNull();
    expect(screen.getByText('так 1 · ні 0 · ще думають 1')).toBeTruthy();
    expect(screen.getByText('0:21')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByText('0:20')).toBeTruthy();
    expect(document.querySelector('.appeal-result')).toBeNull();
  });

  it('on a phone says the hall is voting, without buttons or the bar', () => {
    render(<AppealCard view={appeal()} size="phone" teams={false} offsetMs={0} />);
    expect(document.querySelector('.appeal-card.is-phone')).not.toBeNull();
    expect(screen.getByText('⚖️ Зал голосує…')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('.appeal-bar')).toBeNull();
    expect(document.querySelector('.appeal-ask')).toBeNull();
  });

  it('keeps the paused time left still', () => {
    render(<AppealCard view={appeal({ endsAt: null, remainingMs: 12_000 })} size="phone" teams={false} offsetMs={0} />);
    expect(screen.getByText('0:12')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText('0:12')).toBeTruthy();
  });

  it('counts down by the server offset', () => {
    render(<AppealCard view={appeal()} size="host" teams={false} offsetMs={5000} />);
    expect(screen.getByText('0:16')).toBeTruthy();
  });

  it('shows the result line once decided, without a countdown', () => {
    render(<AppealCard view={closed({ outcome: 'yes', points: 100, yes: 2 })} size="stage" teams={false} offsetMs={0} />);
    expect(document.querySelector('.appeal-result')?.textContent).toBe('⚖️ Зараховано! +100');
    expect(document.querySelector('.appeal-time')).toBeNull();
    cleanup();
    render(<AppealCard view={closed({ outcome: 'tie', yes: 1, no: 1 })} size="phone" teams={false} offsetMs={0} />);
    expect(document.querySelector('.appeal-result')?.textContent).toBe('⚖️ Лишається як було · так 1 · ні 1');
    cleanup();
    render(<AppealCard view={closed({ outcome: 'host', points: 0 })} size="host" teams={false} offsetMs={0} />);
    expect(document.querySelector('.appeal-result')?.textContent).toBe('⚖️ Ведучий зарахував');
  });

  it('names a team appellant through «Команда»', () => {
    render(<AppealCard view={appeal({ by: { playerId: 'team-r', nickname: 'Червоні' } })} size="stage" teams offsetMs={0} />);
    expect(screen.getByRole('heading', { name: '⚖️ Команда «Червоні» оскаржує' })).toBeTruthy();
  });

  it('shows no nickname but the appellant', () => {
    render(<AppealCard view={appeal({ yes: 2, no: 1, waiting: 1 })} size="stage" teams={false} offsetMs={0} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Оля');
    for (const other of ['Тарас', 'Петро', 'Ната', 'p1', 'p3']) expect(text).not.toContain(other);
  });
});
