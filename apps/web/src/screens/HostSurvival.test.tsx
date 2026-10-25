// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostView, PublicQuestion, SurvivalInfo, SurvivalRow, SurvivalTrialInfo } from '@quiz/shared';
import type { Send } from '../live/types';
import { HostSurvival } from './HostSurvival';

afterEach(cleanup);

const row = (over: Partial<SurvivalRow> & { playerId: string; nickname: string }): SurvivalRow => ({ status: 'alive', outAfter: null, ghost: null, answer: null, trial: null, door: null, ...over });
const question = { id: 't1', type: 'text', text: 'Перлина біля моря?', imageUrl: null, video: null, timeLimit: 15, points: 0, choices: [] } as unknown as PublicQuestion;
const trialInfo = (over: Partial<SurvivalTrialInfo> = {}): SurvivalTrialInfo => ({ kind: 'luck', fellBack: false, stage: 'open', endsAt: Date.now() + 10_000, remainingMs: null, limitMs: 10_000, done: 1, total: 2, question: null, reveal: null, ...over });
const info = (rows: SurvivalRow[], trial: SurvivalTrialInfo | null, over: Partial<SurvivalInfo> = {}): SurvivalInfo => ({
  current: 1,
  total: 5,
  target: 1,
  bonus: 500,
  trialKind: 'luck',
  trialsLeft: 2,
  rows,
  aliveCount: rows.filter((r) => r.status !== 'ghost').length,
  ghostCount: rows.filter((r) => r.status === 'ghost').length,
  ghosts: { answered: 0, right: null },
  verdict: 'trial',
  trial,
  ending: false,
  ...over,
});
const host = (survival: SurvivalInfo | null, paused = false) => ({ survival, paused }) as unknown as HostView;
const okSend = () => vi.fn(async () => ({ ok: true as const })) as unknown as Send & ReturnType<typeof vi.fn>;
const show = (view: HostView, send: Send = okSend()) => {
  render(<HostSurvival view={view} offsetMs={0} send={send} onError={vi.fn()} />);
  return send;
};

const rowOf = (name: string) => within(document.querySelector('.survival-host-rows') as HTMLElement).getByText(name).closest('li') as HTMLElement;

describe('HostSurvival', () => {
  it('shows the doors live next to the names and «думає…» for those who have not picked', () => {
    const rows = [
      row({ playerId: 'a', nickname: 'Петро', status: 'edge', trial: 'done', door: { picked: 1, auto: false, trap: null } }),
      row({ playerId: 'b', nickname: 'Оля', status: 'edge', trial: 'pending' }),
    ];
    show(host(info(rows, trialInfo())));
    const lines = Array.from(document.querySelectorAll('.survival-host-rows li')).map((el) => el.textContent ?? '');
    expect(lines.some((line) => line.includes('Петро') && line.includes('Двері 2'))).toBe(true);
    expect(lines.some((line) => line.includes('Оля') && line.includes('думає…'))).toBe(true);
    expect(screen.getByText(/Відповіли 1 з 2/)).toBeTruthy();
  });

  it('shows how many survival questions are left', () => {
    show(host(info([row({ playerId: 'a', nickname: 'Петро' })], null, { trialsLeft: 2, verdict: 'all_right' })));
    expect(screen.getByText('Питань на виживання: 2')).toBeTruthy();
  });

  it('has the «ⓘ» of the round', () => {
    show(host(info([], null)));
    expect(document.querySelector('.host-survival h2 button')).not.toBeNull();
  });

  it('renders nothing without survival info', () => {
    const { container } = render(<HostSurvival view={host(null)} offsetMs={0} send={okSend()} onError={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('after the close «Зарахувати» next to a text answer sends host:override', () => {
    const rows = [
      row({ playerId: 'a', nickname: 'Петро', status: 'ghost', trial: 'out', answer: { type: 'text', value: 'Адеса' } }),
      row({ playerId: 'b', nickname: 'Оля', status: 'alive', trial: 'safe', answer: { type: 'text', value: 'Одеса' } }),
    ];
    const send = show(host(info(rows, trialInfo({ kind: 'question', stage: 'closed', question, endsAt: null, done: 2 }))));
    const petro = within(rowOf('Петро'));
    fireEvent.click(petro.getByRole('button', { name: 'Зарахувати' }));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'a', grade: 'correct' });
    expect(within(rowOf('Оля')).getByRole('button', { name: 'Відхилити' })).toBeTruthy();
  });

  it('no grading buttons while the trial is open, in luck, or on pause', () => {
    const rows = [row({ playerId: 'a', nickname: 'Петро', status: 'edge', trial: 'done', answer: { type: 'text', value: 'Адеса' } })];
    show(host(info(rows, trialInfo({ kind: 'question', question }))));
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
    cleanup();
    const out = [row({ playerId: 'a', nickname: 'Петро', status: 'ghost', trial: 'out', answer: { type: 'text', value: 'Адеса' } })];
    show(host(info(out, trialInfo({ kind: 'question', stage: 'closed', question, endsAt: null })), true));
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
  });
});
