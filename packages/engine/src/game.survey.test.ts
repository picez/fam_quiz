import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type BuffKind, type Question, type RoundRules } from '@quiz/shared';
import { pickCell } from './board';
import { buffBlock, takeBuff } from './buffs';
import { acceptAnswer, end, endRound, lock, next, override, recordOf, start, submitAnswer, type GameState, type Rng } from './game';
import { revealSurveyAll, skippedSurveys, surveyShown } from './survey';
import { hideCloudWord } from './votes';
import { bool, boardRound, classicRound, cloud, makeQuiz, makeRoundsQuiz, single, survey, surveyCloud, withId } from './testing/fixtures';
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
    // розкриття: усі рядки відразу, далі — наступне запитання
    s = must(next(must(revealSurveyAll(must(next(s, 2000, rng)))), 3000, rng));
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
    s = must(revealSurveyAll(must(next(s, 2000, rng))));
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
  it('a board survey steps rows after accept, then the board goes on', () => {
    let s = must(submitAnswer(onSurveyCell(), 'p1', answer('Яблуко'), 1000));
    s = must(acceptAnswer(s, 'p1', 2000));
    expect(s.phase).toBe('reveal');
    expect(s.plays[s.questionIndex].survey).toEqual({ source: 'host', shown: 0 });
    for (let shown = 1; shown <= 5; shown += 1) {
      s = must(next(s, 3000, rng));
      expect(s.phase).toBe('reveal');
      expect(s.plays[s.questionIndex].survey?.shown).toBe(shown);
    }
    s = must(next(s, 4000, rng));
    expect(s.phase).toBe('board');
  });

  it('the board survey keeps the host rows', () => {
    const s = onSurveyCell();
    const play = s.plays[s.questionIndex];
    expect(play.survey).toEqual({ source: 'host', shown: 0 });
    expect(play.question).toEqual(survey);
  });

  it('a swapped player on a manual board survey cell is graded by the host', () => {
    const round = boardRound(
      'g1',
      [
        { title: 'Опитування', cells: [{ answerMode: 'phone', question: survey }], spares: [withId(bool, 'sp1')] },
        { title: 'Інше', cells: [withId(single, 's1')] },
      ],
      { check: 'manual' },
    );
    let s = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end', buffs: ['swap'] }), 'Анна', 'Богдан'))), 0));
    s = must(pickCell(s, 'p1', 'q17', 0, rng));
    s = must(takeBuff(s, 'p1', 'swap', 500, rng));
    s = must(submitAnswer(s, 'p1', { type: 'boolean', value: true }, 1000));
    // запасне — просте запитання: за ручної перевірки «Прийняти» немає, оцінює ведучий
    expect(acceptAnswer(s, 'p1', 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    s = must(override(s, 'p1', 'correct', 2000));
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p1')).toMatchObject({ accepted: true, grade: 'correct' });
  });
});

describe('«100 to 1» survey: a swapped player in a classic round', () => {
  it("the host can grade a swapped player's answer on the reveal", () => {
    const quiz = { ...makeQuiz([survey], { leaderboard: 'end', buffs: ['swap'] }), spares: [withId(bool, 'sp1')] };
    let s = startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, rng);
    s = must(takeBuff(s, 'p1', 'swap', 500, rng));
    s = must(submitAnswer(s, 'p1', { type: 'boolean', value: false }, 1000));
    s = must(submitAnswer(s, 'p2', answer('Яблуко'), 1000));
    if (s.phase === 'question') s = must(lock(s));
    s = must(next(s, 2000, rng));
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p1')).toMatchObject({ grade: 'wrong', spare: 'sp1' });
    expect(override(s, 'p1', 'correct').ok).toBe(true);
    expect(override(s, 'p2', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

/** Класика з Анною p1, Богданом p2, Вірою p3 (і далі — з extra); перше запитання відкрито о 0. */
function openThree(questions: Question[], extra: string[] = []): GameState {
  const quiz = makeQuiz(questions, { leaderboard: 'end', speedBonus: true, rules: DEFAULT_RULES });
  return startRound(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра', ...extra), 0, rng);
}

/** Відповіді кількох гравців о 2000. */
function answerAll(state: GameState, answers: Record<string, Answer>, now = 2000): GameState {
  return Object.entries(answers).reduce((s, [id, a]) => must(submitAnswer(s, id, a, now)), state);
}

/** Закрити поточне запитання й відкрити наступне о now. */
function toNext(state: GameState, now = 5000): GameState {
  let s = state.phase === 'question' ? must(lock(state)) : state;
  const from = s.questionIndex;
  while (!(s.phase === 'question' && s.questionIndex !== from)) s = must(next(s, now, rng));
  return s;
}

const words = (...list: string[]): Answer => ({ type: 'wordcloud', words: list });
const ids = (s: GameState) => s.plays.map((p) => p.question.id);
const rowsOf = (s: GameState) => {
  const { question } = s.plays[s.questionIndex];
  return question.type === 'survey' ? question.rows : null;
};

describe('«100 to 1» survey board from an earlier word cloud', () => {
  it('builds the board from the cloud: hidden words out, popularity from those who wrote', () => {
    let s = openThree([cloud, surveyCloud]);
    s = answerAll(s, {
      p1: words('Каштани', 'Дніпро', 'Лайка'),
      p2: words('каштани', 'Лавра'),
      p3: words('КАШТАНИ', 'Дніпро'),
    });
    s = must(hideCloudWord(s, 'лайка', true));
    s = toNext(s);
    expect(s.plays[1].survey).toEqual({ source: 'cloud', shown: 0 });
    expect(rowsOf(s)).toEqual([
      { id: 'cloud-1', text: 'Каштани', popularity: 100, accepted: [] },
      { id: 'cloud-2', text: 'Дніпро', popularity: 67, accepted: [] },
      { id: 'cloud-3', text: 'Лавра', popularity: 33, accepted: [] },
    ]);
    // знімок вікторини не змінюється
    expect(s.quiz.rounds[0].type === 'classic' && s.quiz.rounds[0].questions[1]).toEqual(surveyCloud);
    s = must(submitAnswer(s, 'p1', { type: 'survey', values: ['каштани', 'дніпро'] }, (s.startedAt ?? 0) + 1000));
    expect(recordOf(s, 1, 'p1')?.points).toBe(1000); // 167 % → не більше ціни
  });

  it('at most 8 rows: the most common words first', () => {
    let s = openThree([cloud, surveyCloud], ['Галя']);
    s = answerAll(s, {
      p1: words('Арка', 'Брама', 'Вежа'),
      p2: words('Арка', 'Гай', 'Дуб'),
      p3: words('Арка', 'Брама', 'Озеро'),
      p4: words('Липа', 'Міст', 'Сад'),
    });
    s = toNext(s);
    expect(rowsOf(s)?.map((r) => [r.id, r.text, r.popularity])).toEqual([
      ['cloud-1', 'Арка', 75],
      ['cloud-2', 'Брама', 50],
      ['cloud-3', 'Вежа', 25],
      ['cloud-4', 'Гай', 25],
      ['cloud-5', 'Дуб', 25],
      ['cloud-6', 'Липа', 25],
      ['cloud-7', 'Міст', 25],
      ['cloud-8', 'Озеро', 25],
    ]);
  });

  it("an empty cloud falls back to the host's spare rows", () => {
    const spare = { ...surveyCloud, rows: survey.rows.slice(0, 4) };
    const s = toNext(openThree([cloud, spare]));
    expect(s.plays[1].survey).toEqual({ source: 'host', shown: 0 });
    expect(rowsOf(s)).toEqual(survey.rows.slice(0, 4));
  });

  it('an empty cloud without spare rows skips the survey', () => {
    const s = toNext(openThree([cloud, surveyCloud, single]));
    expect(ids(s)).toEqual(['q16', 'q1']);
    expect(skippedSurveys(s)).toEqual([surveyCloud]);
  });

  it('a cloud whose words are all hidden counts as empty', () => {
    let s = openThree([cloud, surveyCloud, single]);
    s = answerAll(s, { p1: words('Каштани'), p2: words('каштани'), p3: words('Лавра') });
    s = must(hideCloudWord(s, 'каштани', true));
    s = must(hideCloudWord(s, 'лавра', true));
    s = toNext(s);
    expect(ids(s)).toEqual(['q16', 'q1']);
  });

  it('a cloud never played (round ended early) skips the survey in the next round', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, cloud]), classicRound('r2', [surveyCloud, withId(single, 'q2')])], {
      leaderboard: 'end',
    });
    let s = startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, rng);
    s = must(endRound(s, 1000));
    expect(s.phase).toBe('round_end');
    s = must(next(s, 2000, rng));
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('question');
    expect(ids(s)).toEqual(['q1', 'q2']);
    expect(skippedSurveys(s)).toEqual([surveyCloud]);
  });

  it('skippedSurveys stays empty while the cloud is still current', () => {
    let s = must(lock(openThree([cloud, surveyCloud, single])));
    expect(skippedSurveys(s)).toEqual([]);
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('reveal');
    expect(skippedSurveys(s)).toEqual([]);
    s = must(next(s, 4000, rng));
    expect(ids(s)).toEqual(['q16', 'q1']);
    expect(skippedSurveys(s)).toEqual([surveyCloud]);
  });
});

describe('«100 to 1» survey reveal, row by row', () => {
  /** [survey, single], Анна відповіла; запитання закрито й розкрито (shown 0). */
  function toReveal(): GameState {
    let s = openClassic([survey, single]);
    s = must(submitAnswer(s, 'p1', answer('Яблуко'), 1000));
    s = must(next(must(lock(s)), 2000, rng));
    expect(s.phase).toBe('reveal');
    return s;
  }

  it('reveal opens rows one by one bottom-up, then next goes on', () => {
    let s = toReveal();
    expect(s.plays[0].survey).toEqual({ source: 'host', shown: 0 });
    for (let shown = 1; shown <= 5; shown += 1) {
      s = must(next(s, 3000, rng));
      expect(s.phase).toBe('reveal');
      expect(s.plays[0].survey?.shown).toBe(shown);
    }
    s = must(next(s, 4000, rng));
    expect(s.phase).toBe('question');
    expect(ids(s)).toEqual(['q17', 'q1']);
  });

  it('revealSurveyAll opens every row; wrong_phase outside a survey reveal', () => {
    expect(revealSurveyAll(openClassic([survey]))).toEqual({ ok: false, error: 'wrong_phase' });
    expect(revealSurveyAll(openClassic([single]))).toEqual({ ok: false, error: 'wrong_phase' });
    let s = must(revealSurveyAll(toReveal()));
    expect(s.plays[0].survey?.shown).toBe(5);
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('question');
    expect(ids(s)).toEqual(['q17', 'q1']);
  });

  it('surveyShown is everything after the reveal', () => {
    const open = openClassic([survey, single]);
    expect(surveyShown(open, open.plays[0])).toBe(0);
    let s = must(next(must(next(toReveal(), 3000, rng)), 3000, rng));
    expect(surveyShown(s, s.plays[0])).toBe(2);
    s = must(end(s));
    expect(surveyShown(s, s.plays[0])).toBe(5);
  });
});
