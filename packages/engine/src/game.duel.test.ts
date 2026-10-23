import { describe, expect, it } from 'vitest';
import type { Quiz } from '@quiz/shared';
import { adjustScore, lastNotice } from './adjust';
import { startDice } from './board-dice';
import {
  answerDuel,
  cancelDuel,
  declareDuel,
  duelCategoriesLeft,
  duelCutoff,
  duelEnds,
  duelQuestionOf,
  duelThreshold,
  pickDuelCategory,
  skipDuelQuestion,
} from './duel';
import { endRound, lock, next, pause, tick, type GameState } from './game';
import { boardRound, classicRound, duels, finalRound, makeRoundsQuiz, multi, single, withId } from './testing/fixtures';
import { duelQuiz, revealOf, T0, T1, toDeclarable, toDuelQuestion } from './testing/duel';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng0 = () => 0;
const answers = (s: GameState, id: string) => s.duel?.questions.at(-1)?.tries[id];

/** Без поля duels. */
function withoutDuels(quiz: Quiz): Quiz {
  const { duels: _duels, ...rest } = quiz;
  return rest;
}

/** Класика q1–q3, класика q4–q6 без фіналу. */
const noFinalQuiz = (): Quiz => {
  const quiz = duelQuiz();
  return { ...quiz, rounds: quiz.rounds.slice(0, 2) };
};

/** Поле з 3 клітинок. */
const field = boardRound('g1', [{ title: 'Міста', cells: [withId(single, 'g1-1'), withId(single, 'g1-2'), withId(single, 'g1-3')] }]);

/** Дуелянт id відповідає правильно на поточне запитання дуелі. */
function win(s: GameState, id: string, now: number): GameState {
  return must(answerDuel(s, id, duelQuestionOf(s)?.accepted[0] ?? '', now));
}

/** p1 виграє кожне запитання дуелі, доки не підсумок; далі «Продовжити гру». */
function playOut(s: GameState, now: number): GameState {
  let current = s;
  if (current.duel?.stage === 'category') current = must(pickDuelCategory(current, null, 'dc1', now, rng0));
  while (current.duel?.stage !== 'result') {
    current = win(current, current.duel?.challengerId ?? '', now);
    current = must(next(current, now, rng0));
  }
  return must(next(current, now, rng0));
}

/** Гра з reveal q2 далі до round_end першого раунду. */
function toRoundEnd(s: GameState): GameState {
  const q3 = must(next(s, T0 + 5000, rng0));
  return must(next(revealOf(q3, T0 + 6000), T0 + 7000, rng0));
}

describe('duels', () => {
  it('duels are unavailable before a third of the questions is played', () => {
    const q1 = revealOf(startRound(lobbyWith(duelQuiz(), 'Оля', 'Петро', 'Іра'), T0, rng0), T0 + 1000);
    expect(q1.phase).toBe('reveal');
    expect(declareDuel(q1, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
    const s = must(declareDuel(toDeclarable(), 'p1', 'p2'));
    expect(s.duel).toMatchObject({ stage: 'declared', challengerId: 'p1', opponentId: 'p2', returnPhase: null });
    expect(s.duelsDeclared).toEqual(['p1']);
  });

  it('the threshold counts board cells and skips the final', () => {
    const cells = (id: string) => [1, 2, 3].map((n) => withId(single, `${id}-${n}`));
    const board = boardRound('g', [
      { title: 'А', cells: cells('a') },
      { title: 'Б', cells: cells('b') },
      { title: 'В', cells: cells('c') },
    ]);
    const mixed: Quiz = {
      ...makeRoundsQuiz([classicRound('r1', [single, multi]), board, finalRound('f', withId(single, 'qf'))]),
      duels,
    };
    expect(duelThreshold(mixed)).toBe(4);
    expect(duelCutoff(mixed)).toBe(2);
    expect(duelThreshold(noFinalQuiz())).toBe(2);
    expect(duelCutoff(noFinalQuiz())).toBe(1);
    const one: Quiz = { ...makeRoundsQuiz([classicRound('r1', [single, multi, single])]), duels };
    expect(duelCutoff(one)).toBe(0);
    expect(duelThreshold(withoutDuels(duelQuiz()))).toBeNull();
    expect(duelThreshold({ ...makeRoundsQuiz([finalRound('f', single)]), duels })).toBeNull();
  });

  it('duels close when the final round starts, or the last round without a final', () => {
    const roundEnd = must(endRound(must(next(toRoundEnd(toDeclarable()), T0 + 8000, rng0)), T0 + 9000));
    expect(roundEnd).toMatchObject({ phase: 'round_end', roundIndex: 1 });
    expect(declareDuel(roundEnd, 'p1', 'p2').ok).toBe(true);
    const finalIntro = must(next(roundEnd, T0 + 10_000, rng0));
    expect(finalIntro).toMatchObject({ phase: 'intro', roundIndex: 2 });
    expect(declareDuel(finalIntro, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });

    const noFinal = toDeclarable({}, noFinalQuiz());
    expect(declareDuel(noFinal, 'p1', 'p2').ok).toBe(true);
    const lastIntro = must(next(must(endRound(noFinal, T0 + 5000)), T0 + 6000, rng0));
    expect(lastIntro).toMatchObject({ phase: 'intro', roundIndex: 1 });
    expect(declareDuel(lastIntro, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
    const q4 = must(next(lastIntro, T0 + 7000, rng0));
    expect(q4.phase).toBe('question');
    expect(declareDuel(q4, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('one duel per player and one at a time', () => {
    const base = toDeclarable();
    const s = must(declareDuel(base, 'p1', 'p2'));
    expect(declareDuel(s, 'p3', 'p1')).toEqual({ ok: false, error: 'duel_busy' });
    expect(declareDuel(base, 'p1', 'p1')).toEqual({ ok: false, error: 'not_found' });
    expect(declareDuel(base, 'p1', 'p9')).toEqual({ ok: false, error: 'not_found' });
    expect(declareDuel(base, 'p9', 'p1')).toEqual({ ok: false, error: 'not_found' });
    expect(declareDuel(must(pause(base, T0 + 4000)), 'p1', 'p2')).toEqual({ ok: false, error: 'paused' });
    const cancelled = must(cancelDuel(s));
    expect(declareDuel(cancelled, 'p1', 'p3')).toEqual({ ok: false, error: 'duel_used' });
    expect(declareDuel(cancelled, 'p3', 'p2').ok).toBe(true);
    expect(declareDuel(toDeclarable({}, withoutDuels(duelQuiz())), 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a duel cannot be declared when every category is used up', () => {
    const used = { ...toDeclarable(), duelUsed: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] };
    expect(declareDuel(used, 'p1', 'p2')).toEqual({ ok: false, error: 'duel_empty' });
  });

  it('the duel starts after the reveal and pauses the round', () => {
    let s = must(next(toDeclarable(), T0 + 4000, rng0));
    expect(s.phase).toBe('question');
    s = must(declareDuel(s, 'p1', 'p2'));
    s = must(lock(s));
    expect(s.phase).toBe('locked');
    s = must(next(s, T0 + 5000, rng0));
    expect(s.phase).toBe('reveal');
    expect(s.duel?.stage).toBe('declared');
    s = must(next(s, T0 + 6000, rng0));
    expect(s.phase).toBe('duel');
    expect(s.duel).toMatchObject({ stage: 'category', returnPhase: 'reveal' });
    expect(s.plays).toHaveLength(3);
    expect(s.startedAt).toBeNull();
    expect(s.endsAt).toBeNull();
  });

  it('the challenger or the host picks a category once; an empty category is unavailable', () => {
    const started = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), T0 + 4000, rng0));
    expect(pickDuelCategory(started, 'p2', 'dc1', T1, rng0)).toEqual({ ok: false, error: 'not_your_turn' });
    const s = must(pickDuelCategory(started, 'p1', 'dc1', T1, rng0));
    expect(s.duel).toMatchObject({ stage: 'question', categoryId: 'dc1', total: 2 });
    expect(s.duel?.questions).toEqual([{ questionId: 'd1', tries: {}, winnerId: null, answer: null, timeMs: null }]);
    expect(s.duelUsed).toEqual(['d1']);
    expect(s.startedAt).toBe(T1);
    expect(s.endsAt).toBe(T1 + 20_000);
    expect(duelQuestionOf(s)?.text).toBe('Столиця Франції?');
    expect(pickDuelCategory(s, 'p1', 'dc2', T1, rng0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pickDuelCategory(started, null, 'dc2', T1, rng0).ok).toBe(true);
    expect(pickDuelCategory(started, 'p1', 'dc9', T1, rng0)).toEqual({ ok: false, error: 'not_found' });
    const empty = { ...started, duelUsed: ['d1', 'd2', 'd3'] };
    expect(pickDuelCategory(empty, 'p1', 'dc1', T1, rng0)).toEqual({ ok: false, error: 'duel_empty' });
    const one = must(pickDuelCategory({ ...started, duelUsed: ['d1', 'd3'] }, 'p1', 'dc1', T1, rng0));
    expect(one.duel).toMatchObject({ total: 1, questions: [{ questionId: 'd2' }] });
    expect(pickDuelCategory(must(pause(started, T1)), 'p1', 'dc1', T1, rng0)).toEqual({ ok: false, error: 'paused' });
  });

  it('questions are drawn at random without repeats within the game', () => {
    const high = () => 0.99;
    const started = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), T0 + 4000, rng0));
    let s = must(pickDuelCategory(started, 'p1', 'dc1', T1, high));
    expect(s.duel?.questions[0].questionId).toBe('d3');
    s = must(next(win(s, 'p1', T1 + 1000), T1 + 2000, high));
    expect(s.duel?.questions[1].questionId).toBe('d2');
    s = must(next(win(s, 'p1', T1 + 3000), T1 + 4000, high));
    expect(s.duel?.stage).toBe('result');
    s = must(next(s, T1 + 5000, high));
    expect(s.phase).toBe('question');
    expect(duelCategoriesLeft(s)).toEqual([
      { id: 'dc1', title: 'Столиці', left: 1 },
      { id: 'dc2', title: 'Хімія', left: 3 },
    ]);
    s = must(declareDuel(s, 'p3', 'p2'));
    s = must(next(revealOf(s, T1 + 6000), T1 + 7000, rng0));
    expect(s.duel).toMatchObject({ stage: 'category', challengerId: 'p3' });
    s = must(pickDuelCategory(s, 'p3', 'dc1', T1 + 8000, high));
    expect(s.duel).toMatchObject({ total: 1, questions: [{ questionId: 'd1' }] });
  });

  it('the first correct answer wins the question; wrong answers can be retried until the time is over', () => {
    let s = toDuelQuestion();
    s = must(answerDuel(s, 'p2', 'Львів', T1 + 1000));
    expect(answers(s, 'p2')).toEqual(['Львів']);
    expect(s.duel?.stage).toBe('question');
    s = must(answerDuel(s, 'p2', 'Ліон', T1 + 2000));
    expect(answers(s, 'p2')).toEqual(['Львів', 'Ліон']);
    expect(answerDuel(s, 'p3', 'Париж', T1 + 2500)).toEqual({ ok: false, error: 'not_your_turn' });
    s = must(answerDuel(s, 'p1', '  париж ', T1 + 3000));
    expect(s.duel?.questions[0]).toMatchObject({ winnerId: 'p1', answer: '  париж ', timeMs: 3000 });
    expect(s.duel?.stage).toBe('answer');
    expect(s.endsAt).toBeNull();
    expect(answerDuel(s, 'p2', 'Париж', T1 + 4000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(answerDuel(toDeclarable(), 'p1', 'Париж', T1)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(answerDuel(must(pause(toDuelQuestion(), T1 + 1000)), 'p1', 'Париж', T1 + 1000)).toEqual({ ok: false, error: 'paused' });
  });

  it('answers after the time or beyond the try limit are refused', () => {
    expect(answerDuel(toDuelQuestion(), 'p1', 'Париж', T1 + 20_001)).toEqual({ ok: false, error: 'time_over' });
    let s = toDuelQuestion();
    for (let i = 0; i < 30; i += 1) s = must(answerDuel(s, 'p2', `Місто ${i}`, T1 + 1000));
    expect(answers(s, 'p2')).toHaveLength(30);
    expect(answerDuel(s, 'p2', 'Париж', T1 + 1000)).toEqual({ ok: false, error: 'no_attempts' });
    expect(answerDuel(s, 'p1', 'Париж', T1 + 1000).ok).toBe(true);
  });

  it('time over: nobody wins the question', () => {
    const s = toDuelQuestion();
    expect(tick(s, T1 + 19_999)).toBe(s);
    const over = tick(s, T1 + 20_000);
    expect(over.duel?.stage).toBe('answer');
    expect(over.duel?.questions[0].winnerId).toBeNull();
    expect(over.endsAt).toBeNull();
    expect(over.startedAt).toBeNull();
  });

  it('skipping a question draws another and does not count it', () => {
    const s = must(skipDuelQuestion(toDuelQuestion(), T1 + 5000, rng0));
    expect(s.duel?.questions).toMatchObject([{ questionId: 'd2' }]);
    expect(s.duel?.questions).toHaveLength(1);
    expect(s.duelUsed).toEqual(['d1', 'd2']);
    expect(s.startedAt).toBe(T1 + 5000);
    expect(s.endsAt).toBe(T1 + 25_000);
    const answered = win(s, 'p1', T1 + 6000);
    expect(skipDuelQuestion(answered, T1 + 7000, rng0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(skipDuelQuestion(must(pause(s, T1 + 6000)), T1 + 7000, rng0)).toEqual({ ok: false, error: 'paused' });

    const last = { ...toDuelQuestion(), duelUsed: ['d1', 'd2', 'd3'] };
    const before = last.adjustments.length;
    const done = must(skipDuelQuestion(last, T1 + 5000, rng0));
    expect(done.duel).toMatchObject({ stage: 'result', winnerId: null, questions: [] });
    expect(done.adjustments).toHaveLength(before);
  });

  it('more questions won wins; the stake moves as duel adjustments, even below zero', () => {
    let s = toDeclarable({ questionsPerDuel: 3 });
    const p2score = s.players[1].score;
    s = must(adjustScore(s, 'p2', -p2score, T0 + 3500));
    expect(s.players[1].score).toBe(0);
    const p1score = s.players[0].score;
    s = must(next(must(declareDuel(s, 'p1', 'p2')), T0 + 4000, rng0));
    s = must(pickDuelCategory(s, 'p1', 'dc1', T1, rng0));
    expect(s.duel?.total).toBe(3);
    s = win(s, 'p1', T1 + 1000);
    expect(duelEnds(s)).toBe(false);
    s = must(next(s, T1 + 2000, rng0));
    s = win(s, 'p1', T1 + 3000);
    expect(duelEnds(s)).toBe(true);
    s = must(next(s, T1 + 4000, rng0));
    expect(s.duel).toMatchObject({ stage: 'result', winnerId: 'p1' });
    expect(s.startedAt).toBeNull();
    expect(s.endsAt).toBeNull();
    const [first, second] = s.adjustments.slice(-2);
    expect(first).toMatchObject({ playerId: 'p1', points: 300, source: 'duel' });
    expect(second).toMatchObject({ playerId: 'p2', points: -300, source: 'duel' });
    expect(second.seq).toBe(first.seq + 1);
    expect(s.players[0].score).toBe(p1score + 300);
    expect(s.players[1].score).toBe(-300);
    expect(lastNotice(s)).toMatchObject({ nickname: 'Петро', points: -p2score });
  });

  it('a tie or a zero stake changes no points', () => {
    let s = toDuelQuestion();
    const before = s.adjustments.length;
    const scores = s.players.map((p) => p.score);
    s = must(next(win(s, 'p1', T1 + 1000), T1 + 2000, rng0));
    s = win(s, 'p2', T1 + 3000);
    expect(duelEnds(s)).toBe(true);
    s = must(next(s, T1 + 4000, rng0));
    expect(s.duel).toMatchObject({ stage: 'result', winnerId: null });
    expect(s.adjustments).toHaveLength(before);
    expect(s.players.map((p) => p.score)).toEqual(scores);

    let zero = toDuelQuestion({ stake: 0 });
    zero = must(next(win(zero, 'p1', T1 + 1000), T1 + 2000, rng0));
    zero = must(next(win(zero, 'p1', T1 + 3000), T1 + 4000, rng0));
    expect(zero.duel).toMatchObject({ stage: 'result', winnerId: 'p1' });
    expect(zero.adjustments).toHaveLength(before);
  });

  it('after the duel the game goes on exactly where it was', () => {
    const fromReveal = playOut(toDuelQuestion(), T1 + 1000);
    expect(fromReveal.phase).toBe('question');
    expect(fromReveal.plays[fromReveal.questionIndex].question.id).toBe('q3');
    expect(fromReveal.plays).toHaveLength(3);
    expect(fromReveal.duel).toBeNull();
    expect(next(must(lock(fromReveal)), T1 + 2000, rng0).ok).toBe(true);

    const roundEnd = toRoundEnd(toDeclarable());
    expect(roundEnd).toMatchObject({ phase: 'round_end', roundIndex: 0 });
    const duelAtEnd = must(next(must(declareDuel(roundEnd, 'p1', 'p2')), T0 + 8000, rng0));
    expect(duelAtEnd.duel?.returnPhase).toBe('round_end');
    const fromRoundEnd = playOut(duelAtEnd, T1);
    expect(fromRoundEnd).toMatchObject({ phase: 'intro', roundIndex: 1, duel: null });

    const each: Quiz = { ...duelQuiz(), settings: { leaderboard: 'each' } };
    let lb = revealOf(startRound(lobbyWith(each, 'Оля', 'Петро'), T0, rng0), T0 + 1000);
    lb = must(next(lb, T0 + 2000, rng0));
    expect(lb.phase).toBe('leaderboard');
    lb = revealOf(must(next(lb, T0 + 3000, rng0)), T0 + 4000);
    lb = must(next(lb, T0 + 5000, rng0));
    expect(lb.phase).toBe('leaderboard');
    lb = must(next(must(declareDuel(lb, 'p2', 'p1')), T0 + 6000, rng0));
    expect(lb.duel?.returnPhase).toBe('leaderboard');
    const fromLeaderboard = playOut(lb, T1);
    expect(fromLeaderboard.phase).toBe('question');
    expect(fromLeaderboard.plays[fromLeaderboard.questionIndex].question.id).toBe('q3');

    const withBoard: Quiz = { ...duelQuiz(), rounds: [duelQuiz().rounds[0], field, duelQuiz().rounds[2]] };
    const boardIntro = must(next(toRoundEnd(toDeclarable({}, withBoard)), T0 + 8000, rng0));
    expect(boardIntro).toMatchObject({ phase: 'intro', roundIndex: 1 });
    const dice = must(startDice(boardIntro));
    const duelAtIntro = must(next(must(declareDuel(dice, 'p1', 'p2')), T0 + 9000, rng0));
    expect(duelAtIntro.duel?.returnPhase).toBe('intro');
    const fromIntro = playOut(duelAtIntro, T1);
    expect(fromIntro).toMatchObject({ phase: 'intro', roundIndex: 1, duel: null });
    expect(fromIntro.board?.dice).toEqual(dice.board?.dice);
  });

  it('the host cancels a declared or running duel', () => {
    const declared = must(declareDuel(toDeclarable(), 'p1', 'p2'));
    const dropped = must(cancelDuel(declared));
    expect(dropped.duel).toBeNull();
    expect(dropped.duelsDeclared).toEqual(['p1']);
    expect(dropped.phase).toBe('reveal');

    const running = toDuelQuestion();
    const cancelled = must(cancelDuel(running));
    expect(cancelled).toMatchObject({ phase: 'reveal', duel: null, startedAt: null, endsAt: null, remainingMs: null });
    expect(cancelled.adjustments).toEqual(running.adjustments);
    expect(cancelled.duelsDeclared).toEqual(['p1']);
    const q3 = must(next(cancelled, T1 + 1000, rng0));
    expect(q3.plays[q3.questionIndex].question.id).toBe('q3');

    expect(cancelDuel(toDeclarable())).toEqual({ ok: false, error: 'not_found' });
  });
});
