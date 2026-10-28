import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer } from '@quiz/shared';
import { buzz } from './blitz';
import { pickBluff, writeLie } from './bluff';
import { buyDebuff } from './debuffs';
import { factInput } from './facts';
import { placeWager } from './final';
import { judge, lock, next, submitAnswer, type GameState } from './game';
import { blitzRound, bluff, classicRound, finalRound, makeQuiz, makeRoundsQuiz, poll, single, withId } from './testing/fixtures';
import { rich, T0 as DEBUFF_T0 } from './testing/debuffs';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const rng = () => 0;
const kyiv: Answer = { type: 'single', optionId: 'b' };
const lviv: Answer = { type: 'single', optionId: 'a' };
const PLAIN = { speedBonus: false, rules: DEFAULT_RULES };

function to(s: GameState, phase: GameState['phase'], now: number): GameState {
  let current = s;
  while (current.phase !== phase) current = must(next(current, now, rng));
  return current;
}

/** Id варіанта блефу за текстом. */
function idOf(s: GameState, text: string): string {
  const option = s.plays[s.questionIndex].bluff?.options.find((o) => o.text === text);
  if (option === undefined) throw new Error(`no option ${text}`);
  return option.id;
}

describe('fact rows from the state (12d)', () => {
  it('one row per record with time, verdict and buff; the open question is not in yet', () => {
    let s = startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    s = must(submitAnswer(s, 'p1', kyiv, 3100));
    expect(factInput(s).rows).toEqual([]);
    expect(factInput(s).questions).toEqual([]);
    s = must(submitAnswer(s, 'p2', lviv, 4000));
    const input = factInput(s);
    expect(input.questions).toEqual([
      { index: 0, roundIndex: 0, number: 1, text: single.text, limitMs: single.timeLimit * 1000, scored: true, board: false, blitz: false, bluff: false, final: false },
    ]);
    expect(input.rows).toEqual([
      { playerId: 'p1', questionIndex: 0, roundIndex: 0, attempt: 0, timeMs: 2100, accepted: true, buff: null, spare: false, wager: null, bluff: null },
      expect.objectContaining({ playerId: 'p2', questionIndex: 0, attempt: 0, timeMs: 3000, accepted: false }),
    ]);
    expect(input.players).toEqual([
      { id: 'p1', nickname: 'Оля', rank: 1, score: 1000, rounds: [1000] },
      { id: 'p2', nickname: 'Петро', rank: 2, score: 0, rounds: [0] },
    ]);
    expect(input.debuffs).toEqual([]);
  });

  it('blitz: a row per attempt, like the recorder rows', () => {
    const quiz = makeRoundsQuiz([blitzRound('b1', [single], { check: 'manual', attempts: 2 })]);
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро'), 0, rng);
    s = must(judge(must(submitAnswer(must(buzz(s, 'p2', 1000)), 'p2', lviv, 1000)), 'p2', false, 1000));
    s = must(judge(must(submitAnswer(must(buzz(s, 'p2', 2000)), 'p2', kyiv, 2000)), 'p2', true, 2000));
    expect(s.phase).toBe('locked');
    const input = factInput(s);
    expect(input.questions[0]).toMatchObject({ blitz: true, board: false });
    expect(input.rows.filter((r) => r.playerId === 'p2')).toEqual([
      { playerId: 'p2', questionIndex: 0, roundIndex: 0, attempt: 0, timeMs: 1000, accepted: false, buff: null, spare: false, wager: null, bluff: null },
      { playerId: 'p2', questionIndex: 0, roundIndex: 0, attempt: 1, timeMs: 2000, accepted: true, buff: null, spare: false, wager: null, bluff: null },
    ]);
    expect(input.rows.filter((r) => r.playerId === 'p1')).toEqual([]);
  });

  it('bluff: rows carry the pick, the truth and how many the own lie fooled; a lie without a pick is pick: false', () => {
    let s = startRound(lobbyWith(makeQuiz([bluff, single], { speedBonus: false, rules: DEFAULT_RULES, buffs: [] }), 'Оля', 'Петро', 'Віра'), 10_000, rng);
    s = must(writeLie(s, 'p1', 'Рим', 11_000));
    s = must(writeLie(s, 'p2', 'Мілан', 12_000));
    s = must(writeLie(s, 'p3', 'Париж', 13_000));
    s = must(pickBluff(s, 'p1', idOf(s, 'Мілан'), 14_000));
    s = must(pickBluff(s, 'p2', idOf(s, 'Барселона'), 15_000));
    s = must(lock(s, 16_000));
    const input = factInput(s);
    expect(input.questions[0]).toMatchObject({ bluff: true, limitMs: bluff.choiceTime * 1000 });
    expect(input.rows.map((r) => [r.playerId, r.accepted, r.bluff])).toEqual([
      ['p1', false, { pick: true, truth: false, fooled: 0 }],
      ['p2', true, { pick: true, truth: true, fooled: 1 }],
      ['p3', false, { pick: false, truth: false, fooled: 0 }],
    ]);
  });

  it('final: the wager is in the row; silence is no row', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single], PLAIN), finalRound('f', withId(single, 'f1'))], { leaderboard: 'end' });
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро'), 0, rng);
    s = must(submitAnswer(must(submitAnswer(s, 'p1', kyiv, 1000)), 'p2', kyiv, 1000));
    s = to(s, 'wager', 3000);
    s = must(placeWager(s, 'p1', 500, 4000, rng));
    s = must(placeWager(s, 'p2', 300, 5000, rng));
    expect(s.phase).toBe('question');
    s = must(lock(must(submitAnswer(s, 'p1', kyiv, 6000))));
    const input = factInput(s);
    expect(input.questions[1]).toMatchObject({ index: 1, roundIndex: 1, number: 1, final: true });
    expect(input.rows.filter((r) => r.questionIndex === 1)).toEqual([expect.objectContaining({ playerId: 'p1', wager: 500, accepted: true })]);
    expect(input.rows.filter((r) => r.questionIndex === 0).map((r) => r.wager)).toEqual([null, null]);
  });

  it('a poll gives no rows and is not scored', () => {
    let s = startRound(lobbyWith(makeQuiz([poll, single], PLAIN), 'Оля', 'Петро'), 0, rng);
    s = must(submitAnswer(s, 'p1', { type: 'poll', optionId: 'a' }, 1000));
    s = must(lock(s));
    const input = factInput(s);
    expect(input.questions).toEqual([expect.objectContaining({ index: 0, scored: false })]);
    expect(input.rows).toEqual([]);
  });

  it('the number counts questions within the round', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single], PLAIN), classicRound('r2', [withId(single, 'q2'), withId(single, 'q3')], PLAIN)]);
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро'), 0, rng);
    s = must(lock(s));
    s = to(s, 'question', 1000);
    s = to(must(lock(s)), 'question', 2000);
    s = must(lock(s));
    expect(factInput(s).questions.map((q) => [q.index, q.roundIndex, q.number])).toEqual([
      [0, 0, 1],
      [1, 1, 1],
      [2, 1, 2],
    ]);
  });

  it('a bought debuff: who bought it and on whom', () => {
    const s = must(buyDebuff(rich(), 'p1', 'p2', 'fog', DEBUFF_T0));
    expect(factInput(s).debuffs).toEqual([{ by: 'p1', target: 'p2' }]);
  });

  it('the input is cached per state', () => {
    const s = must(lock(startRound(lobbyWith(makeQuiz([single], PLAIN), 'Оля', 'Петро'), 0, rng)));
    expect(factInput(s)).toBe(factInput(s));
  });

  it('away marks from two seconds: the participant and the closed question (12e)', () => {
    const away = (s: GameState, person: string, ms: number): GameState => ({
      ...s,
      plays: s.plays.map((p, i) => (i === s.questionIndex ? { ...p, away: { ...p.away, [person]: { ms, count: 1, since: null } } } : p)),
    });
    const open = startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    const marked = away(away(open, 'p1', 2000), 'p2', 1900);
    // відкрите запитання ще не рахується
    expect(factInput(marked).away).toEqual([]);
    expect(factInput(must(lock(marked))).away).toEqual([{ playerId: 'p1', questionIndex: 0 }]);
    // команда: людина → команда, без повторів
    const base = teamQuiz([classicRound('r1', [single], PLAIN)]);
    let team = must(next(teamGame(base, [['Оля', 'Петро'], ['Віра']]), 1000, rng));
    team = away(away(away(team, 'm1', 2500), 'm2', 4000), 'm3', 100);
    expect(factInput(must(lock(team))).away).toEqual([{ playerId: 't1', questionIndex: 0 }]);
  });

  it('away marks on unscored questions (poll, cloud) are not facts, as in the history (12e)', () => {
    let s = startRound(lobbyWith(makeQuiz([poll, single], PLAIN), 'Оля', 'Петро'), 0, rng);
    s = { ...s, plays: s.plays.map((p, i) => (i === 0 ? { ...p, away: { p1: { ms: 5000, count: 1, since: null } } } : p)) };
    s = must(lock(s));
    expect(factInput(s).away).toEqual([]);
  });
});
