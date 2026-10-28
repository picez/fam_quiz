import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type QuizSettings } from '@quiz/shared';
import { awayEnd, awayStart } from './away';
import { lock, next, submitAnswer, type GameState } from './game';
import { hostLive } from './live';
import { actAnswer } from './team-act';
import { classicRound, makeRoundsQuiz, poll, single, wipeoutLadder, wipeoutRound, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const rng = () => 0;
const right: Answer = { type: 'single', optionId: 'b' };
const PLAIN = { speedBonus: false, rules: DEFAULT_RULES };
const q100 = withPoints(single, 100);

/** Класика q100, q2 (Оля p1, Петро p2, Іра p3), перше запитання о 1000. */
const open = (settings: Partial<QuizSettings> = { leaderboard: 'each' }) =>
  startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [q100, withId(q100, 'q2')], PLAIN)], settings), 'Оля', 'Петро', 'Іра'), 1000, rng);
/** Вихід людини [from, to]. */
const leave = (s: GameState, person: string, from: number, to: number) => awayEnd(awayStart(s, person, from), person, to);
const liveRow = (s: GameState, id: string) => hostLive(s)?.rows.find((r) => r.id === id);
/** Оля вийшла двічі: 1500 і 1000 мс (разом 2500, два рази). */
const twice = (s: GameState) => leave(leave(s, 'p1', 2000, 3500), 'p1', 4000, 5000);
/** Усі відповіли, закрито, розкрито. */
function toReveal(s: GameState): GameState {
  let r = s;
  for (const id of ['p1', 'p2', 'p3']) r = must(submitAnswer(r, id, right, 6000));
  if (r.phase === 'question') r = must(lock(r));
  r = must(next(r, 7000, rng));
  expect(r.phase).toBe('reveal');
  return r;
}

describe('away marks in the views (12e)', () => {
  it('host live rows: out now, below the mark nothing, then the closed seconds and times', () => {
    let s = awayStart(open(), 'p1', 2000);
    expect(liveRow(s, 'p1')?.away).toEqual([{ personId: 'p1', nickname: 'Оля', ms: 0, count: 0, out: true }]);
    s = awayEnd(s, 'p1', 3500);
    expect(liveRow(s, 'p1')?.away).toEqual([]);
    s = leave(s, 'p1', 4000, 5000);
    expect(liveRow(s, 'p1')?.away).toEqual([{ personId: 'p1', nickname: 'Оля', ms: 2500, count: 2, out: false }]);
    expect(liveRow(s, 'p2')?.away).toEqual([]);
    // Вийшла знову: закриті секунди лишаються, out — зараз
    expect(liveRow(awayStart(s, 'p1', 5500), 'p1')?.away).toEqual([{ personId: 'p1', nickname: 'Оля', ms: 2500, count: 2, out: true }]);
  });

  it('the answer table on the reveal carries the same mark', () => {
    const s = toReveal(twice(open()));
    const responses = hostView(s).responses;
    expect(responses.find((r) => r.playerId === 'p1')?.away).toEqual([{ personId: 'p1', nickname: 'Оля', ms: 2500, count: 2, out: false }]);
    expect(responses.find((r) => r.playerId === 'p2')?.away).toEqual([]);
  });

  it('the stage gets names only, on the question, locked and reveal; on the table nothing', () => {
    let s = leave(twice(open()), 'p3', 2000, 2500);
    expect(stageView(s).away).toEqual(['Оля']);
    // Іра — менше порогу; Петро зараз поза грою — сцені не видно
    s = awayStart(s, 'p2', 5000);
    expect(stageView(s).away).toEqual(['Оля']);
    s = must(lock(s));
    expect(s.phase).toBe('locked');
    expect(stageView(s).away).toEqual(['Оля']);
    s = must(next(s, 7000, rng));
    expect(s.phase).toBe('reveal');
    const stage = stageView(s);
    expect(stage.away).toEqual(['Оля']);
    expect(stage.away.every((name) => typeof name === 'string')).toBe(true);
    expect(JSON.stringify(stage.away)).not.toContain('"ms"');
    s = must(next(s, 8000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(stageView(s).away).toEqual([]);
  });

  it('the own phone gets its own away only', () => {
    const s = twice(open());
    expect(playerView(s, 'p1')?.away).toEqual({ play: 0, ms: 2500, count: 2, out: false, penalty: false });
    expect(playerView(s, 'p2')?.away).toBeNull();
    expect(JSON.stringify(playerView(s, 'p2'))).not.toContain('"personId"');
    expect(playerView(awayStart(s, 'p1', 5500), 'p1')?.away).toMatchObject({ count: 2, out: true });
    expect(playerView(toReveal(s), 'p1')?.away).toMatchObject({ play: 0, ms: 2500 });
    // На таблиці — нічого
    const table = must(next(toReveal(s), 8000, rng));
    expect(table.phase).toBe('leaderboard');
    expect(playerView(table, 'p1')?.away).toBeNull();
  });

  it('the coming penalty is known on the question already, with the setting and in a penalized round only', () => {
    const on = leave(open({ awayPenalty: true }), 'p1', 2000, 5500);
    expect(playerView(on, 'p1')?.away).toMatchObject({ ms: 3500, penalty: true });
    const off = leave(open(), 'p1', 2000, 5500);
    expect(playerView(off, 'p1')?.away?.penalty).toBe(false);
    const short = leave(open({ awayPenalty: true }), 'p1', 2000, 4500);
    expect(playerView(short, 'p1')?.away?.penalty).toBe(false);
    const wipe = startRound(lobbyWith(makeRoundsQuiz([wipeoutRound('w', wipeoutLadder)], { awayPenalty: true }), 'Оля', 'Петро'), 1000, rng);
    expect(wipe.phase).toBe('question');
    expect(playerView(leave(wipe, 'p1', 2000, 6000), 'p1')?.away).toMatchObject({ ms: 4000, penalty: false });
  });

  it('teams: the mark and the own away belong to the person, not to the whole team', () => {
    const base = teamQuiz([classicRound('r1', [q100], PLAIN)]);
    const quiz = { ...base, settings: { ...base.settings, awayPenalty: true } };
    let s = must(next(teamGame(quiz, [['Оля', 'Петро'], ['Віра']]), 1000, rng));
    s = leave(s, 'm2', 2000, 5500);
    expect(playerView(s, 'm2')?.away).toEqual({ play: 0, ms: 3500, count: 1, out: false, penalty: true });
    expect(playerView(s, 'm1')?.away).toBeNull();
    expect(playerView(s, 'm3')?.away).toBeNull();
    expect(liveRow(s, 't1')?.away).toEqual([{ personId: 'm2', nickname: 'Петро', ms: 3500, count: 1, out: false }]);
    expect(liveRow(s, 't2')?.away).toEqual([]);
    expect(stageView(s).away).toEqual(['Петро']);
    s = must(actAnswer(s, 'm1', right, 6000));
    s = must(actAnswer(s, 'm3', right, 6000));
    expect(hostView(s).responses.find((r) => r.playerId === 't1')?.away).toEqual([
      { personId: 'm2', nickname: 'Петро', ms: 3500, count: 1, out: false },
    ]);
  });

  it('team polls: the row and the vote of a person carry only that person', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [poll, q100], PLAIN)]), [['Оля', 'Петро'], ['Віра']]), 1000, rng));
    s = leave(s, 'm2', 2000, 4500);
    expect(liveRow(s, 'm2')?.away).toEqual([{ personId: 'm2', nickname: 'Петро', ms: 2500, count: 1, out: false }]);
    expect(liveRow(s, 'm1')?.away).toEqual([]);
    s = must(actAnswer(s, 'm2', { type: 'poll', optionId: 'a' }, 5000));
    expect(hostView(s).responses.find((r) => r.playerId === 'm2')?.away).toEqual([
      { personId: 'm2', nickname: 'Петро', ms: 2500, count: 1, out: false },
    ]);
  });
});
