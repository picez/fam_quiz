import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type AdjustmentSource, type Answer } from '@quiz/shared';
import { adjustScore } from './adjust';
import { scoreLines } from './breakdown';
import { placeWager } from './final';
import { end, lock, next, recordOf, removePlayer, start, submitAnswer, type GameState } from './game';
import { undoPanel, undoScore } from './undo';
import { blitzRound, classicRound, finalRound, makeRoundsQuiz, poll, single, wipeoutLadder, wipeoutRound, withId } from './testing/fixtures';
import { toDuelQuestion } from './testing/duel';
import { acceptAll, lobbyWith, must, openAt, sendBlitz, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const T0 = 1_000_000;
const rng = () => 0;
const R = { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' as const } };
const right: Answer = { type: 'single', optionId: 'b' };
const wrong: Answer = { type: 'single', optionId: 'a' };
const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], R), classicRound('r2', [withId(single, 'q3')], R)]);
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.score;

/** Відповіді всіх; запитання закривається само; next → розкриття. */
function answerAll(s: GameState, answers: Record<string, Answer>, now: number): GameState {
  let state = s;
  for (const [id, answer] of Object.entries(answers)) state = must(submitAnswer(state, id, answer, now));
  return must(next(state, now + 100, rng));
}
/** Розкриття q1: Оля p1 +1000, Петро p2 −1000, Іра p3 +1000. */
const revealed1 = () => answerAll(openAt(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), T0), { p1: right, p2: wrong, p3: right }, T0 + 1000);
/** Таблиця після q1 (leaderboard). */
const after1 = () => must(next(revealed1(), T0 + 2000, rng));
/** Інваріант 11f: Σ рядків scoreLines гравця = його рахунок. */
function expectLinesMatch(s: GameState) {
  for (const p of s.players) expect(scoreLines(s).filter((l) => l.playerId === p.id).reduce((sum, l) => sum + l.points, 0)).toBe(p.score);
}
/** «Далі», доки гра не дійде до етапу phase. */
function until(s: GameState, phase: GameState['phase'], now: number): GameState {
  let state = s;
  while (state.phase !== phase) state = must(next(state, now, rng));
  return state;
}
/** Від after1(): q2 (Оля wrong, Петро right, Іра right) до кінця раунду 1. */
const roundEnd = () => until(answerAll(must(next(after1(), T0 + 3000, rng)), { p1: wrong, p2: right, p3: right }, T0 + 4000), 'round_end', T0 + 5000);

/** Перша сходинка «Ва-банк»: відповіді, закриття, розкриття (як у game.wipeout.test.ts). */
function playRung(s: GameState, answers: Record<string, Answer>, now: number): GameState {
  let current = s;
  for (const [id, answer] of Object.entries(answers)) current = must(submitAnswer(current, id, answer, now));
  if (current.phase === 'question') current = must(lock(current));
  return must(next(current, now + 500, rng));
}
const RIGHT: Answer[] = [{ type: 'single', optionId: 'b' }];

describe('host undo', () => {
  it('undoes an answer with a forward-only undo adjustment; the record and the verdict stay', () => {
    const s0 = after1();
    expect(s0.phase).toBe('leaderboard');
    const s = must(undoScore(s0, { question: 0, playerId: 'p2' }, T0 + 3000));
    expect(score(s, 'p2')).toBe(0);
    expect(recordOf(s, 0, 'p2')).toMatchObject({ accepted: false, points: -1000 });
    expect(s.adjustments).toEqual([
      { seq: 1, playerId: 'p2', points: 1000, roundIndex: 0, afterQuestion: 1, source: 'undo', at: T0 + 3000, undoes: { question: 0 }, batch: 1 },
    ]);
    expectLinesMatch(s);
  });

  it('a repeat is already_undone; «Повернути» returns the undo once and cannot itself be undone; the answer can be undone again', () => {
    const s1 = must(undoScore(after1(), { question: 0, playerId: 'p2' }, T0 + 3000));
    expect(undoScore(s1, { question: 0, playerId: 'p2' }, T0 + 3100)).toEqual({ ok: false, error: 'already_undone' });
    const s2 = must(undoScore(s1, { seq: 1 }, T0 + 3200));
    expect(score(s2, 'p2')).toBe(-1000);
    expect(s2.adjustments[1]).toMatchObject({ seq: 2, playerId: 'p2', points: -1000, source: 'undo', undoes: { seq: 1 }, batch: 2, roundIndex: 0 });
    expectLinesMatch(s2);
    expect(undoScore(s2, { seq: 1 }, T0 + 3300)).toEqual({ ok: false, error: 'already_undone' });
    expect(undoScore(s2, { seq: 2 }, T0 + 3300)).toEqual({ ok: false, error: 'not_allowed' });
    const s3 = must(undoScore(s2, { question: 0, playerId: 'p2' }, T0 + 3400));
    expect(s3.adjustments[2]).toMatchObject({ seq: 3, points: 1000, undoes: { question: 0 }, batch: 3 });
    expect(score(s3, 'p2')).toBe(0);
    expectLinesMatch(s3);
  });

  it('undoes host points', () => {
    const given = must(adjustScore(after1(), 'p3', 50, T0 + 2500));
    const s = must(undoScore(given, { seq: 1 }, T0 + 3000));
    expect(score(s, 'p3')).toBe(1000);
    expect(s.adjustments[1]).toMatchObject({ seq: 2, playerId: 'p3', points: -50, source: 'undo', undoes: { seq: 1 }, batch: 2, roundIndex: 0 });
    expectLinesMatch(s);
    expect(undoScore(s, { seq: 1 }, T0 + 3100)).toEqual({ ok: false, error: 'already_undone' });
  });

  it('duels, debuffs and format bonuses are not undone', () => {
    for (const source of ['duel', 'debuff', 'survival', 'ladder'] satisfies AdjustmentSource[]) {
      const s = must(adjustScore(after1(), 'p1', 300, T0, source));
      expect(undoScore(s, { seq: 1 }, T0 + 3000)).toEqual({ ok: false, error: 'not_allowed' });
    }
  });

  it('carried points (12r) are not undone: not by seq, not with their round, not on the panel', () => {
    let s = must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), T0, { roundIndex: 0, points: { p1: 42_434, p2: -150 } }));
    s = answerAll(must(next(s, T0, rng)), { p1: right, p2: wrong, p3: right }, T0 + 1000);
    s = must(next(s, T0 + 2000, rng));
    expect(s.adjustments.map((a) => [a.seq, a.source])).toEqual([
      [1, 'carry'],
      [2, 'carry'],
    ]);
    expect(undoScore(s, { seq: 1 }, T0 + 3000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(undoScore(s, { seq: 2 }, T0 + 3000)).toEqual({ ok: false, error: 'not_allowed' });
    const panel = undoPanel(s)!;
    expect(panel.rounds.flatMap((r) => r.loose)).toEqual([]);
    expect(s.phase).toBe('leaderboard');
    const undone = must(undoScore(s, { round: 0 }, T0 + 3000));
    expect(undone.adjustments.filter((a) => a.source === 'undo').every((a) => a.undoes !== undefined && 'question' in a.undoes && a.undoes.question === 0)).toBe(true);
    expect([score(undone, 'p1'), score(undone, 'p2'), score(undone, 'p3')]).toEqual([42_434, -150, 0]);
    expectLinesMatch(undone);
  });

  it('refusals: unknown targets, the lobby and the end, the question still being revealed, an empty round, the autopilot', () => {
    const s = after1();
    expect(undoScore(s, { seq: 9 }, T0)).toEqual({ ok: false, error: 'not_found' });
    expect(undoScore(s, { question: 7, playerId: 'p1' }, T0)).toEqual({ ok: false, error: 'not_found' });
    expect(undoScore(s, { question: 0, playerId: 'p9' }, T0)).toEqual({ ok: false, error: 'not_found' });
    expect(undoScore(s, { round: 5 }, T0)).toEqual({ ok: false, error: 'not_found' });
    expect(undoScore(lobbyWith(quiz, 'Оля'), { question: 0, playerId: 'p1' }, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(undoScore(must(end(s, T0 + 4000)), { question: 0, playerId: 'p1' }, T0 + 5000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(undoScore(revealed1(), { question: 0, playerId: 'p2' }, T0 + 1500)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(undoScore(revealed1(), { question: 0 }, T0 + 1500)).toEqual({ ok: false, error: 'wrong_phase' });
    const onReveal = must(adjustScore(revealed1(), 'p3', 50, T0 + 1500));
    expect(undoScore(onReveal, { seq: 1 }, T0 + 1600)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(undoScore(must(next(onReveal, T0 + 2000, rng)), { seq: 1 }, T0 + 2100).ok).toBe(true);
    expect(undoScore(s, { round: 1 }, T0)).toEqual({ ok: false, error: 'not_allowed' });
    const piloted: GameState = { ...s, autopilot: { authorId: 'p1', at: null } };
    expect(undoScore(piloted, { question: 0, playerId: 'p2' }, T0)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('a poll is not undone and is not in the panel', () => {
    const pollQuiz = makeRoundsQuiz([classicRound('r1', [poll, single], R)]);
    const vote: Answer = { type: 'poll', optionId: 'a' };
    let s = openAt(lobbyWith(pollQuiz, 'Оля', 'Петро'), T0);
    s = answerAll(s, { p1: vote, p2: vote }, T0 + 1000);
    s = must(next(s, T0 + 2000, rng));
    expect(undoScore(s, { question: 0, playerId: 'p1' }, T0 + 3000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(undoPanel(s)!.rounds.flatMap((r) => r.questions).map((q) => q.index)).not.toContain(0);
  });

  it('an answer in «Ва-банк» is not undone', () => {
    const wipeQuiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder)]);
    let s = startRound(lobbyWith(wipeQuiz, 'Оля', 'Петро'), T0, rng);
    s = playRung(s, { p1: RIGHT[0], p2: RIGHT[0] }, T0 + 1000);
    s = must(next(s, T0 + 2000, rng));
    expect(undoScore(s, { question: 0, playerId: 'p1' }, T0 + 3000)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('undoes everything of a question in one batch: answers in player order, then host points', () => {
    const base = must(next(must(adjustScore(revealed1(), 'p3', 50, T0 + 1500)), T0 + 2000, rng));
    const s = must(undoScore(base, { question: 0 }, T0 + 3000));
    expect(s.adjustments.slice(1).map((a) => ({ seq: a.seq, playerId: a.playerId, points: a.points, undoes: a.undoes, batch: a.batch }))).toEqual([
      { seq: 2, playerId: 'p1', points: -1000, undoes: { question: 0 }, batch: 2 },
      { seq: 3, playerId: 'p2', points: 1000, undoes: { question: 0 }, batch: 2 },
      { seq: 4, playerId: 'p3', points: -1000, undoes: { question: 0 }, batch: 2 },
      { seq: 5, playerId: 'p3', points: -50, undoes: { seq: 1 }, batch: 2 },
    ]);
    for (const id of ['p1', 'p2', 'p3']) expect(score(s, id)).toBe(0);
    expectLinesMatch(s);
    expect(undoScore(s, { question: 0 }, T0 + 3100)).toEqual({ ok: false, error: 'already_undone' });

    const petro = must(undoScore(base, { question: 0, playerId: 'p2' }, T0 + 3000));
    const rest = must(undoScore(petro, { question: 0 }, T0 + 3100));
    expect(rest.adjustments.slice(2).map((a) => [a.playerId, a.points, a.batch])).toEqual([
      ['p1', -1000, 3],
      ['p3', -1000, 3],
      ['p3', -50, 3],
    ]);
    expectLinesMatch(rest);
  });

  it('undoes a whole round in one batch', () => {
    const s0 = roundEnd();
    expect(s0.phase).toBe('round_end');
    const s = must(undoScore(s0, { round: 0 }, T0 + 6000));
    expect(s.adjustments).toHaveLength(6);
    expect(new Set(s.adjustments.map((a) => a.batch))).toEqual(new Set([1]));
    expect(s.adjustments.every((a) => a.roundIndex === 0 && a.source === 'undo')).toBe(true);
    for (const id of ['p1', 'p2', 'p3']) expect(score(s, id)).toBe(0);
    expectLinesMatch(s);
  });

  it('an undo made later stands in the round of what it undoes', () => {
    const intro = must(next(roundEnd(), T0 + 6000, rng));
    expect(intro.roundIndex).toBe(1);
    const s = must(undoScore(intro, { question: 0, playerId: 'p1' }, T0 + 7000));
    expect(s.adjustments.at(-1)).toMatchObject({ roundIndex: 0, source: 'undo', undoes: { question: 0 } });
    expect(s.roundIndex).toBe(1);
    expectLinesMatch(s);
  });

  it('the final wager follows the new score', () => {
    const finalQuiz = makeRoundsQuiz([classicRound('r1', [single], R), finalRound('f', withId(single, 'f1'))]);
    let s = answerAll(openAt(lobbyWith(finalQuiz, 'Оля', 'Петро'), T0), { p1: right, p2: right }, T0 + 1000);
    s = until(s, 'wager', T0 + 2000);
    s = must(placeWager(s, 'p1', 1000, T0 + 3000, rng));
    s = must(undoScore(s, { question: 0, playerId: 'p1' }, T0 + 4000));
    expect(s.final?.limits.p1).toBe(0);
    expect(s.final?.wagers.p1).toBe(0);
  });

  it('teams: a team answer is undone, the panel rows carry team ids and names', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [single, withId(single, 'q2')], R)]), [['Оля', 'Петро'], ['Іра']]), T0, rng));
    s = must(submitAnswer(s, 't1', right, T0 + 1000));
    s = must(submitAnswer(s, 't2', wrong, T0 + 1000));
    s = must(next(must(next(s, T0 + 2000, rng)), T0 + 3000, rng));
    const rows = undoPanel(s)!.rounds[0].questions[0].rows;
    const nick = (id: string) => s.players.find((p) => p.id === id)!.nickname;
    expect(rows.map((r) => [r.playerId, r.nickname, r.points])).toEqual([
      ['t1', nick('t1'), 1000],
      ['t2', nick('t2'), -1000],
    ]);
    const undone = must(undoScore(s, { question: 0, playerId: 't1' }, T0 + 4000));
    expect(score(undone, 't1')).toBe(0);
    expectLinesMatch(undone);
  });

  it('a duel started on a reveal keeps that question hidden; returning to the leaderboard frees it', () => {
    const duel = toDuelQuestion();
    expect(duel.phase).toBe('duel');
    expect(duel.duel?.returnPhase).toBe('reveal');
    expect(duel.questionIndex).toBe(1);
    expect(undoScore(duel, { question: 1, playerId: 'p1' }, T0 + 70_000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(undoScore(duel, { question: 1 }, T0 + 70_000)).toEqual({ ok: false, error: 'wrong_phase' });
    const questions = undoPanel(duel)!.rounds.flatMap((r) => r.questions).map((q) => q.index);
    expect(questions).toEqual([0]);
    const fromBoard: GameState = { ...duel, duel: { ...duel.duel!, returnPhase: 'leaderboard' } };
    const s = must(undoScore(fromBoard, { question: 1, playerId: 'p1' }, T0 + 70_000));
    expect(s.adjustments.at(-1)).toMatchObject({ playerId: 'p1', source: 'undo', undoes: { question: 1 } });
    expect(undoPanel(fromBoard)!.rounds[0].questions.map((q) => q.index)).toEqual([1, 0]);
  });

  it('negative question and round indexes are not_found', () => {
    const s = after1();
    expect(undoScore(s, { question: -1, playerId: 'p1' }, T0)).toEqual({ ok: false, error: 'not_found' });
    expect(undoScore(s, { question: -1 }, T0)).toEqual({ ok: false, error: 'not_found' });
    expect(undoScore(s, { round: -1 }, T0)).toEqual({ ok: false, error: 'not_found' });
  });

  it('a removed player leaves the panel, and targets on their rows are not_found', () => {
    const given = must(adjustScore(after1(), 'p2', 50, T0 + 2500));
    const s = must(removePlayer(given, 'p2', T0 + 2600));
    const rows = undoPanel(s)!.rounds.flatMap((r) => [...r.questions.flatMap((q) => q.rows), ...r.loose]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.playerId === 'p2')).toBe(false);
    expect(undoScore(s, { question: 0, playerId: 'p2' }, T0 + 3000)).toEqual({ ok: false, error: 'not_found' });
    expect(undoScore(s, { seq: 1 }, T0 + 3000)).toEqual({ ok: false, error: 'not_found' });
  });

  it('undoes a blitz answer, keeping the lines equal to the score', () => {
    const blitzQuiz = makeRoundsQuiz([blitzRound('b1', [single, withId(single, 'q2')])]);
    // Перевірка вручну: ведучий приймає відповідь, запитання закривається.
    let s = acceptAll(sendBlitz(openAt(lobbyWith(blitzQuiz, 'Оля', 'Петро'), T0), 'p1', right, T0 + 1000), T0 + 1500);
    s = until(s, 'leaderboard', T0 + 2000);
    const points = recordOf(s, 0, 'p1')!.points;
    expect(points).not.toBe(0);
    expect(undoPanel(s)!.rounds[0]).toMatchObject({ type: 'blitz', questions: [{ index: 0, rows: [{ playerId: 'p1', points }] }] });
    const undone = must(undoScore(s, { question: 0, playerId: 'p1' }, T0 + 3000));
    expect(undone.adjustments.at(-1)).toMatchObject({ playerId: 'p1', points: -points, roundIndex: 0, undoes: { question: 0 } });
    expect(score(undone, 'p1')).toBe(0);
    expectLinesMatch(undone);
  });

  it('the panel: rows of closed questions with who undid them, newest round and question first', () => {
    const onReveal = must(adjustScore(revealed1(), 'p3', 50, T0 + 1500));
    expect(undoPanel(onReveal)).toEqual({ rounds: [] });
    const later = must(next(onReveal, T0 + 2000, rng));
    expect(undoPanel(later)).toEqual({
      rounds: [
        {
          index: 0,
          title: '',
          type: 'classic',
          loose: [],
          questions: [
            {
              index: 0,
              number: 1,
              text: 'Столиця України?',
              rows: [
                { kind: 'answer', playerId: 'p1', nickname: 'Оля', points: 1000, target: { question: 0, playerId: 'p1' }, undoneBy: null },
                { kind: 'answer', playerId: 'p2', nickname: 'Петро', points: -1000, target: { question: 0, playerId: 'p2' }, undoneBy: null },
                { kind: 'answer', playerId: 'p3', nickname: 'Іра', points: 1000, target: { question: 0, playerId: 'p3' }, undoneBy: null },
                { kind: 'host', playerId: 'p3', nickname: 'Іра', points: 50, target: { seq: 1 }, undoneBy: null },
              ],
            },
          ],
        },
      ],
    });
    const petroRow = (s: GameState) => undoPanel(s)!.rounds[0].questions[0].rows[1];
    const undone = must(undoScore(later, { question: 0, playerId: 'p2' }, T0 + 3000));
    expect(petroRow(undone).undoneBy).toBe(2);
    expect(petroRow(must(undoScore(undone, { seq: 2 }, T0 + 3100))).undoneBy).toBeNull();

    const ended = roundEnd();
    const first = undoPanel(ended)!.rounds[0].questions[0];
    expect([first.index, first.number]).toEqual([1, 2]);
    const intro = must(adjustScore(must(next(ended, T0 + 6000, rng)), 'p1', 100, T0 + 6500));
    expect(undoPanel(intro)!.rounds[0]).toEqual({
      index: 1,
      title: '',
      type: 'classic',
      questions: [],
      loose: [{ kind: 'host', playerId: 'p1', nickname: 'Оля', points: 100, target: { seq: 1 }, undoneBy: null }],
    });
    expect(undoPanel(intro)!.rounds[1].index).toBe(0);

    expect(undoPanel(lobbyWith(quiz, 'Оля'))).toBeNull();
    expect(undoPanel(must(end(later, T0 + 4000)))).toBeNull();
    expect(undoPanel({ ...later, autopilot: { authorId: 'p1', at: null } })).toBeNull();
  });
});
