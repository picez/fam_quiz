import { describe, expect, it } from 'vitest';
import { TEAM_WIDE_TYPES, type AchievementId, type Question } from '@quiz/shared';
import { clues, memory, single, withId } from '@quiz/engine/testing';
import type { AchievementGame } from './achievement-games';
import { PENALTY_ATTEMPT } from './db/schema';
import { gameAchievements, type AchievementWho } from './game-achievements';
import { mechanicAchievements } from './mechanic-achievements';
import { fakeGame, OLYA_IN_TEAM, P, PETRO, q, row, SOLO, TEAM, teamGame, VIRA_IN_TEAM } from './testing/achievement-fixtures';

const has = (game: AchievementGame, id: AchievementId, who: AchievementWho = SOLO) => mechanicAchievements(game, who).has(id);

describe('mechanicAchievements', () => {
  it('lawyer: a won appeal for any reason; a tie is not; the whole team gets it', () => {
    expect(has(fakeGame({ appeals: [{ participantId: P, questionIndex: 0, outcome: 'yes', yes: 3, no: 1 }] }), 'lawyer')).toBe(true);
    expect(has(fakeGame({ appeals: [{ participantId: P, questionIndex: 0, outcome: 'tie', yes: 2, no: 2 }] }), 'lawyer')).toBe(false);
    expect(has(fakeGame({ appeals: [{ participantId: PETRO, questionIndex: 0, outcome: 'yes', yes: 3, no: 0 }] }), 'lawyer')).toBe(false);
    const team = teamGame({ appeals: [{ participantId: TEAM, questionIndex: 0, outcome: 'yes', yes: 3, no: 0 }] });
    expect(has(team, 'lawyer', OLYA_IN_TEAM)).toBe(true);
    expect(has(team, 'lawyer', VIRA_IN_TEAM)).toBe(true);
  });

  it('own_pace: right on the first clue at own pace while someone opened more', () => {
    const selfPaced = withId({ ...clues, cluePace: 'self' as const }, 'c1');
    const game = (petroClue: number, question = selfPaced) =>
      fakeGame({ questions: [q(0, { question })], rows: [row(0, { clue: 1 }), row(0, { participantId: PETRO, clue: petroClue, accepted: false, points: 0 })] });
    expect(has(game(3), 'own_pace')).toBe(true);
    expect(has(game(1), 'own_pace')).toBe(false);
    expect(has(game(3, withId(clues, 'c2')), 'own_pace')).toBe(false);
  });

  it('risky: a right answer under Risk; a silent Risk is a miss, never a win', () => {
    const questions = [q(0), q(1)];
    expect(has(fakeGame({ questions, rows: [row(0, { buff: 'risk' })] }), 'risky')).toBe(true);
    const silent = row(0, { attempt: PENALTY_ATTEMPT, accepted: false, points: -100, buff: 'risk' });
    expect(has(fakeGame({ questions, rows: [silent] }), 'risky')).toBe(false);
    expect(has(fakeGame({ questions, rows: [silent, row(1, { buff: 'risk' })] }), 'risky')).toBe(true);
    const appealed = fakeGame({ questions, rows: [row(0, { buff: 'risk', accepted: false, points: 0 })], appeals: [{ participantId: P, questionIndex: 0, outcome: 'yes', yes: 3, no: 0 }] });
    expect(has(appealed, 'risky')).toBe(false);
  });

  it('peeker: a right answer after a peek', () => {
    expect(has(fakeGame({ rows: [row(0, { buff: 'peek' })] }), 'peeker')).toBe(true);
    expect(has(fakeGame({ rows: [row(0, { buff: 'peek', accepted: false, points: 0 })] }), 'peeker')).toBe(false);
  });

  it('chosen_one: the chosen or rotating answerer who got it right', () => {
    const right = [row(0, { participantId: TEAM, answeredBy: 'm-vira' })];
    expect(has(teamGame({ answerer: 'chosen', rows: right }), 'chosen_one', VIRA_IN_TEAM)).toBe(true);
    expect(has(teamGame({ answerer: 'chosen', rows: right }), 'chosen_one', OLYA_IN_TEAM)).toBe(false);
    expect(has(teamGame({ answerer: 'rotate', rows: right }), 'chosen_one', VIRA_IN_TEAM)).toBe(true);
    expect(has(teamGame({ answerer: 'captain', rows: right }), 'chosen_one', VIRA_IN_TEAM)).toBe(false);
    expect(has(teamGame({ answerer: 'chosen', rows: right, questions: [q(0, { blitz: true })] }), 'chosen_one', VIRA_IN_TEAM)).toBe(false);
    expect(has(teamGame({ answerer: 'chosen', rows: right, questions: [q(0, { question: withId(memory, 'm1') })] }), 'chosen_one', VIRA_IN_TEAM)).toBe(false);
    expect(has(fakeGame({ answerer: null, rows: [row(0)] }), 'chosen_one')).toBe(false);
  });

  it('chosen_one: no team-wide type counts — the whole team acts there, nobody is chosen', () => {
    const right = [row(0, { participantId: TEAM, answeredBy: 'm-vira' })];
    for (const type of TEAM_WIDE_TYPES) {
      const question = { ...withId(single, `tw-${type}`), type } as unknown as Question;
      expect(has(teamGame({ answerer: 'chosen', rows: right, questions: [q(0, { question })] }), 'chosen_one', VIRA_IN_TEAM), type).toBe(false);
    }
    expect(TEAM_WIDE_TYPES).toEqual(expect.arrayContaining(['timedlist', 'letterwords', 'drawing', 'memory', 'melody']));
  });

  it('an unfinished game gives nothing', () => {
    expect(mechanicAchievements(fakeGame({ status: 'aborted', rows: [row(0, { buff: 'risk' })] }), SOLO).size).toBe(0);
  });

  it('gameAchievements includes them in catalogue order', () => {
    const got = gameAchievements(fakeGame({ questions: [q(0), q(1, { question: withId(single, 'q1') })], rows: [row(0, { buff: 'risk' }), row(1, { buff: 'peek' })] }), SOLO);
    expect(got).toEqual(expect.arrayContaining(['risky', 'peeker']));
    expect(got.indexOf('risky')).toBeLessThan(got.indexOf('peeker'));
  });
});
