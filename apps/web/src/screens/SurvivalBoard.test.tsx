// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SurvivalInfo, SurvivalRow } from '@quiz/shared';
import { SurvivalBoard } from './SurvivalBoard';

afterEach(cleanup);

const row = (over: Partial<SurvivalRow> & { playerId: string; nickname: string }): SurvivalRow => ({
  status: 'alive',
  outAfter: null,
  ghost: null,
  answer: null,
  trial: null,
  door: null,
  ...over,
});

const info = (rows: SurvivalRow[], over: Partial<SurvivalInfo> = {}): SurvivalInfo => ({
  current: 1,
  total: 5,
  target: 1,
  bonus: 500,
  trialKind: 'luck',
  trialsLeft: 0,
  rows,
  aliveCount: rows.filter((r) => r.status !== 'ghost').length,
  ghostCount: rows.filter((r) => r.status === 'ghost').length,
  ghosts: { answered: 0, right: null },
  verdict: null,
  trial: null,
  ending: false,
  ...over,
});

describe('SurvivalBoard', () => {
  const rows = [
    row({ playerId: 'p1', nickname: 'Оля' }),
    row({ playerId: 'p2', nickname: 'Іван', status: 'edge', trial: 'pending' }),
    row({ playerId: 'p3', nickname: 'Марко', status: 'edge', trial: 'done' }),
    row({ playerId: 'p4', nickname: 'Софія', status: 'ghost', outAfter: 1 }),
  ];

  it('groups players into alive, on the edge and ghosts', () => {
    render(<SurvivalBoard info={info(rows)} size="phone" />);
    expect(screen.getByRole('heading', { name: 'Живі' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'На межі' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Привиди' })).toBeTruthy();
    expect(screen.getByText('Живих: 3 · привидів: 1')).toBeTruthy();
    expect(screen.getByText('вибув(-ла) після 1')).toBeTruthy();
  });

  it('highlights the own row', () => {
    render(<SurvivalBoard info={info(rows)} size="phone" highlightId="p1" />);
    expect(screen.getByText('Оля').closest('li')!.className).toBe('is-me');
    expect(screen.getByText('Іван').closest('li')!.className).toBe('');
  });

  it('shows a tick for a done trial without the pick, but the host sees the door', () => {
    const luck = [row({ playerId: 'p3', nickname: 'Марко', status: 'edge', trial: 'done', door: { picked: 1, auto: false, trap: null } })];
    render(<SurvivalBoard info={info(luck)} size="stage" />);
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.queryByText(/Двері/)).toBeNull();
    cleanup();
    render(<SurvivalBoard info={info(luck)} size="host" />);
    expect(screen.getByText('✓ Двері 2')).toBeTruthy();
  });

  it('shows how many ghosts guessed only when the count is known', () => {
    render(<SurvivalBoard info={info(rows, { ghosts: { answered: 2, right: null } })} size="phone" />);
    expect(screen.queryByText(/відгадали/)).toBeNull();
    cleanup();
    render(<SurvivalBoard info={info(rows, { ghosts: { answered: 2, right: 1 } })} size="phone" />);
    expect(screen.getByText('Привиди: 1 з 2 відгадали')).toBeTruthy();
  });
});
