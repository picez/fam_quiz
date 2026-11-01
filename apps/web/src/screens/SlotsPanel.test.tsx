// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContinuedView, Phase, ResumeLobby } from '@quiz/shared';
import type { Send } from '../live/types';
import { SlotsPanel } from './SlotsPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const olyaId = '11111111-1111-4111-8111-111111111111';
const petroId = '22222222-2222-4222-8222-222222222222';

const continued = (over: Partial<ContinuedView> = {}): ContinuedView => ({
  slots: [
    { id: olyaId, nickname: 'Оля', team: null, taken: true, account: false },
    { id: petroId, nickname: 'Петро', team: 'Сови', taken: false, account: true },
  ],
  carryRound: null,
  ...over,
});

const resume: ResumeLobby = {
  rounds: [
    { title: 'Розминка', type: 'classic' },
    { title: 'Річки', type: 'classic' },
  ],
  participants: [],
};

function show(
  options: { continued?: ContinuedView; send?: Send; self?: string | null; paused?: boolean; phase?: Phase; resume?: ResumeLobby | null } = {},
) {
  const send = options.send ?? (vi.fn(async () => ({ ok: true as const })) as unknown as Send);
  render(
    <SlotsPanel
      continued={options.continued ?? continued()}
      send={send}
      self={options.self}
      paused={options.paused ?? false}
      phase={options.phase ?? 'leaderboard'}
      resume={options.resume ?? null}
    />,
  );
  return send as unknown as ReturnType<typeof vi.fn>;
}

const row = (name: string) => screen.getByText(name, { exact: false }).closest('li') as HTMLElement;

describe('SlotsPanel', () => {
  it('an open panel with each seat: «на місці» or «вільне», «Звільнити» only for a taken one', () => {
    show();
    const panel = document.querySelector('details.slots-panel') as HTMLDetailsElement;
    expect(panel.open).toBe(true);
    expect(within(panel).getByText('Місця збереженої гри')).toBeTruthy();
    expect(within(row('Оля')).getByText('на місці')).toBeTruthy();
    expect(within(row('Оля')).getByRole('button', { name: 'Звільнити' })).toBeTruthy();
    expect(within(row('Петро')).getByText('вільне')).toBeTruthy();
    expect(within(row('Петро')).getByText(/Сови/)).toBeTruthy();
    expect(within(row('Петро')).queryByRole('button', { name: 'Звільнити' })).toBeNull();
  });

  it('«Звільнити» asks first and sends host:release; a refusal sends nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const send = show();
    fireEvent.click(within(row('Оля')).getByRole('button', { name: 'Звільнити' }));
    expect(confirm).toHaveBeenCalledWith('Звільнити місце «Оля»? Бали лишаться в таблиці.');
    expect(send).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => {
      fireEvent.click(within(row('Оля')).getByRole('button', { name: 'Звільнити' }));
    });
    expect(send).toHaveBeenCalledWith('host:release', { playerId: olyaId });
  });

  it('a failed release shows the error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    show({ send: vi.fn(async () => ({ ok: false as const, error: 'not_found' })) as unknown as Send });
    await act(async () => {
      fireEvent.click(within(row('Оля')).getByRole('button', { name: 'Звільнити' }));
    });
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('no «Звільнити» next to self', () => {
    show({ self: olyaId });
    expect(screen.queryByRole('button', { name: 'Звільнити' })).toBeNull();
  });

  it('the gathering hint shows on a pause outside the lobby only', () => {
    const hint = 'Гравці вибирають себе зі списку. Коли всі зайдуть, натисни «Продовжити».';
    show({ paused: true, phase: 'leaderboard' });
    expect(screen.getByText(hint)).toBeTruthy();
    cleanup();
    show({ paused: true, phase: 'lobby' });
    expect(screen.queryByText(hint)).toBeNull();
    cleanup();
    show({ paused: false, phase: 'leaderboard' });
    expect(screen.queryByText(hint)).toBeNull();
  });

  it('a restart from round 2 says so in the lobby', () => {
    show({ continued: continued({ carryRound: 1 }), phase: 'lobby', resume });
    expect(screen.getByText('Почнемо з «Раунд 2 · Річки» з балами збереженої гри.')).toBeTruthy();
    cleanup();
    show({ continued: continued({ carryRound: null }), phase: 'lobby', resume });
    expect(screen.queryByText(/Почнемо з/)).toBeNull();
  });
});
