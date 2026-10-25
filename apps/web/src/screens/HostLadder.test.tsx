// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostView } from '@quiz/shared';
import type { Send } from '../live/types';
import { HostLadder } from './HostLadder';
import { ladderInfo } from './ladder-fixtures';

afterEach(cleanup);

const choices = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
];
const players = [
  { id: 'p1', nickname: 'Олена', connected: true, score: 0, streak: 0, debuff: null },
  { id: 'p2', nickname: 'Петро', connected: true, score: 0, streak: 0, debuff: null },
  { id: 'p3', nickname: 'Тарас', connected: false, score: 0, streak: 0, debuff: null },
];
const pub = { type: 'single', text: 'Столиця?', imageUrl: null, video: null, timeLimit: null, points: 0, choices, right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null };

const host = (over: Partial<HostView>): HostView => ({ phase: 'intro', paused: false, players, question: null, ladder: ladderInfo(), ...over }) as unknown as HostView;

function show(view: HostView) {
  const send = vi.fn<Send>(async () => ({ ok: true as const }));
  render(<HostLadder view={view} offsetMs={0} send={send} />);
  return send;
}

describe('HostLadder', () => {
  it('intro: a click on a player picks them; the offline one is disabled; the pick is marked', () => {
    const send = show(host({ ladder: ladderInfo({ contestant: { playerId: 'p1', nickname: 'Олена' }, current: -1 }) }));
    expect((screen.getByRole('button', { name: 'Олена' }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('button', { name: 'Тарас' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("не на зв'язку")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Петро' }));
    expect(send).toHaveBeenCalledWith('host:ladder-pick', { playerId: 'p2' });
  });

  it('the pick shows live on a question («думає…» until a choice) and the round has its help button', () => {
    show(host({ phase: 'question', question: pub as HostView['question'], ladder: ladderInfo({ contestantPick: null }) }));
    expect(screen.getByText('думає…')).toBeTruthy();
    expect(document.querySelector('.host-ladder h2 button')).not.toBeNull();
    cleanup();
    show(host({ phase: 'question', question: pub as HostView['question'], ladder: ladderInfo({ contestantPick: 'b' }) }));
    expect(screen.getByText('Олена вибрав(-ла): Київ')).toBeTruthy();
  });

  it('a pending decision: «Забирає 300» sends take true, «Грає далі» take false', () => {
    const send = show(host({ phase: 'leaderboard', ladder: ladderInfo({ decision: 'pending' }) }));
    fireEvent.click(screen.getByRole('button', { name: /Забирає 300/ }));
    expect(send).toHaveBeenCalledWith('host:ladder-decide', { take: true });
  });

  it('no decision buttons once the outcome is there', () => {
    show(host({ phase: 'leaderboard', ladder: ladderInfo({ decision: null, outcome: { kind: 'took', passed: 2, points: 300 } }) }));
    expect(screen.queryByRole('button', { name: /Забирає/ })).toBeNull();
  });
});
