import { describe, expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { nextDeadline } from './blitz';
import {
  end,
  endRound,
  lock,
  next,
  override,
  pause,
  recordOf,
  removePlayer,
  resume,
  setConnected,
  start,
  submitAnswer,
  tick,
  withCurrentPlay,
  withTotals,
  type GameState,
} from './game';
import { suspend } from './restore';
import { classicRound, makeRoundsQuiz, single, wipeoutLadder, wipeoutRound } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';
import { decideWipeout, decisionOpen, decisionsShown, wipeoutChoiceOf, wipeoutCorrect, wipeoutIn, wipeoutPlayOf, wipeoutTable } from './wipeout';

const rng = () => 0;
const quiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])]);
const lobby = () => lobbyWith(quiz, 'Оля', 'Петро', 'Віра');

/** Правильна й неправильна відповідь на кожну сходинку w1…w5. */
const RIGHT: Answer[] = [
  { type: 'single', optionId: 'b' },
  { type: 'boolean', value: true },
  { type: 'numeric', value: 2100 },
  { type: 'text', value: 'Одеса' },
  { type: 'slider', value: 52 },
];
const WRONG: Answer[] = [
  { type: 'single', optionId: 'a' },
  { type: 'boolean', value: false },
  { type: 'numeric', value: 3000 },
  { type: 'text', value: 'Львів' },
  { type: 'slider', value: 53 },
];

const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;

/** Гравці вибирають «Далі» заздалегідь, прямо в журналі (решту вікно рішення закриє як «Забрати»). */
function stay(s: GameState, ...ids: string[]): GameState {
  const play = wipeoutPlayOf(s);
  if (play === null) throw new Error('no wipeout play');
  return withCurrentPlay(s, { ...play, wipeout: { ...play.wipeout, stay: [...play.wipeout.stay, ...ids] } });
}

/** «Далі», доки не відкриється наступне запитання або раунд не скінчиться; відкрите вікно рішення спливає. */
function toNext(s: GameState, now: number): GameState {
  let current = must(next(s, now, rng));
  while (current.phase !== 'question' && current.phase !== 'round_end' && current.phase !== 'finished') {
    if (decisionOpen(current)) current = tick(current, current.endsAt ?? now);
    current = must(next(current, now, rng));
  }
  return current;
}

/** Відповіді на поточну сходинку о now, закриття й розкриття. */
function playRung(s: GameState, answers: Record<string, Answer>, now: number): GameState {
  let current = s;
  for (const [id, answer] of Object.entries(answers)) current = must(submitAnswer(current, id, answer, now));
  if (current.phase === 'question') current = must(lock(current));
  return must(next(current, now + 500, rng));
}

describe('wipeout: answers and banks', () => {
  it('everyone is in at the start and answers the first rung', () => {
    const s = startRound(lobby(), 0, rng);
    expect(s.phase).toBe('question');
    expect(wipeoutIn(s)).toEqual(['p1', 'p2', 'p3']);
    expect(s.plays[0].wipeout).toEqual({ took: [], stay: [], end: false });
  });

  it('a right answer is correct with no points yet; a wrong one burns', () => {
    let s = startRound(lobby(), 0, rng);
    s = must(submitAnswer(s, 'p1', RIGHT[0], 1000));
    s = must(submitAnswer(s, 'p2', WRONG[0], 1000));
    s = must(lock(s));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ grade: 'correct', accepted: true, accuracy: 1, points: 0, basePoints: 0 });
    expect(recordOf(s, 0, 'p2')).toMatchObject({ grade: 'wrong', accepted: false, accuracy: 0, points: 0 });
    s = must(next(s, 2000, rng));
    expect(s.phase).toBe('reveal');
    expect(wipeoutTable(s)).toEqual({
      p1: { status: 'in', bank: 100, step: null },
      p2: { status: 'burned', bank: 0, step: 0 },
      p3: { status: 'burned', bank: 0, step: 0 },
    });
    expect(wipeoutIn(s)).toEqual(['p1']);
  });

  it('a burned player cannot answer the next rung', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: WRONG[0] }, 1000);
    s = toNext(stay(s, 'p1'), 3000);
    expect(s.phase).toBe('question');
    expect(s.plays[1].question.id).toBe('w2');
    expect(submitAnswer(s, 'p2', RIGHT[1], 4000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(submitAnswer(s, 'p3', RIGHT[1], 4000)).toEqual({ ok: false, error: 'not_allowed' });
    // Оля — єдина в грі: її відповідь закриває запитання
    const answered = must(submitAnswer(s, 'p1', RIGHT[1], 4000));
    expect(answered.phase).toBe('locked');
  });

  it('a player still in cannot answer twice', () => {
    let s = startRound(lobby(), 0, rng);
    s = must(submitAnswer(s, 'p1', RIGHT[0], 1000));
    expect(submitAnswer(s, 'p1', RIGHT[0], 1500)).toEqual({ ok: false, error: 'already_answered' });
    expect(submitAnswer(s, 'p2', { type: 'boolean', value: true }, 1500)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p2', RIGHT[0], 20_001)).toEqual({ ok: false, error: 'time_over' });
  });

  it('slider counts only inside the tolerance', () => {
    const w5 = wipeoutLadder[4];
    expect(wipeoutCorrect(w5, { type: 'slider', value: 52 })).toBe(true);
    expect(wipeoutCorrect(w5, { type: 'slider', value: 48 })).toBe(true);
    // 53: частка ≥ 0,5 за 10b, але тут — поза допуском
    expect(wipeoutCorrect(w5, { type: 'slider', value: 53 })).toBe(false);
    expect(wipeoutCorrect(w5, { type: 'numeric', value: 50 })).toBe(false);
  });

  it('numeric inside the tolerance is right even off the exact value', () => {
    const w3 = wipeoutLadder[2];
    expect(wipeoutCorrect(w3, { type: 'numeric', value: 2100 })).toBe(true);
    expect(wipeoutCorrect(w3, { type: 'numeric', value: 2162 })).toBe(false);
    expect(wipeoutCorrect(wipeoutLadder[3], { type: 'text', value: ' одеса ' })).toBe(true);
    expect(wipeoutCorrect(wipeoutLadder[1], { type: 'boolean', value: false })).toBe(false);
  });

  it('survivors cash in when the last rung closes the round', () => {
    let s = startRound(lobby(), 0, rng);
    for (let i = 0; i < 5; i += 1) {
      const now = 10_000 * (i + 1);
      s = playRung(s, { p1: RIGHT[i], ...(i === 0 ? { p2: WRONG[0] } : {}) }, i === 0 ? 1000 : now);
      if (i < 4) s = toNext(stay(s, 'p1'), now + 1000);
    }
    expect(s.phase).toBe('reveal');
    // до кінця раунду банк ще в драбині, не в балах
    expect(score(s, 'p1')).toBe(0);
    s = must(next(s, 70_000, rng));
    expect(s.phase).toBe('round_end');
    expect(s.plays[4].wipeout?.end).toBe(true);
    expect(s.plays.slice(0, 4).map((p) => p.wipeout?.end)).toEqual([false, false, false, false]);
    expect(recordOf(s, 4, 'p1')?.points).toBe(1500);
    expect(recordOf(s, 4, 'p1')?.basePoints).toBe(1500);
    expect([0, 1, 2, 3].map((i) => recordOf(s, i, 'p1')?.points)).toEqual([0, 0, 0, 0]);
    expect(score(s, 'p1')).toBe(1500);
    expect(score(s, 'p2')).toBe(0);
    expect(wipeoutTable(s).p1).toEqual({ status: 'survived', bank: 1500, step: 4 });
  });

  it('a bank taken after a rung moves into the score', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: RIGHT[0] }, 1000);
    const play = wipeoutPlayOf(s)!;
    // рішення вписано прямо в журнал (до задачі 3); рахунок перераховує withTotals
    s = withTotals(withCurrentPlay(s, { ...play, wipeout: { ...play.wipeout, took: ['p2'], stay: ['p1'] } }));
    s = toNext(s, 3000);
    expect(wipeoutIn(s)).toEqual(['p1']);
    expect(recordOf(s, 0, 'p2')?.points).toBe(100);
    expect(score(s, 'p2')).toBe(100);
    expect(score(s, 'p1')).toBe(0);
  });

  it('nobody in ends the round early', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: WRONG[0], p2: WRONG[0], p3: WRONG[0] }, 1000);
    expect(wipeoutIn(s)).toEqual([]);
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('round_end');
    expect(s.plays).toHaveLength(1);
    expect(s.plays[0].wipeout?.end).toBe(true);
    expect(s.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });

  it('ending the round mid-question is like time over', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: WRONG[0], p3: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p3'), 3000);
    s = must(submitAnswer(s, 'p1', RIGHT[1], 4000));
    expect(s.phase).toBe('question');
    s = must(endRound(s, 5000));
    expect(s.phase).toBe('round_end');
    expect(recordOf(s, 1, 'p3')).toBeUndefined();
    expect(wipeoutTable(s)).toEqual({
      p1: { status: 'survived', bank: 300, step: 1 },
      p2: { status: 'burned', bank: 0, step: 0 },
      p3: { status: 'burned', bank: 0, step: 1 },
    });
    expect(recordOf(s, 1, 'p1')?.points).toBe(300);
    expect(s.players.map((p) => p.score)).toEqual([300, 0, 0]);
  });

  it('ending the game moves the banks too', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: WRONG[0], p3: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p3'), 3000);
    s = playRung(s, { p1: RIGHT[1], p3: RIGHT[1] }, 4000);
    expect(s.phase).toBe('reveal');
    s = must(end(s, 6000));
    expect(s.phase).toBe('finished');
    expect(s.players.map((p) => p.score)).toEqual([300, 0, 300]);
    expect(wipeoutTable(s, 0).p3).toEqual({ status: 'survived', bank: 300, step: 1 });
  });

  it('ending the game mid-question burns those who have not answered', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p3: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p3'), 3000);
    s = must(submitAnswer(s, 'p1', RIGHT[1], 4000));
    s = must(end(s, 5000));
    expect(s.players.map((p) => p.score)).toEqual([300, 0, 0]);
  });

  it('no streaks, no speed bonus, no time for ties', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: RIGHT[0], p3: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p2', 'p3'), 3000);
    s = playRung(s, { p1: RIGHT[1], p2: RIGHT[1], p3: RIGHT[1] }, 4000);
    s = must(endRound(s, 6000));
    for (const play of s.plays) for (const record of Object.values(play.answers)) expect(record.streakBonus).toBe(0);
    expect(s.players.map((p) => p.totalTimeMs)).toEqual([0, 0, 0]);
    expect(s.players.map((p) => p.streak)).toEqual([0, 0, 0]);
    expect(s.players.map((p) => p.score)).toEqual([300, 300, 300]);
  });

  it('a wipeout question opens with the «Запитання N» splash', () => {
    const s = must(next(must(start(lobbyWithSplash(quiz, 'Оля', 'Петро'))), 0, rng));
    expect(s.phase).toBe('question');
    expect(s.splash?.kind).toBe('question');
  });

  it('the classic round after it plays as before', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: WRONG[0], p3: WRONG[0] }, 1000);
    s = toNext(stay(s, 'p1'), 3000);
    s = must(endRound(playRung(s, { p1: RIGHT[1] }, 4000), 6000));
    expect(score(s, 'p1')).toBe(300);
    s = must(next(s, 7000, rng));
    expect(s.phase).toBe('intro');
    expect(wipeoutIn(s)).toEqual([]);
    s = must(next(s, 8000, rng));
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].wipeout).toBeUndefined();
    s = must(submitAnswer(s, 'p1', RIGHT[0], 9000));
    s = must(submitAnswer(s, 'p2', RIGHT[0], 9000));
    s = must(submitAnswer(s, 'p3', RIGHT[0], 9000));
    const classic = recordOf(s, s.questionIndex, 'p1')?.points ?? 0;
    expect(classic).toBeGreaterThan(0);
    expect(score(s, 'p1')).toBe(300 + classic);
    // перенесений банк лишається в балах
    expect(recordOf(s, 1, 'p1')?.points).toBe(300);
  });
});

describe('decisions (10g)', () => {
  /** Перша сходинка: усі троє відповіли правильно (якщо не сказано інакше), розкриття о 1500. */
  const revealed = (answers: Record<string, Answer> = { p1: RIGHT[0], p2: RIGHT[0], p3: RIGHT[0] }) =>
    playRung(startRound(lobby(), 0, rng), answers, 1000);
  const decide = (s: GameState, id: string, take: boolean, now = 3000) => must(decideWipeout(s, id, take, now));

  it('after the reveal the ladder opens a 10-second window', () => {
    const s = must(next(revealed(), 2000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(s.startedAt).toBe(2000);
    expect(s.endsAt).toBe(12_000);
    expect(decisionOpen(s)).toBe(true);
    // навіть коли таблиця лише в кінці
    const quietQuiz = { ...quiz, settings: { ...quiz.settings, leaderboard: 'end' as const } };
    const quiet = playRung(startRound(lobbyWith(quietQuiz, 'Оля', 'Петро'), 0, rng), { p1: RIGHT[0], p2: RIGHT[0] }, 1000);
    const opened = must(next(quiet, 2000, rng));
    expect(opened.phase).toBe('leaderboard');
    expect(opened.endsAt).toBe(12_000);
  });

  it('stay keeps the player in, take moves the bank into the score at once', () => {
    let s = must(next(revealed({ p1: RIGHT[0], p2: RIGHT[0] }), 2000, rng));
    s = decide(s, 'p1', true);
    expect(score(s, 'p1')).toBe(100);
    expect(wipeoutTable(s).p1).toEqual({ status: 'took', bank: 100, step: 0 });
    expect(recordOf(s, 0, 'p1')?.points).toBe(100);
    expect(decisionOpen(s)).toBe(true);
    s = decide(s, 'p2', false);
    expect(s.plays[0].wipeout).toEqual({ took: ['p1'], stay: ['p2'], end: false });
    // Віра згоріла: решта присутніх у грі вирішили — вікно закрилося саме
    expect(decisionOpen(s)).toBe(false);
    expect(s.endsAt).toBeNull();
    expect(s.phase).toBe('leaderboard');
    expect(wipeoutIn(s)).toEqual(['p2']);
    expect(score(s, 'p2')).toBe(0);
  });

  it('a decision is final', () => {
    let s = must(next(revealed(), 2000, rng));
    s = decide(s, 'p1', false);
    expect(decideWipeout(s, 'p1', true, 3500)).toEqual({ ok: false, error: 'already_answered' });
    s = decide(s, 'p2', true);
    expect(decideWipeout(s, 'p2', false, 3500)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('only players still in decide', () => {
    const shown = revealed({ p1: RIGHT[0], p2: RIGHT[0], p3: WRONG[0] });
    expect(decideWipeout(shown, 'p1', true, 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    const s = must(next(shown, 2000, rng));
    expect(decideWipeout(s, 'p3', true, 3000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(decideWipeout(s, 'nobody', true, 3000)).toEqual({ ok: false, error: 'not_found' });
    expect(decideWipeout(must(pause(s, 2500)), 'p1', true, 3000)).toEqual({ ok: false, error: 'paused' });
  });

  it('no choice means take', () => {
    let s = must(next(revealed({ p1: RIGHT[0], p2: RIGHT[0] }), 2000, rng));
    s = decide(s, 'p1', false);
    expect(tick(s, 11_999)).toBe(s);
    expect(nextDeadline(s, 3000)).toBe(12_000);
    // рішення рівно на кінці вже запізно: сервер тікає саме тоді
    expect(decideWipeout(s, 'p2', false, 12_000)).toEqual({ ok: false, error: 'wrong_phase' });
    s = tick(s, 12_000);
    expect(decisionOpen(s)).toBe(false);
    expect(s.plays[0].wipeout).toEqual({ took: ['p2'], stay: ['p1'], end: false, auto: ['p2'] });
    expect(wipeoutTable(s).p2).toEqual({ status: 'took', bank: 100, step: 0 });
    expect(score(s, 'p2')).toBe(100);
  });

  it('an absent player does not hold the window', () => {
    let s = must(next(revealed(), 2000, rng));
    s = must(setConnected(s, 'p3', false, 2500));
    s = decide(s, 'p1', false);
    s = decide(s, 'p2', false);
    expect(decisionOpen(s)).toBe(false);
    expect(s.plays[0].wipeout).toEqual({ took: ['p3'], stay: ['p1', 'p2'], end: false, auto: ['p3'] });
    expect(score(s, 'p3')).toBe(100);
  });

  it('a player who leaves last closes the window', () => {
    let s = must(next(revealed(), 2000, rng));
    s = decide(s, 'p1', false);
    s = decide(s, 'p2', true);
    s = must(setConnected(s, 'p3', false, 4000));
    expect(decisionOpen(s)).toBe(false);
    expect(wipeoutTable(s).p3.status).toBe('took');
  });

  it('the host cannot skip an open window', () => {
    let s = must(next(revealed(), 2000, rng));
    expect(next(s, 2500, rng)).toEqual({ ok: false, error: 'deciding' });
    s = decide(s, 'p1', false);
    s = decide(s, 'p2', true);
    s = decide(s, 'p3', false);
    s = must(next(s, 4000, rng));
    expect(s.phase).toBe('question');
    expect(s.plays[1].question.id).toBe('w2');
    expect(wipeoutIn(s)).toEqual(['p1', 'p3']);
    expect(submitAnswer(s, 'p2', RIGHT[1], 4500)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('when everybody took, the next step ends the round', () => {
    let s = must(next(revealed(), 2000, rng));
    for (const id of ['p1', 'p2', 'p3']) s = decide(s, id, true);
    expect(decisionOpen(s)).toBe(false);
    s = must(next(s, 4000, rng));
    expect(s.phase).toBe('round_end');
    expect(s.plays).toHaveLength(1);
    expect(s.players.map((p) => p.score)).toEqual([100, 100, 100]);
  });

  it('pause freezes the window', () => {
    let s = must(next(revealed(), 2000, rng));
    s = must(pause(s, 6000));
    expect(s.remainingMs).toBe(6000);
    expect(s.endsAt).toBeNull();
    expect(decisionOpen(s)).toBe(true);
    expect(tick(s, 50_000)).toBe(s);
    expect(next(s, 7000, rng)).toEqual({ ok: false, error: 'paused' });
    s = must(resume(s, 36_000));
    expect(s.paused).toBe(false);
    expect(s.endsAt).toBe(42_000);
    expect(s.startedAt).toBe(36_000);
    expect(s.remainingMs).toBeNull();
    expect(next(s, 37_000, rng)).toEqual({ ok: false, error: 'deciding' });
  });

  it('nextDeadline is the end of the window', () => {
    const s = must(next(revealed(), 2000, rng));
    expect(nextDeadline(s, 3000)).toBe(12_000);
    expect(nextDeadline(must(pause(s, 3000)), 3000)).toBeNull();
    // після закриття вікна чекати нічого
    expect(nextDeadline(tick(s, 12_000), 12_000)).toBeNull();
  });

  it('ending the round mid-window takes for the undecided', () => {
    let s = must(next(revealed({ p1: RIGHT[0], p2: RIGHT[0] }), 2000, rng));
    s = decide(s, 'p1', false);
    s = must(endRound(s, 4000));
    expect(s.phase).toBe('round_end');
    expect(s.plays[0].wipeout).toEqual({ took: ['p2'], stay: ['p1'], end: true, auto: ['p2'] });
    expect(wipeoutTable(s).p2).toEqual({ status: 'took', bank: 100, step: 0 });
    expect(wipeoutTable(s).p1).toEqual({ status: 'survived', bank: 100, step: 0 });
    expect(s.players.map((p) => p.score)).toEqual([100, 100, 0]);
  });

  it('ending the game mid-window takes for the undecided too', () => {
    let s = must(next(revealed({ p1: RIGHT[0], p2: RIGHT[0] }), 2000, rng));
    s = decide(s, 'p1', false);
    s = must(end(s, 4000));
    expect(s.phase).toBe('finished');
    expect(wipeoutTable(s, 0).p2.status).toBe('took');
    expect(s.players.map((p) => p.score)).toEqual([100, 100, 0]);
  });

  it('suspend keeps an open window paused and readable', () => {
    const s = must(next(revealed(), 2000, rng));
    const saved = JSON.parse(JSON.stringify(suspend(s, 5000))) as GameState;
    expect(saved.paused).toBe(true);
    expect(saved.remainingMs).toBe(7000);
    expect(decisionOpen(saved)).toBe(true);
    // гравці повертаються, вікно йде далі з того самого залишку
    let back = saved;
    for (const id of ['p1', 'p2', 'p3']) back = must(setConnected(back, id, true, 60_000));
    back = must(resume(back, 60_000));
    expect(back.endsAt).toBe(67_000);
    back = decide(back, 'p1', false, 61_000);
    back = decide(back, 'p2', false, 61_000);
    back = decide(back, 'p3', true, 61_000);
    expect(decisionOpen(back)).toBe(false);
    expect(score(back, 'p3')).toBe(100);
  });

  it('a window that expired before a restart closes on suspend', () => {
    const saved = suspend(must(next(revealed(), 2000, rng)), 20_000);
    expect(decisionOpen(saved)).toBe(false);
    expect(saved.players.map((p) => p.score)).toEqual([100, 100, 100]);
  });

  it('the host override on the reveal brings a burned player back', () => {
    let s = playRung(startRound(lobby(), 0, rng), { p1: RIGHT[0], p2: RIGHT[0] }, 1000);
    s = toNext(stay(s, 'p1', 'p2'), 3000);
    s = playRung(s, { p1: RIGHT[1], p2: RIGHT[1] }, 4000);
    s = toNext(stay(s, 'p1', 'p2'), 6000);
    s = playRung(s, { p1: RIGHT[2], p2: RIGHT[2] }, 7000);
    s = toNext(stay(s, 'p1', 'p2'), 9000);
    expect(s.plays[3].question.id).toBe('w4');
    s = playRung(s, { p1: RIGHT[3], p2: { type: 'text', value: 'Одесса' } }, 10_000);
    expect(s.phase).toBe('reveal');
    expect(wipeoutTable(s).p2).toEqual({ status: 'burned', bank: 0, step: 3 });
    expect(override(s, 'p2', 'partial')).toEqual({ ok: false, error: 'partial_disabled' });
    expect(override(s, 'p3', 'correct')).toEqual({ ok: false, error: 'not_found' });
    s = must(override(s, 'p2', 'correct'));
    expect(recordOf(s, 3, 'p2')).toMatchObject({ grade: 'correct', accepted: true, accuracy: 1, points: 0, overridden: true });
    expect(wipeoutTable(s).p2).toEqual({ status: 'in', bank: 1000, step: null });
    expect(wipeoutIn(s)).toEqual(['p1', 'p2']);
    // і назад: «неправильно» спалює
    expect(wipeoutTable(must(override(s, 'p2', 'wrong'))).p2.status).toBe('burned');
    s = must(next(s, 12_000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(override(s, 'p2', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
    s = decide(s, 'p2', true, 13_000);
    expect(score(s, 'p2')).toBe(1000);
  });

  it('kicking the last undecided player closes the window', () => {
    let s = must(next(revealed(), 2000, rng));
    s = decide(s, 'p1', false);
    s = decide(s, 'p2', true);
    expect(decisionOpen(s)).toBe(true);
    s = must(removePlayer(s, 'p3'));
    expect(decisionOpen(s)).toBe(false);
    expect(s.plays[0].wipeout).toEqual({ took: ['p2'], stay: ['p1'], end: false });
    expect(score(s, 'p2')).toBe(100);
    s = must(next(s, 4000, rng));
    expect(s.phase).toBe('question');
    expect(wipeoutIn(s)).toEqual(['p1']);
  });

  describe('decisions screen (11e)', () => {
    const choices = (s: GameState) => {
      const play = wipeoutPlayOf(s);
      if (play === null) throw new Error('no wipeout play');
      return ['p1', 'p2', 'p3'].map((id) => wipeoutChoiceOf(play, id));
    };

    it('is not up while the window is open (even paused) or on the reveal', () => {
      expect(decisionsShown(revealed())).toBe(false);
      const s = must(next(revealed(), 2000, rng));
      expect(decisionsShown(s)).toBe(false);
      expect(decisionsShown(must(pause(s, 2500)))).toBe(false);
    });

    it('a window closed by the timer remembers who took by default', () => {
      let s = must(next(revealed(), 2000, rng));
      s = decide(s, 'p1', false);
      s = decide(s, 'p2', true);
      s = tick(s, 12_000);
      expect(s.plays[0].wipeout).toEqual({ took: ['p2', 'p3'], stay: ['p1'], end: false, auto: ['p3'] });
      expect(decisionsShown(s)).toBe(true);
      expect(choices(s)).toEqual(['stay', 'took', 'auto']);
      expect(score(s, 'p3')).toBe(100);
    });

    it('when everybody decided there is no auto key', () => {
      let s = must(next(revealed(), 2000, rng));
      s = decide(s, 'p1', false);
      s = decide(s, 'p2', false);
      s = decide(s, 'p3', true);
      expect(decisionOpen(s)).toBe(false);
      expect('auto' in (s.plays[0].wipeout ?? {})).toBe(false);
      expect(decisionsShown(s)).toBe(true);
      expect(choices(s)).toEqual(['stay', 'stay', 'took']);
    });

    it('an absent player is taken by default', () => {
      let s = must(next(revealed(), 2000, rng));
      s = must(setConnected(s, 'p3', false, 2500));
      s = decide(s, 'p1', false);
      s = decide(s, 'p2', false);
      expect(s.plays[0].wipeout?.auto).toEqual(['p3']);
      expect(choices(s)).toEqual(['stay', 'stay', 'auto']);
    });

    it('is gone after the next step', () => {
      let s = must(next(revealed(), 2000, rng));
      s = decide(s, 'p1', false);
      s = tick(s, 12_000);
      expect(decisionsShown(s)).toBe(true);
      s = must(next(s, 20_000, rng));
      expect(s.phase).toBe('question');
      expect(decisionsShown(s)).toBe(false);
    });

    it('ending the round mid-window goes to round_end without the screen, auto keeps the undecided', () => {
      let s = must(next(revealed(), 2000, rng));
      s = decide(s, 'p1', false);
      s = must(endRound(s, 4000));
      expect(s.phase).toBe('round_end');
      expect(decisionsShown(s)).toBe(false);
      expect(s.plays[0].wipeout?.auto).toEqual(['p2', 'p3']);
    });

    it('kicking a player taken by default removes them from auto', () => {
      let s = must(next(revealed(), 2000, rng));
      s = decide(s, 'p1', false);
      s = decide(s, 'p2', true);
      s = tick(s, 12_000);
      s = must(removePlayer(s, 'p3'));
      expect(s.plays[0].wipeout).toEqual({ took: ['p2'], stay: ['p1'], end: false, auto: [] });
    });
  });
});

describe('ending during the question splash (10g)', () => {
  /** Гра із заставками: перша сходинка зіграна (Оля й Петро правильно), обидва «Далі», о 20 000 відкрито w2 із заставкою. */
  function splashing(): GameState {
    let s = must(next(must(start(lobbyWithSplash(quiz, 'Оля', 'Петро', 'Віра'))), 0, rng));
    const opens = s.startedAt ?? 0;
    s = playRung(s, { p1: RIGHT[0], p2: RIGHT[0] }, opens + 1000);
    s = must(next(s, opens + 2000, rng));
    s = must(decideWipeout(s, 'p1', false, opens + 3000));
    s = must(decideWipeout(s, 'p2', false, opens + 3000));
    s = must(next(s, 20_000, rng));
    expect(s.phase).toBe('question');
    expect(s.plays).toHaveLength(2);
    expect(s.startedAt).toBeGreaterThan(20_000);
    return s;
  }

  it('ending the round while the splash plays keeps the banks', () => {
    const s = must(endRound(splashing(), 20_100));
    expect(s.phase).toBe('round_end');
    expect(s.plays).toHaveLength(1);
    expect(s.plays[0].wipeout?.end).toBe(true);
    expect(wipeoutTable(s).p1).toEqual({ status: 'survived', bank: 100, step: 0 });
    expect(s.players.map((p) => p.score)).toEqual([100, 100, 0]);
  });

  it('ending the game while the splash plays keeps the banks', () => {
    const s = must(end(splashing(), 20_100));
    expect(s.phase).toBe('finished');
    expect(s.plays).toHaveLength(1);
    expect(s.players.map((p) => p.score)).toEqual([100, 100, 0]);
  });

  it('ending the round while the splash is paused keeps the banks', () => {
    const s = must(endRound(must(pause(splashing(), 20_100)), 30_000));
    expect(s.plays).toHaveLength(1);
    expect(s.players.map((p) => p.score)).toEqual([100, 100, 0]);
  });

  it('after the splash ending the round burns the silent as before', () => {
    const open = splashing();
    const s = must(endRound(open, (open.startedAt ?? 0) + 100));
    expect(s.plays).toHaveLength(2);
    expect(s.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });
});
