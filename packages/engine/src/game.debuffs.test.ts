import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { activeDebuff, cancelDebuff, debuffOn, setDebuff, shownDebuff } from './debuffs';
import { placeWager } from './final';
import { end, endRound, lock, next, removePlayer, setConnected, start, type GameState } from './game';
import {
  blitzRound,
  boardRound,
  chain,
  classicRound,
  finalRound,
  makeQuiz,
  makeRoundsQuiz,
  single,
  text,
  withId,
  withPoints,
} from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { stageView } from './views';

const T0 = 1_000_000;
const rng = () => 0;
const lobby3 = () => lobbyWith(makeQuiz([single, text]), 'Олена', 'Тарас', 'Віра');

/** Від закритого запитання до наступного вибору клітинки поля. */
function toBoard(state: GameState): GameState {
  let current = state;
  while (current.phase !== 'board') current = must(next(current, T0, rng));
  return current;
}

describe('host debuffs', () => {
  it('a debuff waits until the next question and fires for everyone answering a classic question', () => {
    let state = must(setDebuff(must(start(lobby3())), 'p1', 'fog'));
    expect(state.debuffs.p1).toEqual({ kind: 'fog', firedAt: null, since: null, by: null });
    expect(activeDebuff(state, 'p1')).toBeNull();
    state = must(next(state, T0)); // перше запитання
    expect(state.debuffs.p1).toEqual({ kind: 'fog', firedAt: 0, since: T0, by: null });
    expect(activeDebuff(state, 'p1')?.kind).toBe('fog');
    state = must(lock(state));
    expect(state.debuffs.p1).toBeUndefined();
  });

  it('one debuff per player; a waiting one can be cancelled, a firing one cannot', () => {
    const waiting = must(setDebuff(must(start(lobby3())), 'p1', 'fog'));
    expect(setDebuff(waiting, 'p1', 'mud')).toEqual({ ok: false, error: 'debuff_busy' });
    expect(must(setDebuff(waiting, 'p2', 'mud')).debuffs.p2?.kind).toBe('mud');
    expect(must(cancelDebuff(waiting, 'p1')).debuffs).toEqual({});
    const firing = must(next(waiting, T0));
    expect(cancelDebuff(firing, 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(setDebuff(firing, 'p1', 'mud')).toEqual({ ok: false, error: 'debuff_busy' });
    expect(cancelDebuff(firing, 'p2')).toEqual({ ok: false, error: 'not_found' });
    expect(setDebuff(firing, 'p9', 'mud')).toEqual({ ok: false, error: 'not_found' });
    expect(setDebuff(lobby3(), 'p1', 'fog')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a debuff cast during a question fires in the next one', () => {
    let state = must(setDebuff(startRound(lobby3(), T0), 'p1', 'shake'));
    expect(state.debuffs.p1.firedAt).toBeNull();
    state = must(lock(state));
    expect(state.debuffs.p1.firedAt).toBeNull();
    state = must(next(state, T0 + 1000)); // reveal
    state = must(next(state, T0 + 2000)); // leaderboard
    expect(state.phase).toBe('leaderboard');
    state = must(next(state, T0 + 3000)); // друге запитання
    expect(state.debuffs.p1).toEqual({ kind: 'shake', firedAt: 1, since: T0 + 3000, by: null });
  });

  it('a debuff waits through a cell chosen by someone else and a voice cell, fires on a blitz cell', () => {
    const q = (id: string) => withPoints(withId(single, id), 100);
    const round = boardRound('g1', [
      { title: 'A', cells: [q('c11'), { question: q('c12'), answerMode: 'voice' }, { question: q('c13'), kind: 'blitz' }] },
    ]);
    const intro = () => must(start(lobbyWith(makeRoundsQuiz([round]), 'Олена', 'Тарас', 'Віра')));

    let state = must(next(must(setDebuff(intro(), 'p3', 'mirror')), T0, rng));
    state = must(pickCell(state, 'p1', 'c11', T0, rng)); // звичайна клітинка p1
    expect(state.debuffs.p3.firedAt).toBeNull();
    state = must(pickCell(toBoard(must(lock(state))), 'p2', 'c12', T0, rng)); // усна клітинка p2
    expect(state.debuffs.p3.firedAt).toBeNull();
    state = must(pickCell(toBoard(must(lock(state))), 'p3', 'c13', T0, rng)); // бліц-клітинка
    expect(state.debuffs.p3).toEqual({ kind: 'mirror', firedAt: 2, since: T0, by: null });

    const own = must(pickCell(must(next(must(setDebuff(intro(), 'p1', 'fog')), T0, rng)), 'p1', 'c11', T0, rng));
    expect(own.debuffs.p1.firedAt).toBe(0);
    const voice = must(pickCell(must(next(must(setDebuff(intro(), 'p1', 'fog')), T0, rng)), 'p1', 'c12', T0, rng));
    expect(voice.debuffs.p1.firedAt).toBeNull();
    const blitzByOther = must(pickCell(must(next(must(setDebuff(intro(), 'p2', 'fog')), T0, rng)), 'p1', 'c13', T0, rng));
    expect(blitzByOther.debuffs.p2.firedAt).toBe(0);
  });

  it('a disconnected target keeps the debuff for the next question', () => {
    let state = must(setDebuff(must(start(lobby3())), 'p2', 'mirror'));
    state = must(setConnected(state, 'p2', false, T0));
    state = must(next(state, T0));
    expect(state.debuffs.p2.firedAt).toBeNull();
    state = must(setConnected(state, 'p2', true, T0 + 1000));
    state = must(next(must(next(must(lock(state)), T0)), T0)); // reveal → leaderboard
    state = must(next(state, T0 + 5000));
    expect(state.debuffs.p2).toEqual({ kind: 'mirror', firedAt: 1, since: T0 + 5000, by: null });
  });

  it('blitz rounds, the final and the word chain count as answering for everyone', () => {
    const opened = (quiz: ReturnType<typeof makeQuiz>) => must(next(must(setDebuff(must(start(lobbyWith(quiz, 'Олена', 'Тарас'))), 'p2', 'guests')), T0, rng));
    for (const check of ['auto', 'manual'] as const) {
      const state = opened(makeRoundsQuiz([blitzRound('b', [single], { check })]));
      expect(state.phase).toBe('question');
      expect(state.debuffs.p2.firedAt).toBe(0);
    }
    expect(opened(makeQuiz([chain])).debuffs.p2.firedAt).toBe(0);

    let final = must(start(lobbyWith(makeRoundsQuiz([finalRound('f', single)]), 'Олена', 'Тарас')));
    final = must(next(final, T0, rng)); // ставки
    final = must(setDebuff(final, 'p2', 'freeze'));
    final = must(placeWager(final, 'p1', 0, T0, rng));
    final = must(placeWager(final, 'p2', 0, T0 + 500, rng));
    expect(final.phase).toBe('question');
    expect(final.debuffs.p2).toEqual({ kind: 'freeze', firedAt: 0, since: T0 + 500, by: null });
  });

  it('a kicked player loses the debuff; ending the round mid-question leaves no stale debuff on the stage', () => {
    const waiting = must(setDebuff(must(start(lobby3())), 'p1', 'fog'));
    expect(must(removePlayer(waiting, 'p1')).debuffs).toEqual({});
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [text])]);
    const firing = must(next(must(setDebuff(must(start(lobbyWith(quiz, 'Олена', 'Тарас'))), 'p1', 'fog')), T0));
    expect(shownDebuff(firing, 'p1')?.firedAt).toBe(0);
    const ended = must(endRound(firing, T0 + 1000));
    expect(ended.phase).toBe('round_end');
    expect(shownDebuff(ended, 'p1')).toBeNull();
    expect(must(setDebuff(ended, 'p1', 'mud')).debuffs.p1).toEqual({ kind: 'mud', firedAt: null, since: null, by: null });
  });

  it('a waiting debuff does not survive the end of the game on the stage', () => {
    const waiting = must(setDebuff(must(start(lobby3())), 'p1', 'fog'));
    const finished = must(end(waiting));
    expect(finished.phase).toBe('finished');
    expect(shownDebuff(finished, 'p1')).toBeNull();
    expect(stageView(finished).debuffs).toEqual([]);
  });

  it('debuffOn: the kind fired on that question for the recorder; another question, a waiting or a spent debuff — null (12i)', () => {
    const waiting = must(setDebuff(must(start(lobby3())), 'p1', 'fog'));
    expect(debuffOn(waiting, 0, 'p1')).toBeNull();
    const fired = must(next(waiting, T0)); // перше запитання
    expect(debuffOn(fired, 0, 'p1')).toBe('fog');
    expect(debuffOn(fired, 1, 'p1')).toBeNull();
    expect(debuffOn(fired, 0, 'p2')).toBeNull();
    const locked = must(lock(fired));
    expect(debuffOn(locked, 0, 'p1')).toBeNull();
    let state = locked;
    while (state.phase !== 'question') state = must(next(state, T0 + 1000));
    expect(state.questionIndex).toBe(1);
    expect(debuffOn(state, 0, 'p1')).toBeNull();
    expect(debuffOn(state, 1, 'p1')).toBeNull();
  });
});
