import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type BuffKind, type Question, type RoundRules } from '@quiz/shared';
import { pickCell } from './board';
import { buffBlock, takeBuff } from './buffs';
import { acceptAnswer, lock, next, override, recordOf, start, submitAnswer, type GameState, type Rng } from './game';
import { boardRound, makeQuiz, makeRoundsQuiz, single, survey, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng: Rng = () => 0;

/** Класика з p1 «Анна» і p2 «Богдан», бонус швидкості увімкнено; перше запитання відкрито о 0. */
function openClassic(questions: Question[], rules: Partial<RoundRules> = {}, buffs: BuffKind[] = []): GameState {
  const quiz = makeQuiz(questions, { leaderboard: 'end', speedBonus: true, rules: { ...DEFAULT_RULES, ...rules }, buffs });
  return startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, rng);
}

const answer = (...values: string[]) => ({ type: 'survey' as const, values });
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);
const streakOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.streak;

describe('«100 to 1» survey in a classic round', () => {
  it('each matched row pays price × popularity / 100; half the price is correct; no speed bonus', () => {
    let s = openClassic([survey]);
    s = must(submitAnswer(s, 'p1', answer('яблучко', 'Банан', 'ананас'), 1000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({
      points: 570,
      accepted: true,
      grade: 'correct',
      answer: { type: 'survey', values: ['яблучко', 'Банан', 'ананас'], rows: ['sa', 'sb', null] },
    });
    s = must(submitAnswer(s, 'p2', answer('Яблуко', ' яблуко ', 'Кавун'), 44_000));
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 420, accepted: false, grade: 'partial', answer: { values: ['Яблуко', 'Кавун'], rows: ['sa', 'sd'] } });
  });

  it('the same row twice counts once', () => {
    const s = must(submitAnswer(openClassic([survey]), 'p1', answer('Яблуко', 'яблучко'), 1000));
    expect(record(s, 'p1')).toMatchObject({ points: 320, grade: 'partial', answer: { values: ['Яблуко', 'яблучко'], rows: ['sa', null] } });
  });

  it('only the first N answers count', () => {
    const s = must(submitAnswer(openClassic([{ ...survey, answers: 2 }]), 'p1', answer('Яблуко', '', 'Банан', 'Кавун'), 1000));
    expect(record(s, 'p1')?.answer).toEqual({ type: 'survey', values: ['Яблуко', 'Банан'], rows: ['sa', 'sb'] });
    expect(record(s, 'p1')?.points).toBe(570);
  });

  it('points never exceed the price', () => {
    const big: Question = {
      ...survey,
      rows: [
        { id: 'x', text: 'Перший', popularity: 100, accepted: [] },
        { id: 'y', text: 'Другий', popularity: 50, accepted: [] },
      ],
    };
    const s = must(submitAnswer(openClassic([big]), 'p1', answer('Перший', 'Другий'), 1000));
    expect(record(s, 'p1')).toMatchObject({ points: 1000, accuracy: 1, grade: 'correct' });
  });

  it('empty answer — type_mismatch; a text answer — type_mismatch; one answer only — already_answered; time over — time_over', () => {
    const s = openClassic([survey]);
    expect(submitAnswer(s, 'p1', answer('', '   '), 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', { type: 'text', value: 'Яблуко' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(openClassic([single]), 'p1', answer('Київ'), 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const answered = must(submitAnswer(s, 'p1', answer('Груша'), 1000));
    expect(submitAnswer(answered, 'p1', answer('Банан'), 2000)).toEqual({ ok: false, error: 'already_answered' });
    expect(submitAnswer(s, 'p1', answer('Банан'), 46_000)).toEqual({ ok: false, error: 'time_over' });
  });

  it('the minus penalty only for zero points', () => {
    let s = openClassic([survey, withId(survey, 'q18')], { penalty: 'minus' });
    s = must(submitAnswer(s, 'p1', answer('ананас'), 1000));
    s = must(lock(s));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: -1000, grade: 'wrong' });
    expect(recordOf(s, 0, 'p2')).toBeUndefined();
    s = must(next(must(next(s, 2000, rng)), 3000, rng));
    expect(s.questionIndex).toBe(1);
    s = must(submitAnswer(s, 'p1', answer('Кавун'), 4000));
    expect(recordOf(s, 1, 'p1')).toMatchObject({ points: 100, grade: 'partial' });
  });

  it('the round multiplier applies', () => {
    const s = must(submitAnswer(openClassic([survey], { multiplier: 2 }), 'p1', answer('Яблуко', 'Банан'), 1000));
    expect(record(s, 'p1')?.points).toBe(1140);
  });

  it('streak: a correct survey continues it, a partial breaks it', () => {
    let s = openClassic([survey, withId(survey, 'q18')], { streak: { length: 2, bonus: { kind: 'fixed', value: 100 } } });
    s = must(submitAnswer(s, 'p1', answer('Яблуко', 'Банан'), 1000));
    s = must(submitAnswer(s, 'p2', answer('Яблуко', 'Банан'), 1000));
    s = must(next(s, 2000, rng));
    s = must(next(s, 3000, rng));
    expect(s.questionIndex).toBe(1);
    s = must(submitAnswer(s, 'p1', answer('Яблуко', 'Полуниця', 'Кавун'), 4000));
    s = must(submitAnswer(s, 'p2', answer('Груша'), 4000));
    expect(streakOf(s, 'p1')).toBe(2);
    expect(streakOf(s, 'p2')).toBe(0);
    expect(record(s, 'p1')).toMatchObject({ basePoints: 570, streakBonus: 100, points: 670 });
    expect(record(s, 'p2')).toMatchObject({ points: 80, streakBonus: 0 });
  });

  it('override refuses a survey', () => {
    let s = openClassic([survey]);
    s = must(submitAnswer(s, 'p1', answer('Яблуко'), 1000));
    s = must(next(must(lock(s)), 2000, rng));
    expect(s.phase).toBe('reveal');
    expect(override(s, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('buffs: double, time, hint and shield fit; fifty, retry and audience do not', () => {
    const s = openClassic([survey], { penalty: 'minus' });
    for (const kind of ['double', 'time', 'hint', 'shield'] as const) expect(buffBlock(s, 'p1', kind, 1000)).toBeNull();
    for (const kind of ['fifty', 'retry', 'audience'] as const) expect(buffBlock(s, 'p1', kind, 1000)).toBe('unfit_type');
  });

  it('double doubles the survey points', () => {
    let s = openClassic([survey], {}, ['double']);
    s = must(takeBuff(s, 'p1', 'double', 500, rng));
    s = must(submitAnswer(s, 'p1', answer('Яблуко', 'Банан'), 1000));
    expect(record(s, 'p1')?.points).toBe(1140);
  });
});

describe('«100 to 1» survey on a board cell answered from the phone', () => {
  /** Поле з p1 «Анна» і p2 «Богдан»: клітинка-survey ×2 (q17); p1 вибрав її о 0. */
  function onSurveyCell(check: 'auto' | 'manual' = 'auto'): GameState {
    const round = boardRound(
      'g1',
      [
        { title: 'Опитування', cells: [{ mark: 'x2', answerMode: 'phone', question: survey }] },
        { title: 'Інше', cells: [withId(single, 's1')] },
      ],
      { check },
    );
    const s = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'))), 0));
    return must(pickCell(s, 'p1', 'q17', 0, rng));
  }

  it('only the chooser answers', () => {
    expect(submitAnswer(onSurveyCell(), 'p2', answer('Яблуко'), 1000)).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('the waiting board answer already carries the hits', () => {
    const s = must(submitAnswer(onSurveyCell(), 'p1', answer('Яблуко', 'Банан'), 1000));
    expect(s.plays[s.questionIndex].board?.answer).toEqual({ type: 'survey', values: ['Яблуко', 'Банан'], rows: ['sa', 'sb'] });
  });

  it('accept reveals with board points', () => {
    let s = must(submitAnswer(onSurveyCell(), 'p1', answer('Яблуко', 'Банан'), 1000));
    s = must(acceptAnswer(s, 'p1', 2000));
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p1')).toMatchObject({ points: 1140, accepted: true, grade: 'correct' });
  });

  it('a manual-check board still accepts a survey by its board', () => {
    let s = must(submitAnswer(onSurveyCell('manual'), 'p1', answer('Кавун'), 1000));
    s = must(acceptAnswer(s, 'p1', 2000));
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p1')).toMatchObject({ points: 200, accepted: false, grade: 'partial' });
    expect(override(s, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
