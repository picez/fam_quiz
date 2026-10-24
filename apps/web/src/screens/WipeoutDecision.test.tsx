// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView, WipeoutInfo } from '@quiz/shared';
import { WipeoutDecision } from './WipeoutDecision';

afterEach(cleanup);

const wipeoutInfo = (over: Partial<WipeoutInfo> = {}): WipeoutInfo => ({
  ladder: [100, 200, 300, 400, 500],
  current: 2,
  done: 3,
  rows: [],
  inCount: 2,
  decide: null,
  ...over,
});

type Own = NonNullable<PlayerView['me']['wipeout']>;
const decisionView = (own: Partial<Own>, over: { paused?: boolean; open?: boolean } = {}): PlayerView =>
  ({
    paused: over.paused ?? false,
    wipeout: wipeoutInfo({ decide: over.open === false ? null : { endsAt: Date.now() + 8_000, remainingMs: null, decided: 0, total: 2 } }),
    me: { wipeout: { status: 'in', bank: 300, decision: null, canDecide: true, ...own } },
  }) as unknown as PlayerView;

describe('WipeoutDecision', () => {
  it('offers two big buttons with the bank, a countdown and the take-by-default line', () => {
    const onDecide = vi.fn();
    render(<WipeoutDecision view={decisionView({})} offsetMs={0} onDecide={onDecide} />);
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByText('Не вибереш за 10 с — банк забереться сам.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Забрати 300' }));
    expect(onDecide).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Далі' }));
    expect(onDecide).toHaveBeenLastCalledWith(false);
  });

  it('shows a line instead of the buttons after the decision or outside the game', () => {
    render(<WipeoutDecision view={decisionView({ decision: 'stay', canDecide: false })} offsetMs={0} onDecide={vi.fn()} />);
    expect(screen.getByText('Ти йдеш далі. Чекаємо інших…')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    render(<WipeoutDecision view={decisionView({ status: 'took', decision: 'take', canDecide: false })} offsetMs={0} onDecide={vi.fn()} />);
    expect(screen.getByText('Забрано 300')).toBeTruthy();
    cleanup();
    render(<WipeoutDecision view={decisionView({ status: 'burned', bank: 0, canDecide: false })} offsetMs={0} onDecide={vi.fn()} />);
    expect(screen.getByText('Банк згорів')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disables the buttons on pause', () => {
    render(<WipeoutDecision view={decisionView({}, { paused: true })} offsetMs={0} onDecide={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Далі' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Забрати 300' }).hasAttribute('disabled')).toBe(true);
  });
});
