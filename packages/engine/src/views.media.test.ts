import type { Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { placeWager } from './final';
import { lock, next, start, submitAnswer, type GameState } from './game';
import { audioOf, hostView, playerView, stageView } from './views';
import { classicRound, finalRound, makeRoundsQuiz, single, slider, text, withReveal } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const YT = 'dQw4w9WgXcQ';
const rng = () => 0;
const audible: Question = { ...single, audio: { source: 'youtube', id: YT, start: 0, duration: 30 } };
const questions: Question[] = [slider, { ...audible, id: 'q-audio' }, { ...withReveal(text), id: 'q-reveal' }];

/** Класика [повзунок, запитання з аудіо, запитання з проявленням], перше відкрите в момент 0; Анна p1, Богдан p2. */
function openClassic(): GameState {
  return startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', questions, { speedBonus: false })]), 'Анна', 'Богдан'), 0, rng);
}

/** Закрити поточне запитання й дійти до reveal. */
function toReveal(state: GameState): GameState {
  return must(next(must(lock(state)), 0, rng));
}

/** З reveal першого запитання відкрити друге. */
function secondQuestion(): GameState {
  let s = toReveal(openClassic());
  while (s.questionIndex !== 1 || s.phase !== 'question') s = must(next(s, 0, rng));
  return s;
}

describe('slider in the views', () => {
  it('slider correct values never reach the phone or the stage before the reveal', () => {
    const s = openClassic();
    const phone = playerView(s, 'p1')!;
    expect(phone.question?.slider).toEqual({ min: 0, max: 100, step: 1, unit: '%' });
    for (const view of [phone, stageView(s)]) {
      expect(view.question).not.toHaveProperty('correct');
      expect(JSON.stringify(view.question)).not.toMatch(/tolerance|zeroBeyond|"correct"/);
    }
    expect(stageView(s).sliderMarks).toBeNull();
  });

  it('the stage gets the marks only on the reveal, sorted by distance', () => {
    let s = openClassic();
    s = must(submitAnswer(s, 'p1', { type: 'slider', value: 57 }, 1000));
    s = must(submitAnswer(s, 'p2', { type: 'slider', value: 52 }, 1000));
    expect(stageView(s).sliderMarks).toBeNull();
    // Усі відповіли: запитання закрилося саме.
    expect(s.phase).toBe('locked');
    expect(stageView(s).sliderMarks).toBeNull();
    s = must(next(s, 0, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).sliderMarks).toEqual([
      { playerId: 'p2', nickname: 'Богдан', value: 52, points: 1000 },
      { playerId: 'p1', nickname: 'Анна', value: 57, points: 500 },
    ]);
  });

  it('the host sees the marks while the question runs', () => {
    let s = openClassic();
    expect(hostView(s).sliderMarks).toEqual([]);
    s = must(submitAnswer(s, 'p1', { type: 'slider', value: 57 }, 1000));
    expect(hostView(s).sliderMarks).toEqual([{ playerId: 'p1', nickname: 'Анна', value: 57, points: 500 }]);
    expect(stageView(s).sliderMarks).toBeNull();
  });

  it('a final slider shows no marks on the stage', () => {
    let s = must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f', slider)]), 'Анна', 'Богдан'))), 0, rng));
    s = must(placeWager(s, 'p1', 0, 1000, rng));
    s = must(placeWager(s, 'p2', 0, 1000, rng));
    s = must(submitAnswer(s, 'p1', { type: 'slider', value: 50 }, 1000));
    expect(hostView(s).sliderMarks).toBeNull();
    s = must(next(must(lock(s)), 0, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).sliderMarks).toBeNull();
  });
});

describe('audio and reveal in the views', () => {
  it('the phone never gets the audio source', () => {
    const s = secondQuestion();
    const phone = playerView(s, 'p1')!;
    expect(phone.question?.audio).toEqual({ duration: 30, clip: null });
    expect(JSON.stringify(phone)).not.toContain(YT);
    const clip = { source: 'youtube', id: YT, start: 0, duration: 30 };
    expect(stageView(s).question?.audio).toEqual({ duration: 30, clip });
    expect(hostView(s).question?.audio).toEqual({ duration: 30, clip });
  });

  it('audioOf follows the current question and phase', () => {
    expect(audioOf(lobbyWith(makeRoundsQuiz([classicRound('r1', questions, { speedBonus: false })]), 'Анна'))).toBeNull();
    const first = openClassic();
    expect(audioOf(first)).toBeNull();
    let s = secondQuestion();
    expect(audioOf(s)).toMatchObject({ source: 'youtube', id: YT });
    s = must(lock(s));
    expect(audioOf(s)).toMatchObject({ id: YT });
    s = must(next(s, 0, rng));
    expect(s.phase).toBe('reveal');
    expect(audioOf(s)).toMatchObject({ id: YT });
    while (s.phase !== 'leaderboard') s = must(next(s, 0, rng));
    expect(audioOf(s)).toBeNull();
  });

  it('everyone sees the reveal mode; nobody gets extra clues', () => {
    let s = secondQuestion();
    s = must(lock(s));
    s = must(next(s, 0, rng));
    while (s.questionIndex !== 2 || s.phase !== 'question') s = must(next(s, 0, rng));
    const views = [playerView(s, 'p1')!, stageView(s), hostView(s)];
    for (const view of views) {
      expect(view.question?.reveal).toBe('pixels');
      expect(view.question?.imageUrl).toBe(text.imageUrl ?? withReveal(text).imageUrl);
    }
  });
});
