import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type Question } from '@quiz/shared';
import { pickCell } from './board';
import { acceptAnswer, lock, next, submitAnswer, type GameState, type Rng } from './game';
import { revealSurveyAll } from './survey';
import { hostView, playerView, stageView } from './views';
import { boardRound, cloud, makeQuiz, makeRoundsQuiz, single, survey, surveyCloud, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng: Rng = () => 0;

/** Класика; Анна p1, Богдан p2; перше запитання відкрито о 0. */
function openClassic(questions: Question[] = [survey]): GameState {
  const quiz = makeQuiz(questions, { leaderboard: 'end', rules: { ...DEFAULT_RULES } });
  return startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, rng);
}

const answer = (...values: string[]) => ({ type: 'survey' as const, values });
const words = (...list: string[]): Answer => ({ type: 'wordcloud', words: list });
/** Збіги відповіді «100 до 1» (rows з id рядків чи null) — не ті порожні/закриті рядки табло. */
const HITS = /"rows":\[("|null)/;
const LEAK = ['Полуниця', 'Кавун', 'Груша', 'Банан', 'яблучко'];

/** Анна відповіла «Яблуко», «ананас»; етап reveal, жодного рядка ще не відкрито. */
function atReveal(): GameState {
  let s = must(submitAnswer(openClassic(), 'p1', answer('Яблуко', 'ананас'), 1000));
  s = must(lock(s));
  return must(next(s, 2000, rng));
}

/** Поле: клітинка-survey (q17), p1 вибрав її о 0. */
function onSurveyCell(check: 'auto' | 'manual' = 'auto'): GameState {
  const round = boardRound(
    'g1',
    [
      { title: 'Опитування', cells: [{ mark: 'x2', answerMode: 'phone', question: survey }] },
      { title: 'Інше', cells: [withId(single, 's1')] },
    ],
    { check },
  );
  const s = startRound(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'), 0, rng);
  return must(pickCell(s, 'p1', 'q17', 0, rng));
}

/** Закрити поточне запитання й дійти до запитання з індексом index. */
function toQuestion(state: GameState, index: number): GameState {
  let s = state.phase === 'question' ? must(lock(state)) : state;
  while (!(s.phase === 'question' && s.questionIndex === index)) s = must(next(s, 5000, rng));
  return s;
}

describe('survey views', () => {
  it('survey rows never reach phones or the stage before the reveal', () => {
    let s = openClassic([survey]);
    s = must(submitAnswer(s, 'p1', answer('Яблуко', 'ананас'), 1000));
    for (const t of [s, must(lock(s))]) {
      for (const view of [playerView(t, 'p1')!, playerView(t, 'p2')!, stageView(t)]) {
        const json = JSON.stringify(view);
        for (const text of LEAK) expect(json).not.toContain(text);
        expect(json).not.toMatch(/"popularity":\d|"sa"|"sb"/);
      }
    }
    expect(playerView(s, 'p1')!.question?.survey).toEqual({ answers: 3, rows: 5 });
    expect(playerView(s, 'p1')!.me.answer).toEqual({ type: 'survey', values: ['Яблуко', 'ананас'] });
    expect(playerView(s, 'p1')!.me.survey).toBeNull();
    expect(stageView(s).survey?.rows.map((r) => [r.rank, r.open, r.text])).toEqual([
      [1, false, null],
      [2, false, null],
      [3, false, null],
      [4, false, null],
      [5, false, null],
    ]);
    expect(hostView(s).survey?.rows[0]).toMatchObject({ rank: 1, text: 'Яблуко', popularity: 32, by: ['Анна'] });
    expect(hostView(s).survey).toMatchObject({ source: 'host', total: 5, shown: 0 });
  });

  it('the stage gets only the opened rows, bottom-up', () => {
    let s = atReveal();
    expect(stageView(s).survey?.shown).toBe(0);
    s = must(next(s, 3000, rng));
    s = must(next(s, 3000, rng));
    const stage = stageView(s);
    expect(stage.survey?.shown).toBe(2);
    expect(stage.survey?.rows.map((r) => [r.rank, r.open, r.text, r.by])).toEqual([
      [1, false, null, null],
      [2, false, null, null],
      [3, false, null, null],
      [4, true, 'Кавун', []],
      [5, true, 'Груша', []],
    ]);
    for (const view of [stage, playerView(s, 'p2')!]) {
      const json = JSON.stringify(view);
      for (const text of ['Яблуко', 'Банан', 'Полуниця']) expect(json).not.toContain(text);
      expect(view.reveal?.type === 'survey' ? view.reveal.rows : null).toEqual([]);
    }
    s = must(revealSurveyAll(s));
    const all = stageView(s).survey!;
    expect(all.rows.every((r) => r.open)).toBe(true);
    expect(all.rows[0]).toEqual({ rank: 1, open: true, text: 'Яблуко', popularity: 32, by: ['Анна'] });
  });

  it('the phone sees its own lines only once their rows are opened', () => {
    let s = must(submitAnswer(openClassic(), 'p1', answer('Яблуко', 'ананас'), 1000));
    s = must(lock(s));
    expect(playerView(s, 'p1')!.me.survey).toBeNull();
    s = must(next(s, 2000, rng));
    const phone = playerView(s, 'p1')!;
    // Рядок «Яблуко» (місце 1) ще закритий на табло: телефон не випереджає ведучого; «мимо» нічого не розкриває.
    expect(phone.me.survey).toEqual({
      lines: [
        { value: 'Яблуко', rank: null, text: null, popularity: null, pending: true },
        { value: 'ананас', rank: null, text: null, popularity: null, pending: true },
      ],
    });
    expect(JSON.stringify(phone.me.survey)).not.toContain('32');
    // Бали й рахунок не випереджають табло.
    expect(phone.me.result).toBeNull();
    expect(phone.me.score).toBe(0);
    // Власна відповідь без збігів: рядки, що влучили, видно лише з відкриттям усієї дошки.
    expect(phone.me.answer).toEqual({ type: 'survey', values: ['Яблуко', 'ананас'] });
    expect(JSON.stringify(phone)).not.toMatch(HITS);
    expect(stageView(s).stats?.accepted).toBeNull();
    expect(playerView(s, 'p2')!.me.survey).toBeNull();
    expect(playerView(s, 'p1')!.table?.rows.every((r) => r.score === 0)).toBe(true);
    expect(stageView(s).players.every((p) => p.streak === 0)).toBe(true);
    s = must(revealSurveyAll(s));
    expect(playerView(s, 'p1')!.me.result?.points).toBe(320);
    expect(playerView(s, 'p1')!.me.answer).toMatchObject({ rows: ['sa', null] });
    expect(stageView(s).stats?.accepted).toEqual(expect.any(Number));
    expect(playerView(s, 'p1')!.me.score).toBe(320);
    expect(playerView(s, 'p1')!.me.survey).toEqual({
      lines: [
        { value: 'Яблуко', rank: 1, text: 'Яблуко', popularity: 32, pending: false },
        { value: 'ананас', rank: null, text: null, popularity: null, pending: false },
      ],
    });
  });

  it('everything is open after the reveal', () => {
    const quiz = makeQuiz([survey, withId(survey, 'q19')], { leaderboard: 'each', rules: { ...DEFAULT_RULES } });
    let s = must(submitAnswer(startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, rng), 'p1', answer('Яблуко', 'ананас'), 1000));
    s = must(next(must(lock(s)), 2000, rng));
    s = must(revealSurveyAll(s));
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(stageView(s).survey?.rows.every((r) => r.open)).toBe(true);
    expect(stageView(s).survey?.shown).toBe(5);
  });

  it('a cloud board shows source cloud and the built rows to the host only', () => {
    let s = startRound(lobbyWith(makeQuiz([cloud, surveyCloud], { leaderboard: 'end', rules: { ...DEFAULT_RULES } }), 'Анна', 'Богдан'), 0, rng);
    s = must(submitAnswer(s, 'p1', words('Каштани', 'Дніпро'), 1000));
    s = must(submitAnswer(s, 'p2', words('каштани'), 1000));
    s = toQuestion(s, 1);
    s = must(submitAnswer(s, 'p1', answer('каштани'), (s.startedAt ?? 0) + 1000));
    const host = hostView(s);
    expect(host.survey).toMatchObject({ source: 'cloud', total: 2 });
    expect(host.correct?.type === 'survey' ? host.correct.rows.map((r) => r.text) : null).toEqual(['Каштани', 'Дніпро']);
    for (const view of [stageView(s), playerView(s, 'p2')!]) expect(JSON.stringify(view)).not.toContain('Дніпро');
    s = must(next(must(lock(s)), 9000, rng));
    expect(s.phase).toBe('reveal');
    const stage = stageView(s);
    expect(stage.reveal?.type === 'survey' ? stage.reveal.rows : null).toEqual([]);
    expect(JSON.stringify(stage)).not.toContain('Дніпро');
    expect(stage.survey).toMatchObject({ source: 'cloud', shown: 0 });
  });

  it('the waiting board answer carries no hits to the stage or the chooser', () => {
    const s = must(submitAnswer(onSurveyCell('manual'), 'p1', answer('Яблуко', 'ананас'), 1000));
    for (const view of [stageView(s), playerView(s, 'p1')!, playerView(s, 'p2')!]) {
      const json = JSON.stringify(view);
      expect(json).not.toMatch(HITS);
      for (const text of LEAK) expect(json).not.toContain(text);
    }
    expect(playerView(s, 'p1')!.me.answer).toEqual({ type: 'survey', values: ['Яблуко', 'ананас'] });
    expect(stageView(s).spotlight?.answer).toEqual({ type: 'survey', values: ['Яблуко', 'ананас'] });
    expect(hostView(s).spotlight?.answer).toMatchObject({ rows: ['sa', null] });
    const accepted = must(acceptAnswer(s, 'p1', 2000));
    expect(accepted.phase).toBe('reveal');
    for (const view of [stageView(accepted), playerView(accepted, 'p2')!]) {
      const json = JSON.stringify(view);
      expect(json).not.toMatch(HITS);
      expect(json).not.toContain('Полуниця');
    }
  });

  it('the board verdict reaches the stage and phones only once the whole board is open', () => {
    const s = must(submitAnswer(onSurveyCell('manual'), 'p1', answer('Яблуко', 'ананас'), 1000));
    let accepted = must(acceptAnswer(s, 'p1', 2000));
    expect(accepted.phase).toBe('reveal');
    for (const view of [stageView(accepted), playerView(accepted, 'p1')!, playerView(accepted, 'p2')!]) {
      expect(view.spotlight?.playerId).toBe('p1');
      expect(view.spotlight?.grade).toBeNull();
    }
    expect(hostView(accepted).spotlight?.grade).not.toBeNull();
    accepted = must(next(accepted, 3000, rng));
    expect(stageView(accepted).spotlight?.grade).toBeNull();
    accepted = must(revealSurveyAll(accepted));
    expect(stageView(accepted).spotlight?.grade).toBe('partial');
    expect(playerView(accepted, 'p2')!.spotlight?.grade).toBe('partial');
  });

  it('the host sees skipped surveys and the round total excludes them', () => {
    let s = startRound(
      lobbyWith(makeQuiz([cloud, surveyCloud, withId(single, 'q1')], { leaderboard: 'end', rules: { ...DEFAULT_RULES } }), 'Анна', 'Богдан'),
      0,
      rng,
    );
    expect(hostView(s).total).toBe(3);
    s = toQuestion(s, 1);
    expect(s.plays[1].question.id).toBe('q1');
    const host = hostView(s);
    expect(host.surveySkipped).toEqual(['Що ви назвали про Київ?']);
    expect(host.total).toBe(2);
    expect(stageView(s).total).toBe(2);
  });

  it('other types carry no survey data', () => {
    const s = openClassic([single]);
    expect(stageView(s).survey).toBeNull();
    expect(playerView(s, 'p1')!.question?.survey).toBeNull();
    expect(playerView(s, 'p1')!.me.survey).toBeNull();
    expect(hostView(s).surveySkipped).toEqual([]);
  });
});
