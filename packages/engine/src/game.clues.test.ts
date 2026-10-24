import { DEFAULT_RULES, type Answer, type BuffKind, type Question, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { nextDeadline } from './blitz';
import { pickCell } from './board';
import { buffBlock, takeBuff } from './buffs';
import { cluesAnswered, cluesOpen, nextClue, nextClueAt } from './clues';
import { acceptAnswer, lock, next, override, pause, recordOf, repick, resume, start, submitAnswer, tick, type GameState, type Play } from './game';
import { suspend } from './restore';
import { bool, boardRound, classicRound, clues, makeRoundsQuiz, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const right: Answer = { type: 'clues', value: 'Тарас Шевченко' };
const wrong: Answer = { type: 'clues', value: 'Франко' };
const rules = (patch: Partial<RoundRules>): RoundRules => ({ ...DEFAULT_RULES, ...patch });
const rng = () => 0;
const currentPlay = (s: GameState): Play => s.plays[s.questionIndex];

/** Класика з бонусом швидкості, перше запитання відкрите в момент 0 (таймер стартує в 0); гравці Анна p1, Богдан p2. */
function openClassic(questions: Question[] = [clues], options: { rules?: RoundRules; buffs?: BuffKind[] } = {}): GameState {
  const round = classicRound('r1', questions, { speedBonus: true, rules: options.rules ?? DEFAULT_RULES });
  return startRound(lobbyWith(makeRoundsQuiz([round], options.buffs ? { buffs: options.buffs } : {}), 'Анна', 'Богдан'), 0, rng);
}

const answered = (s: GameState, at: number, answer: Answer = right) => recordOf(must(submitAnswer(s, 'p1', answer, at)), 0, 'p1');

/** Поле з однією клітинкою «Хто я?»; Анна вибрала її в момент 0. */
function pickedCell(answerMode: 'phone' | 'voice' = 'phone'): GameState {
  const round = boardRound('g1', [{ title: 'A', cells: [clues] }], { answerMode });
  const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан')));
  return must(pickCell(must(next(intro, 0)), null, clues.id, 0, rng));
}

describe('«Who am I?» in the classic round', () => {
  it('the first clue is open at once and the rest open by the interval', () => {
    const s = openClassic([clues]);
    expect(currentPlay(s).clues).toBe(1);
    expect(tick(s, 4999)).toBe(s);
    expect(currentPlay(tick(s, 5000)).clues).toBe(2);
    expect(currentPlay(tick(s, 12_000)).clues).toBe(3); // кілька підказок за один тік
  });

  it('nextDeadline waits for the next clue, then for the end', () => {
    const s = openClassic();
    expect(nextDeadline(s, 0)).toBe(5000);
    const all = tick(s, 20_000);
    expect(currentPlay(all).clues).toBe(5);
    expect(nextClueAt(all)).toBeNull();
    expect(nextDeadline(all, 20_000)).toBe(30_000);
  });

  it('the answer after the k-th of n clues pays price × (n − k + 1) / n, without a speed bonus', () => {
    const s = openClassic();
    expect(answered(s, 1000)).toMatchObject({ points: 1000, accepted: true, grade: 'correct' });
    expect(answered(s, 5000)).toMatchObject({ points: 800, accepted: true, grade: 'correct' });
    expect(answered(s, 12_000)).toMatchObject({ points: 600, accepted: true, grade: 'correct' });
    expect(answered(s, 21_000)).toMatchObject({ points: 200, accepted: true, grade: 'correct' });
  });

  it('a wrong answer pays 0, or minus with the penalty, at any clue', () => {
    expect(answered(openClassic(), 1000, wrong)).toMatchObject({ points: 0, accepted: false, grade: 'wrong' });
    expect(answered(openClassic(), 21_000, wrong)).toMatchObject({ points: 0, accepted: false, grade: 'wrong' });
    const minus = openClassic([clues], { rules: rules({ penalty: 'minus' }) });
    expect(answered(minus, 12_000, wrong)).toMatchObject({ points: -1000, grade: 'wrong' });
  });

  it('one answer only', () => {
    const s = must(submitAnswer(openClassic(), 'p1', wrong, 1000));
    expect(submitAnswer(s, 'p1', right, 2000)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('a correct answer at the last clue keeps the streak', () => {
    const streak = { length: 2, bonus: { kind: 'fixed', value: 100 } } as const;
    let s = openClassic([clues, withId(clues, 'q13')], { rules: rules({ streak }) });
    s = must(lock(must(submitAnswer(s, 'p1', right, 21_000))));
    while (s.phase !== 'question') s = must(next(s, 30_000, rng));
    s = must(lock(must(submitAnswer(s, 'p1', right, 30_000 + 21_000))));
    expect(s.players[0].streak).toBe(2);
    expect(recordOf(s, 1, 'p1')).toMatchObject({ basePoints: 200, streakBonus: 100, accepted: true });
  });

  it('the multiplier applies', () => {
    expect(answered(openClassic([clues], { rules: rules({ multiplier: 2 }) }), 5000)?.points).toBe(1600);
  });

  it('pause freezes the clues: after resume the next clue opens the rest of the interval later', () => {
    const paused = must(pause(openClassic(), 3000));
    expect(tick(paused, 8000)).toBe(paused);
    expect(nextClueAt(paused)).toBeNull();
    const s = must(resume(paused, 10_000));
    expect(nextClueAt(s)).toBe(12_000);
    expect(currentPlay(tick(s, 11_999)).clues).toBe(1);
    expect(currentPlay(tick(s, 12_000)).clues).toBe(2);
  });

  it('a host override on the reveal keeps the clue decay', () => {
    let s = must(submitAnswer(openClassic(), 'p1', wrong, 5000));
    s = must(next(must(lock(s)), 6000, rng));
    expect(recordOf(s, 0, 'p1')?.points).toBe(0);
    expect(recordOf(must(override(s, 'p1', 'correct')), 0, 'p1')).toMatchObject({ points: 800, accepted: true, grade: 'correct' });
  });

  it('extra time opens no new clues', () => {
    let s = must(takeBuff(openClassic([clues], { buffs: ['time'] }), 'p1', 'time', 1000, rng));
    s = tick(s, 35_000);
    expect(s.phase).toBe('question');
    expect(currentPlay(s).clues).toBe(5);
    expect(nextClueAt(s)).toBeNull();
    expect(answered(s, 40_000)).toMatchObject({ points: 200, grade: 'correct' });
  });

  it('50/50, a second try and the audience are not available; double works', () => {
    const s = openClassic([clues], { buffs: ['fifty', 'retry', 'audience', 'double'] });
    expect(buffBlock(s, 'p1', 'fifty')).toBe('unfit_type');
    expect(buffBlock(s, 'p1', 'retry')).toBe('unfit_type');
    expect(buffBlock(s, 'p1', 'audience')).toBe('unfit_type');
    expect(buffBlock(s, 'p1', 'double')).toBeNull();
    const doubled = must(takeBuff(s, 'p1', 'double', 500, rng));
    expect(answered(doubled, 1000)?.points).toBe(2000);
  });

  it('the clue of an answer: by the time in the classic round', () => {
    const s = openClassic();
    expect(cluesAnswered(currentPlay(s), clues, 12_000)).toBe(3);
  });
});

describe('«Who am I?» on a board phone cell', () => {
  it('the clock stops while the host accepts; the clue is the one at submission', () => {
    let s = tick(pickedCell(), 5000);
    expect(currentPlay(s).clues).toBe(2);
    s = must(submitAnswer(s, 'p1', right, 6000));
    expect(s.heldAt).toBe(6000);
    expect(tick(s, 15_000)).toBe(s);
    expect(currentPlay(tick(s, 15_000)).clues).toBe(2);
    expect(nextClueAt(s)).toBeNull();
    s = must(acceptAnswer(s, 'p1', 20_000));
    expect(s.plays.at(-1)?.answers.p1).toMatchObject({ points: 800, accepted: true, grade: 'correct' });
  });

  it('after repick the clues continue from where the clock stopped', () => {
    let s = tick(pickedCell(), 6000);
    s = must(submitAnswer(s, 'p1', wrong, 6000));
    s = must(repick(s, 'p1', 9000));
    expect(nextClueAt(s)).toBe(13_000);
    expect(currentPlay(tick(s, 12_999)).clues).toBe(2);
    expect(currentPlay(tick(s, 13_000)).clues).toBe(3);
  });
});

describe('«Who am I?» swapped away on a board cell', () => {
  it('after the chooser swaps to a spare no clue ticks are scheduled or opened', () => {
    const spare = withId(bool, 'sp1');
    const round = boardRound('g1', [{ title: 'A', cells: [clues], spares: [spare] }], { answerMode: 'phone' });
    const intro = must(start(lobbyWith(makeRoundsQuiz([round], { buffs: ['swap'] }), 'Анна', 'Богдан')));
    const picked = must(pickCell(must(next(intro, 0)), null, clues.id, 0, rng));
    expect(nextClueAt(picked)).toBe(5000);
    const s = must(takeBuff(picked, 'p1', 'swap', 1000, rng));
    expect(nextClueAt(s)).toBeNull();
    expect(nextDeadline(s, 1000)).not.toBe(5000);
    expect(currentPlay(tick(s, 6000)).clues).toBe(1);
  });
});

describe('«Who am I?» on a board voice cell', () => {
  it('clues do not open by time on a voice cell', () => {
    const s = pickedCell('voice');
    const later = tick(s, 25_000);
    expect(currentPlay(later).clues).toBe(1);
    expect(nextClueAt(s)).toBeNull();
    expect(nextDeadline(s, 0)).toBe(30_000);
  });

  it('the host opens the next clue; the verdict pays by the open clue', () => {
    let s = must(nextClue(pickedCell('voice'), 1000));
    s = must(nextClue(s, 2000));
    expect(cluesOpen(currentPlay(s))).toBe(3);
    // Число на усній клітинці — відкрите ведучим, а не за часом.
    expect(cluesAnswered(currentPlay(s), clues, 25_000)).toBe(3);
    s = must(override(s, 'p1', 'correct', 3000));
    expect(s.phase).toBe('locked');
    expect(s.plays.at(-1)?.answers.p1).toMatchObject({ points: 600, accepted: true, grade: 'correct' });
  });

  it('nextClue errors', () => {
    let s = pickedCell('voice');
    for (let i = 0; i < 4; i++) s = must(nextClue(s, 1000 + i));
    expect(cluesOpen(currentPlay(s))).toBe(5);
    expect(nextClue(s, 2000)).toEqual({ ok: false, error: 'clues_done' });
    expect(nextClue(pickedCell('phone'), 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(nextClue(openClassic(), 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(nextClue(must(pause(pickedCell('voice'), 1000)), 2000)).toEqual({ ok: false, error: 'paused' });
    let revealed = must(override(pickedCell('voice'), 'p1', 'wrong', 1000));
    while (revealed.phase !== 'reveal') revealed = must(next(revealed, 2000, rng));
    expect(nextClue(revealed, 3000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a re-grade on the reveal keeps the clue number', () => {
    let s = must(nextClue(pickedCell('voice'), 1000));
    s = must(nextClue(s, 2000));
    s = must(override(s, 'p1', 'correct', 3000));
    expect(s.plays.at(-1)?.answers.p1.points).toBe(600);
    while (s.phase !== 'reveal') s = must(next(s, 4000, rng));
    s = must(override(s, 'p1', 'wrong', 5000));
    expect(s.plays.at(-1)?.answers.p1.points).toBe(0);
    s = must(override(s, 'p1', 'correct', 6000));
    expect(s.plays.at(-1)?.answers.p1).toMatchObject({ points: 600, grade: 'correct' });
  });
});

describe('«Who am I?» after a restart', () => {
  it('a suspended room resumes the clues where they stopped', () => {
    const s = must(resume(suspend(openClassic(), 7000), 100_000));
    expect(cluesOpen(currentPlay(s))).toBe(2);
    expect(nextClueAt(s)).toBe(103_000);
  });
});
