// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardInfo, StageView, TeamsView } from '@quiz/shared';
import { StageAnswerers } from './StageAnswerers';
import { publicQuestion, teamsView } from './team-test-view';

afterEach(cleanup);

const chosenTeams = (over: Partial<TeamsView> = {}): TeamsView =>
  teamsView({
    answerer: 'chosen',
    teams: [
      {
        id: 'team-a',
        name: 'Червоні',
        color: 0,
        captainId: 'u1',
        answererId: 'u5',
        members: [
          { id: 'u1', nickname: 'Іра', connected: true },
          { id: 'u5', nickname: 'Петро', connected: true },
        ],
      },
      {
        id: 'team-b',
        name: 'Сині',
        color: 1,
        captainId: 'u2',
        answererId: 'u3',
        members: [
          { id: 'u2', nickname: 'Оля', connected: true },
          { id: 'u3', nickname: 'Марко', connected: true },
        ],
      },
    ],
    ...over,
  });

// Лише поля, які читає рядок; решта зрізу сцені тут не потрібна.
const stage = (over: Partial<StageView> = {}): StageView =>
  ({ phase: 'question', question: publicQuestion, blitz: null, board: null, ladder: null, teams: chosenTeams(), ...over }) as StageView;

const line = () => document.querySelector('p.stage-answerers');

describe('StageAnswerers', () => {
  it('names who answers under each team name in one line', () => {
    render(<StageAnswerers view={stage()} />);
    const spans = [...line()!.querySelectorAll('span.stage-answerer')];
    expect(spans.map((span) => span.querySelector('strong')!.textContent)).toEqual(['Червоні', 'Сині']);
    expect(spans.map((span) => span.textContent)).toEqual(['Червоні — відповідає: Петро', 'Сині — відповідає: Марко']);
    expect(spans[0]!.classList.contains('team-0')).toBe(true);
    expect(spans[1]!.classList.contains('team-1')).toBe(true);
    expect(spans[0]!.querySelector('.team-dot')).not.toBeNull();
  });

  it('shows on locked and reveal too, and in rotate', () => {
    render(<StageAnswerers view={stage({ phase: 'reveal', teams: chosenTeams({ answerer: 'rotate' }) })} />);
    expect(line()).not.toBeNull();
    cleanup();
    render(<StageAnswerers view={stage({ phase: 'locked' })} />);
    expect(line()).not.toBeNull();
  });

  it('is empty in the captain mode and in a solo game', () => {
    render(<StageAnswerers view={stage({ teams: chosenTeams({ answerer: 'captain' }) })} />);
    expect(line()).toBeNull();
    cleanup();
    render(<StageAnswerers view={stage({ teams: null })} />);
    expect(line()).toBeNull();
  });

  it('is empty in blitz, polls and clouds', () => {
    render(<StageAnswerers view={stage({ blitz: { queue: [] } as unknown as StageView['blitz'] })} />);
    expect(line()).toBeNull();
    cleanup();
    render(<StageAnswerers view={stage({ question: { ...publicQuestion, type: 'poll' } })} />);
    expect(line()).toBeNull();
    cleanup();
    render(<StageAnswerers view={stage({ question: { ...publicQuestion, type: 'wordcloud' } })} />);
    expect(line()).toBeNull();
  });

  it('skips a team the engine sends with no answerer (the board, «Ва-банк»)', () => {
    const board = { turn: { playerId: 'team-a', nickname: 'Червоні' } } as BoardInfo;
    const teams = chosenTeams();
    render(<StageAnswerers view={stage({ board, teams: { ...teams, teams: teams.teams.map((team) => (team.id === 'team-b' ? { ...team, answererId: null } : team)) } })} />);
    expect([...line()!.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['Червоні']);
  });

  it('skips an answerer who is not among the members', () => {
    const teams = chosenTeams();
    render(<StageAnswerers view={stage({ teams: { ...teams, teams: teams.teams.map((team) => (team.id === 'team-a' ? { ...team, answererId: 'gone' } : team)) } })} />);
    expect([...line()!.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['Сині']);
  });

  it('nothing when no team answers', () => {
    const teams = chosenTeams();
    render(<StageAnswerers view={stage({ teams: { ...teams, teams: teams.teams.map((team) => ({ ...team, answererId: null })) } })} />);
    expect(line()).toBeNull();
  });

  it('with up to three teams the full label stays; with six it is short and may wrap', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: `team-${i}`,
      name: `Команда ${i + 1}`,
      color: i,
      captainId: `c${i}`,
      answererId: `a${i}`,
      members: [
        { id: `c${i}`, nickname: `Капітан ${i + 1}`, connected: true },
        { id: `a${i}`, nickname: `Гравець ${i + 1}`, connected: true },
      ],
    }));
    render(<StageAnswerers view={stage({ teams: chosenTeams({ teams: six.slice(0, 3) }) })} />);
    expect(line()!.classList.contains('many')).toBe(false);
    expect(line()!.querySelector('span.stage-answerer')!.textContent).toBe('Команда 1 — відповідає: Гравець 1');
    cleanup();
    render(<StageAnswerers view={stage({ teams: chosenTeams({ teams: six }) })} />);
    expect(line()!.classList.contains('many')).toBe(true);
    const spans = [...line()!.querySelectorAll('span.stage-answerer')];
    expect(spans.map((span) => span.textContent)).toEqual(six.map((_, i) => `Команда ${i + 1}: Гравець ${i + 1}`));
  });

  it('in the ladder names only the contestant team', () => {
    const ladder = { contestant: { playerId: 'team-b', nickname: 'Сині' } } as StageView['ladder'];
    render(<StageAnswerers view={stage({ ladder })} />);
    expect([...line()!.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['Сині']);
  });

  it('is empty between questions', () => {
    render(<StageAnswerers view={stage({ phase: 'leaderboard' })} />);
    expect(line()).toBeNull();
  });
});
