import { DEFAULT_RULES, type Answer, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { cluesAnswered, cluesOpen, cluesOpenBy, cluesSeenBy, nextClue, nextClueAt, openClue } from './clues';
import { acceptAnswer, lock, next, override, pause, recordOf, resume, start, submitAnswer, tick, type GameState, type Play } from './game';
import { takeBuff } from './buffs';
import { actorOf } from './team-act';
import { grantOvertime } from './timing';
import { boardRound, bool, classicRound, clues, makeRoundsQuiz, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const selfClues = { ...clues, cluePace: 'self' } satisfies Question; // 5 підказок, 30 с, 1000 балів
const right: Answer = { type: 'clues', value: 'Тарас Шевченко' };
const wrong: Answer = { type: 'clues', value: 'Франко' };
const rng = () => 0;
const currentPlay = (s: GameState): Play => s.plays[s.questionIndex];
const opened = (s: GameState, id: string, times: number, at = 1000) => {
  for (let i = 0; i < times; i += 1) s = must(openClue(s, id, at));
  return s;
};
/** Класика без бонусу швидкості, запитання відкрите в 0; Анна p1, Богдан p2. */
const openClassic = (question: Question = selfClues) =>
  startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [question], { rules: DEFAULT_RULES })]), 'Анна', 'Богдан'), 0, rng);

/** Поле з однією клітинкою «Хто я?» у власному темпі; Анна вибрала її в момент 0. */
function pickedCell(answerMode: 'phone' | 'voice' = 'phone'): GameState {
  const round = boardRound('g1', [{ title: 'A', cells: [selfClues] }], { answerMode });
  const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан')));
  return must(pickCell(must(next(intro, 0)), null, selfClues.id, 0, rng));
}

/** m1 Оля, m2 Петро — t1 (капітан Оля); m3 Віра, m4 Ігор — t2 (капітан Віра). */
const LAYOUT = [
  ['Оля', 'Петро'],
  ['Віра', 'Ігор'],
];

describe('«Who am I?» at own pace (12c)', () => {
  it('each player opens their own clues; the timer opens nothing', () => {
    const s = opened(openClassic(), 'p1', 2);
    expect(currentPlay(s).clueOpens).toEqual({ p1: 3 });
    expect(cluesOpenBy(currentPlay(s), 'p2')).toBe(1);
    expect(cluesSeenBy(currentPlay(s), 'p1')).toBe(3);
    const later = tick(s, 25_000);
    expect(currentPlay(later).clues).toBe(1);
    expect(nextClueAt(later)).toBeNull();
  });

  it('the price follows the own count at the answer, not the time', () => {
    const s = opened(openClassic(), 'p1', 2);
    const a = must(submitAnswer(s, 'p1', right, 1500));
    const b = must(submitAnswer(a, 'p2', right, 25_000));
    expect(recordOf(b, 0, 'p1')).toMatchObject({ points: 600, accepted: true, grade: 'correct' });
    expect(recordOf(b, 0, 'p2')).toMatchObject({ points: 1000, accepted: true });
    expect(cluesAnswered(currentPlay(b), selfClues, 25_000, 'p2')).toBe(1);
    expect(cluesAnswered(currentPlay(b), selfClues, 1500, 'p1')).toBe(3);
  });

  it('no more clues after the answer', () => {
    const s = must(submitAnswer(opened(openClassic(), 'p1', 1), 'p1', wrong, 1500));
    expect(openClue(s, 'p1', 2000)).toEqual({ ok: false, error: 'already_answered' });
    expect(currentPlay(s).clueOpens).toEqual({ p1: 2 });
  });

  it('a pause or a hold refuses, and after resume it opens', () => {
    const paused = must(pause(openClassic(), 2000));
    expect(openClue(paused, 'p1', 2500)).toEqual({ ok: false, error: 'paused' });
    // heldAt вписано вручну: утримання тут штучне, без справжньої дії, що його ставить.
    expect(openClue({ ...openClassic(), heldAt: 2000 }, 'p1', 2500)).toEqual({ ok: false, error: 'paused' });
    const resumed = must(resume(paused, 3000));
    expect(currentPlay(must(openClue(resumed, 'p1', 3500))).clueOpens).toEqual({ p1: 2 });
  });

  it('not during the splash', () => {
    const s = startRound(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [selfClues], { rules: DEFAULT_RULES })]), 'Анна', 'Богдан'), 0, rng);
    const startedAt = s.startedAt ?? 0;
    expect(startedAt).toBeGreaterThan(0);
    expect(openClue(s, 'p1', startedAt - 1)).toEqual({ ok: false, error: 'not_started' });
    expect(openClue(s, 'p1', startedAt).ok).toBe(true);
  });

  it('not after the time is over', () => {
    const s = openClassic();
    const over = tick(s, 30_001);
    expect(over.phase).toBe('locked');
    expect(openClue(over, 'p1', 30_001)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(openClue(must(lock(s)), 'p1', 1000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('after the own deadline: time_over, while a player with extra time still opens', () => {
    const s = grantOvertime(openClassic(), 'p2', 10_000);
    expect(openClue(s, 'p1', 30_500)).toEqual({ ok: false, error: 'time_over' });
    expect(currentPlay(must(openClue(s, 'p2', 30_500))).clueOpens).toEqual({ p2: 2 });
  });

  it('all clues open: clues_done', () => {
    const s = opened(openClassic(), 'p1', 4);
    expect(currentPlay(s).clueOpens).toEqual({ p1: 5 });
    expect(openClue(s, 'p1', 1000)).toEqual({ ok: false, error: 'clues_done' });
  });

  it('without cluePace the timer opens clues as before', () => {
    const s = openClassic(clues);
    expect(openClue(s, 'p1', 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(currentPlay(tick(s, 5000)).clues).toBe(2);
  });

  it('a board phone cell: only the chooser opens, watchers see their clues, accept pays by the own count', () => {
    let s = opened(pickedCell(), 'p1', 2);
    expect(openClue(s, 'p2', 1000)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(cluesSeenBy(currentPlay(s), 'p2')).toBe(3);
    s = must(submitAnswer(s, 'p1', right, 2000));
    s = must(acceptAnswer(s, 'p1', 3000));
    expect(currentPlay(s).answers.p1).toMatchObject({ accuracy: 0.6, accepted: true });
  });

  it('a voice cell ignores self: the host opens, the grade pays by the host clue', () => {
    let s = pickedCell('voice');
    expect(openClue(s, 'p1', 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    s = must(nextClue(s, 1000));
    expect(cluesOpen(currentPlay(s))).toBe(2);
    s = must(override(s, 'p1', 'correct', 3000));
    expect(currentPlay(s).answers.p1).toMatchObject({ accuracy: 0.8, accepted: true });
  });

  it('the host grade on the reveal pays by the own count, not the time', () => {
    let s = must(submitAnswer(opened(openClassic(), 'p1', 2), 'p1', wrong, 1500));
    s = must(lock(s));
    while (s.phase !== 'reveal') s = must(next(s, 2000, rng));
    s = must(override(s, 'p1', 'correct'));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 600, accepted: true, grade: 'correct' });
  });

  it('works under the autopilot', () => {
    const s: GameState = { ...openClassic(), autopilot: { authorId: 'p1', at: null } };
    expect(currentPlay(must(openClue(s, 'p1', 1000))).clueOpens).toEqual({ p1: 2 });
  });

  it('a classic player who swapped to a spare opens no clues; the others still do', () => {
    const quiz = { ...makeRoundsQuiz([classicRound('r1', [selfClues], { rules: DEFAULT_RULES })], { buffs: ['swap'] }), spares: [withId(bool, 's1')] };
    const s = must(takeBuff(startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, rng), 'p1', 'swap', 1000, rng));
    expect(openClue(s, 'p1', 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(currentPlay(must(openClue(s, 'p2', 2000))).clueOpens).toEqual({ p2: 2 });
  });

  it('a board chooser who swapped to a spare opens no clues', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [selfClues], spares: [withId(bool, 'sp1')] }], { answerMode: 'phone' });
    const intro = must(start(lobbyWith(makeRoundsQuiz([round], { buffs: ['swap'] }), 'Анна', 'Богдан')));
    const picked = must(pickCell(must(next(intro, 0)), null, selfClues.id, 0, rng));
    const s = must(takeBuff(picked, 'p1', 'swap', 1000, rng));
    expect(openClue(s, 'p1', 2000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('in a team game the team opens; only the captain acts for it', () => {
    const s = must(next(teamGame(teamQuiz([classicRound('r1', [selfClues])]), LAYOUT), 0, rng));
    expect(currentPlay(must(openClue(s, 't1', 1000))).clueOpens).toEqual({ t1: 2 });
    expect(actorOf(s, 'm2', 'answer')).toEqual({ ok: false, error: 'not_captain' });
  });

  it('a team that opened two more clues gets 600 for the right answer', () => {
    let s = opened(must(next(teamGame(teamQuiz([classicRound('r1', [selfClues], { rules: DEFAULT_RULES })]), LAYOUT), 0, rng)), 't1', 2);
    s = must(submitAnswer(s, 't1', right, 1500));
    expect(recordOf(s, 0, 't1')).toMatchObject({ points: 600, accepted: true });
  });
});
