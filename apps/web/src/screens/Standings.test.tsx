// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Standing, TeamsView } from '@quiz/shared';
import { Standings } from './Standings';
import { teamsView } from './team-test-view';

afterEach(cleanup);

const rows = [{ participantId: 'a', nickname: 'Оля', rank: 1, score: 100 }] as unknown as Standing[];

describe('Standings titles', () => {
  it('puts the title next to the nickname', () => {
    render(<Standings standings={rows} teams={null} titles={{ Оля: '👑 Король' }} />);
    expect(screen.getByText('👑 Король').closest('li')?.textContent).toContain('Оля');
  });
  it('does not put a title in a team row', () => {
    const teams: TeamsView = { ...teamsView(), teams: [{ ...teamsView().teams[0]!, id: 'a' }] };
    render(<Standings standings={rows} teams={teams} titles={{ Оля: '👑 Король' }} />);
    expect(screen.queryByText('👑 Король')).toBeNull();
  });
});

describe('Standings levels (15a)', () => {
  it('puts the level next to a solo nickname', () => {
    render(<Standings standings={rows} teams={null} levels={{ Оля: { level: 3, color: null, frame: null, font: null } }} />);
    expect(screen.getByText('Рів. 3').closest('li')?.textContent).toContain('Оля');
  });
  it('puts no level in a team row', () => {
    const teams: TeamsView = { ...teamsView(), teams: [{ ...teamsView().teams[0]!, id: 'a' }] };
    render(<Standings standings={rows} teams={teams} levels={{ Оля: { level: 3, color: null, frame: null, font: null } }} />);
    expect(screen.queryByText('Рів. 3')).toBeNull();
  });
});

describe('Standings series (26b)', () => {
  const two = [
    { participantId: 'a', nickname: 'Оля', rank: 1, score: 100 },
    { participantId: 'b', nickname: 'Іван', rank: 2, score: 50 },
  ] as unknown as Standing[];
  it('a series mark stands next to the player', () => {
    render(<Standings standings={two} teams={null} series={{ a: 2, b: -3 }} />);
    const plus = screen.getByText('Серія +2');
    const minus = screen.getByText('Серія −3');
    expect(plus.closest('li')?.textContent).toContain('Оля');
    expect(plus.className).not.toContain('is-minus');
    expect(minus.closest('li')?.textContent).toContain('Іван');
    expect(minus.className).toContain('is-minus');
  });
  it('shows nothing without the prop', () => {
    render(<Standings standings={two} teams={null} />);
    expect(screen.queryByText(/Серія/)).toBeNull();
  });
});
