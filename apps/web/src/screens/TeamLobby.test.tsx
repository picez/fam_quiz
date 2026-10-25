// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamView } from '@quiz/shared';
import type { Send } from '../live/types';
import { TeamLobby } from './TeamLobby';
import { playerTeam, teamPlayerView, teamsView } from './team-test-view';

afterEach(cleanup);

const six: TeamView[] = ['Червоні', 'Сині', 'Зелені', 'Жовті', 'Фіолетові', 'Помаранчеві'].map((name, color) => ({
  id: `t${color}`,
  name,
  color,
  captainId: null,
  members: color === 1 ? [{ id: 'u2', nickname: 'Оля', connected: true }] : [],
}));

function show(view: ReturnType<typeof teamPlayerView>) {
  const send: Send = vi.fn(async () => ({ ok: true as const }));
  render(<TeamLobby view={view} send={send} onError={() => undefined} />);
  return send;
}

describe('TeamLobby', () => {
  it('pick: six team buttons in a grid, own team pressed, a tap sends player:team', async () => {
    const send = show(teamPlayerView({ teams: teamsView({ teams: six }) }, { teamId: 't1', canPick: true }));
    const buttons = document.querySelectorAll('.team-pick-grid .team-pick');
    expect(buttons).toHaveLength(6);
    expect(screen.getByRole('button', { name: /Сині/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Червоні/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /Сині/ }).textContent).toContain('1 грав.');
    fireEvent.click(screen.getByRole('button', { name: /Зелені/ }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:team', { teamId: 't2' }));
  });

  it('pick: without a team the lobby says so', () => {
    show(teamPlayerView({}, { teamId: null, captainId: null, captain: false, canPick: true }));
    expect(screen.getByText('Ще без команди')).toBeTruthy();
  });

  it('host and random: wait for the host without a team, show the team with one', () => {
    show(teamPlayerView({ teams: teamsView({ form: 'host' }) }, { teamId: null, canPick: false }));
    expect(screen.getByText('Ведучий розподіляє команди…')).toBeTruthy();
    cleanup();
    show(teamPlayerView({ teams: teamsView({ form: 'random' }) }));
    expect(screen.getByText('Твоя команда: Сині')).toBeTruthy();
    expect(screen.queryByText('Ведучий розподіляє команди…')).toBeNull();
  });

  it('dice: the roll button sends player:team-roll; after the round closes the team is shown', async () => {
    const dice = { rows: [{ playerId: 'u2', nickname: 'Оля', throws: [], waiting: true }], tieBreak: false, done: false };
    const send = show(teamPlayerView({ teams: teamsView({ form: 'dice', dice }) }, { teamId: null, captainId: null, captain: false, canRoll: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Кинути кубик' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:team-roll', undefined));
    cleanup();
    show(teamPlayerView({ teams: teamsView({ form: 'dice', dice: { ...dice, done: true } }) }, { canRoll: false }));
    expect(screen.getByText('Твоя команда: Сині')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Кинути кубик' })).toBeNull();
  });

  it('dice: after my throw I wait for the others', () => {
    const dice = { rows: [{ playerId: 'u2', nickname: 'Оля', throws: [4], waiting: false }], tieBreak: false, done: false };
    show(teamPlayerView({ teams: teamsView({ form: 'dice', dice }) }, { teamId: null, captainId: null, captain: false, canRoll: false }));
    expect(screen.getByText('Чекаємо на інших…')).toBeTruthy();
    expect(playerTeam().canRoll).toBe(false);
  });
});
