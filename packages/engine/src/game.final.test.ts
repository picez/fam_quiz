import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type FinalRound, type Question, type RoundRules } from '@quiz/shared';
import { adjustScore } from './adjust';
import { guessWord } from './chain';
import { placeWager } from './final';
import {
  end,
  endRound,
  finalShown,
  lock,
  next,
  override,
  pause,
  recordOf,
  removePlayer,
  setConnected,
  start,
  submitAnswer,
  tick,
  type GameState,
} from './game';
import { pendingOf } from './hold';
import { finalPoints } from './score';
import { adjustTime, limitMsOf } from './timing';
import { chain, classicRound, finalRound, makeRoundsQuiz, order, single, withId, withPoints, withVideo } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const rng = () => 0;
const q2 = withId(withPoints(single, 400), 'q2');
const f1 = withId(single, 'f1');

const score = (state: GameState, playerId: string) => state.players.find((p) => p.id === playerId)?.score;
const scores = (state: GameState) => state.players.map((p) => p.score);
const last = (state: GameState) => state.plays[state.plays.length - 1];
const finalRecord = (state: GameState, playerId: string) => recordOf(state, state.plays.length - 1, playerId);

function quizWith(final: Partial<Omit<FinalRound, 'id' | 'type' | 'questions'>> = {}, question: Question = f1, rules: Partial<RoundRules> = {}) {
  return makeRoundsQuiz(
    [
      classicRound('r1', [single, q2], { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus', ...rules } }),
      finalRound('f', question, final),
    ],
    { leaderboard: 'end' },
  );
}

/**
 * Класичний раунд зіграно, гра на round_end. q1 (1000): p1 правильно, p2 і p3 мовчать.
 * q2 (400): p2 правильно, p3 неправильно (−400), p1 мовчить. Рахунки 1000, 400, −400.
 */
function toRoundEnd(final: Partial<Omit<FinalRound, 'id' | 'type' | 'questions'>> = {}, question: Question = f1, rules: Partial<RoundRules> = {}): GameState {
  let s = must(start(lobbyWith(quizWith(final, question, rules), 'Анна', 'Богдан', 'Віра')));
  s = must(next(s, 0, rng));
  s = must(submitAnswer(s, 'p1', right, 1000));
  s = must(next(must(lock(s)), 2000, rng));
  s = must(next(s, 3000, rng));
  s = must(submitAnswer(s, 'p2', right, 4000));
  s = must(submitAnswer(s, 'p3', wrong, 4000));
  s = must(next(must(lock(s)), 5000, rng));
  return must(next(s, 6000, rng));
}

/** Гра на етапі ставок фіналу. */
function toWagers(final: Partial<Omit<FinalRound, 'id' | 'type' | 'questions'>> = {}, question: Question = f1, rules: Partial<RoundRules> = {}): GameState {
  const intro = must(next(toRoundEnd(final, question, rules), 7000, rng));
  return must(next(intro, 8000, rng));
}

/** Ставки 500 / 400 / 0, запитання відкрито в момент 10 000. */
function toQuestion(final: Partial<Omit<FinalRound, 'id' | 'type' | 'questions'>> = {}, question: Question = f1): GameState {
  let s = toWagers(final, question);
  s = must(placeWager(s, 'p1', 500, 9000, rng));
  s = must(placeWager(s, 'p2', 400, 9500, rng));
  return must(placeWager(s, 'p3', 0, 10_000, rng));
}

/** p1 правильно, p2 неправильно, p3 мовчить; закрито й розкрито. */
function toReveal(): GameState {
  let s = toQuestion();
  s = must(submitAnswer(s, 'p1', right, 11_000));
  s = must(submitAnswer(s, 'p2', wrong, 12_000));
  return must(next(must(lock(s)), 13_000, rng));
}

describe('the final round', () => {
  it('the final starts with an intro, then secret wagers with limits from the score', () => {
    const roundEnd = toRoundEnd();
    expect(roundEnd.phase).toBe('round_end');
    expect(scores(roundEnd)).toEqual([1000, 400, -400]);
    const intro = must(next(roundEnd, 7000, rng));
    expect(intro.phase).toBe('intro');
    expect(intro.final).toEqual({ limits: {}, wagers: {}, allIn: [], order: [], shown: 0, split: false });
    const wager = must(next(intro, 8000, rng));
    expect(wager.phase).toBe('wager');
    expect(wager.final?.limits).toEqual({ p1: 1000, p2: 400, p3: 0 });
    expect(wager.startedAt).toBeNull();
    expect(wager.endsAt).toBeNull();
    expect(wager.remainingMs).toBeNull();
    expect(tick(wager, 1e9)).toBe(wager);
  });

  it('a quiz that starts with a final still opens with an intro and zero limits', () => {
    const quiz = makeRoundsQuiz([finalRound('f', f1)]);
    const intro = must(start(lobbyWith(quiz, 'Анна', 'Богдан')));
    expect(intro.phase).toBe('intro');
    expect(intro.final).toEqual({ limits: {}, wagers: {}, allIn: [], order: [], shown: 0, split: false });
    const wager = must(next(intro, 1000, rng));
    expect(wager.phase).toBe('wager');
    expect(wager.final?.limits).toEqual({ p1: 0, p2: 0 });
  });

  it('a classic round has no final state', () => {
    const roundEnd = toRoundEnd();
    expect(roundEnd.final).toBeNull();
  });

  it('wagers outside 0..limit are refused', () => {
    const s = toWagers();
    for (const amount of [1001, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(placeWager(s, 'p1', amount, 9000, rng)).toEqual({ ok: false, error: 'wager_invalid' });
    }
    expect(placeWager(s, 'p3', 1, 9000, rng)).toEqual({ ok: false, error: 'wager_invalid' });
    expect(must(placeWager(s, 'p3', 0, 9000, rng)).final?.wagers).toEqual({ p3: 0 });
    expect(must(placeWager(s, 'p1', 1000, 9000, rng)).final?.wagers).toEqual({ p1: 1000 });
    const paused = must(pause(s, 9000));
    expect(placeWager(paused, 'p1', 500, 9000, rng)).toEqual({ ok: false, error: 'paused' });
    expect(placeWager(s, 'px', 0, 9000, rng)).toEqual({ ok: false, error: 'not_found' });
    expect(placeWager(toRoundEnd(), 'p1', 0, 9000, rng)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the question opens once every connected player has wagered, and wagers can change before that', () => {
    let s = toWagers();
    s = must(placeWager(s, 'p1', 500, 9000, rng));
    s = must(placeWager(s, 'p1', 600, 9100, rng));
    s = must(placeWager(s, 'p2', 400, 9200, rng));
    expect(s.phase).toBe('wager');
    expect(s.final?.wagers).toEqual({ p1: 600, p2: 400 });
    s = must(placeWager(s, 'p3', 0, 9300, rng));
    expect(s.phase).toBe('question');
    expect(s.startedAt).toBe(9300);
    expect(s.endsAt).toBe(9300 + 20_000);
    expect(last(s).question.id).toBe('f1');
    expect(last(s).final).toEqual({ wagers: { p1: 600, p2: 400, p3: 0 }, allIn: ['p2'], graded: [] });
    expect(placeWager(s, 'p1', 100, 9400, rng)).toEqual({ ok: false, error: 'wrong_phase' });

    let away = must(setConnected(toWagers(), 'p3', false, 8500));
    away = must(placeWager(away, 'p1', 500, 9000, rng));
    expect(away.phase).toBe('wager');
    away = must(placeWager(away, 'p2', 100, 9100, rng));
    expect(away.phase).toBe('question');
    expect(last(away).final?.wagers.p3).toBe(0);
  });

  it('the host opens the question without missing wagers and they count as zero', () => {
    const s = must(placeWager(toWagers(), 'p1', 500, 9000, rng));
    const opened = must(next(s, 9500, rng));
    expect(opened.phase).toBe('question');
    expect(opened.startedAt).toBe(9500);
    expect(last(opened).final).toEqual({ wagers: { p1: 500, p2: 0, p3: 0 }, allIn: [], graded: [] });
  });

  it('a correct answer adds the wager and a wrong or missing one subtracts it', () => {
    const s = toReveal();
    expect(s.phase).toBe('reveal');
    expect(scores(s)).toEqual([1500, 0, -400]);
    expect(finalRecord(s, 'p1')).toMatchObject({ grade: 'correct', accepted: true, accuracy: 1, points: 500, basePoints: 500 });
    expect(finalRecord(s, 'p2')).toMatchObject({ grade: 'wrong', accepted: false, accuracy: 0, points: -400 });
    const silent = finalRecord(s, 'p3');
    expect(silent).toMatchObject({ answer: null, grade: 'wrong', accepted: false, overridden: false, timeMs: 20_000 });
    expect(silent?.points).toBe(0);
    expect(finalPoints(300, true)).toBe(300);
    expect(finalPoints(300, false)).toBe(-300);
    expect(finalPoints(0, false)).toBe(0);
  });

  it('multipliers, streaks, partial credit and the speed bonus do not apply in the final', () => {
    // Серія довжиною 1 спрацювала б уже на самому запитанні фіналу, якби правила раунду діяли.
    const rules: Partial<RoundRules> = { multiplier: 2, partial: 50, streak: { length: 1, bonus: { kind: 'fixed', value: 100 } } };
    let s = toWagers({}, f1, rules);
    const before = score(s, 'p1') ?? 0;
    s = must(placeWager(s, 'p1', 500, 9000, rng));
    s = must(next(s, 10_000, rng));
    s = must(submitAnswer(s, 'p1', right, 10_500));
    s = must(next(must(lock(s)), 11_000, rng));
    expect(finalRecord(s, 'p1')).toMatchObject({ points: 500, basePoints: 500, streakBonus: 0 });
    expect(score(s, 'p1')).toBe(before + 500);
    expect(s.players.every((p) => p.streak === 0)).toBe(true);

    const finalOrder = withId(order, 'f1');
    let o = must(placeWager(toWagers({}, finalOrder, { partial: 50 }), 'p1', 500, 9000, rng));
    o = must(next(o, 10_000, rng));
    o = must(submitAnswer(o, 'p1', { type: 'order', itemIds: ['u', 'l', 'h', 'k'] }, 10_500));
    expect(finalRecord(o, 'p1')).toMatchObject({ grade: 'wrong', accepted: false, accuracy: 0, points: -500 });
  });

  it('final answer time does not count towards the tie-break time', () => {
    const before = toWagers().players.map((p) => p.totalTimeMs);
    expect(toReveal().players.map((p) => p.totalTimeMs)).toEqual(before);
  });

  it('manual check keeps a provisional wrong grade until the host decides', () => {
    let s = toQuestion({ check: 'manual' });
    s = must(submitAnswer(s, 'p1', right, 11_000));
    s = must(submitAnswer(s, 'p2', right, 12_000));
    expect(finalRecord(s, 'p1')).toMatchObject({ grade: 'wrong', accepted: false, accuracy: 0, points: -500 });
    expect(finalRecord(s, 'p2')).toMatchObject({ grade: 'wrong', points: -400 });
    expect(last(s).final?.graded).toEqual([]);
    expect(override(s, 'p1', 'correct', 12_500)).toEqual({ ok: false, error: 'wrong_phase' });
    s = must(lock(s));
    s = must(override(s, 'p1', 'correct'));
    expect(finalRecord(s, 'p1')).toMatchObject({ grade: 'correct', accepted: true, accuracy: 1, points: 500, overridden: false });
    expect(last(s).final?.graded).toEqual(['p1']);
    expect(score(s, 'p1')).toBe(1500);
    expect(override(s, 'p1', 'partial')).toEqual({ ok: false, error: 'partial_disabled' });
    s = must(next(s, 13_000, rng));
    expect(finalRecord(s, 'p2')).toMatchObject({ grade: 'wrong', points: -400 });
    expect(score(s, 'p2')).toBe(0);
  });

  it('the reveal goes player by player from the lowest score before the final', () => {
    let s = toReveal();
    expect(s.final?.order).toEqual(['p3', 'p2', 'p1']);
    expect(s.final?.shown).toBe(0);
    expect(finalShown(s, 'p3')).toBe(false);
    s = must(next(s, 14_000, rng));
    expect(s.phase).toBe('reveal');
    expect(s.final?.shown).toBe(1);
    expect(finalShown(s, 'p3')).toBe(true);
    expect(finalShown(s, 'p2')).toBe(false);
    s = must(next(s, 15_000, rng));
    expect(s.final?.shown).toBe(2);
    expect(finalShown(s, 'p2')).toBe(true);
    expect(finalShown(s, 'p1')).toBe(false);
    s = must(next(s, 16_000, rng));
    expect(s.final?.shown).toBe(3);
    expect(s.phase).toBe('reveal');
    s = must(next(s, 17_000, rng));
    expect(s.phase).toBe('finished');
    expect(finalShown(s, 'p1')).toBe(true);
  });

  it('finalShown is false before the reveal and true outside the final', () => {
    expect(finalShown(toRoundEnd(), 'p1')).toBe(true);
    const q = toQuestion();
    expect(finalShown(q, 'p1')).toBe(false);
    expect(finalShown(must(lock(q)), 'p1')).toBe(false);
    expect(finalShown(toReveal(), 'px')).toBe(false);
  });

  it('ties in the reveal order follow the join order', () => {
    const quiz = makeRoundsQuiz([finalRound('f', f1)]);
    let s = must(next(must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра'))), 1000, rng));
    s = must(next(s, 2000, rng));
    s = must(submitAnswer(s, 'p2', right, 3000));
    s = must(next(must(lock(s)), 4000, rng));
    expect(s.final?.order).toEqual(['p1', 'p2', 'p3']);
  });

  it('the host can change a final grade at the reveal, but not for a silent player', () => {
    let s = toReveal();
    s = must(override(s, 'p2', 'correct'));
    expect(finalRecord(s, 'p2')).toMatchObject({ grade: 'correct', accepted: true, points: 400, overridden: true });
    expect(score(s, 'p2')).toBe(800);
    expect(last(s).final?.graded).toEqual(['p2']);
    expect(s.final?.order).toEqual(['p3', 'p2', 'p1']);
    s = must(override(s, 'p1', 'wrong'));
    expect(score(s, 'p1')).toBe(500);
    expect(override(s, 'p3', 'correct')).toEqual({ ok: false, error: 'not_found' });
    expect(override(s, 'px', 'correct')).toEqual({ ok: false, error: 'not_found' });
  });

  it('a final question with a video has no timer and closes when every connected player answered', () => {
    let s = must(setConnected(toWagers({}, withVideo(f1)), 'p3', false, 8500));
    s = must(placeWager(s, 'p1', 500, 9000, rng));
    s = must(placeWager(s, 'p2', 400, 9100, rng));
    expect(s.phase).toBe('question');
    expect(s.endsAt).toBeNull();
    expect(tick(s, 1e9).phase).toBe('question');
    expect(adjustTime(s, 15, 10_000)).toEqual({ ok: false, error: 'wrong_phase' });
    s = must(submitAnswer(s, 'p1', right, 500_000));
    expect(s.phase).toBe('question');
    s = must(submitAnswer(s, 'p2', right, 600_000));
    expect(s.phase).toBe('locked');
    s = must(next(s, 700_000, rng));
    expect(finalRecord(s, 'p3')).toMatchObject({ answer: null, grade: 'wrong', timeMs: 0 });
    expect(scores(s)).toEqual([1500, 800, -400]);
  });

  it('a timed final question takes ±15 s like a classic one', () => {
    const s = toQuestion();
    const before = limitMsOf(last(s));
    const longer = must(adjustTime(s, 15, 11_000));
    expect(limitMsOf(last(longer))).toBe((before ?? 0) + 15_000);
  });

  it('nobody waits for the host in the final: there is no hold', () => {
    const s = must(submitAnswer(toQuestion(), 'p1', right, 11_000));
    expect(pendingOf(s)).toBeNull();
    expect(s.heldAt).toBeNull();
    expect(s.phase).toBe('question');
  });

  it('kicking a player during the final keeps the reveal order', () => {
    let w = must(placeWager(toWagers(), 'p2', 100, 9000, rng));
    w = must(removePlayer(w, 'p2'));
    expect(w.final?.limits).toEqual({ p1: 1000, p3: 0 });
    expect(w.final?.wagers).toEqual({});
    expect(w.phase).toBe('wager');

    let s = must(next(must(next(toReveal(), 14_000, rng)), 15_000, rng));
    expect(s.final?.shown).toBe(2);
    s = must(removePlayer(s, 'p3'));
    expect(s.final?.order).toEqual(['p2', 'p1']);
    expect(s.final?.shown).toBe(1);
    expect(last(s).final?.wagers).toEqual({ p1: 500, p2: 400 });
    expect(finalShown(s, 'p2')).toBe(true);
    expect(finalShown(s, 'p1')).toBe(false);

    let m = must(override(must(lock(must(submitAnswer(toQuestion({ check: 'manual' }), 'p1', right, 11_000)))), 'p1', 'correct'));
    m = must(removePlayer(m, 'p1'));
    expect(last(m).final).toEqual({ wagers: { p2: 400, p3: 0 }, allIn: ['p2'], graded: [] });
  });

  it('all-in stakes the whole limit and a plain wager drops it', () => {
    let s = must(placeWager(toWagers(), 'p1', 0, 9000, rng, true));
    expect(s.final?.wagers.p1).toBe(1000);
    expect(s.final?.allIn).toEqual(['p1']);
    s = must(placeWager(s, 'p1', 300, 9100, rng));
    expect(s.final?.wagers.p1).toBe(300);
    expect(s.final?.allIn).toEqual([]);
  });

  it('all-in follows host points during the wagers', () => {
    let s = must(placeWager(toWagers(), 'p1', 0, 9000, rng, true));
    s = must(adjustScore(s, 'p1', 200, 9100));
    expect([s.final?.limits.p1, s.final?.wagers.p1]).toEqual([1200, 1200]);
    s = must(adjustScore(s, 'p1', -500, 9200));
    expect([s.final?.limits.p1, s.final?.wagers.p1]).toEqual([700, 700]);
    s = must(adjustScore(s, 'p1', -800, 9300));
    expect([s.final?.limits.p1, s.final?.wagers.p1, s.final?.allIn]).toEqual([0, 0, []]);
    s = must(adjustScore(s, 'p1', 300, 9350));
    expect([s.final?.limits.p1, s.final?.wagers.p1]).toEqual([200, 0]);
    // Звичайна ставка не росте: p2 ставить 300, +500 → межа 900, ставка 300.
    s = must(placeWager(s, 'p2', 300, 9400, rng));
    s = must(adjustScore(s, 'p2', 500, 9500));
    expect([s.final?.limits.p2, s.final?.wagers.p2]).toEqual([900, 300]);
  });

  it('all-in with a zero limit is a plain zero', () => {
    const s = must(placeWager(toWagers(), 'p3', 0, 9000, rng, true));
    expect([s.final?.wagers.p3, s.final?.allIn]).toEqual([0, []]);
  });

  it('the question remembers every stake of the whole limit, pressed or typed', () => {
    let s = must(placeWager(toWagers(), 'p1', 0, 9000, rng, true));
    s = must(placeWager(s, 'p2', 400, 9100, rng));
    s = must(placeWager(s, 'p3', 0, 9200, rng));
    expect(s.phase).toBe('question');
    expect(last(s).final?.allIn).toEqual(['p1', 'p2']);
    expect(last(toQuestion()).final?.allIn).toEqual(['p2']);
  });

  it('kicking a player drops the all-in mark', () => {
    let w = must(placeWager(toWagers(), 'p1', 0, 9000, rng, true));
    w = must(removePlayer(w, 'p1'));
    expect(w.final?.allIn).toEqual([]);

    let s = must(placeWager(toWagers(), 'p1', 0, 9000, rng, true));
    s = must(placeWager(s, 'p2', 400, 9100, rng));
    s = must(placeWager(s, 'p3', 0, 9200, rng));
    s = must(removePlayer(s, 'p1'));
    expect(s.final?.allIn).toEqual([]);
    expect(last(s).final?.allIn).toEqual(['p2']);
  });

  it('ending the round during the wagers leaves no final records; ending after the question settles everyone', () => {
    const w = toWagers();
    const ended = must(endRound(w, 9000));
    expect(ended.phase).toBe('finished');
    expect(ended.plays).toHaveLength(2);
    expect(scores(ended)).toEqual([1000, 400, -400]);
    expect(must(end(w)).plays).toHaveLength(2);

    const answered = must(submitAnswer(toQuestion(), 'p1', right, 11_000));
    const closed = must(endRound(answered, 12_000));
    expect(closed.phase).toBe('finished');
    expect(scores(closed)).toEqual([1500, 0, -400]);
    expect(finalRecord(closed, 'p2')).toMatchObject({ answer: null, grade: 'wrong', points: -400 });
    expect(closed.final?.order).toEqual(['p3', 'p2', 'p1']);
    expect(closed.final?.shown).toBe(closed.final?.order.length);
    expect(finalShown(closed, 'p1')).toBe(true);

    const stopped = must(end(answered));
    expect(stopped.phase).toBe('finished');
    expect(scores(stopped)).toEqual([1500, 0, -400]);
    expect(stopped.final?.shown).toBe(3);

    const midReveal = must(end(must(next(toReveal(), 14_000, rng))));
    expect(midReveal.final?.order).toEqual(['p3', 'p2', 'p1']);
    expect(midReveal.final?.shown).toBe(3);
  });

  it('a chain final: finishing in time wins the wager, playing without finishing loses it, check manual is ignored', () => {
    let s = toQuestion({ check: 'manual' }, chain);
    s = ['Риба', 'Океан', 'Корабель'].reduce((current, word) => must(guessWord(current, 'p1', word, 15_000)), s);
    s = must(guessWord(s, 'p2', 'Риба', 12_000));
    expect(s.phase).toBe('question');
    s = tick(s, 30_000);
    expect(s.phase).toBe('locked');
    s = must(next(s, 31_000, rng));
    expect(s.phase).toBe('reveal');
    expect(finalRecord(s, 'p1')).toMatchObject({ grade: 'correct', points: 500 });
    expect(finalRecord(s, 'p2')).toMatchObject({ grade: 'wrong', points: -400, answer: { type: 'chain', solved: 1 } });
    expect(finalRecord(s, 'p3')).toMatchObject({ answer: null, points: 0 });
    expect(override(s, 'p2', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
