// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TeamBar } from './TeamBar';
import { teamPlayerView } from './team-test-view';

afterEach(cleanup);

describe('TeamBar', () => {
  it('shows the team name and colour', () => {
    render(<TeamBar view={teamPlayerView({}, { captain: false })} />);
    expect(screen.getByText('Сині')).toBeTruthy();
    expect(document.querySelector('.team-bar')?.classList.contains('team-1')).toBe(true);
  });

  it('names the captain, or says you are one', () => {
    render(<TeamBar view={teamPlayerView({}, { captain: false, memberId: 'u3', captainId: 'u2' })} />);
    expect(screen.getByText('Капітан: Оля')).toBeTruthy();
    cleanup();
    render(<TeamBar view={teamPlayerView()} />);
    expect(screen.getByText('Ти капітан')).toBeTruthy();
  });

  it('a buzz names who answers; a duel names the duelist', () => {
    render(<TeamBar view={teamPlayerView({}, { buzzerId: 'u3' })} />);
    expect(screen.getByText('Відповідає Петро')).toBeTruthy();
    cleanup();
    render(<TeamBar view={teamPlayerView({}, { duelistId: 'u4' })} />);
    expect(screen.getByText('Дуелянт: Ната')).toBeTruthy();
  });

  it('names who answers when it is not the captain (12g)', () => {
    render(<TeamBar view={teamPlayerView({}, { captain: false, memberId: 'u3', answererId: 'u3', answerer: true, answererMode: 'chosen' })} />);
    expect(screen.getByText('Ти відповідаєш')).toBeTruthy();
    cleanup();
    render(<TeamBar view={teamPlayerView({}, { answererId: 'u3', answerer: false, answererMode: 'chosen' })} />);
    expect(screen.getByText('Відповідає Петро')).toBeTruthy();
    cleanup();
    render(<TeamBar view={teamPlayerView({}, { answererId: 'u2', answererMode: 'chosen' })} />);
    expect(screen.getByText('Ти капітан')).toBeTruthy();
  });

  it('renders nothing in a solo game or without a team', () => {
    const solo = render(<TeamBar view={teamPlayerView({ teams: null, team: null })} />);
    expect(solo.container.innerHTML).toBe('');
    cleanup();
    const none = render(<TeamBar view={teamPlayerView({}, { teamId: null })} />);
    expect(none.container.innerHTML).toBe('');
  });
});
