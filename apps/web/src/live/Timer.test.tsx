// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Timer, timerStatus } from './Timer';

afterEach(cleanup);

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

  it('timerStatus: pause beats hold', () => {
    expect(timerStatus({ paused: true, held: true })).toBe('paused');
    expect(timerStatus({ paused: false, held: true })).toBe('held');
    expect(timerStatus({ paused: false, held: false })).toBeNull();
  });
});
