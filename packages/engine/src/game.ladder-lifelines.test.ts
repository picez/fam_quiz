import { describe, expect, it } from 'vitest';
import type { Answer, Question, QuizSettings, Round } from '@quiz/shared';
import { AUDIENCE_MS, buffsUsed, giveHint, takeBuff, voteTally } from './buffs';
import { nextDeadline } from './blitz';
import { lock, next, pause, resume, setConnected, start, submitAnswer, tick, type GameState, type Rng } from './game';
import { decideLadder, ladderPlayOf, lifelinesUsed, pickContestant, useLifeline } from './ladder';
import { suspend } from './restore';
import { hostView } from './views';
import { classicRound, ladderQuestions, ladderRound, LADDER_RIGHT, LADDER_WRONG, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must } from './testing/helpers';

const rng = () => 0;
const T = 10_000;
const opt = (optionId: string): Answer => ({ type: 'single', optionId });

type LadderOptions = Parameters<typeof ladderRound>[2];

/** rng з масиву значень (далі — 0). */
function seq(values: number[]): Rng {
  return () => values.shift() ?? 0;
}

/** Ведучий вибрав Петра (p2) у першому раунді rounds; l1 відкрито о T. Глядачі — Оля (p1) і Віра (p3). */
function open(rounds: Round[], settings: Partial<QuizSettings> = {}, lobby: typeof lobbyWith = lobbyWith): GameState {
  const intro = must(start(lobby(makeRoundsQuiz(rounds, settings), 'Оля', 'Петро', 'Віра')));
  return must(next(must(pickContestant(intro, 'p2')), T, rng));
}

/** Драбина з одним раундом «Мільйонер», за ним класика; l1 відкрито о T. */
function climb(options: LadderOptions = {}, settings: Partial<QuizSettings> = {}, questions: Question[] = ladderQuestions): GameState {
  return open([ladderRound('rl', questions, options), classicRound('r2', [withId(single, 'q2')])], settings);
}

const lifelines = (s: GameState) => ladderPlayOf(s)?.ladder.lifelines;
const at = (s: GameState, ms: number) => (s.startedAt ?? T) + ms;

/** Петро правильно на поточній сходинці (глядачі мовчать), «Граю далі» — і наступне запитання. */
function pass(state: GameState): GameState {
  const step = ladderPlayOf(state)?.ladder.step ?? 0;
  const now = at(state, 1000);
  let s = must(submitAnswer(state, 'p2', LADDER_RIGHT[step], now));
  if (s.phase === 'question') s = must(lock(s));
  s = must(next(must(next(s, now + 100, rng)), now + 200, rng));
  s = must(decideLadder(s, 'p2', false, now + 300));
  return must(next(s, now + 400, rng));
}

describe('ladder lifelines: 50/50', () => {
  it('50/50 removes two wrong options', () => {
    let s = must(useLifeline(climb(), 'p2', 'fifty', T + 1000, seq([0, 0])));
    // l1: правильна b; неправильні [a, c, d] → перший a, потім з [c, d] → c.
    expect(lifelines(s)?.fifty).toEqual({ removed: ['a', 'c'], at: T + 1000 });
    expect(lifelinesUsed(s)).toEqual(['fifty']);
    s = pass(s);
    expect(ladderPlayOf(s)?.question.id).toBe('l2');
    expect(lifelinesUsed(s)).toEqual(['fifty']);
    expect(useLifeline(s, 'p2', 'fifty', at(s, 500), rng)).toEqual({ ok: false, error: 'buff_used' });
  });

  it("lifelines are the round's, not the quiz buffs", () => {
    // Вікторина без бафів: підказки драбини працюють.
    expect(climb().quiz.settings.buffs ?? []).toEqual([]);
    expect(useLifeline(climb(), 'p2', 'audience', T + 1000, rng).ok).toBe(true);
    // Не ввімкнена в раунді — не можна.
    expect(useLifeline(climb({ lifelines: ['fifty'] }), 'p2', 'audience', T + 1000, rng)).toEqual({ ok: false, error: 'not_allowed' });
    // Після драбини 50/50 вікторини лишається неторканим.
    let s = must(useLifeline(climb({}, { buffs: ['fifty'] }), 'p2', 'fifty', T + 1000, rng));
    s = must(submitAnswer(s, 'p2', LADDER_WRONG[0], T + 2000));
    s = must(next(must(lock(s)), T + 3000, rng));
    while (!(s.phase === 'question' && s.roundIndex === 1)) s = must(next(s, T + 4000, rng));
    expect(buffsUsed(s, 'p2')).toEqual([]);
    s = must(takeBuff(s, 'p2', 'fifty', at(s, 500), rng));
    expect(buffsUsed(s, 'p2')).toEqual(['fifty']);
  });

  it('several lifelines on one question', () => {
    let s = must(useLifeline(climb(), 'p2', 'fifty', T + 1000, rng));
    s = must(useLifeline(s, 'p2', 'audience', T + 2000, rng));
    s = must(useLifeline(s, 'p2', 'hint', T + 3000, rng));
    expect(lifelinesUsed(s)).toEqual(['fifty', 'audience', 'hint']);
    expect(Object.keys(lifelines(s) ?? {}).sort()).toEqual(['audience', 'fifty', 'hint']);
  });

  it('only the contestant, before answering', () => {
    const s = climb();
    expect(useLifeline(s, 'p1', 'fifty', T + 1000, rng)).toEqual({ ok: false, error: 'not_allowed' });
    expect(useLifeline(s, 'p9', 'fifty', T + 1000, rng)).toEqual({ ok: false, error: 'not_found' });
    const answered = must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 1000));
    expect(useLifeline(answered, 'p2', 'fifty', T + 1500, rng)).toEqual({ ok: false, error: 'already_answered' });
    expect(useLifeline(must(pause(s, T + 1000)), 'p2', 'fifty', T + 1500, rng)).toEqual({ ok: false, error: 'paused' });
    const splashed = open([ladderRound('rl')], {}, lobbyWithSplash);
    expect(splashed.startedAt).toBeGreaterThan(T);
    expect(useLifeline(splashed, 'p2', 'fifty', T, rng)).toEqual({ ok: false, error: 'not_started' });
    const timed = climb({ timer: true });
    expect(timed.endsAt).toBe(T + 20_000);
    expect(useLifeline(timed, 'p2', 'fifty', T + 20_001, rng)).toEqual({ ok: false, error: 'time_over' });
    const board = must(next(must(next(must(lock(answered)), T + 2000, rng)), T + 2100, rng));
    expect(board.phase).toBe('leaderboard');
    expect(useLifeline(board, 'p2', 'fifty', T + 2500, rng)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('ladder lifelines: ask the hall', () => {
  it('the hall votes with its own answers', () => {
    let s = must(submitAnswer(climb(), 'p1', opt('b'), T + 500));
    s = must(useLifeline(s, 'p2', 'audience', T + 1000, rng));
    expect(lifelines(s)?.audience).toEqual({ endsAt: T + 1000 + AUDIENCE_MS, closed: false, ballots: {}, at: T + 1000 });
    s = must(submitAnswer(s, 'p3', opt('c'), T + 2000));
    expect(s.phase).toBe('question');
    const audience = lifelines(s)?.audience;
    expect(audience?.closed).toBe(true);
    expect(audience?.ballots).toEqual({ p1: opt('b'), p3: opt('c') });
    expect(voteTally(ladderQuestions[0], audience?.ballots ?? {}).counts).toEqual({ b: 1, c: 1 });
  });

  it('the vote closes on time', () => {
    let s = must(submitAnswer(climb(), 'p1', opt('b'), T + 500));
    s = must(useLifeline(s, 'p2', 'audience', T + 1000, rng));
    const endsAt = T + 1000 + AUDIENCE_MS;
    expect(lifelines(tick(s, endsAt - 1))?.audience?.closed).toBe(false);
    s = tick(s, endsAt);
    expect(s.phase).toBe('question');
    expect(lifelines(s)?.audience).toMatchObject({ closed: true, ballots: { p1: opt('b') } });
    expect(submitAnswer(s, 'p3', opt('b'), endsAt + 500)).toEqual({ ok: false, error: 'vote_closed' });
    // Учасник відповідає й після закриття голосування.
    expect(submitAnswer(s, 'p2', LADDER_RIGHT[0], endsAt + 500).ok).toBe(true);
  });

  it('the contestant answering closes the vote', () => {
    let s = must(useLifeline(climb(), 'p2', 'audience', T + 1000, rng));
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T + 2000));
    expect(lifelines(s)?.audience).toMatchObject({ closed: true, ballots: {} });
    expect(submitAnswer(s, 'p1', opt('b'), T + 2500)).toEqual({ ok: false, error: 'vote_closed' });
  });

  it('closing the question closes the vote', () => {
    let s = must(useLifeline(climb(), 'p2', 'audience', T + 1000, rng));
    s = must(submitAnswer(s, 'p1', opt('a'), T + 1500));
    s = must(lock(s));
    expect(lifelines(s)?.audience).toMatchObject({ closed: true, ballots: { p1: opt('a') } });
  });

  it('no present hall means no audience', () => {
    let s = must(setConnected(climb(), 'p1', false, T + 500));
    s = must(setConnected(s, 'p3', false, T + 500));
    expect(useLifeline(s, 'p2', 'audience', T + 1000, rng)).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('the audience gives the contestant extra time with a timer', () => {
    const timed = must(useLifeline(climb({ timer: true }), 'p2', 'audience', T + 1000, rng));
    expect(timed.plays[timed.questionIndex].overtime).toEqual({ p2: AUDIENCE_MS });
    const untimed = must(useLifeline(climb(), 'p2', 'audience', T + 1000, rng));
    expect(untimed.plays[untimed.questionIndex].overtime).toBeUndefined();
  });

  it('pause freezes the vote', () => {
    let s = must(useLifeline(climb(), 'p2', 'audience', T + 1000, rng));
    const endsAt = T + 1000 + AUDIENCE_MS;
    expect(nextDeadline(s, T + 2000)).toBe(endsAt);
    s = must(pause(s, T + 5000));
    expect(lifelines(tick(s, endsAt + 10_000))?.audience?.closed).toBe(false);
    s = must(resume(s, T + 35_000));
    expect(lifelines(s)?.audience).toMatchObject({ endsAt: endsAt + 30_000, closed: false });
    expect(nextDeadline(s, T + 35_000)).toBe(endsAt + 30_000);
    expect(lifelines(tick(s, endsAt + 30_000))?.audience?.closed).toBe(true);
  });

  it('the last hall answer on pause does not close the vote until resume', () => {
    let s = must(useLifeline(climb(), 'p2', 'audience', T + 1000, rng));
    s = must(submitAnswer(s, 'p1', opt('b'), T + 1500));
    s = must(pause(s, T + 2000));
    s = must(setConnected(s, 'p3', false, T + 2500));
    expect(lifelines(s)?.audience?.closed).toBe(false);
    s = must(resume(s, T + 3000));
    expect(lifelines(s)?.audience).toMatchObject({ closed: true, ballots: { p1: opt('b') } });
  });

  it('suspend keeps an open vote readable', () => {
    let s = must(submitAnswer(climb(), 'p1', opt('b'), T + 500));
    s = must(useLifeline(s, 'p2', 'audience', T + 1000, rng));
    const saved = suspend(s, T + 3000);
    const restored = JSON.parse(JSON.stringify(saved)) as GameState;
    expect(restored).toEqual(saved);
    expect(lifelines(restored)?.audience?.closed).toBe(false);
    const hour = 3_600_000;
    const resumed = must(resume(restored, T + 3000 + hour));
    expect(lifelines(resumed)?.audience).toMatchObject({ endsAt: T + 1000 + AUDIENCE_MS + hour, closed: false });
    expect(lifelines(tick(resumed, T + 1000 + AUDIENCE_MS + hour))?.audience?.closed).toBe(true);
  });
});

describe('ladder lifelines: the host hint', () => {
  it('the host hint', () => {
    let s = must(useLifeline(climb(), 'p2', 'hint', T + 1000, rng));
    expect(lifelines(s)?.hint).toEqual({ text: null, aloud: false, at: T + 1000 });
    expect(hostView(s).hints).toEqual([{ playerId: 'p2', nickname: 'Петро', at: T + 1000 }]);
    s = must(giveHint(s, 'p2', 'Подумай про столиці'));
    expect(lifelines(s)?.hint).toEqual({ text: 'Подумай про столиці', aloud: false, at: T + 1000 });
    expect(hostView(s).hints).toEqual([]);
    expect(giveHint(s, 'p2', 'Ще раз')).toEqual({ ok: false, error: 'not_found' });
    expect(giveHint(climb(), 'p2', 'Без запиту')).toEqual({ ok: false, error: 'not_found' });

    const aloud = must(giveHint(must(useLifeline(climb(), 'p2', 'hint', T + 1000, rng)), 'p2', null));
    expect(lifelines(aloud)?.hint).toEqual({ text: null, aloud: true, at: T + 1000 });

    const hinted = ladderQuestions.map((q) => ({ ...q, hint: 'Це місто на Дніпрі' }));
    const ready = must(useLifeline(climb({}, {}, hinted), 'p2', 'hint', T + 1000, rng));
    expect(lifelines(ready)?.hint).toEqual({ text: 'Це місто на Дніпрі', aloud: false, at: T + 1000 });
    expect(hostView(ready).hints).toEqual([]);
    expect(giveHint(ready, 'p2', 'Ще')).toEqual({ ok: false, error: 'not_found' });
  });

  it('lifelines across the ladder', () => {
    let s = must(useLifeline(climb(), 'p2', 'fifty', T + 1000, rng));
    s = pass(pass(s));
    expect(ladderPlayOf(s)?.question.id).toBe('l3');
    s = must(useLifeline(s, 'p2', 'audience', at(s, 500), rng));
    s = pass(s);
    expect(ladderPlayOf(s)?.question.id).toBe('l4');
    expect(lifelinesUsed(s)).toEqual(['fifty', 'audience']);
    expect(useLifeline(s, 'p2', 'fifty', at(s, 500), rng)).toEqual({ ok: false, error: 'buff_used' });
    expect(useLifeline(s, 'p2', 'audience', at(s, 500), rng)).toEqual({ ok: false, error: 'buff_used' });
    expect(useLifeline(s, 'p2', 'hint', at(s, 500), rng).ok).toBe(true);

    // Новий раунд «Мільйонер»: усі підказки знову доступні.
    let two = must(useLifeline(open([ladderRound('rl1'), ladderRound('rl2')]), 'p2', 'fifty', T + 1000, rng));
    two = must(submitAnswer(two, 'p2', LADDER_WRONG[0], T + 2000));
    two = must(next(must(lock(two)), T + 3000, rng));
    while (two.phase !== 'intro' || two.roundIndex !== 1) two = must(next(two, T + 4000, rng));
    two = must(next(must(pickContestant(two, 'p2')), T + 5000, rng));
    expect(lifelinesUsed(two)).toEqual([]);
    expect(useLifeline(two, 'p2', 'fifty', T + 6000, rng).ok).toBe(true);
  });
});
