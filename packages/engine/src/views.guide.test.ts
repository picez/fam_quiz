import { describe, expect, it } from 'vitest';
import { guidePages } from '@quiz/shared';
import { lock, next, start, submitAnswer, type GameState } from './game';
import { pickCell } from './board';
import { boardRound, bool, classicRound, makeRoundsQuiz, order, single, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithGuide, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;
const rng0 = () => 0;
const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(order, 'o1'), withId(single, 'q3'), withId(bool, 'b1')])], { newcomers: true });
/** «Почати гру» → «До гри» через усі сторінки → перше запитання. */
const firstQuestion = (s: GameState) => {
  let at = must(start(s));
  while (at.phase === 'guide') at = must(next(at, T0, rng0));
  return must(next(at, T0, rng0));
};
/** Закрити запитання й дійти «Далі» до наступного відкритого. */
const nextQuestion = (s: GameState, now: number) => {
  let at = must(lock(s));
  while (at.phase !== 'question') at = must(next(at, now, rng0));
  return at;
};

describe('guide views', () => {
  it('every role sees the guide page and all pages during the guide', () => {
    const s = must(next(must(start(lobbyWithGuide(quiz, 'Анна'))), T0, rng0));
    const pages = guidePages(s.quiz);
    for (const view of [stageView(s), hostView(s), playerView(s, 'p1')]) {
      expect(view?.phase).toBe('guide');
      expect(view?.guide).toEqual({ page: 1, pages });
      expect(view?.newcomers).toBe(true);
    }
  });

  it('nothing new is shown without the flag', () => {
    const s = must(next(must(start(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Анна'))), T0, rng0));
    expect([stageView(s).guide, stageView(s).newcomers, playerView(s, 'p1')?.me.tip]).toEqual([null, false, null]);
  });

  it('the first question of each type carries a tip; a repeated type does not', () => {
    let s = firstQuestion(lobbyWithGuide(quiz, 'Анна', 'Богдан'));
    expect(playerView(s, 'p1')?.me.tip).toBe('single');
    s = nextQuestion(s, T0 + 30_000);
    expect(playerView(s, 'p2')?.me.tip).toBe('order');
    s = nextQuestion(s, T0 + 60_000);
    expect(playerView(s, 'p1')?.me.tip).toBeNull(); // single уже був
    s = nextQuestion(s, T0 + 90_000);
    expect(playerView(s, 'p1')?.me.tip).toBe('boolean');
    expect(playerView(must(lock(s)), 'p1')?.me.tip).toBeNull(); // лише на етапі question
  });

  it('the tip does not touch the clock and answering still works', () => {
    const s = firstQuestion(lobbyWithGuide(quiz, 'Анна'));
    expect([s.startedAt, s.endsAt]).toEqual([T0, T0 + 20_000]);
    expect(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, T0 + 10).ok).toBe(true);
  });

  it('on the board only the chooser of a normal cell gets the tip, and nobody on a voice cell', () => {
    const cells = (p: string) => [withId(single, `${p}1`), { question: withId(bool, `${p}2`), answerMode: 'voice' as const }, withId(single, `${p}3`)];
    const board = makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: cells('a') }, { title: 'B', cells: cells('b') }, { title: 'C', cells: cells('c') }])], { newcomers: true });
    let s = must(start(lobbyWithGuide(board, 'Анна', 'Богдан')));
    while (s.phase === 'guide') s = must(next(s, T0, rng0));
    s = must(next(s, T0, rng0)); // intro → поле
    const opened = must(pickCell(s, 'p1', 'a1', T0, rng0));
    expect([playerView(opened, 'p1')?.me.tip, playerView(opened, 'p2')?.me.tip]).toEqual(['single', null]);
    const voice = must(pickCell(s, 'p1', 'a2', T0, rng0));
    expect([playerView(voice, 'p1')?.me.tip, playerView(voice, 'p2')?.me.tip]).toEqual([null, null]);
  });
});
