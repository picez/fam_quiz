import { createGame, type AnswerRecord, type GameState, type Play } from '@quiz/engine';
import { makeQuiz, single } from '@quiz/engine/testing';
import { DELETED_NICKNAME, REPLAY_VOTE_ATTEMPT, type Grade } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { VOTE_ATTEMPT } from './db/schema';
import { diffEvents, refreshEvents, seenOf } from './game-events';

const AT = new Date('2026-11-20T10:00:00.000Z');
const OLIA = 'p-olia';
const PETRO = 'p-petro';
const MARKO = 'p-marko';
const nobody = { users: new Map<string, string>(), forgotten: new Set<string>() };

const record = (grade: Grade, overridden = false): AnswerRecord => ({
  answer: { type: 'single', optionId: grade === 'correct' ? 'b' : 'a' },
  timeMs: 1000,
  accepted: grade === 'correct',
  accuracy: grade === 'correct' ? 1 : 0,
  grade,
  basePoints: grade === 'correct' ? 100 : 0,
  streakBonus: 0,
  points: grade === 'correct' ? 100 : 0,
  overridden,
});

const play = (answers: Record<string, AnswerRecord>, extra: Partial<Play> = {}): Play => ({ roundIndex: 0, question: single, answers, extraMs: 0, ...extra });

/** Стан посеред гри: гравці [id, нік, рахунок], пауза й журнал запитань. */
function stateOf(players: [string, string, number][], { paused = false, plays = [play({})] }: { paused?: boolean; plays?: Play[] } = {}): GameState {
  const base = createGame(makeQuiz([single, single]));
  return {
    ...base,
    phase: 'question',
    questionIndex: plays.length - 1,
    paused,
    plays,
    players: players.map(([id, nickname, score]) => ({ id, nickname, connected: true, score, totalTimeMs: 0, streak: 0 })),
  };
}

const two: [string, string, number][] = [
  [OLIA, 'Оля', 100],
  [PETRO, 'Петро', 300],
];

describe('game events (65)', () => {
  it('a late player is a join, a kicked one is a leave with the score', () => {
    const before = stateOf(two, { plays: [play({}), play({})] });
    const joined = stateOf([...two, [MARKO, 'Марко', 0]], { plays: [play({}), play({})] });
    const events = diffEvents(seenOf(before), joined, AT, { users: new Map([[MARKO, 'marko-user']]), forgotten: new Set() });
    expect(events).toEqual([
      { id: expect.any(String), at: AT, questionIndex: 1, kind: 'join', participantId: MARKO, userId: 'marko-user', nickname: 'Марко', details: null },
    ]);

    const kicked = stateOf([[OLIA, 'Оля', 100], [MARKO, 'Марко', 0]], { plays: [play({}), play({})] });
    expect(diffEvents(seenOf(joined), kicked, AT, nobody)).toEqual([
      { id: expect.any(String), at: AT, questionIndex: 1, kind: 'leave', participantId: PETRO, userId: null, nickname: 'Петро', details: { score: 300 } },
    ]);
    expect(diffEvents(seenOf(kicked), kicked, AT, nobody)).toEqual([]);
  });

  it('pause and resume are two events', () => {
    const running = stateOf(two);
    const paused = stateOf(two, { paused: true });
    expect(diffEvents(seenOf(running), paused, AT, nobody)).toMatchObject([{ kind: 'pause', participantId: null, userId: null, nickname: '', details: null, questionIndex: 0 }]);
    expect(diffEvents(seenOf(paused), running, AT, nobody)).toMatchObject([{ kind: 'resume', nickname: '' }]);
  });

  it('a host decision keeps the grade it replaced', () => {
    const wrong = stateOf(two, { plays: [play({ [OLIA]: record('correct'), [PETRO]: record('wrong') })] });
    const decided = stateOf(two, { plays: [play({ [OLIA]: record('correct'), [PETRO]: record('correct', true) })] });
    const events = diffEvents(seenOf(wrong), decided, AT, nobody);
    expect(events).toEqual([
      { id: expect.any(String), at: AT, questionIndex: 0, kind: 'verdict', participantId: PETRO, userId: null, nickname: 'Петро', details: { from: 'wrong', to: 'correct' } },
    ]);
    expect(diffEvents(seenOf(decided), decided, AT, nobody)).toEqual([]);
    // Ведучий передумав: нова оцінка при overridden — ще одне рішення.
    const again = stateOf(two, { plays: [play({ [OLIA]: record('correct'), [PETRO]: record('partial', true) })] });
    expect(diffEvents(seenOf(decided), again, AT, nobody)).toMatchObject([{ kind: 'verdict', details: { from: 'correct', to: 'partial' } }]);
    // Ручна оцінка гравця, що не відповідав: запису не було.
    const silent = stateOf(two, { plays: [play({ [OLIA]: record('correct') })] });
    const granted = stateOf(two, { plays: [play({ [OLIA]: record('correct'), [PETRO]: record('correct', true) })] });
    expect(diffEvents(seenOf(silent), granted, AT, nobody)).toMatchObject([{ kind: 'verdict', participantId: PETRO, details: { from: null, to: 'correct' } }]);
  });

  it('blitz attempts are no verdicts', () => {
    const blitz = (graded: boolean): Play =>
      play(
        { [PETRO]: graded ? record('correct', true) : record('wrong') },
        { blitz: { attempts: [{ playerId: PETRO, answer: null, timeMs: 500, grade: graded ? 'correct' : null, points: graded ? 100 : 0 }] } as unknown as Play['blitz'] },
      );
    const before = stateOf(two, { plays: [blitz(false)] });
    const after = stateOf(two, { plays: [blitz(true)] });
    expect(diffEvents(seenOf(before), after, AT, nobody).filter((e) => e.kind === 'verdict')).toEqual([]);
  });

  it('a forgotten seat is the deleted player', () => {
    const before = stateOf(two);
    const after = stateOf([[OLIA, 'Оля', 100]]);
    const events = diffEvents(seenOf(before), after, AT, { users: new Map([[PETRO, 'petro-user']]), forgotten: new Set([PETRO]) });
    expect(events).toMatchObject([{ kind: 'leave', participantId: PETRO, userId: null, nickname: DELETED_NICKNAME, details: { score: 300 } }]);
  });

  it('a team game: a person who leaves names the team and its score', () => {
    const teams = (members: [string, string, string][]): GameState => ({
      ...stateOf([['t-red', 'Червоні', 200]]),
      teams: {
        form: 'host',
        list: [{ id: 't-red', name: 'Червоні', color: 0 }],
        members: members.map(([id, nickname, teamId]) => ({ id, nickname, connected: true, teamId })),
        captains: {},
        dice: null,
        duelists: {},
      } as unknown as GameState['teams'],
    });
    const before = teams([[OLIA, 'Оля', 't-red'], [PETRO, 'Петро', 't-red']]);
    const after = teams([[OLIA, 'Оля', 't-red']]);
    expect(diffEvents(seenOf(before), after, AT, nobody)).toMatchObject([{ kind: 'leave', participantId: PETRO, nickname: 'Петро', details: { score: 200, team: 'Червоні' } }]);
  });

  it('pending events follow the room at write time: a forgotten seat and an unbound account lose the account', () => {
    const ev = (participantId: string | null, userId: string | null, nickname: string) => ({ id: participantId ?? 'p', participantId, userId, nickname });
    const events = [ev(PETRO, 'petro-user', 'Петро'), ev(MARKO, 'marko-user', 'Марко'), ev(OLIA, 'olia-user', 'Оля'), ev(null, null, '')];
    const fresh = refreshEvents(events, { users: new Map([[OLIA, 'olia-user']]), forgotten: new Set([PETRO]) });
    expect(fresh).toEqual([
      ev(PETRO, null, DELETED_NICKNAME),
      ev(MARKO, null, 'Марко'),
      ev(OLIA, 'olia-user', 'Оля'),
      ev(null, null, ''),
    ]);
    expect(fresh[2]).toBe(events[2]);
  });

  it('a pending event of a seat rebound to another account (66, merge) follows the seat', () => {
    const ev = { id: 'e1', participantId: OLIA, userId: 'secondary', nickname: 'Оля' };
    expect(refreshEvents([ev], { users: new Map([[OLIA, 'primary']]), forgotten: new Set() })).toEqual([{ ...ev, userId: 'primary' }]);
  });

  it('the shared vote attempt is the server one', () => {
    expect(REPLAY_VOTE_ATTEMPT).toBe(VOTE_ATTEMPT);
  });
});
