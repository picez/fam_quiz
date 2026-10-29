// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiceInfo } from '@quiz/shared';
import { StageTeams } from './StageTeams';
import { teamsView } from './team-test-view';

afterEach(cleanup);

const threeTeams = () =>
  teamsView({
    teams: [
      { id: 'a', name: 'Червоні', color: 0, captainId: 'u1', answererId: 'u1', members: [{ id: 'u1', nickname: 'Іра', connected: true }] },
      { id: 'b', name: 'Сині', color: 1, captainId: 'u2', answererId: 'u2', members: [{ id: 'u2', nickname: 'Оля', connected: true }, { id: 'u3', nickname: 'Петро', connected: false }] },
      { id: 'c', name: 'Зелені', color: 2, captainId: null, answererId: null, members: [] },
    ],
  });

describe('StageTeams', () => {
  it('shows a column per team with its name and colour class', () => {
    render(<StageTeams teams={threeTeams()} />);
    const columns = [...document.querySelectorAll('.stage-team')];
    expect(columns.map((c) => c.querySelector('h2')?.textContent)).toEqual(['Червоні', 'Сині', 'Зелені']);
    expect(columns.map((c) => [...c.classList].find((name) => name.startsWith('team-')))).toEqual(['team-0', 'team-1', 'team-2']);
  });

  it('lists nicknames under their team with a crown at the captain', () => {
    render(<StageTeams teams={threeTeams()} />);
    const blue = document.querySelector('.team-1')!;
    expect(blue.textContent).toContain('Оля');
    expect(blue.textContent).toContain('Петро');
    expect(blue.querySelectorAll('.captain-mark')).toHaveLength(1);
    expect(blue.querySelector('li')!.textContent).toContain('👑');
    expect(blue.querySelectorAll('li')[1]!.textContent).not.toContain('👑');
  });

  it('names the people without a team', () => {
    render(<StageTeams teams={teamsView({ unassigned: [{ id: 'u9', nickname: 'Ігор', connected: true }] })} />);
    expect(screen.getByText('Без команди: Ігор')).toBeTruthy();
  });

  it('shows the dice rolls when teams form by dice', () => {
    const dice: DiceInfo = {
      rows: [
        { playerId: 'u1', nickname: 'Іра', throws: [5], waiting: false },
        { playerId: 'u2', nickname: 'Оля', throws: [], waiting: true },
      ],
      tieBreak: false,
      done: false,
    };
    render(<StageTeams teams={teamsView({ form: 'dice', dice })} />);
    expect(document.querySelector('.dice-panel')).not.toBeNull();
    expect(screen.getByText('Кидають: Оля')).toBeTruthy();
    expect(screen.getByLabelText('Кубик: 5')).toBeTruthy();
  });

  it('has no dice panel in the other forms', () => {
    render(<StageTeams teams={teamsView()} />);
    expect(document.querySelector('.dice-panel')).toBeNull();
  });
});
