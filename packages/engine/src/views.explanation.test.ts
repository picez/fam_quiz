import type { Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { lock, next, submitAnswer, type GameState } from './game';
import { playerView, stageView } from './views';
import { classicRound, makeRoundsQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng = () => 0;
const EXPLANATION = 'Бо Сонце — зоря, а не планета.';
const explained: Question = { ...single, explanation: EXPLANATION };

/** Класика з одним запитанням із поясненням, відкрите в момент 0; Анна p1, Богдан p2. */
function openClassic(): GameState {
  return startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [explained], { speedBonus: false })]), 'Анна', 'Богдан'), 0, rng);
}

describe('question explanation in the views', () => {
  it('never reaches the phone or the stage while the question runs, and comes with the reveal', () => {
    let s = openClassic();
    expect(s.phase).toBe('question');
    expect(JSON.stringify(playerView(s, 'p1'))).not.toContain(EXPLANATION);
    expect(JSON.stringify(stageView(s))).not.toContain(EXPLANATION);
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: single.type === 'single' ? single.correctId : '' }, 1000));
    expect(JSON.stringify(playerView(s, 'p1'))).not.toContain(EXPLANATION);
    s = must(lock(s));
    expect(JSON.stringify(playerView(s, 'p2'))).not.toContain(EXPLANATION);
    s = must(next(s, 0, rng));
    expect(s.phase).toBe('reveal');
    expect(playerView(s, 'p2')!.reveal?.explanation).toBe(EXPLANATION);
    expect(playerView(s, 'p1')!.reveal?.explanation).toBe(EXPLANATION);
    expect(playerView(s, 'p1')!.me.result?.grade).toBe('correct');
    expect(playerView(s, 'p2')!.me.result).toBeNull();
  });
});
