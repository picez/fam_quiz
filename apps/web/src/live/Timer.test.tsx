// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timer, timerFace, timerStatus } from './Timer';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Timer', () => {
  it('shows the remaining and the full time with a bar', () => {
    const { container } = render(<Timer view={{ endsAt: null, remainingMs: 45_000 }} offsetMs={0} total={60_000} />);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('45');
    expect(screen.getByText('/ 60 с')).toBeTruthy();
    expect((container.querySelector('.timer-bar > span') as HTMLElement).style.width).toBe('75%');
  });

  it('without a total it looks as before', () => {
    const { container } = render(<Timer view={{ endsAt: null, remainingMs: 45_000 }} offsetMs={0} />);
    expect(container.querySelector('.timer-total')).toBeNull();
    expect(container.querySelector('.timer-bar')).toBeNull();
  });

  it('shows the paused and held states', () => {
    render(<Timer view={{ endsAt: null, remainingMs: 10_000 }} offsetMs={0} status="held" />);
    expect(screen.getByText('Чекає рішення ведучого')).toBeTruthy();
    cleanup();
    render(<Timer view={{ endsAt: null, remainingMs: 10_000 }} offsetMs={0} status="paused" />);
    expect(screen.getByText('Пауза')).toBeTruthy();
  });

  it('the state takes the place of the full time in the same row, the bar stays', () => {
    const { container } = render(<Timer view={{ endsAt: null, remainingMs: 10_000 }} offsetMs={0} total={30_000} status="held" />);
    const timer = screen.getByRole('timer');
    expect([...timer.children].map((child) => child.className)).toEqual(['timer-flaps', 'timer-label', 'timer-bar']);
    expect(timer.querySelector('.timer-label')?.textContent).toBe('Чекає рішення ведучого');
    expect(timer.querySelector('.timer-label')?.getAttribute('data-total')).toBe('/ 30 с');
    expect(container.querySelector('.timer-total')).toBeNull();
  });

  it('never shows more than the full time', () => {
    const { container } = render(<Timer view={{ endsAt: null, remainingMs: 30_400 }} offsetMs={0} total={30_000} />);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('30');
    expect((container.querySelector('.timer-bar > span') as HTMLElement).style.width).toBe('100%');
  });

  it('a re-render for another reason reads the current time, so the count never ticks back up', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const view = { endsAt: 1_010_000, remainingMs: null };
    const { rerender } = render(<Timer view={view} offsetMs={0} total={30_000} />);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('10');
    // Час іде, а інтервал ще не спрацював; перемальовує зміна зсуву годинника.
    vi.setSystemTime(1_005_000);
    rerender(<Timer view={view} offsetMs={1} total={30_000} />);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('5');
  });

  it('timerStatus: pause beats hold', () => {
    expect(timerStatus({ paused: true, held: true })).toBe('paused');
    expect(timerStatus({ paused: false, held: true })).toBe('held');
    expect(timerStatus({ paused: false, held: false })).toBeNull();
  });

  it('a long clip keeps the board on the full question time with «Слухайте»', () => {
    const { container } = render(<Timer view={{ endsAt: null, remainingMs: 40_000 }} offsetMs={0} total={50_000} leadMs={30_000} />);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('20');
    expect(screen.getByText('🎵 Слухайте')).toBeTruthy();
    expect((container.querySelector('.timer-bar > span') as HTMLElement).style.width).toBe('100%');
    cleanup();
    render(<Timer view={{ endsAt: null, remainingMs: 15_000 }} offsetMs={0} total={50_000} leadMs={30_000} />);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('15');
    expect(screen.getByText('/ 20 с')).toBeTruthy();
    expect(screen.queryByText('🎵 Слухайте')).toBeNull();
  });

  it('a pause during the clip wins over «Слухайте»', () => {
    render(<Timer view={{ endsAt: null, remainingMs: 40_000 }} offsetMs={0} total={50_000} leadMs={30_000} status="paused" />);
    expect(screen.getByText('Пауза')).toBeTruthy();
    expect(screen.queryByText('🎵 Слухайте')).toBeNull();
  });
});

describe('timerFace', () => {
  const input = (over: Partial<Parameters<typeof timerFace>[0]> = {}) => ({
    view: { endsAt: null, remainingMs: 45_000 },
    offsetMs: 0,
    total: 60_000,
    status: null,
    leadMs: 0,
    ...over,
  });

  it('counts the seconds, the bar and the full time like the board', () => {
    expect(timerFace(input(), 0)).toEqual({ seconds: 45, pct: 75, status: null, totalText: '/ 60 с', ending: false });
    expect(timerFace(input({ total: null }), 0)).toMatchObject({ seconds: 45, pct: null, totalText: '' });
    expect(timerFace(input({ view: { endsAt: null, remainingMs: null } }), 0)).toBeNull();
  });

  it('uses the server clock offset', () => {
    expect(timerFace(input({ view: { endsAt: 100_000, remainingMs: null }, offsetMs: 5_000 }), 85_000)?.seconds).toBe(10);
  });

  it('a playing fragment holds the board on the full time and says listen', () => {
    const face = timerFace(input({ view: { endsAt: 40_000, remainingMs: null }, total: 40_000, leadMs: 10_000 }), 0);
    expect(face).toMatchObject({ seconds: 30, status: 'listening', ending: false });
  });

  it('the last five seconds only while the clock runs and nothing holds it', () => {
    expect(timerFace(input({ view: { endsAt: 5_000, remainingMs: null } }), 0)?.ending).toBe(true);
    expect(timerFace(input({ view: { endsAt: 6_000, remainingMs: null } }), 0)?.ending).toBe(false);
    expect(timerFace(input({ view: { endsAt: null, remainingMs: 3_000 }, status: 'paused' }), 0)?.ending).toBe(false);
    expect(timerFace(input({ view: { endsAt: null, remainingMs: 3_000 }, status: 'held' }), 0)?.ending).toBe(false);
  });

  it('Timer marks the root in the last five seconds', () => {
    vi.useFakeTimers();
    render(<Timer view={{ endsAt: Date.now() + 4_500, remainingMs: null }} offsetMs={0} total={30_000} />);
    expect(screen.getByRole('timer').classList.contains('is-ending')).toBe(true);
    cleanup();
    render(<Timer view={{ endsAt: Date.now() + 9_000, remainingMs: null }} offsetMs={0} total={30_000} />);
    expect(screen.getByRole('timer').classList.contains('is-ending')).toBe(false);
    act(() => vi.advanceTimersByTime(4_200));
    expect(screen.getByRole('timer').classList.contains('is-ending')).toBe(true);
  });
});
