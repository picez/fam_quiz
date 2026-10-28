import { describe, expect, it } from 'vitest';
import { AWAY_MS, DEFAULT_RULES, type Answer, type QuizSettings } from '@quiz/shared';
import { awayEnd, awayStart, awayStep } from './away';
import { lock, next, submitAnswer, type GameState } from './game';
import { hostLive } from './live';
import { actAnswer } from './team-act';
import { classicRound, makeRoundsQuiz, poll, single, wipeoutLadder, wipeoutRound, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const rng = () => 0;
const right: Answer = { type: 'single', optionId: 'b' };
const wrong: Answer = { type: 'single', optionId: 'a' };
const none = new Set<string>();
const PLAIN = { speedBonus: false, rules: DEFAULT_RULES };
const MINUS = { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' as const } };
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
    expect(JSON.stringify(playerView(s, 'p2'))).not.toContain('2500');
    expect(playerView(s, 'p2')?.lastAway).toBeNull();
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

/** Крок, як RoomManager.commit: перехід і awayStep (hidden — приховані телефони). */
const step = (s: GameState, to: GameState, at: number, hidden: ReadonlySet<string> = none) => awayStep(s, to, at, hidden);
/** Петро й Іра відповідають, ведучий закриває й розкриває; кроки з awayStep. */
function othersToReveal(s: GameState, at: number, answer: Answer = right): GameState {
  let r = s;
  for (const id of ['p2', 'p3']) r = step(r, must(submitAnswer(r, id, answer, at)), at);
  if (r.phase === 'question') r = step(r, must(lock(r)), at);
  r = step(r, must(next(r, at + 1000, rng)), at + 1000);
  expect(r.phase).toBe('reveal');
  return r;
}

describe('the last leave stays on the own phone after the question (12e)', () => {
  it('left in Q1 and came back on the leaderboard: lastAway keeps Q1, away is gone', () => {
    let s = awayStart(open(), 'p1', 2000);
    s = othersToReveal(s, 5000);
    s = step(s, must(next(s, 7000, rng)), 7000);
    expect(s.phase).toBe('leaderboard');
    // інтервал закрито на кроці закриття запитання (Оля вже не під наглядом)
    expect(playerView(s, 'p1')?.away).toBeNull();
    expect(playerView(s, 'p1')?.lastAway).toEqual({ play: 0, ms: 3000, count: 1, out: false, penalty: false });
  });

  it('a hidden phone opened in Q2 and came back during Q2: lastAway points at Q2', () => {
    let s = leave(open(), 'p1', 2000, 4500);
    s = must(submitAnswer(s, 'p1', right, 5000));
    s = othersToReveal(s, 5000);
    s = step(s, must(next(s, 7000, rng)), 7000);
    expect(playerView(s, 'p1')?.lastAway).toMatchObject({ play: 0, ms: 2500 });
    s = step(s, must(next(s, 8000, rng)), 8000, new Set(['p1']));
    expect(s.phase).toBe('question');
    expect(s.questionIndex).toBe(1);
    expect(s.plays[1].away?.p1?.since).not.toBeNull();
    // ще поза грою на Q2: lastAway — відкритий Q2 з out, хоч позначки там ще немає (тривога чекає на повернення)
    expect(playerView(s, 'p1')?.lastAway).toMatchObject({ play: 1, out: true });
    // телефон сховано ще до старту Q2: перші AWAY_MS.preGrace не рахуються
    s = awayEnd(s, 'p1', 16_000);
    expect(playerView(s, 'p1')?.lastAway).toMatchObject({ play: 1, ms: 16_000 - (s.startedAt ?? 0) - AWAY_MS.preGrace, count: 1, out: false });
    expect(playerView(s, 'p1')?.away).toMatchObject({ play: 1 });
  });

  it('one leave over two questions rings once: hidden through Q1 into Q2, lastAway is the open Q2 until the return', () => {
    // Оля ховає телефон у Q1 й не повертається: Q1 закривається з позначкою, Q2 стартує з відкритим інтервалом (ще в пільзі)
    let s = awayStart(open(), 'p1', 2000);
    s = othersToReveal(s, 5000, right);
    s = step(s, must(next(s, 7000, rng)), 7000, new Set(['p1']));
    s = step(s, must(next(s, 8000, rng)), 8000, new Set(['p1']));
    expect(s.questionIndex).toBe(1);
    expect(s.plays[0].away?.p1).toMatchObject({ ms: 3000, since: null });
    expect(s.plays[1].away?.p1?.since).not.toBeNull();
    // поки інтервал Q2 відкритий — out: true, хоч його ms ще 0, тож тривоги для Q1 нема
    expect(playerView(s, 'p1')?.lastAway).toMatchObject({ play: 1, ms: 0, count: 0, out: true });
    // повернення в межах пільги: Q2 без позначки, лишається Q1 — одна тривога за весь вихід
    s = awayEnd(s, 'p1', (s.startedAt ?? 0) + 1000);
    expect(playerView(s, 'p1')?.lastAway).toMatchObject({ play: 0, ms: 3000, out: false });
  });

  it('the game finished after the last question: lastAway is still there', () => {
    let s = startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [q100], PLAIN)]), 'Оля', 'Петро', 'Іра'), 1000, rng);
    s = awayStart(s, 'p1', 2000);
    s = othersToReveal(s, 4000);
    let t = 6000;
    while (s.phase !== 'finished') {
      s = step(s, must(next(s, t, rng)), t);
      t += 1000;
    }
    expect(playerView(s, 'p1')?.lastAway).toMatchObject({ play: 0, ms: 2000, out: false });
    expect(playerView(s, 'p2')?.lastAway).toBeNull();
  });

  it('with awayPenalty the last leave shows the penalty once its row exists', () => {
    let s = leave(open({ awayPenalty: true, leaderboard: 'each' }), 'p1', 2000, 5500);
    s = must(submitAnswer(s, 'p1', right, 6000));
    s = othersToReveal(s, 6000);
    expect(playerView(s, 'p1')?.away?.penalty).toBe(true);
    s = step(s, must(next(s, 8000, rng)), 8000);
    expect(s.adjustments.filter((a) => a.source === 'away')).toEqual([expect.objectContaining({ playerId: 'p1', points: -100 })]);
    expect(playerView(s, 'p1')?.away).toBeNull();
    expect(playerView(s, 'p1')?.lastAway).toMatchObject({ play: 0, ms: 3500, penalty: true });
  });

  it('teams: a teammate has no lastAway of the one who left', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [q100], PLAIN)]), [['Оля', 'Петро'], ['Віра']]), 1000, rng));
    s = leave(s, 'm2', 2000, 5000);
    expect(playerView(s, 'm2')?.lastAway).toMatchObject({ play: 0, ms: 3000 });
    expect(playerView(s, 'm1')?.lastAway).toBeNull();
  });

  it("teams: a teammate's long leave makes the penalty known on m1's phone, with m1's own seconds", () => {
    const base = teamQuiz([classicRound('r1', [q100], PLAIN)]);
    const quiz = { ...base, settings: { ...base.settings, awayPenalty: true } };
    let s = must(next(teamGame(quiz, [['Оля', 'Петро'], ['Віра']]), 1000, rng));
    s = leave(leave(s, 'm1', 2000, 4500), 'm2', 2000, 6000);
    expect(playerView(s, 'm1')?.away).toEqual({ play: 0, ms: 2500, count: 1, out: false, penalty: true });
  });

  it('a negative record gives no penalty; a positive one on the reveal does', () => {
    const minus = () => startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [q100], MINUS)], { awayPenalty: true }), 'Оля', 'Петро', 'Іра'), 1000, rng);
    let neg = leave(minus(), 'p1', 2000, 5500);
    neg = must(submitAnswer(neg, 'p1', wrong, 6000));
    neg = othersToReveal(neg, 6000);
    expect(neg.plays[0].away?.p1?.ms).toBe(3500);
    expect(playerView(neg, 'p1')?.away?.penalty).toBe(false);
    let pos = leave(minus(), 'p1', 2000, 5500);
    pos = must(submitAnswer(pos, 'p1', right, 6000));
    pos = othersToReveal(pos, 6000);
    expect(playerView(pos, 'p1')?.away?.penalty).toBe(true);
  });
});
