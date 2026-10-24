import { describe, expect, it } from 'vitest';
import { SPLASH_MS, type Answer } from '@quiz/shared';
import { setDebuff } from './debuffs';
import { end, endRound, next, override, pause, removePlayer, resume, setConnected, submitAnswer, tick, type GameState, type Rng, type SurvivalTrial } from './game';
import { suspend } from './restore';
import { answerTrial, closeTrial, pickDoor, survivalAlive, trialOpen, trialQuestionOf, unusedTrial } from './survival';
import { classicRound, makeRoundsQuiz, single, survivalQuestions, survivalRound, survivalTrials, text } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';

const rng = () => 0;
type RoundOptions = Parameters<typeof survivalRound>[3];
const quizWith = (options: RoundOptions = {}, trials = survivalTrials) =>
  makeRoundsQuiz([survivalRound('rs', survivalQuestions, trials, options), classicRound('r2', [single])]);
const PLAYERS = ['Оля', 'Петро', 'Віра', 'Гліб'];
const lobby = (options: RoundOptions = {}, trials = survivalTrials) => lobbyWith(quizWith(options, trials), ...PLAYERS);

/** Числа rng по черзі, далі — 0. */
function seq(values: number[]): Rng {
  let i = 0;
  return () => values[i++] ?? 0;
}

/** Правильна й неправильна відповідь на кожне запитання s1…s5. */
const RIGHT: Answer[] = [
  { type: 'single', optionId: 'b' },
  { type: 'boolean', value: true },
  { type: 'numeric', value: 2061 },
  { type: 'text', value: 'Одеса' },
  { type: 'slider', value: 50 },
];
const WRONG: Answer[] = [
  { type: 'single', optionId: 'a' },
  { type: 'boolean', value: false },
  { type: 'numeric', value: 3000 },
  { type: 'text', value: 'Львів' },
  { type: 'slider', value: 90 },
];
const YES: Answer = { type: 'boolean', value: true };
const NO: Answer = { type: 'boolean', value: false };

const step = (s: GameState) => survivalQuestions.findIndex((q) => q.id === s.plays[s.questionIndex].question.id);
const trialOf = (s: GameState): SurvivalTrial => {
  const trial = s.plays[s.questionIndex].survival?.trial;
  if (trial === null || trial === undefined) throw new Error('no trial');
  return trial;
};
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const bonuses = (s: GameState) => s.adjustments.filter((a) => a.source === 'survival').map((a) => a.playerId);

/** Живі відповідають на поточне запитання о at (wrong — неправильно, решта живих — правильно), розкриття о at + 500, «Далі» о at + 1000. */
function toTrial(s: GameState, wrong: string[], at: number, trialRng: Rng = rng): GameState {
  let current = s;
  const i = step(s);
  for (const id of survivalAlive(s)) current = must(submitAnswer(current, id, wrong.includes(id) ? WRONG[i] : RIGHT[i], at));
  expect(current.phase).toBe('locked');
  current = must(next(current, at + 500, rng));
  return must(next(current, at + 1000, trialRng));
}

/** s1: Петро й Віра помилилися, «Далі» о 3000 — випробування. */
const firstTrial = (options: RoundOptions = {}, trialRng: Rng = rng, trials = survivalTrials) =>
  toTrial(startRound(lobby(options, trials), 0, rng), ['p2', 'p3'], 2000, trialRng);

describe('survival trial: the survival question', () => {
  it('a survival question for everyone on the edge', () => {
    let s = firstTrial();
    expect(s.phase).toBe('leaderboard');
    expect(trialOpen(s)).toBe(true);
    expect(trialOf(s)).toMatchObject({ kind: 'question', fellBack: false, questionId: 't1', stage: 'open', out: [] });
    expect(trialQuestionOf(s)?.id).toBe('t1');
    expect(s.startedAt).toBe(3000);
    expect(s.endsAt).toBe(3000 + 15_000);
    s = must(answerTrial(s, 'p2', YES, 4000));
    expect(trialOpen(s)).toBe(true);
    s = must(answerTrial(s, 'p3', NO, 5000));
    expect(trialOf(s).stage).toBe('closed');
    expect(trialOf(s).out).toEqual(['p3']);
    expect(trialOf(s).answers.p2).toEqual({ answer: YES, correct: true, timeMs: 1000, overridden: false });
    expect(s.endsAt).toBeNull();
    expect(s.startedAt).toBeNull();
    expect(survivalAlive(s)).toEqual(['p1', 'p2', 'p4']);
  });

  it('silence on the survival question means out', () => {
    let s = must(answerTrial(firstTrial(), 'p3', YES, 4000));
    const endsAt = s.endsAt ?? 0;
    s = tick(s, endsAt - 1);
    expect(trialOpen(s)).toBe(true);
    s = tick(s, endsAt);
    expect(trialOpen(s)).toBe(false);
    expect(trialOf(s).out).toEqual(['p2']);
  });

  it('only players on the edge answer the trial', () => {
    const s = firstTrial();
    expect(answerTrial(s, 'p1', YES, 4000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(answerTrial(s, 'p9', YES, 4000)).toEqual({ ok: false, error: 'not_found' });
    const answered = must(answerTrial(s, 'p2', YES, 4000));
    expect(answerTrial(answered, 'p2', NO, 4500)).toEqual({ ok: false, error: 'already_answered' });
    expect(answerTrial(must(pause(s, 4000)), 'p2', YES, 4500)).toEqual({ ok: false, error: 'paused' });
    expect(answerTrial(s, 'p2', YES, s.endsAt ?? 0)).toEqual({ ok: false, error: 'time_over' });
    expect(answerTrial(s, 'p2', { type: 'single', optionId: 'b' }, 4000)).toEqual({ ok: false, error: 'type_mismatch' });
    // після закриття — уже не відкрите
    const closed = closeTrial(s);
    expect(answerTrial(closed, 'p2', YES, 4000)).toEqual({ ok: false, error: 'wrong_phase' });
    // під час заставки
    const splashing = toTrial(startRound(lobbyWithSplash(quizWith(), ...PLAYERS), 0, rng), ['p2'], 10_000);
    expect(splashing.splash?.kind).toBe('trial');
    expect(splashing.startedAt).toBe(11_000 + SPLASH_MS.trial);
    expect(answerTrial(splashing, 'p2', YES, 11_500)).toEqual({ ok: false, error: 'not_started' });
    expect(must(answerTrial(splashing, 'p2', YES, 11_000 + SPLASH_MS.trial)).plays[0].survival?.trial?.stage).toBe('closed');
  });

  it('trial questions are used in order, then luck', () => {
    let s = startRound(lobby(), 0, rng);
    s = toTrial(s, ['p2'], 1000);
    expect(trialOf(s).questionId).toBe('t1');
    expect(unusedTrial(s)?.id).toBe('t2');
    s = must(next(must(answerTrial(s, 'p2', YES, 3000)), 4000, rng));
    s = toTrial(s, ['p2'], 5000);
    expect(trialOf(s)).toMatchObject({ kind: 'question', questionId: 't2', presented: ['a', 'b', 'c'] });
    expect(unusedTrial(s)).toBeNull();
    s = must(next(must(answerTrial(s, 'p2', { type: 'single', optionId: 'b' }, 7000)), 8000, rng));
    s = toTrial(s, ['p2'], 9000);
    expect(trialOf(s)).toMatchObject({ kind: 'luck', fellBack: true, questionId: null, presented: [] });
    expect(trialQuestionOf(s)).toBeNull();
    expect(s.endsAt).toBe(10_000 + 10_000);
  });

  it('the trial question options are shuffled only with shuffleOptions', () => {
    let s = startRound(lobby({ shuffleOptions: true }, [survivalTrials[1]]), 0, rng);
    s = toTrial(s, ['p2'], 1000, rng);
    expect(trialOf(s).presented).toEqual(['b', 'c', 'a']);
  });
});

describe('survival trial: luck', () => {
  it('luck: a trap per player from the rng, picking it means out', () => {
    let s = firstTrial({ trial: 'luck' }, seq([0.05, 0.5, 0.9, 0.1]));
    expect(trialOf(s)).toMatchObject({ kind: 'luck', fellBack: false, traps: { p2: 0, p3: 2 }, fallback: { p2: 1, p3: 0 } });
    expect(s.endsAt).toBe(3000 + 10_000);
    s = must(pickDoor(s, 'p2', 0, 4000));
    expect(trialOpen(s)).toBe(true);
    s = must(pickDoor(s, 'p3', 1, 4000));
    expect(trialOf(s).stage).toBe('closed');
    expect(trialOf(s).doors).toEqual({ p2: 0, p3: 1 });
    expect(trialOf(s).out).toEqual(['p2']);
    expect(survivalAlive(s)).toEqual(['p1', 'p3', 'p4']);
  });

  it('luck: no pick means the fallback door', () => {
    const safe = must(pickDoor(firstTrial({ trial: 'luck' }, seq([0.05, 0.5, 0.9, 0.1])), 'p2', 1, 4000));
    const closed = tick(safe, safe.endsAt ?? 0);
    expect(trialOf(closed).doors).toEqual({ p2: 1 });
    expect(trialOf(closed).out).toEqual([]);
    const trapped = must(pickDoor(firstTrial({ trial: 'luck' }, seq([0.05, 0.5, 0.9, 0.95])), 'p2', 1, 4000));
    expect(trialOf(trapped).fallback.p3).toBe(2);
    expect(trialOf(tick(trapped, trapped.endsAt ?? 0)).out).toEqual(['p3']);
  });

  it('pickDoor errors', () => {
    const luck = firstTrial({ trial: 'luck' });
    expect(pickDoor(luck, 'p2', 3, 4000)).toEqual({ ok: false, error: 'not_found' });
    expect(pickDoor(luck, 'p2', -1, 4000)).toEqual({ ok: false, error: 'not_found' });
    expect(pickDoor(luck, 'p1', 0, 4000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(pickDoor(must(pickDoor(luck, 'p2', 0, 4000)), 'p2', 1, 4000)).toEqual({ ok: false, error: 'already_answered' });
    expect(pickDoor(luck, 'p2', 0, luck.endsAt ?? 0)).toEqual({ ok: false, error: 'time_over' });
    expect(answerTrial(luck, 'p2', YES, 4000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pickDoor(firstTrial(), 'p2', 0, 4000)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('survival trial: closing', () => {
  it('the host closes the trial early', () => {
    let s = must(answerTrial(firstTrial(), 'p2', YES, 4000));
    s = must(next(s, 5000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(trialOf(s)).toMatchObject({ stage: 'closed', out: ['p3'] });
    s = must(next(s, 6000, rng));
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].question.id).toBe('s2');
  });

  it('an absent player does not hold the trial', () => {
    const question = must(setConnected(firstTrial(), 'p3', false, 3500));
    expect(trialOpen(question)).toBe(true);
    const closed = must(answerTrial(question, 'p2', YES, 4000));
    expect(trialOf(closed)).toMatchObject({ stage: 'closed', out: ['p3'] });
    const luck = must(setConnected(firstTrial({ trial: 'luck' }, seq([0.05, 0.5, 0.9, 0.1])), 'p3', false, 3500));
    const picked = must(pickDoor(luck, 'p2', 1, 4000));
    expect(trialOf(picked)).toMatchObject({ stage: 'closed', doors: { p2: 1 }, out: [] });
    // і якщо відключився останній, хто не відповів, випробування закривається
    const left = must(setConnected(must(answerTrial(firstTrial(), 'p2', YES, 4000)), 'p3', false, 4500));
    expect(trialOf(left)).toMatchObject({ stage: 'closed', out: ['p3'] });
  });

  it('nobody present on the edge waits for the timer', () => {
    let s = must(setConnected(must(setConnected(firstTrial(), 'p2', false, 3500)), 'p3', false, 3500));
    expect(trialOpen(s)).toBe(true);
    s = tick(s, s.endsAt ?? 0);
    expect(trialOf(s).out).toEqual(['p2', 'p3']);
  });

  it('pause freezes the trial clock and the splash', () => {
    let s = toTrial(startRound(lobbyWithSplash(quizWith(), ...PLAYERS), 0, rng), ['p2', 'p3'], 10_000);
    const opened = 11_000;
    expect(s.splash).toEqual({ kind: 'trial', at: opened, until: opened + SPLASH_MS.trial });
    expect(s.endsAt).toBe(opened + SPLASH_MS.trial + 15_000);
    // пауза посеред заставки
    s = must(pause(s, opened + 1000));
    expect(s.remainingMs).toBe(15_000);
    expect(tick(s, opened + 100_000)).toBe(s);
    s = must(resume(s, opened + 31_000));
    expect(s.splash).toEqual({ kind: 'trial', at: opened + 30_000, until: opened + 30_000 + SPLASH_MS.trial });
    expect(s.startedAt).toBe(opened + 30_000 + SPLASH_MS.trial);
    expect(s.endsAt).toBe(opened + 30_000 + SPLASH_MS.trial + 15_000);
    // пауза посеред таймера
    const mid = (s.startedAt ?? 0) + 5000;
    s = must(pause(s, mid));
    expect(s.remainingMs).toBe(10_000);
    expect(tick(s, mid + 100_000)).toBe(s);
    s = must(resume(s, mid + 30_000));
    expect(s.endsAt).toBe(mid + 30_000 + 10_000);
    expect(trialOpen(tick(s, (s.endsAt ?? 0) - 1))).toBe(true);
    expect(trialOpen(tick(s, s.endsAt ?? 0))).toBe(false);
  });

  it('answers given while paused close the trial on resume', () => {
    // відповіді на паузі неможливі, але вилучення можливе: останнього, хто не відповів, вилучено на паузі
    let s = must(answerTrial(firstTrial(), 'p2', YES, 4000));
    s = must(pause(s, 4500));
    s = must(setConnected(s, 'p3', false, 4600));
    expect(trialOpen(s)).toBe(true);
    s = must(resume(s, 5000));
    expect(trialOf(s)).toMatchObject({ stage: 'closed', out: ['p3'] });
  });

  it('suspend keeps an open trial paused and readable', () => {
    const s = must(answerTrial(firstTrial(), 'p2', YES, 4000));
    const suspended = suspend(s, 5000);
    expect(suspended.paused).toBe(true);
    expect(trialOpen(suspended)).toBe(true);
    expect(suspended.remainingMs).toBe((s.endsAt ?? 0) - 5000);
    expect(JSON.parse(JSON.stringify(suspended))).toEqual(suspended);
    // після повернення продовжується
    const back = must(resume(must(setConnected(suspended, 'p3', true, 9000)), 9000));
    expect(trialOpen(back)).toBe(true);
    expect(trialOf(must(answerTrial(back, 'p3', YES, 9500)))).toMatchObject({ stage: 'closed', out: [] });
  });

  it('the host can accept a survival answer after closing', () => {
    const textTrial = { ...text, id: 't1', timeLimit: 15 };
    let s = firstTrial({}, rng, [textTrial]);
    s = must(answerTrial(s, 'p2', { type: 'text', value: 'Одеса' }, 4000));
    s = must(answerTrial(s, 'p3', { type: 'text', value: 'Анкарра' }, 4000));
    expect(trialOf(s).out).toEqual(['p3']);
    expect(override(s, 'p3', 'partial')).toEqual({ ok: false, error: 'partial_disabled' });
    expect(override(s, 'p1', 'correct')).toEqual({ ok: false, error: 'not_found' });
    s = must(override(s, 'p3', 'correct'));
    expect(trialOf(s).out).toEqual([]);
    expect(trialOf(s).answers.p3).toMatchObject({ correct: true, overridden: true });
    expect(survivalAlive(s)).toEqual(['p1', 'p2', 'p3', 'p4']);
    s = must(override(s, 'p2', 'wrong'));
    expect(trialOf(s).out).toEqual(['p2']);
    // поки відкрите — ще ні
    expect(override(firstTrial({}, rng, [textTrial]), 'p2', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    // удача
    const luck = must(next(firstTrial({ trial: 'luck' }), 4000, rng));
    expect(override(luck, 'p2', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    // після «Далі» — оцінка вже не про випробування
    s = must(next(s, 5000, rng));
    expect(s.phase).toBe('question');
    expect(override(s, 'p3', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('survival trial: the end of the round', () => {
  it('a trial after the last question decides who gets the bonus', () => {
    let s = startRound(lobby(), 0, rng);
    for (let i = 0; i < 4; i += 1) {
      s = toTrial(s, [], i * 10_000 + 1000);
      s = must(next(s, i * 10_000 + 3000, rng));
    }
    expect(s.plays[s.questionIndex].question.id).toBe('s5');
    s = toTrial(s, ['p2'], 50_000);
    expect(trialOpen(s)).toBe(true);
    s = must(answerTrial(s, 'p2', NO, 52_000));
    expect(trialOf(s).out).toEqual(['p2']);
    s = must(next(s, 53_000, rng));
    expect(s.phase).toBe('round_end');
    expect(bonuses(s)).toEqual(['p1', 'p3', 'p4']);
    expect(s.plays[s.questionIndex].survival?.end).toBe(true);
  });

  it('the round ends after the trial that leaves N alive', () => {
    let s = toTrial(startRound(lobby({ survivors: 2 }), 0, rng), ['p3', 'p4'], 1000);
    s = must(answerTrial(must(answerTrial(s, 'p3', NO, 3000)), 'p4', NO, 3000));
    expect(trialOf(s).out).toEqual(['p3', 'p4']);
    s = must(next(s, 4000, rng));
    expect(s.phase).toBe('round_end');
    expect(bonuses(s)).toEqual(['p1', 'p2']);
  });

  it('ending the round during the trial closes it like time over', () => {
    const s = must(answerTrial(firstTrial(), 'p2', YES, 4000));
    const ended = must(endRound(s, 5000));
    expect(ended.phase).toBe('round_end');
    expect(ended.plays[0].survival?.trial).toMatchObject({ stage: 'closed', out: ['p3'] });
    expect(bonuses(ended)).toEqual(['p1', 'p2', 'p4']);
    expect(score(ended, 'p3')).toBe(0);
    const finished = must(end(s, 5000));
    expect(finished.phase).toBe('finished');
    expect(finished.plays[0].survival?.trial).toMatchObject({ stage: 'closed', out: ['p3'] });
    expect(bonuses(finished)).toEqual(['p1', 'p2', 'p4']);
  });

  it('kicking the last undecided player closes the trial', () => {
    const s = must(answerTrial(firstTrial(), 'p2', YES, 4000));
    const kicked = must(removePlayer(s, 'p3'));
    expect(trialOf(kicked)).toMatchObject({ stage: 'closed', out: [] });
    expect(kicked.endsAt).toBeNull();
    expect(survivalAlive(kicked)).toEqual(['p1', 'p2', 'p4']);
  });

  it('debuffs do not fire on a trial', () => {
    let s = must(setDebuff(firstTrial(), 'p2', 'fog'));
    expect(s.debuffs.p2?.firedAt).toBeNull();
    s = must(answerTrial(s, 'p2', YES, 4000));
    expect(s.debuffs.p2?.firedAt).toBeNull();
    s = tick(s, s.endsAt ?? 0);
    expect(s.debuffs.p2?.firedAt).toBeNull();
    s = must(next(s, 20_000, rng));
    expect(s.phase).toBe('question');
    expect(s.debuffs.p2?.firedAt).not.toBeNull();
  });
});
