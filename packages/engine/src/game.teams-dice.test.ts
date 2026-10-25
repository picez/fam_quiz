import { describe, expect, it } from 'vitest';
import { addPlayer, removePlayer, start, type GameState } from './game';
import { assignTeam, rollTeamDie, rollTeamRest, setTeamForm, startTeamDice } from './teams';
import { classicRound, single } from './testing/fixtures';
import { must } from './testing/helpers';
import { teamLobby, teamQuiz } from './testing/teams';

/** rng, що дає задані грані кубика по черзі. */
const faces = (...values: number[]) => {
  const queue = values.map((v) => (v - 1) / 6 + 0.01);
  return () => queue.shift() ?? 0;
};

const NAMES = ['Анна', 'Богдан', 'Віра', 'Галина', 'Дмитро', 'Євген', 'Жанна'];

/** Лобі зі способом «кубик» і n учасниками m1…mn на count командах. */
const diceLobby = (n: number, count = 2) => must(setTeamForm(teamLobby(teamQuiz([classicRound('r1', [single])], count), ...NAMES.slice(0, n)), 'dice'));

const roll = (s: GameState, id: string, face: number) => must(rollTeamDie(s, id, faces(face)));
const teamOf = (s: GameState, id: string) => s.teams?.members.find((m) => m.id === id)?.teamId;
const roster = (s: GameState, team: string) => s.teams?.members.filter((m) => m.teamId === team).map((m) => m.id);

describe('team dice in the lobby', () => {
  it('only in «dice» → else team_form; one member → teams_few', () => {
    expect(startTeamDice(teamLobby(teamQuiz([classicRound('r1', [single])]), 'Анна', 'Богдан'))).toEqual({ ok: false, error: 'team_form' });
    expect(startTeamDice(diceLobby(1))).toEqual({ ok: false, error: 'teams_few' });
  });

  it('ties are rerolled by everyone tied; then the highest go to the first team', () => {
    let state = must(startTeamDice(diceLobby(4)));
    expect(state.teams?.dice).toEqual({ throws: {}, tour: ['m1', 'm2', 'm3', 'm4'], waiting: ['m1', 'm2', 'm3', 'm4'], tourNo: 1 });
    expect(startTeamDice(state)).toEqual({ ok: false, error: 'dice_pending' });
    // Гра не стартує, поки тур кубиків відкритий.
    expect(start(state)).toEqual({ ok: false, error: 'dice_pending' });
    state = roll(roll(roll(roll(state, 'm1', 6), 'm2', 2), 'm3', 5), 'm4', 2);
    expect(state.teams?.dice).toMatchObject({ tour: ['m2', 'm4'], waiting: ['m2', 'm4'], tourNo: 2 });
    expect(teamOf(state, 'm1')).toBeNull();
    state = roll(roll(state, 'm2', 3), 'm4', 1);
    expect(roster(state, 't1')).toEqual(['m1', 'm3']);
    expect(roster(state, 't2')).toEqual(['m2', 'm4']);
    expect(state.teams?.dice).toEqual({ throws: { m1: [6], m2: [2, 3], m3: [5], m4: [2, 1] }, tour: [], waiting: [], tourNo: 2 });
  });

  it('a second roll in the same tour → not_your_turn; no tour → wrong_phase', () => {
    expect(rollTeamDie(diceLobby(2), 'm1', faces(3))).toEqual({ ok: false, error: 'wrong_phase' });
    const rolled = roll(must(startTeamDice(diceLobby(3))), 'm1', 4);
    expect(rollTeamDie(rolled, 'm1', faces(3))).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('the host rolls for everyone still waiting', () => {
    const state = must(rollTeamRest(roll(must(startTeamDice(diceLobby(3))), 'm2', 1), faces(6, 3)));
    expect(state.teams?.dice?.throws).toEqual({ m1: [6], m2: [1], m3: [3] });
    expect(roster(state, 't1')).toEqual(['m1', 'm3']);
    expect(roster(state, 't2')).toEqual(['m2']);
  });

  it('seven members on three teams → bands 3, 2, 2 by descending result', () => {
    const state = must(rollTeamRest(must(startTeamDice(diceLobby(7, 3))), faces(1, 6, 3, 5, 2, 4, 3)));
    // m3 і m7 мають по 3 — перекидають
    expect(state.teams?.dice).toMatchObject({ tour: ['m3', 'm7'], tourNo: 2 });
    const settled = must(rollTeamRest(state, faces(4, 2)));
    expect(settled.teams?.dice?.tour).toEqual([]);
    expect(roster(settled, 't1')).toEqual(['m2', 'm4', 'm6']);
    expect(roster(settled, 't2')).toEqual(['m3', 'm7']);
    expect(roster(settled, 't3')).toEqual(['m1', 'm5']);
  });

  it('the host cannot move anyone during a tour; switching the form cancels the tour and keeps the teams', () => {
    let state = must(assignTeam(diceLobby(3), 'm1', 't2'));
    state = must(startTeamDice(state));
    expect(assignTeam(state, 'm2', 't1')).toEqual({ ok: false, error: 'dice_pending' });
    const switched = must(setTeamForm(state, 'host'));
    expect(switched.teams?.dice).toBeNull();
    expect(teamOf(switched, 'm1')).toBe('t2');
  });

  it('who joins during a tour stays without a team and outside the tour', () => {
    let state = must(startTeamDice(diceLobby(2)));
    state = must(addPlayer(state, { id: 'm9', nickname: 'Пізній' }));
    expect(state.teams?.dice?.tour).toEqual(['m1', 'm2']);
    state = roll(roll(state, 'm1', 5), 'm2', 2);
    expect(teamOf(state, 'm1')).toBe('t1');
    expect(teamOf(state, 'm2')).toBe('t2');
    expect(teamOf(state, 'm9')).toBeNull();
  });

  it('removing the one the tour waits for closes the tour', () => {
    let state = roll(roll(must(startTeamDice(diceLobby(3))), 'm1', 5), 'm2', 2);
    state = must(removePlayer(state, 'm3'));
    expect(state.teams?.dice).toEqual({ throws: { m1: [5], m2: [2] }, tour: [], waiting: [], tourNo: 1 });
    expect(teamOf(state, 'm1')).toBe('t1');
    expect(teamOf(state, 'm2')).toBe('t2');
  });
});
