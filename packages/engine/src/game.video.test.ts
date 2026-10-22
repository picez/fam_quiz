import { describe, expect, it } from 'vitest';
import { buzz, nextDeadline } from './blitz';
import { pickCell } from './board';
import {
  acceptAnswer,
  lock,
  next,
  override,
  pause,
  recordOf,
  repick,
  resume,
  setConnected,
  start,
  submitAnswer,
  tick,
  type GameState,
} from './game';
import { pendingOf } from './hold';
import { adjustTime } from './timing';
import { blitzRound, boardRound, classicRound, makeRoundsQuiz, single, withId, withPoints, withVideo } from './testing/fixtures';
import { acceptAll, lobbyWith, must } from './testing/helpers';
import type { BlitzRound, BoardCell, Question } from '@quiz/shared';

const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const clip = withVideo(single);

type BlitzOptions = Partial<Omit<BlitzRound, 'id' | 'type' | 'questions'>>;

/** Класичний раунд, перше запитання відкрите в момент 0; гравці Анна p1, Богдан p2. */
function openClassic(questions: Question[] = [clip], speedBonus = true): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', questions, { speedBonus })]);
  return must(start(lobbyWith(quiz, 'Анна', 'Богдан'), 0));
}

/** Бліц-раунд, перше запитання відкрите в момент 0; гравці Анна p1, Богдан p2. */
function openBlitz(options: BlitzOptions = {}, questions: Question[] = [clip]): GameState {
  const quiz = makeRoundsQuiz([blitzRound('b1', questions, options)]);
  return must(start(lobbyWith(quiz, 'Анна', 'Богдан'), 0));
}

const queueOf = (state: GameState) => state.plays[state.questionIndex].blitz?.queue ?? [];
const score = (state: GameState, playerId: string) => state.players.find((p) => p.id === playerId)?.score;

describe('a classic question with a video', () => {
  it('has no timer and takes answers long after its time limit', () => {
    const state = openClassic();
    expect(state.endsAt).toBeNull();
    expect(state.startedAt).toBe(0);
    const answered = must(submitAnswer(state, 'p1', right, 600_000));
    expect(recordOf(answered, 0, 'p1')?.timeMs).toBe(600_000);
    expect(tick(answered, 10_000_000).phase).toBe('question');
  });

  it('closes when every connected player has answered', () => {
    const one = must(submitAnswer(openClassic(), 'p1', right, 5000));
    expect(one.phase).toBe('question');
    expect(must(submitAnswer(one, 'p2', wrong, 9000)).phase).toBe('locked');
  });

  it('the host closes it at any time', () => {
    const locked = must(lock(openClassic()));
    expect(locked.phase).toBe('locked');
    const revealed = must(next(locked, 1000));
    expect(revealed.phase).toBe('reveal');
    expect(recordOf(revealed, 0, 'p1')).toBeUndefined();
    expect(recordOf(revealed, 0, 'p2')).toBeUndefined();
  });

  it('an untimed question closes when the last unanswered player drops, and waits with nobody connected', () => {
    const answered = must(submitAnswer(openClassic(), 'p1', right, 5000));
    expect(must(setConnected(answered, 'p2', false, 6000)).phase).toBe('locked');

    const empty = must(setConnected(must(setConnected(openClassic(), 'p1', false, 1000)), 'p2', false, 2000));
    expect(empty.phase).toBe('question');
    expect(tick(empty, 1e9).phase).toBe('question');
  });

  it('gives no speed bonus even with the speed bonus on', () => {
    const answered = must(submitAnswer(openClassic([clip], true), 'p1', right, 100_000));
    const revealed = must(next(must(lock(answered)), 100_000));
    expect(revealed.phase).toBe('reveal');
    expect(score(revealed, 'p1')).toBe(1000);
    expect(score(must(override(revealed, 'p1', 'correct')), 'p1')).toBe(1000);
  });

  it('refuses ±15 s', () => {
    const state = openClassic();
    expect(adjustTime(state, 15, 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(adjustTime(state, -15, 1000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('pause and resume keep it open and do not count the pause into answer time', () => {
    const resumed = must(resume(must(pause(openClassic(), 10_000)), 70_000));
    expect(resumed.phase).toBe('question');
    expect(resumed.startedAt).toBe(60_000);
    expect(resumed.endsAt).toBeNull();
    const answered = must(submitAnswer(resumed, 'p1', right, 80_000));
    expect(recordOf(answered, 0, 'p1')?.timeMs).toBe(20_000);
  });

  it('leaves the tie-break time out', () => {
    const first = must(lock(must(submitAnswer(openClassic([clip, withId(single, 'q2')]), 'p1', right, 50_000))));
    let state = must(next(first, 60_000));
    while (state.phase !== 'question') state = must(next(state, 100_000));
    expect(state.startedAt).toBe(100_000);
    const done = must(submitAnswer(must(submitAnswer(state, 'p1', right, 103_000)), 'p2', right, 103_000));
    expect(done.phase).toBe('locked');
    expect(done.players.map((p) => p.totalTimeMs)).toEqual([3000, 3000]);
  });

  it('schedules no deadline', () => {
    expect(nextDeadline(openClassic(), 0)).toBeNull();
  });
});

describe('a blitz question with a video', () => {
  it('takes a buzz at any time and closes on the first correct answer', () => {
    const buzzed = must(buzz(openBlitz({ answerWindow: 10 }), 'p1', 300_000));
    expect(queueOf(buzzed)[0]?.deadline).toBe(310_000);
    const answered = acceptAll(must(submitAnswer(buzzed, 'p1', right, 301_000)), 302_000);
    expect(answered.phase).toBe('locked');
  });

  it('the answer window still applies and nextDeadline sees it', () => {
    const buzzed = must(buzz(openBlitz({ answerWindow: 10 }), 'p1', 1000));
    expect(nextDeadline(buzzed, 1000)).toBe(11_000);
    const burnt = tick(buzzed, 11_000);
    expect(burnt.plays[0].blitz?.attempts).toMatchObject([{ playerId: 'p1', grade: 'wrong' }]);
    expect(queueOf(burnt)).toEqual([]);
    expect(burnt.phase).toBe('question');
  });

  it('a blitz round without a window gives a silent head the default window on an untimed question', () => {
    const buzzed = must(buzz(openBlitz({ answerWindow: null }), 'p1', 1000));
    expect(queueOf(buzzed)[0]?.deadline).toBe(16_000);
    const two = must(buzz(buzzed, 'p2', 2000));
    expect(queueOf(tick(two, 16_000))[0]?.playerId).toBe('p2');

    const timed = must(buzz(openBlitz({ answerWindow: null }, [single]), 'p1', 1000));
    expect(queueOf(timed)[0]?.deadline).toBeNull();
  });

  it('a wrong answer does not close it, the host does', () => {
    const buzzed = must(buzz(openBlitz({ attempts: null }), 'p1', 1000));
    const wrongly = acceptAll(must(submitAnswer(buzzed, 'p1', wrong, 2000)), 3000);
    expect(wrongly.phase).toBe('question');
    const locked = must(lock(wrongly));
    expect(locked.phase).toBe('locked');
    expect(locked.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('pause on an untimed blitz question shifts the answer windows', () => {
    const buzzed = must(buzz(openBlitz({ answerWindow: 10 }), 'p1', 1000));
    expect(queueOf(buzzed)[0]?.deadline).toBe(11_000);
    const resumed = must(resume(must(pause(buzzed, 5000)), 65_000));
    expect(queueOf(resumed)[0]?.deadline).toBe(71_000);
    expect(queueOf(tick(resumed, 70_000))[0]?.playerId).toBe('p1');
  });
});

describe('a video on the board', () => {
  const q = (id: string, points: number) => withPoints(withId(single, id), points);
  /** Поле як у game.board-cells.test.ts: c11 з відео за 100, c12 за 200; p1 вибрав c11 у момент 0; гравці p1, p2, p3. */
  function picked(cell: Partial<BoardCell> = {}): GameState {
    const round = boardRound('g1', [{ title: 'A', cells: [{ question: withVideo(q('c11', 100)), ...cell }, q('c12', 200)] }]);
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан', 'Віра'), 0));
    return must(pickCell(must(next(intro, 0)), null, 'c11', 0, Math.random));
  }
  const points = (state: GameState, playerId: string) => state.plays[0].answers[playerId]?.points;

  it('a normal phone cell with a video has no timer and waits for the answerer', () => {
    const state = picked();
    expect(state.endsAt).toBeNull();
    expect(tick(state, 600_000).phase).toBe('question');
    const answered = must(submitAnswer(tick(state, 600_000), 'p1', right, 600_000));
    expect(answered.heldAt).toBe(600_000);
    const revealed = must(acceptAnswer(answered, 'p1', 601_000));
    expect(revealed.phase).toBe('reveal');
    expect(points(revealed, 'p1')).toBe(100);
  });

  it('repick on an untimed cell lets the answerer answer again', () => {
    const held = must(submitAnswer(picked(), 'p1', wrong, 5000));
    const repicked = must(repick(held, 'p1', 9000));
    expect(repicked.heldAt).toBeNull();
    expect(repicked.endsAt).toBeNull();
    const revealed = must(acceptAnswer(must(submitAnswer(repicked, 'p1', right, 12_000)), 'p1', 13_000));
    expect(points(revealed, 'p1')).toBe(100);
  });

  it('only the chooser answers an untimed normal cell', () => {
    expect(submitAnswer(picked(), 'p2', right, 1000)).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('an untimed normal cell closes 30 s after its answerer left, unless they return or their answer waits', () => {
    const away = must(setConnected(picked(), 'p1', false, 1000));
    expect(away.board?.awaySince).toBe(1000);
    expect(nextDeadline(away, 1000)).toBe(31_000);
    expect(tick(away, 30_999).phase).toBe('question');
    const closed = tick(away, 31_000);
    expect(closed.phase).toBe('locked');
    expect(closed.board?.awaySince).toBeNull();
    expect(recordOf(must(next(closed, 32_000)), 0, 'p1')?.grade).toBe('wrong');

    const back = must(setConnected(away, 'p1', true, 20_000));
    expect(back.board?.awaySince).toBeNull();
    expect(tick(back, 60_000).phase).toBe('question');

    const held = must(setConnected(must(submitAnswer(picked(), 'p1', wrong, 500)), 'p1', false, 1000));
    expect(held.board?.awaySince).toBeNull();
    expect(nextDeadline(held, 1000)).toBeNull();
    const waiting = tick(held, 100_000);
    expect(waiting.phase).toBe('question');
    expect(pendingOf(waiting)).toMatchObject({ playerId: 'p1' });

    // Після паузи відсутній гравець знову має повні 30 с; сервер не тікає без дедлайну, тож відлік ставить саме продовження.
    const paused = must(pause(away, 10_000));
    expect(paused.board?.awaySince).toBeNull();
    expect(nextDeadline(paused, 10_000)).toBeNull();
    const resumed = must(resume(paused, 50_000));
    expect(resumed.board?.awaySince).toBe(50_000);
    expect(nextDeadline(resumed, 50_000)).toBe(80_000);
    expect(tick(resumed, 50_000).board?.awaySince).toBe(50_000);
    expect(tick(resumed, 79_999).phase).toBe('question');
    expect(tick(resumed, 80_000).phase).toBe('locked');
    // Той, хто повернувся на паузі, відліку після продовження не має.
    const returned = must(resume(must(setConnected(paused, 'p1', true, 20_000)), 50_000));
    expect(returned.board?.awaySince).toBeNull();
  });

  it('the countdown starts when an absent answerer is picked for, or their answer is sent back', () => {
    // Ведучий вибирає клітинку за відсутнього гравця: відлік іде з моменту відкриття.
    const round = boardRound('g1', [{ title: 'A', cells: [withVideo(q('c11', 100)), q('c12', 200)] }]);
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан'), 0));
    const offline = must(setConnected(must(next(intro, 0)), 'p1', false, 0));
    const opened = must(pickCell(offline, null, 'c11', 5000, Math.random));
    expect(opened.phase).toBe('question');
    expect(opened.board?.awaySince).toBe(5000);

    // Гравець відповів і пішов, ведучий натиснув «Перевибрати»: тепер відлік іде.
    const held = must(setConnected(must(submitAnswer(picked(), 'p1', wrong, 500)), 'p1', false, 1000));
    const repicked = must(repick(held, 'p1', 9000));
    expect(repicked.board?.awaySince).toBe(9000);
    expect(nextDeadline(repicked, 9000)).toBe(39_000);
  });

  it('a voice cell with a video stays open until the host grades it', () => {
    const state = picked({ answerMode: 'voice' });
    expect(tick(state, 600_000).phase).toBe('question');
    expect(must(override(state, 'p1', 'correct', 600_000)).phase).toBe('locked');
  });

  it('an untimed blitz cell closes on the first correct answer or by the host, with penalty for all once', () => {
    const buzzed = must(buzz(picked({ kind: 'blitz', penalty: 'all' }), 'p2', 200_000));
    expect(queueOf(buzzed)[0]?.deadline).toBe(215_000);
    const locked = must(acceptAnswer(must(submitAnswer(buzzed, 'p2', right, 201_000)), 'p2', 202_000));
    expect(locked.phase).toBe('locked');
    const revealed = must(next(locked, 203_000));
    expect(revealed.phase).toBe('reveal');
    expect(revealed.players.map((p) => p.score)).toEqual([-100, 100, -100]);

    const nobody = must(next(must(lock(picked({ kind: 'blitz', penalty: 'all' }))), 1000));
    expect(nobody.players.map((p) => p.score)).toEqual([-100, -100, -100]);
  });

  it('an absent player does not close an untimed blitz cell', () => {
    const away = must(setConnected(picked({ kind: 'blitz' }), 'p1', false, 1000));
    const later = tick(away, 100_000);
    expect(later.phase).toBe('question');
    expect(later.board?.awaySince).toBeNull();
  });
});
