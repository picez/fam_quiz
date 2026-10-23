import { describe, expect, it } from 'vitest';
import type { Quiz } from '@quiz/shared';
import { nextDeadline } from './blitz';
import { pickCell } from './board';
import { chooserOf } from './board-turns';
import { setDebuff } from './debuffs';
import { answerDuel, declareDuel, duelQuestionOf, pickDuelCategory } from './duel';
import { end, endRound, lock, next, pause, removePlayer, resume, setConnected, tick, type GameState } from './game';
import { adjustTime } from './timing';
import { boardRound, classicRound, duels, finalRound, makeRoundsQuiz, multi, single, withId } from './testing/fixtures';
import { answerAll, duelQuiz, T0, T1, toDeclarable, toDuelQuestion } from './testing/duel';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng0 = () => 0;

/** Дуелянт id відповідає правильно на поточне запитання дуелі. */
function win(s: GameState, id: string, now: number): GameState {
  return must(answerDuel(s, id, duelQuestionOf(s)?.accepted[0] ?? '', now));
}

/** p1 (той, хто оголосив) виграє кожне запитання дуелі до підсумку; без «Продовжити гру». */
function toResult(s: GameState, now: number): GameState {
  let current = s;
  if (current.duel?.stage === 'category') current = must(pickDuelCategory(current, null, 'dc1', now, rng0));
  while (current.duel?.stage !== 'result') {
    current = win(current, current.duel?.challengerId ?? '', now);
    current = must(next(current, now, rng0));
  }
  return current;
}

/** Дуель до підсумку й «Продовжити гру». */
function playOut(s: GameState, now: number): GameState {
  return must(next(toResult(s, now), now, rng0));
}

/** Закриває поточне запитання без відповідей і розкриває його. */
function lockReveal(s: GameState, now: number): GameState {
  return must(next(must(lock(s)), now, rng0));
}

describe('duels and the rest of the game', () => {
  it('a pause holds the duel clock', () => {
    const s = toDuelQuestion();
    expect(s.endsAt).toBe(T1 + 20_000);
    const paused = must(pause(s, T1 + 5000));
    expect(paused).toMatchObject({ paused: true, remainingMs: 15_000, startedAt: null, endsAt: null });
    expect(answerDuel(paused, 'p1', 'Париж', T1 + 6000)).toEqual({ ok: false, error: 'paused' });
    expect(tick(paused, T1 + 30_000)).toBe(paused);
    const resumed = must(resume(paused, T1 + 60_000));
    expect(resumed).toMatchObject({ paused: false, remainingMs: null, endsAt: T1 + 75_000, startedAt: T1 + 55_000 });
    expect(tick(resumed, T1 + 74_000).duel?.stage).toBe('question');
    expect(tick(resumed, T1 + 75_000).duel?.stage).toBe('answer');

    // На етапі вибору категорії пауза — загальна.
    const category = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), T0 + 4000, rng0));
    const pausedCategory = must(pause(category, T0 + 5000));
    expect(pausedCategory).toMatchObject({ paused: true, remainingMs: null, endsAt: null });
    expect(must(resume(pausedCategory, T0 + 6000))).toMatchObject({ paused: false, duel: { stage: 'category' }, endsAt: null });
  });

  it('nextDeadline points at the duel question end', () => {
    const s = toDuelQuestion();
    expect(nextDeadline(s, T1 + 1000)).toBe(T1 + 20_000);
    expect(nextDeadline(s, T1 + 20_000)).toBeNull();
    expect(nextDeadline(must(pause(s, T1 + 1000)), T1 + 2000)).toBeNull();
    const category = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), T0 + 4000, rng0));
    expect(nextDeadline(category, T0 + 5000)).toBeNull();
    const answered = win(s, 'p1', T1 + 1000);
    expect(answered.duel?.stage).toBe('answer');
    expect(nextDeadline(answered, T1 + 2000)).toBeNull();
    const result = toResult(s, T1 + 1000);
    expect(nextDeadline(result, T1 + 2000)).toBeNull();
  });

  it('board turns stay frozen through a duel', () => {
    const cells = (id: string) => [1, 2, 3].map((n) => withId(single, `g-${id}-${n}`));
    const board = boardRound('g', [
      { title: 'А', cells: cells('a') },
      { title: 'Б', cells: cells('b') },
      { title: 'В', cells: cells('c') },
    ]);
    const quiz: Quiz = {
      ...makeRoundsQuiz([classicRound('r1', [single, multi]), board, finalRound('f', withId(single, 'qf'))], { leaderboard: 'end' }),
      duels,
    };
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), T0, rng0);
    s = must(next(answerAll(s, T0 + 1000), T0 + 1000));
    s = must(next(s, T0 + 2000, rng0));
    s = must(next(answerAll(s, T0 + 3000), T0 + 3000));
    s = must(next(s, T0 + 4000, rng0));
    expect(s).toMatchObject({ phase: 'round_end', roundIndex: 0 });
    s = must(next(must(next(s, T0 + 5000, rng0)), T0 + 6000, rng0));
    expect(s.phase).toBe('board');
    for (const cell of ['g-a-1', 'g-a-2']) {
      s = must(pickCell(s, null, cell, T0 + 7000, rng0));
      s = must(next(lockReveal(s, T0 + 8000), T0 + 9000, rng0));
      expect(s.phase).toBe('board');
    }
    s = must(pickCell(s, null, 'g-a-3', T0 + 10_000, rng0));
    s = must(declareDuel(s, 'p1', 'p2'));
    s = lockReveal(s, T0 + 11_000);
    expect(s.phase).toBe('reveal');

    const withoutDuel = must(next({ ...s, duel: null }, T0 + 12_000, rng0));
    expect(withoutDuel.phase).toBe('board');

    let duel = must(next(s, T0 + 12_000, rng0));
    expect(duel.phase).toBe('duel');
    const chooser = chooserOf(withoutDuel) ?? '';
    duel = must(setConnected(duel, chooser, false, T0 + 13_000));
    expect(duel.board?.awaySince).toBeNull();
    expect(nextDeadline(duel, T0 + 13_000)).toBeNull();
    expect(tick(duel, T0 + 100_000).board).toEqual(duel.board);
    duel = must(setConnected(duel, chooser, true, T0 + 14_000));

    const after = playOut(duel, T1);
    expect(after.phase).toBe('board');
    expect(chooserOf(after)).toBe(chooserOf(withoutDuel));
    expect(after.board?.done).toBe(withoutDuel.board?.done);
    expect(after.board?.circleNo).toBe(withoutDuel.board?.circleNo);
    expect(after.board?.circle).toEqual(withoutDuel.board?.circle);
  });

  it('debuffs wait for the next real question', () => {
    let s = must(setDebuff(toDeclarable(), 'p1', 'fog'));
    s = must(declareDuel(s, 'p1', 'p2'));
    s = must(next(s, T0 + 4000, rng0));
    expect(s.phase).toBe('duel');
    expect(s.debuffs.p1.firedAt).toBeNull();
    s = must(pickDuelCategory(s, 'p1', 'dc1', T1, rng0));
    expect(s.debuffs.p1.firedAt).toBeNull();
    s = toResult(s, T1 + 1000);
    expect(s.debuffs.p1.firedAt).toBeNull();
    s = must(next(s, T1 + 2000, rng0));
    expect(s.plays[s.questionIndex].question.id).toBe('q3');
    expect(s.debuffs.p1.firedAt).toBe(s.questionIndex);
  });

  it('kicking a duelist cancels the duel; kicking the opponent gives the challenger the right back', () => {
    const s = toDuelQuestion();
    const noOpponent = must(removePlayer(s, 'p2'));
    expect(noOpponent).toMatchObject({ phase: 'reveal', duel: null, endsAt: null });
    expect(noOpponent.duelsDeclared).not.toContain('p1');
    expect(declareDuel(noOpponent, 'p1', 'p3').ok).toBe(true);

    const noChallenger = must(removePlayer(s, 'p1'));
    expect(noChallenger).toMatchObject({ phase: 'reveal', duel: null });
    expect(noChallenger.duelsDeclared).toEqual([]);

    const bystander = must(removePlayer(s, 'p3'));
    expect(bystander.phase).toBe('duel');
    expect(bystander.duel).toEqual(s.duel);

    const declared = must(declareDuel(toDeclarable(), 'p1', 'p2'));
    const declaredKick = must(removePlayer(declared, 'p2'));
    expect(declaredKick).toMatchObject({ phase: 'reveal', duel: null, duelsDeclared: [] });

    const result = toResult(s, T1 + 1000);
    expect(result.duel?.stage).toBe('result');
    const kicked = must(removePlayer(result, 'p2'));
    expect(kicked).toMatchObject({ phase: 'reveal', duel: null });
    expect(kicked.duelsDeclared).toEqual(['p1']);
    expect(kicked.adjustments).toEqual([expect.objectContaining({ playerId: 'p1', points: 300, source: 'duel' })]);
    const p1 = (state: GameState) => state.players.find((p) => p.id === 'p1')?.score;
    expect(p1(kicked)).toBe(p1(result));
  });

  it('ending the round or the game mid-duel drops the duel', () => {
    const s = toDuelQuestion();
    const ended = must(endRound(s, T1 + 1000));
    expect(ended).toMatchObject({ phase: 'round_end', duel: null, startedAt: null, endsAt: null });
    expect(ended.adjustments).toEqual(s.adjustments);
    expect(ended.duelsDeclared).toEqual(['p1']);

    const declared = must(endRound(must(declareDuel(toDeclarable(), 'p1', 'p2')), T0 + 4000));
    expect(declared.phase).toBe('round_end');
    expect(declared.duel?.stage).toBe('declared');

    const finished = must(end(s));
    expect(finished).toMatchObject({ phase: 'finished', duel: null });
  });

  it('a disconnected duelist keeps the duel going; the host may pick the category', () => {
    const category = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), T0 + 4000, rng0));
    const away = must(setConnected(category, 'p1', false, T0 + 5000));
    expect(away.duel).toEqual(category.duel);
    expect(away.phase).toBe('duel');
    const picked = must(pickDuelCategory(away, null, 'dc2', T1, rng0));
    expect(picked.duel).toMatchObject({ stage: 'question', categoryId: 'dc2' });
  });

  it('a duel declared in the last round before the final starts at the round end', () => {
    let s = must(next(must(endRound(toDeclarable(), T0 + 4000)), T0 + 5000, rng0));
    expect(s).toMatchObject({ phase: 'intro', roundIndex: 1 });
    s = must(next(s, T0 + 6000, rng0));
    s = must(next(lockReveal(s, T0 + 7000), T0 + 8000, rng0));
    s = must(next(lockReveal(s, T0 + 9000), T0 + 10_000, rng0));
    expect(s.plays[s.questionIndex].question.id).toBe('q6');
    s = must(declareDuel(s, 'p1', 'p2'));

    // Ведучий завершує раунд: оголошена дуель стартує з round_end, до заставки фіналу.
    const roundEnd = must(endRound(s, T0 + 11_000));
    expect(roundEnd).toMatchObject({ phase: 'round_end', roundIndex: 1, duel: { stage: 'declared' } });
    const atEnd = must(next(roundEnd, T0 + 12_000, rng0));
    expect(atEnd).toMatchObject({ phase: 'duel', duel: { returnPhase: 'round_end' } });
    expect(playOut(atEnd, T1)).toMatchObject({ phase: 'intro', roundIndex: 2, duel: null });

    // Звичайний хід: дуель стартує після розкриття q6, далі — кінець раунду.
    const atReveal = must(next(lockReveal(s, T0 + 11_000), T0 + 12_000, rng0));
    expect(atReveal).toMatchObject({ phase: 'duel', duel: { returnPhase: 'reveal' } });
    expect(playOut(atReveal, T1)).toMatchObject({ phase: 'round_end', roundIndex: 1, duel: null });
  });

  it('duel points count towards the final wager limit', () => {
    const roundEnd = must(endRound(must(next(must(endRound(toDeclarable(), T0 + 4000)), T0 + 5000, rng0)), T0 + 6000));
    expect(roundEnd).toMatchObject({ phase: 'round_end', roundIndex: 1 });
    const plain = must(next(must(next(roundEnd, T0 + 7000, rng0)), T0 + 8000, rng0));
    expect(plain.phase).toBe('wager');

    const duel = must(next(must(declareDuel(roundEnd, 'p1', 'p2')), T0 + 7000, rng0));
    const intro = playOut(duel, T1);
    expect(intro).toMatchObject({ phase: 'intro', roundIndex: 2 });
    const wager = must(next(intro, T1 + 1000, rng0));
    expect(wager.phase).toBe('wager');
    const p1 = wager.players.find((p) => p.id === 'p1')?.score ?? 0;
    expect(wager.final?.limits.p1).toBe(p1);
    expect(wager.final?.limits.p1).toBe((plain.final?.limits.p1 ?? 0) + 300);
  });

  it('host time buttons do nothing in a duel', () => {
    expect(adjustTime(toDuelQuestion(), 15, T1 + 1000)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
