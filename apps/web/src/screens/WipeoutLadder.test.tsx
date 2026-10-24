// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WipeoutInfo, WipeoutRow } from '@quiz/shared';
import { WipeoutLadder, WipeoutPlayers } from './WipeoutLadder';

afterEach(cleanup);

const row = (id: string, over: Partial<WipeoutRow> = {}): WipeoutRow => ({ playerId: id, nickname: `Гравець ${id}`, status: 'in', bank: 0, step: null, decision: null, ...over });

const wipeoutInfo = (over: Partial<WipeoutInfo> = {}): WipeoutInfo => ({
  ladder: [100, 200, 300, 400, 500],
  current: 2,
  done: 3,
  rows: [row('a', { bank: 600 }), row('b', { status: 'took', bank: 300, step: 1 }), row('c', { status: 'burned', step: 2 })],
  inCount: 1,
  decide: null,
  ...over,
});

describe('WipeoutLadder', () => {
  it('draws every step with the current one marked and the passed ones done', () => {
    render(<WipeoutLadder info={wipeoutInfo()} size="stage" />);
    const steps = screen.getAllByRole('listitem').filter((el) => el.classList.contains('wipeout-step'));
    expect(steps).toHaveLength(5);
    const current = steps.filter((el) => el.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('300');
    expect(steps.filter((el) => el.classList.contains('is-done'))).toHaveLength(3);
  });

  it('groups the players by state with banks', () => {
    render(<WipeoutLadder info={wipeoutInfo()} size="phone" highlightId="a" />);
    expect(screen.getByText('У грі')).toBeTruthy();
    expect(screen.getByText('Забрали')).toBeTruthy();
    expect(screen.getByText('Згоріли')).toBeTruthy();
    expect(screen.getByText('Гравець a').closest('li')?.classList.contains('is-me')).toBe(true);
    expect(screen.getByText('Гравець a').closest('li')?.textContent).toContain('600');
  });

  it('marks a decided player without showing the choice', () => {
    const info = wipeoutInfo({
      rows: [row('a', { decision: 'decided' }), row('b', { decision: 'pending' })],
      decide: { endsAt: null, remainingMs: null, decided: 1, total: 2 },
    });
    render(<WipeoutPlayers info={info} size="stage" />);
    expect(screen.getByText('✓ вирішив')).toBeTruthy();
    expect(screen.getByText('Вирішили 1 з 2')).toBeTruthy();
    expect(screen.queryByText('Забрати')).toBeNull();
  });

  it('shows the live choice for the host', () => {
    const info = wipeoutInfo({ rows: [row('a', { decision: 'take' }), row('b', { decision: 'stay' })] });
    render(<WipeoutPlayers info={info} size="host" />);
    expect(screen.getByText('забирає')).toBeTruthy();
    expect(screen.getByText('іде далі')).toBeTruthy();
  });
});
