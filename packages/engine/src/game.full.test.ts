import { expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { next, start, submitAnswer, type GameState } from './game';
import { makeQuiz } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

it('plays a whole quiz with every question type', () => {
  const quiz = makeQuiz(undefined, { speedBonus: false, leaderboard: 'end' });

  // Для кожного запитання: [відповідь Олени, відповідь Тараса, бали Олени, бали Тараса].
  const rounds: [Answer, Answer, number, number][] = [
    [{ type: 'single', optionId: 'b' }, { type: 'single', optionId: 'a' }, 1000, 0],
    [{ type: 'multi', optionIds: ['a', 'c'] }, { type: 'multi', optionIds: ['a'] }, 1000, 0],
    [{ type: 'boolean', value: true }, { type: 'boolean', value: true }, 1000, 1000],
    [{ type: 'text', value: ' ОДЕСА ' }, { type: 'text', value: 'Київ' }, 1000, 0],
    [{ type: 'numeric', value: 2061 }, { type: 'numeric', value: 2111 }, 1000, 750],
    [{ type: 'order', itemIds: ['u', 'l', 'k', 'h'] }, { type: 'order', itemIds: ['l', 'u', 'k', 'h'] }, 1000, 500],
  ];

  let now = 1_000_000;
  let state: GameState = must(start(lobbyWith(quiz, 'Олена', 'Тарас'), now));

  rounds.forEach(([olena, taras, olenaPoints, tarasPoints], index) => {
    expect(state.phase).toBe('question');
    expect(state.questionIndex).toBe(index);

    now += 1000;
    state = must(submitAnswer(state, 'p1', olena, now));
    state = must(submitAnswer(state, 'p2', taras, now));
    expect(state.phase).toBe('locked');

    state = must(next(state, now));
    expect(state.phase).toBe('reveal');
    expect(playerView(state, 'p1')?.me.result?.points).toBe(olenaPoints);
    expect(playerView(state, 'p2')?.me.result?.points).toBe(tarasPoints);
    expect(stageView(state).standings).toBeNull();

    now += 1000;
    state = must(next(state, now));
  });

  expect(state.phase).toBe('finished');
  expect(stageView(state).standings).toEqual([
    { participantId: 'p1', nickname: 'Олена', score: 6000, totalTimeMs: 6000, rank: 1 },
    { participantId: 'p2', nickname: 'Тарас', score: 2250, totalTimeMs: 6000, rank: 2 },
  ]);
  expect(playerView(state, 'p2')?.me.rank).toBe(2);
  expect(hostView(state).standings).toHaveLength(2);
});
