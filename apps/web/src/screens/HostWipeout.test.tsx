// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HostView, WipeoutInfo, WipeoutRow } from '@quiz/shared';
import { HostWipeout } from './HostWipeout';

afterEach(cleanup);

const row = (id: string, nickname: string, over: Partial<WipeoutRow> = {}): WipeoutRow => ({ playerId: id, nickname, status: 'in', bank: 300, step: null, decision: null, choice: null, prev: null, ...over });
const info = (over: Partial<WipeoutInfo> = {}): WipeoutInfo => ({
  ladder: [100, 200, 300],
  current: 2,
  done: 3,
  rows: [row('a', 'Оля', { decision: 'take' }), row('b', 'Петро', { decision: 'pending' })],
  inCount: 2,
  decide: { endsAt: Date.now() + 10_000, remainingMs: null, decided: 1, total: 2 },
  decisions: false,
  ...over,
});
const host = (wipeout: WipeoutInfo | null) => ({ wipeout }) as unknown as HostView;

describe('HostWipeout', () => {
  it('shows live decisions next to the names', () => {
    render(<HostWipeout view={host(info())} offsetMs={0} />);
    const lines = Array.from(document.querySelectorAll('.wipeout-group li')).map((el) => el.textContent ?? '');
    expect(lines.some((line) => line.includes('Оля') && line.includes('забирає'))).toBe(true);
    expect(lines.some((line) => line.includes('Петро') && line.includes('думає…'))).toBe(true);
    expect(screen.getByText(/Гравці вирішують… \d+ с/)).toBeTruthy();
  });

  it('shows each choice in the «Рішення» group once the window closed', () => {
    const rows = [row('a', 'Оля', { choice: 'stay', bank: 600 }), row('b', 'Петро', { status: 'took', choice: 'took', bank: 300 })];
    render(<HostWipeout view={host(info({ decide: null, decisions: true, rows }))} offsetMs={0} />);
    const group = document.querySelector('.host-wipeout .wipeout-group.is-choices') as HTMLElement;
    expect(group.textContent).toContain('Далі з 600');
    expect(group.textContent).toContain('Забрано 300');
  });

  it('has the «ⓘ» of the round', () => {
    render(<HostWipeout view={host(info({ decide: null }))} offsetMs={0} />);
    expect(document.querySelector('.host-wipeout h2 button')).not.toBeNull();
  });

  it('renders nothing without wipeout info', () => {
    const { container } = render(<HostWipeout view={host(null)} offsetMs={0} />);
    expect(container.innerHTML).toBe('');
  });
});
