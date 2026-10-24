import type { Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pause, recordOf, resume, submitAnswer, type GameState } from './game';
import { adjustTime, limitMsOf } from './timing';
import { classicRound, makeRoundsQuiz, single, withAudio, withVideo } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const right = { type: 'single', optionId: 'b' } as const;

/** Класика, запитання (20 с) відкрите в момент 0; гравці Анна p1, Богдан p2. */
function openClassic(question: Question): GameState {
  return startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [question])]), 'Анна', 'Богдан'), 0);
}

describe('a question with an audio clip', () => {
  it('a clip longer than the question delays the timer', () => {
    const s = openClassic(withAudio(single, { duration: 30 }));
    expect(s.endsAt).toBe(50_000);
    expect(limitMsOf(s.plays[0])).toBe(50_000);
    expect(recordOf(must(submitAnswer(s, 'p1', right, 45_000)), 0, 'p1')).toMatchObject({ accepted: true, timeMs: 45_000 });
  });

  it('a shorter clip runs alongside', () => {
    const s = openClassic(withAudio(single, { duration: 10 }));
    expect(s.endsAt).toBe(20_000);
    expect(limitMsOf(s.plays[0])).toBe(20_000);
  });

  it('a question without audio keeps its timer', () => {
    const raw = JSON.parse(JSON.stringify(single)) as Question;
    expect('audio' in raw).toBe(false);
    expect(openClassic(raw).endsAt).toBe(20_000);
  });

  it('pause and resume keep the remaining time with the audio lead', () => {
    const s = openClassic(withAudio(single, { duration: 30 }));
    const paused = must(pause(s, 10_000));
    expect(paused.remainingMs).toBe(40_000);
    expect(must(resume(paused, 15_000)).endsAt).toBe(55_000);
  });

  it('+15 s works on the whole window', () => {
    const s = must(adjustTime(openClassic(withAudio(single, { duration: 30 })), 15, 1000));
    expect(s.endsAt).toBe(65_000);
    expect(limitMsOf(s.plays[0])).toBe(65_000);
  });

  it('a video question is still untimed', () => {
    const s = openClassic(withVideo(single));
    expect(s.endsAt).toBeNull();
    expect(limitMsOf(s.plays[0])).toBeNull();
  });
});
