import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { acceptAnswer, next, override, start, submitAnswer, type GameState } from './game';
import { pendingOf } from './hold';
import { boardRound, makeRoundsQuiz, single, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const q = (id: string, points: number) => withPoints(withId(single, id), points);
const c11 = q('c11', 100);
const c12 = q('c12', 200);
const b = { type: 'single', optionId: 'b' } as const;

function picked(cells: Parameters<typeof boardRound>[1][number]['cells'], options = {}): GameState {
  const round = boardRound('g1', [{ title: 'A', cells }], options);
  const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан', 'Віра'), 0));
  return must(pickCell(must(next(intro, 0)), null, 'c11', 0, Math.random));
}

describe('answer mode of a board cell', () => {
  it('a phone cell in a voice round takes the answer from the phone', () => {
    const state = picked([{ question: c11, answerMode: 'phone' }, c12], { answerMode: 'voice' });
    const answered = must(submitAnswer(state, 'p1', b, 1000));
    expect(pendingOf(answered)).toMatchObject({ playerId: 'p1' });
    const revealed = must(acceptAnswer(answered, 'p1', 2000));
    expect(revealed.phase).toBe('reveal');
    expect(revealed.plays[0].answers.p1.points).toBe(100);
  });

  it('a voice cell in a phone round is graded by the host', () => {
    const state = picked([{ question: c11, answerMode: 'voice' }, c12], { answerMode: 'phone' });
    expect(submitAnswer(state, 'p1', b, 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(state.heldAt).toBeNull();
    const graded = must(override(state, 'p1', 'correct', 2000));
    expect(graded.phase).toBe('locked');
    const revealed = must(next(graded, 3000));
    expect(revealed.phase).toBe('reveal');
    expect(revealed.plays[0].answers.p1.points).toBe(100);
  });

  it('a cell without its own mode follows the round', () => {
    expect(picked([c11, c12], { answerMode: 'voice' }).plays[0].board).toMatchObject({ answerMode: 'voice', kind: 'normal', penalty: 'none' });
    expect(picked([c11, c12], { answerMode: 'phone' }).plays[0].board?.answerMode).toBe('phone');
  });

  it('the cell kind and penalty are taken when it opens', () => {
    const state = picked([{ question: c11, kind: 'blitz', penalty: 'all' }, c12]);
    expect(state.plays[0].board).toMatchObject({ kind: 'blitz', penalty: 'all' });
  });
});
