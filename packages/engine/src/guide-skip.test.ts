import { describe, expect, it } from 'vitest';
import type { GameState } from './game';
import { guideSkipNeed, guideSkipTally, guideVoters } from './guide-skip';
import { classicRound, makeRoundsQuiz, single } from './testing/fixtures';
import { lobbyWith } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const solo = (...names: string[]): GameState => lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), ...names);
const offline = (state: GameState, id: string): GameState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, connected: false } : p)),
});

describe('guide skip rule (75)', () => {
  it('guideSkipNeed: half of the people rounded up, at least one', () => {
    expect([0, 1, 2, 3, 4, 5].map(guideSkipNeed)).toEqual([1, 1, 1, 2, 2, 3]);
  });

  it('guideVoters: connected solo players only', () => {
    const state = offline(solo('Оля', 'Петро', 'Ліна'), 'p2');
    expect(guideVoters(state)).toEqual([state.players[0].id, state.players[2].id]);
  });

  it('guideVoters: people of a team game, not teams', () => {
    const state = teamGame(teamQuiz([classicRound('r1', [single])]), [
      ['Оля', 'Петро'],
      ['Ліна', 'Марко'],
    ]);
    expect(guideVoters(state)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('guideSkipTally counts only voters and decides by majority', () => {
    const state = offline(solo('Оля', 'Петро', 'Ліна', 'Марко', 'Іра'), 'p5');
    expect(guideSkipTally(state, new Set(['p1']))).toEqual({ votes: 1, of: 4, need: 2, reached: false });
    expect(guideSkipTally(state, new Set(['p1', 'p2'])).reached).toBe(true);
    expect(guideSkipTally(state, new Set(['p1', 'p5', 'zzz']))).toMatchObject({ votes: 1, reached: false });
    const empty = { ...state, players: [] };
    expect(guideSkipTally(empty, new Set(['p1']))).toEqual({ votes: 0, of: 0, need: 1, reached: false });
  });
});
