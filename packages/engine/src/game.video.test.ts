import { describe, expect, it } from 'vitest';
import { buzz, nextDeadline } from './blitz';
import { lock, next, override, pause, recordOf, resume, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { adjustTime } from './timing';
import { blitzRound, classicRound, makeRoundsQuiz, single, withId, withVideo } from './testing/fixtures';
import { acceptAll, lobbyWith, must } from './testing/helpers';
import type { BlitzRound, Question } from '@quiz/shared';

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
