import { describe, expect, it } from 'vitest';
import { guidePages } from '@quiz/shared';
import { end, endRound, next, pause, resume, skipGuide, start, submitAnswer, type GameState } from './game';
import { boardRound, classicRound, finalRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithGuide, lobbyWithSplash, must } from './testing/helpers';

const T0 = 1_000_000;
const rng0 = () => 0;
// phone, rounds, questions, debuffs (старі налаштування — усі дебафи): 4 сторінки.
const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')]), finalRound('f1', withId(single, 'fq'))], { newcomers: true });
const withSplashes = (s: GameState): GameState => ({ ...s, transitions: true });

describe('the «Як грати» phase', () => {
  it('without the flag the game starts as before', () => {
    const plain = must(start(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [single])]), 'Анна'), T0));
    expect([plain.phase, plain.guidePage, plain.splash?.kind]).toEqual(['intro', 0, 'round']);
  });

  it('with the flag «Почати гру» opens page 0 without a splash; the first round is already set up', () => {
    const s = must(start(withSplashes(lobbyWithGuide(quiz, 'Анна', 'Богдан')), T0));
    expect([s.phase, s.guidePage, s.roundIndex, s.splash]).toEqual(['guide', 0, 0, null]);
    expect(guidePages(s.quiz)).toHaveLength(4);
  });

  it('«Далі» pages forward; on the last page it leaves the guide with the round splash', () => {
    let s = must(start(withSplashes(lobbyWithGuide(quiz, 'Анна')), T0));
    for (const page of [1, 2, 3]) {
      s = must(next(s, T0 + page * 1000, rng0));
      expect([s.phase, s.guidePage]).toEqual(['guide', page]);
    }
    s = must(next(s, T0 + 10_000, rng0));
    expect([s.phase, s.guidePage]).toEqual(['intro', 0]);
    expect(s.splash).toEqual({ kind: 'round', at: T0 + 10_000, until: T0 + 12_500 });
  });

  it('leaving the guide plays the round splash — «Фінал» when the first round is a final; a board round keeps its fresh turn order', () => {
    const finalFirst = makeRoundsQuiz([finalRound('f1', single)], { newcomers: true });
    const s = must(skipGuide(must(start(withSplashes(lobbyWithGuide(finalFirst, 'Анна')), T0)), T0 + 500));
    expect([s.phase, s.splash?.kind]).toEqual(['intro', 'final']);
    const cells = (p: string) => [withId(single, `${p}1`), withId(single, `${p}2`), withId(single, `${p}3`)];
    const board = makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: cells('a') }, { title: 'B', cells: cells('b') }, { title: 'C', cells: cells('c') }])], { newcomers: true });
    const guided = must(skipGuide(must(start(lobbyWithGuide(board, 'Анна', 'Богдан'))), T0));
    const { newcomers: _, ...plainSettings } = board.settings;
    const direct = must(start(lobbyWith({ ...board, settings: plainSettings }, 'Анна', 'Богдан')));
    expect(guided.board).toEqual(direct.board);
  });

  it('«До гри» skips from any page; outside the guide it is wrong_phase', () => {
    const first = must(start(lobbyWithGuide(quiz, 'Анна')));
    const s = must(skipGuide(must(next(first, T0, rng0)), T0 + 100));
    expect(s.phase).toBe('intro');
    expect(skipGuide(s, T0 + 200)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(skipGuide(lobbyWithGuide(quiz, 'Анна'), T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('pause and end work in the guide; end-round does not; paging waits for resume', () => {
    const s = must(start(lobbyWithGuide(quiz, 'Анна')));
    const paused = must(pause(s, T0));
    expect(next(paused, T0 + 1, rng0)).toEqual({ ok: false, error: 'paused' });
    expect(skipGuide(paused, T0 + 1)).toEqual({ ok: false, error: 'paused' });
    const resumed = must(resume(paused, T0 + 5000));
    expect([resumed.phase, resumed.guidePage, resumed.paused]).toEqual(['guide', 0, false]);
    expect(endRound(s, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(must(end(withSplashes(s), T0)).phase).toBe('finished');
  });

  it('nothing can be answered in the guide; the first question opens only after the round intro', () => {
    let s = must(start(lobbyWithGuide(quiz, 'Анна')));
    expect(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, T0).ok).toBe(false);
    s = must(next(must(skipGuide(s, T0)), T0 + 100, rng0));
    expect(s.phase).toBe('question');
  });
});
