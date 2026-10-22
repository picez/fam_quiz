import { describe, expect, it } from 'vitest';
import {
  currentRound,
  endRound,
  lock,
  next,
  pause,
  recordOf,
  resume,
  roundQuestionNumber,
  start,
  submitAnswer,
  type GameState,
} from './game';
import { blitzRound, bool, classicRound, makeQuiz, makeRoundsQuiz, numeric, single, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const T0 = 1_000_000;
const correct = { type: 'single', optionId: 'b' } as const;
const quiz = makeRoundsQuiz(
  [classicRound('r1', [single, text], { title: 'Розминка' }), classicRound('r2', [bool, numeric])],
  { leaderboard: 'end' },
);

const intro = () => must(start(lobbyWith(quiz, 'Олена', 'Тарас')));
const firstQuestion = () => must(next(intro(), T0));
/** Закрити поточне запитання й перейти до розкриття. */
const toReveal = (state: GameState) => must(next(must(lock(state)), T0));
/** Перейти з розкриття до наступного етапу. */
const after = (state: GameState) => must(next(toReveal(state), T0));

describe('rounds', () => {
  it('opens with the intro of the first round, then its first question', () => {
    const state = intro();
    expect(state.phase).toBe('intro');
    expect(state.roundIndex).toBe(0);
    expect(currentRound(state)?.title).toBe('Розминка');

    const question = must(next(state, T0));
    expect(question.phase).toBe('question');
    expect(question.plays).toHaveLength(1);
    expect(question.plays[0].roundIndex).toBe(0);
    expect(question.plays[0].question.id).toBe(single.id);
    expect(question.questionIndex).toBe(0);
    expect(roundQuestionNumber(question)).toBe(0);
  });

  it('walks round_end → intro of the next round → finished after its last question', () => {
    const second = after(firstQuestion());
    expect(second.phase).toBe('question');
    expect(second.plays[1].question.id).toBe(text.id);
    expect(roundQuestionNumber(second)).toBe(1);

    const roundEnd = after(second);
    expect(roundEnd.phase).toBe('round_end');

    const nextIntro = must(next(roundEnd, T0));
    expect(nextIntro.phase).toBe('intro');
    expect(nextIntro.roundIndex).toBe(1);

    const third = must(next(nextIntro, T0));
    expect(third.plays[2]).toMatchObject({ roundIndex: 1, question: { id: bool.id } });
    expect(roundQuestionNumber(third)).toBe(0);

    const finished = after(after(third));
    expect(finished.phase).toBe('finished');
    expect(finished.plays.map((play) => play.question.id)).toEqual([single.id, text.id, bool.id, numeric.id]);
  });

  it('starts every quiz with the intro of its first round, even a quiz of one round', () => {
    for (const quiz of [makeQuiz([single, text]), makeRoundsQuiz([blitzRound('b1', [single])])]) {
      const intro = must(start(lobbyWith(quiz, 'Олена')));
      expect(intro).toMatchObject({ phase: 'intro', roundIndex: 0, plays: [], endsAt: null });
      const open = must(next(intro, T0 + 5_000));
      expect(open).toMatchObject({ phase: 'question', roundIndex: 0, questionIndex: 0, startedAt: T0 + 5_000 });
      expect(open.plays).toHaveLength(1);
    }
  });

  it('pauses and ends the game from the intro of the only round', () => {
    const intro = must(start(lobbyWith(makeQuiz([single, text]), 'Олена')));
    const paused = must(pause(intro, T0));
    expect(next(paused, T0)).toEqual({ ok: false, error: 'paused' });
    const ended = must(endRound(must(resume(paused, T0)), T0));
    expect(ended.plays).toHaveLength(0);
    expect(ended.players[0].score).toBe(0);
  });
});

describe('endRound', () => {
  it('closes the open question, counts the given answers and skips the rest of the round', () => {
    const answered = must(submitAnswer(firstQuestion(), 'p1', correct, T0 + 10_000));
    const state = must(endRound(answered, T0 + 12_000));
    expect(state.phase).toBe('round_end');
    expect(state.endsAt).toBeNull();
    expect(recordOf(state, 0, 'p1')?.points).toBe(750);
    expect(state.players.map((p) => [p.score, p.totalTimeMs])).toEqual([
      [750, 10_000],
      [0, 20_000],
    ]);
    expect(submitAnswer(state, 'p2', correct, T0 + 13_000)).toEqual({ ok: false, error: 'wrong_phase' });

    const nextRound = must(next(must(next(state, T0)), T0));
    expect(nextRound.plays.map((play) => play.question.id)).toEqual([single.id, bool.id]);
  });

  it('finishes the game in the last round', () => {
    const lastRound = must(next(must(endRound(firstQuestion(), T0)), T0));
    expect(must(endRound(lastRound, T0)).phase).toBe('finished');
  });

  it('is allowed from the intro, reveal and leaderboard', () => {
    expect(must(endRound(intro(), T0)).phase).toBe('round_end');
    expect(must(endRound(toReveal(firstQuestion()), T0)).phase).toBe('round_end');
    const each = makeRoundsQuiz([classicRound('r1', [single, text]), classicRound('r2', [bool])]);
    const leaderboard = after(must(next(must(start(lobbyWith(each, 'Олена'))), T0)));
    expect(leaderboard.phase).toBe('leaderboard');
    expect(must(endRound(leaderboard, T0)).phase).toBe('round_end');
  });

  it('is rejected in the lobby, at the end of a round and after the game', () => {
    expect(endRound(lobbyWith(quiz, 'Олена'), T0)).toEqual({ ok: false, error: 'wrong_phase' });
    const roundEnd = must(endRound(firstQuestion(), T0));
    expect(endRound(roundEnd, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    const finished = must(endRound(must(next(roundEnd, T0)), T0));
    expect(finished.phase).toBe('finished');
    expect(endRound(finished, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('clears a pause', () => {
    const paused = must(pause(firstQuestion(), T0 + 5000));
    const state = must(endRound(paused, T0 + 6000));
    expect(state.paused).toBe(false);
    expect(state.remainingMs).toBeNull();
  });
});
