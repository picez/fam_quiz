import { DEFAULT_RULES, type BlitzRound, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { buzz, nextDeadline } from './blitz';
import { pendingOf } from './hold';
import {
  acceptAnswer,
  end,
  endRound,
  judge,
  lock,
  next,
  override,
  pause,
  removePlayer,
  repick,
  resume,
  setConnected,
  submitAnswer,
  tick,
  type GameState,
} from './game';
import { classicRound, blitzRound, makeRoundsQuiz, single, text } from './testing/fixtures';
import { acceptAll, lobbyWith, must, startRound } from './testing/helpers';

const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const rules = (patch: Partial<RoundRules>) => ({ ...DEFAULT_RULES, ...patch, partial: null });
const copies = (...ids: string[]) => ids.map((id) => ({ ...single, id }));
type Options = Partial<Omit<BlitzRound, 'id' | 'type' | 'questions'>>;

/** Гра з одним раундом бліцу, перше запитання відкрите в момент 0. */
function open(options: Options = {}, questions = [single, text]): GameState {
  const quiz = makeRoundsQuiz([blitzRound('b1', questions, options)]);
  return startRound(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра'), 0);
}

/** Натискання й відповідь одного гравця; ведучий тисне «Прийняти». */
function buzzAndAnswer(state: GameState, playerId: string, answer: typeof right | typeof wrong, now: number) {
  return acceptAll(must(submitAnswer(must(buzz(state, playerId, now)), playerId, answer, now)), now);
}

/** Іде далі, доки не відкриється наступне запитання. */
function toQuestion(state: GameState): GameState {
  let current = must(next(state, 0));
  while (current.phase !== 'question') current = must(next(current, 0));
  return current;
}

const score = (state: GameState, playerId: string) => state.players.find((p) => p.id === playerId)?.score;

describe('blitz queue', () => {
  it('the first correct answer in the queue wins the question', () => {
    let state = must(buzz(open(), 'p1', 1000));
    state = must(buzz(state, 'p2', 1500));
    state = must(submitAnswer(state, 'p2', right, 1600));
    expect(state.phase).toBe('question');
    expect(state.plays[0].blitz?.attempts).toEqual([]);
    state = acceptAll(must(submitAnswer(state, 'p1', wrong, 2000)), 2000);
    expect(state.phase).toBe('locked');
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([
      ['p1', 'wrong'],
      ['p2', 'correct'],
    ]);
    expect(state.players.find((p) => p.id === 'p2')?.score).toBe(1000);
    expect(state.players.find((p) => p.id === 'p1')?.score).toBe(0);
  });

  it('a wrong attempt costs the question price when the penalty is on', () => {
    let state = open({ rules: rules({ penalty: 'minus', multiplier: 2 }) });
    state = buzzAndAnswer(state, 'p1', wrong, 1000);
    state = buzzAndAnswer(state, 'p2', right, 2000);
    expect(state.phase).toBe('locked');
    expect(score(state, 'p1')).toBe(-2000);
    expect(score(state, 'p2')).toBe(2000);
  });

  it('a player with attempts left can buzz again and goes to the end of the queue', () => {
    let state = must(buzz(open({ attempts: 2 }), 'p1', 1000));
    state = must(buzz(state, 'p3', 1500));
    state = acceptAll(must(submitAnswer(state, 'p1', wrong, 2000)), 2000);
    state = must(buzz(state, 'p1', 2500));
    expect(state.plays[0].blitz?.queue.map((entry) => entry.playerId)).toEqual(['p3', 'p1']);
    state = acceptAll(must(submitAnswer(state, 'p3', wrong, 3000)), 3000);
    state = acceptAll(must(submitAnswer(state, 'p1', wrong, 3500)), 3500);
    expect(state.plays[0].blitz?.attempts.map((a) => a.playerId)).toEqual(['p1', 'p3', 'p1']);
    expect(buzz(state, 'p1', 4000)).toEqual({ ok: false, error: 'no_attempts' });
  });

  it('buzzing twice without answering is refused', () => {
    const state = must(buzz(open(), 'p1', 1000));
    expect(buzz(state, 'p1', 1200)).toEqual({ ok: false, error: 'already_queued' });
  });

  it('an answer without buzzing is refused', () => {
    const state = open();
    expect(submitAnswer(state, 'p1', { type: 'single', optionId: 'b' }, 1000)).toEqual({
      ok: false,
      error: 'not_in_queue',
    });
  });

  it('a missed answer window counts as a wrong attempt with the penalty', () => {
    let state = must(buzz(open({ answerWindow: 5, rules: rules({ penalty: 'minus' }) }), 'p1', 1000));
    expect(tick(state, 5999)).toBe(state);
    state = tick(state, 6000);
    expect(state.plays[0].blitz?.attempts).toEqual([
      { playerId: 'p1', answer: null, timeMs: 1000, grade: 'wrong', points: -1000 },
    ]);
    expect(state.plays[0].answers.p1).toMatchObject({ answer: null, grade: 'wrong', points: -1000 });
    expect(state.phase).toBe('question');
  });

  it('after the timer the queue is still checked but nobody can buzz', () => {
    let state = must(buzz(open({ answerWindow: 15 }), 'p1', 19000));
    expect(buzz(state, 'p2', 20001)).toEqual({ ok: false, error: 'time_over' });
    state = tick(state, 20000);
    expect(state.phase).toBe('question');
    state = acceptAll(must(submitAnswer(state, 'p1', right, 25000)), 25000);
    expect(state.plays[0].blitz?.attempts.map((a) => a.grade)).toEqual(['correct']);
    expect(state.phase).toBe('locked');
  });

  it('with the window off an unanswered buzz burns out with the question timer', () => {
    let state = must(buzz(open({ answerWindow: null }), 'p1', 1000));
    expect(tick(state, 19999).phase).toBe('question');
    state = tick(state, 20000);
    expect(state.plays[0].blitz?.attempts).toEqual([
      { playerId: 'p1', answer: null, timeMs: 1000, grade: 'wrong', points: 0 },
    ]);
    expect(state.phase).toBe('locked');
  });

  it('the question closes when nobody can buzz any more', () => {
    let state = open({ attempts: 1 });
    state = buzzAndAnswer(state, 'p1', wrong, 1000);
    state = buzzAndAnswer(state, 'p2', wrong, 2000);
    expect(state.phase).toBe('question');
    state = buzzAndAnswer(state, 'p3', wrong, 3000);
    expect(state.phase).toBe('locked');
    expect(state.plays[0].blitz?.attempts.some((a) => a.grade === 'correct')).toBe(false);
    expect(state.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });

  it('lock drops the unchecked queue without points', () => {
    let state = must(buzz(open({ rules: rules({ penalty: 'minus' }) }), 'p1', 1000));
    state = must(submitAnswer(must(buzz(state, 'p2', 1500)), 'p2', right, 1600));
    state = must(lock(state));
    expect(state.plays[0].blitz).toEqual({ queue: [], attempts: [], buzzed: ['p1', 'p2'] });
    expect(state.plays[0].answers).toEqual({});
    expect(state.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });
});

describe('blitz scoring', () => {
  it('blitz streak continues only for winners and survives questions a player skipped', () => {
    const streak = { length: 2, bonus: { kind: 'fixed', value: 300 } } as const;
    let state = open({ rules: rules({ streak }) }, copies('q1', 'q2', 'q3'));
    state = toQuestion(buzzAndAnswer(state, 'p1', right, 1000));
    state = toQuestion(buzzAndAnswer(state, 'p2', right, 1000));
    state = buzzAndAnswer(state, 'p1', right, 1000);
    expect(state.plays.map((play) => play.answers.p1?.streakBonus)).toEqual([0, undefined, 300]);
    expect(state.plays.map((play) => play.answers.p2?.streakBonus)).toEqual([undefined, 0, undefined]);
    expect(score(state, 'p1')).toBe(2300);
    expect(score(state, 'p2')).toBe(1000);
  });

  it('a buzz dropped after another player wins breaks the streak', () => {
    const streak = { length: 2, bonus: { kind: 'fixed', value: 300 } } as const;
    let state = open({ rules: rules({ streak }) }, copies('q1', 'q2', 'q3'));
    state = toQuestion(buzzAndAnswer(state, 'p1', right, 1000));
    state = must(buzz(state, 'p2', 1000));
    state = must(buzz(state, 'p1', 1100));
    state = acceptAll(must(submitAnswer(state, 'p2', right, 1200)), 1200);
    expect(state.phase).toBe('locked');
    expect(state.players.find((p) => p.id === 'p1')?.streak).toBe(0);
    state = buzzAndAnswer(toQuestion(state), 'p1', right, 1000);
    expect(state.plays[2].answers.p1?.streakBonus).toBe(0);
    expect(score(state, 'p1')).toBe(2000);
  });

  it('a buzz dropped when the host locks the question breaks the streak', () => {
    const streak = { length: 2, bonus: { kind: 'fixed', value: 300 } } as const;
    let state = open({ rules: rules({ streak }) }, copies('q1', 'q2', 'q3'));
    state = toQuestion(buzzAndAnswer(state, 'p1', right, 1000));
    state = must(lock(must(buzz(state, 'p1', 1000))));
    expect(state.players.find((p) => p.id === 'p1')?.streak).toBe(0);
    state = buzzAndAnswer(toQuestion(state), 'p1', right, 1000);
    expect(state.plays[2].answers.p1?.streakBonus).toBe(0);
  });

  it('the streak bonus percent is taken from the winning attempt, not from earlier penalties', () => {
    const streak = { length: 2, bonus: { kind: 'percent', value: 50 } } as const;
    let state = open({ attempts: 2, rules: rules({ penalty: 'minus', streak }) }, copies('q1', 'q2'));
    state = toQuestion(buzzAndAnswer(state, 'p1', right, 1000));
    state = buzzAndAnswer(state, 'p1', wrong, 1000);
    expect(score(state, 'p1')).toBe(1000);
    state = buzzAndAnswer(state, 'p1', right, 2000);
    expect(state.phase).toBe('locked');
    expect(state.plays[1].answers.p1).toMatchObject({ basePoints: 0, streakBonus: 500, points: 500 });
    expect(score(state, 'p1')).toBe(1500);
  });

  it('blitz answers do not add to the tie-break time', () => {
    let state = must(buzz(open(), 'p1', 1000));
    state = acceptAll(must(submitAnswer(state, 'p1', right, 4000)), 4000);
    expect(state.phase).toBe('locked');
    expect(state.players.map((p) => p.totalTimeMs)).toEqual([0, 0, 0]);
  });

  it('the host cannot change a blitz grade after the reveal', () => {
    const revealed = must(next(buzzAndAnswer(open(), 'p2', right, 1000), 0));
    expect(revealed.phase).toBe('reveal');
    expect(override(revealed, 'p2', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('blitz manual check, pause, kick and deadlines', () => {
  const manual = (extra: Options = {}) => open({ check: 'manual', ...extra });

  it('manual check waits for the host and judges the head of the queue', () => {
    let state = must(buzz(manual(), 'p1', 1000));
    state = must(submitAnswer(state, 'p1', wrong, 1100));
    state = must(submitAnswer(must(buzz(state, 'p2', 1200)), 'p2', right, 1300));
    expect(state.phase).toBe('question');
    expect(state.plays[0].blitz?.attempts).toEqual([]);
    expect(judge(state, 'p2', true, 2000)).toEqual({ ok: false, error: 'not_found' });
    state = must(judge(state, 'p1', false, 2000));
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([['p1', 'wrong']]);
    expect(state.phase).toBe('question');
    state = must(judge(state, 'p2', true, 2100));
    expect(state.phase).toBe('locked');
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([
      ['p1', 'wrong'],
      ['p2', 'correct'],
    ]);
    expect(score(state, 'p2')).toBe(1000);
  });

  it('manual check still waits after the window and the timer', () => {
    let state = must(buzz(manual({ answerWindow: 5 }), 'p1', 1000));
    state = must(submitAnswer(state, 'p1', right, 2000));
    state = tick(state, 30000);
    expect(state.phase).toBe('question');
    expect(state.plays[0].blitz?.attempts).toEqual([]);
  });

  it('judge is refused in an automatic blitz round', () => {
    const state = must(submitAnswer(must(buzz(open(), 'p1', 1000)), 'p1', wrong, 1500));
    expect(judge(state, 'p1', true, 2000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('judge is refused on pause and in a classic round', () => {
    let state = must(submitAnswer(must(buzz(manual(), 'p1', 1000)), 'p1', right, 1500));
    expect(judge(must(pause(state, 2000)), 'p1', true, 2100)).toEqual({ ok: false, error: 'paused' });
    state = startRound(lobbyWith(makeRoundsQuiz([classicRound('c1', [single])]), 'Анна'), 0);
    expect(judge(state, 'p1', true, 100)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('pause freezes answer windows', () => {
    let state = must(buzz(open({ answerWindow: 10 }), 'p1', 1000));
    state = must(pause(state, 5000));
    expect(state.pausedAt).toBe(5000);
    expect(buzz(state, 'p2', 6000)).toEqual({ ok: false, error: 'paused' });
    state = must(resume(state, 65000));
    expect(state.pausedAt).toBeNull();
    expect(state.plays[0].blitz?.queue[0]).toMatchObject({ at: 61000, deadline: 71000 });
    expect(tick(state, 70999)).toBe(state);
    state = tick(state, 71000);
    expect(state.plays[0].blitz?.attempts).toEqual([
      { playerId: 'p1', answer: null, timeMs: 1000, grade: 'wrong', points: 0 },
    ]);
  });

  it('kicking the head of the queue checks the next answer at once', () => {
    let state = must(buzz(open(), 'p1', 1000));
    state = must(submitAnswer(must(buzz(state, 'p2', 1500)), 'p2', right, 1600));
    expect(state.phase).toBe('question');
    state = acceptAll(must(removePlayer(state, 'p1')), 2000);
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([['p2', 'correct']]);
    expect(state.phase).toBe('locked');
  });

  it('a kick during a pause checks the next answer only after the resume', () => {
    let state = must(buzz(open(), 'p1', 1000));
    state = must(submitAnswer(must(buzz(state, 'p2', 1500)), 'p2', right, 1600));
    state = must(removePlayer(must(pause(state, 2000)), 'p1'));
    expect(state.plays[0].blitz?.attempts).toEqual([]);
    expect(state.phase).toBe('question');
    state = acceptAll(must(resume(state, 5000)), 5000);
    expect(state.plays[0].blitz?.attempts).toEqual([
      { playerId: 'p2', answer: right, timeMs: 1500, grade: 'correct', points: 1000 },
    ]);
    expect(state.phase).toBe('locked');
  });

  it('kicking a player removes their attempts from earlier questions', () => {
    let state = toQuestion(must(lock(buzzAndAnswer(open({ attempts: 2 }, copies('q1', 'q2')), 'p1', wrong, 1000))));
    state = must(buzz(state, 'p2', 1000));
    state = must(removePlayer(state, 'p1'));
    expect(state.plays[0].blitz?.attempts).toEqual([]);
    expect(state.plays[1].blitz?.queue.map((e) => e.playerId)).toEqual(['p2']);
  });

  it('a disconnected head of the queue burns out when the window ends', () => {
    let state = must(buzz(open({ answerWindow: 5 }), 'p1', 1000));
    state = must(setConnected(state, 'p1', false, 0));
    expect(state.phase).toBe('question');
    state = tick(state, 6000);
    expect(state.plays[0].blitz?.attempts).toMatchObject([{ playerId: 'p1', answer: null, grade: 'wrong' }]);
  });

  it('nextDeadline returns the nearest window or the question end', () => {
    expect(nextDeadline(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single])]), 'Анна'), 0)).toBeNull();
    let state = must(buzz(open({ answerWindow: 5 }), 'p1', 1000));
    expect(nextDeadline(state, 1000)).toBe(6000);
    expect(nextDeadline(state, 6000)).toBe(20000);
    expect(nextDeadline(state, 20000)).toBeNull();
    expect(nextDeadline(must(pause(state, 2000)), 2000)).toBeNull();
    state = startRound(lobbyWith(makeRoundsQuiz([classicRound('c1', [single])]), 'Анна'), 0);
    expect(nextDeadline(state, 0)).toBe(20000);
  });

  it('the host cannot override a blitz grade even for a player without a record', () => {
    const revealed = must(next(buzzAndAnswer(open(), 'p2', right, 1000), 0));
    expect(override(revealed, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('end drops the unchecked queue', () => {
    let state = must(buzz(open(), 'p1', 1000));
    state = must(end(state));
    expect(state.phase).toBe('finished');
    expect(state.plays[0].blitz).toEqual({ queue: [], attempts: [], buzzed: ['p1'] });
  });

  it('the question closes when the last player who could still buzz disconnects', () => {
    let state = open({ attempts: 1 });
    state = buzzAndAnswer(state, 'p1', wrong, 1000);
    state = buzzAndAnswer(state, 'p2', wrong, 2000);
    state = must(setConnected(state, 'p3', false, 0));
    expect(state.phase).toBe('locked');
  });

  it('closing the question or ending the round during a hold leaves the game movable', () => {
    const held = must(submitAnswer(must(buzz(open({}, copies('q1', 'q2')), 'p1', 1000)), 'p1', wrong, 3000));
    expect(held.heldAt).toBe(3000);
    const locked = must(lock(held));
    expect(locked.heldAt).toBeNull();
    const reopened = toQuestion(locked);
    expect(reopened.heldAt).toBeNull();
    expect(reopened.endsAt).toBe(20000);
    expect(tick(reopened, 20000).phase).toBe('locked');
    const ended = must(endRound(held, 4000));
    expect(ended.heldAt).toBeNull();
    expect(ended.phase).toBe('finished');
  });

  it('with nobody connected the question does not close before the timer', () => {
    let state = open();
    for (const id of ['p1', 'p2', 'p3']) state = must(setConnected(state, id, false, 0));
    expect(state.phase).toBe('question');
    expect(tick(state, 19999).phase).toBe('question');
    expect(tick(state, 20000).phase).toBe('locked');
  });
});

describe('blitz millionaire: the head answer waits for the host', () => {
  /** p1 натиснув у 1000 і відповів 'a' у 3000: відповідь чекає, годинник стоїть. */
  function pendingHead(options: Options = {}): GameState {
    return must(submitAnswer(must(buzz(open(options), 'p1', 1000)), 'p1', wrong, 3000));
  }

  it('the head answer waits for accept and stops the question timer', () => {
    const state = pendingHead();
    expect(state.phase).toBe('question');
    expect(state.heldAt).toBe(3000);
    expect(state.plays[0].blitz?.attempts).toEqual([]);
    expect(pendingOf(state)).toEqual({ playerId: 'p1', answer: wrong });
    expect(tick(state, 60000)).toBe(state);
    expect(nextDeadline(state, 3000)).toBeNull();
  });

  it('accepting a wrong answer passes the queue on and resumes the timer', () => {
    let state = must(buzz(pendingHead(), 'p2', 3500));
    state = must(submitAnswer(state, 'p2', right, 4000));
    expect(state.heldAt).toBe(3000);
    state = must(acceptAnswer(state, 'p1', 10000));
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([['p1', 'wrong']]);
    expect(pendingOf(state)).toEqual({ playerId: 'p2', answer: right });
    expect(state.heldAt).toBe(10000);
    expect(state.endsAt).toBe(27000);
    state = must(acceptAnswer(state, 'p2', 11000));
    expect(state.phase).toBe('locked');
    expect(score(state, 'p2')).toBe(1000);
  });

  it('repick clears the head answer and resumes its window from the same remainder', () => {
    let state = pendingHead({ answerWindow: 15 });
    state = must(repick(state, 'p1', 50000));
    expect(state.heldAt).toBeNull();
    expect(state.plays[0].blitz?.queue[0]).toMatchObject({ playerId: 'p1', answer: null, deadline: 63000 });
    expect(state.endsAt).toBe(67000);
    state = must(submitAnswer(state, 'p1', right, 51000));
    expect(state.heldAt).toBe(51000);
    state = must(acceptAnswer(state, 'p1', 52000));
    expect(state.plays[0].blitz?.attempts.map((a) => a.grade)).toEqual(['correct']);
    expect(state.phase).toBe('locked');
  });

  it('a buzz during a pending answer gets its full window after the hold', () => {
    let state = must(buzz(pendingHead({ answerWindow: 15 }), 'p2', 40000));
    expect(state.plays[0].blitz?.queue[1]).toMatchObject({ playerId: 'p2', at: 3000, deadline: 18000 });
    state = must(acceptAnswer(state, 'p1', 50000));
    expect(state.plays[0].blitz?.queue[0]).toMatchObject({ playerId: 'p2', deadline: 65000 });
    expect(state.heldAt).toBeNull();
    expect(tick(state, 64999).plays[0].blitz?.queue.map((e) => e.playerId)).toEqual(['p2']);
    state = tick(state, 65000);
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([
      ['p1', 'wrong'],
      ['p2', 'wrong'],
    ]);
  });

  it('a buzz during the hold is timed by the frozen clock', () => {
    const state = pendingHead();
    expect(buzz(state, 'p2', 90000).ok).toBe(true);
    expect(buzz(must(pause(state, 4000)), 'p2', 5000)).toEqual({ ok: false, error: 'paused' });
  });

  it('manual check: judge works on the pending head and repick stays', () => {
    let state = must(buzz(pendingHead({ check: 'manual' }), 'p2', 4000));
    state = must(submitAnswer(state, 'p2', right, 5000));
    expect(state.heldAt).toBe(3000);
    expect(acceptAnswer(state, 'p1', 6000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(must(repick(state, 'p1', 6000)).plays[0].blitz?.queue[0].answer).toBeNull();
    state = must(judge(state, 'p1', false, 10000));
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([['p1', 'wrong']]);
    expect(state.heldAt).toBe(10000);
    expect(state.endsAt).toBe(27000);
    state = must(judge(state, 'p2', true, 11000));
    expect(state.phase).toBe('locked');
  });

  it('kicking the pending head passes the hold to the next answer', () => {
    let state = must(buzz(pendingHead(), 'p2', 3500));
    state = must(submitAnswer(state, 'p2', right, 4000));
    state = must(removePlayer(state, 'p1'));
    expect(pendingOf(state)).toEqual({ playerId: 'p2', answer: right });
    expect(state.heldAt).toBe(3000);
    expect(tick(state, 9000)).toBe(state);
  });

  it('kicking the pending head with nobody answered behind lets the clock run again', () => {
    let state = must(buzz(pendingHead({ answerWindow: 15 }), 'p2', 3500));
    state = tick(must(removePlayer(state, 'p1')), 9000);
    expect(state.heldAt).toBeNull();
    expect(state.plays[0].blitz?.queue[0]).toMatchObject({ playerId: 'p2', deadline: 24000 });
    expect(state.endsAt).toBe(26000);
  });

  it('accept and repick name the pending player: a stale tap on the next answer is refused', () => {
    let state = must(buzz(pendingHead(), 'p2', 3500));
    state = must(submitAnswer(state, 'p2', right, 4000));
    expect(acceptAnswer(state, 'p2', 5000)).toEqual({ ok: false, error: 'not_found' });
    expect(repick(state, 'p2', 5000)).toEqual({ ok: false, error: 'not_found' });
    state = must(acceptAnswer(state, 'p1', 5000));
    expect(pendingOf(state)?.playerId).toBe('p2');
    expect(acceptAnswer(state, 'p1', 5000)).toEqual({ ok: false, error: 'not_found' });
    expect(state.phase).toBe('question');
  });

  it('resume after kicking the pending head on pause closes the question when nobody can answer', () => {
    let state = buzzAndAnswer(open(), 'p2', wrong, 1000);
    state = buzzAndAnswer(state, 'p3', wrong, 2000);
    state = must(submitAnswer(must(buzz(state, 'p1', 3000)), 'p1', wrong, 3500));
    expect(state.heldAt).toBe(3500);
    state = must(removePlayer(must(pause(state, 4000)), 'p1'));
    expect(state.phase).toBe('question');
    state = must(resume(state, 5000));
    expect(state.phase).toBe('locked');
  });

  it('a pause over a pending blitz answer changes nothing', () => {
    let state = must(pause(pendingHead(), 4000));
    state = must(resume(state, 500000));
    expect(state.heldAt).toBe(3000);
    expect(acceptAnswer(must(pause(state, 500000)), 'p1', 500000)).toEqual({ ok: false, error: 'paused' });
    expect(repick(must(pause(state, 500000)), 'p1', 500000)).toEqual({ ok: false, error: 'paused' });
    state = must(repick(state, 'p1', 500000));
    expect(state.endsAt).toBe(517000);
  });
});
