import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEFAULT_RULES, type Answer, type Question, type RoundRules } from '@quiz/shared';
import { adjustScore } from './adjust';
import { buffBlock } from './buffs';
import { buyDebuff } from './debuffs';
import { lock, next, override, recordOf, start, submitAnswer, tick, type GameState, type Rng } from './game';
import { cloudTally, cloudVoters, hideCloudWord } from './votes';
import { cloud, makeQuiz, poll, single, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng: Rng = () => 0;
const STREAK: Partial<RoundRules> = { streak: { length: 2, bonus: { kind: 'fixed', value: 100 } } };

/** Класика з серією 2 (+100), бонус швидкості увімкнено; Анна p1, Богдан p2, Віра p3; перше запитання відкрито о 0. */
function openClassic(questions: Question[], rules: Partial<RoundRules> = STREAK): GameState {
  const quiz = makeQuiz(questions, { leaderboard: 'end', speedBonus: true, rules: { ...DEFAULT_RULES, ...rules } });
  return startRound(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра'), 0, rng);
}

/** Відповіді кількох гравців о 2000. */
function answerAll(state: GameState, answers: Record<string, Answer>, now = 2000): GameState {
  return Object.entries(answers).reduce((s, [id, answer]) => must(submitAnswer(s, id, answer, now)), state);
}

/** Закрити поточне запитання й відкрити наступне о now. */
function toNext(state: GameState, now: number): GameState {
  let s = state.phase === 'question' ? must(lock(state)) : state;
  const from = s.questionIndex;
  while (!(s.phase === 'question' && s.questionIndex !== from)) s = must(next(s, now, rng));
  return s;
}

const recordAt = (s: GameState, index: number, id: string) => recordOf(s, index, id);
const scores = (s: GameState) => s.players.map((p) => p.score);
const streakOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.streak;
const timeOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.totalTimeMs;
const words = (...list: string[]): Answer => ({ type: 'wordcloud', words: list });
const playOf = (s: GameState) => s.plays[s.questionIndex];

describe('polls and word clouds (no points)', () => {
  it('a vote is recorded with zero points and changes no score', () => {
    let s = openClassic([poll]);
    s = must(submitAnswer(s, 'p1', { type: 'poll', optionId: 'b' }, 1000));
    expect(recordAt(s, 0, 'p1')).toMatchObject({
      points: 0,
      basePoints: 0,
      streakBonus: 0,
      accuracy: 0,
      grade: 'wrong',
      accepted: false,
      timeMs: 1000,
      answer: { type: 'poll', optionId: 'b' },
    });
    s = answerAll(s, { p2: { type: 'poll', optionId: 'a' }, p3: { type: 'poll', optionId: 'b' } });
    expect(s.phase).toBe('locked');
    expect(scores(s)).toEqual([0, 0, 0]);
  });

  it('a poll between two correct answers keeps the streak and its bonus', () => {
    let s = openClassic([single, poll, withId(single, 's2')]);
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, 1000));
    s = toNext(s, 3000);
    s = must(submitAnswer(s, 'p1', { type: 'poll', optionId: 'a' }, 4000));
    s = toNext(s, 6000);
    expect(streakOf(s, 'p1')).toBe(1);
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, 7000));
    s = must(lock(s));
    expect(streakOf(s, 'p1')).toBe(2);
    expect(recordAt(s, 2, 'p1')?.streakBonus).toBe(100);
    expect(recordAt(s, 1, 'p1')).toMatchObject({ streakBonus: 0, points: 0 });
  });

  it('missing a poll does not break the streak either', () => {
    let s = openClassic([single, poll, withId(single, 's2')]);
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, 1000));
    s = toNext(s, 3000);
    s = toNext(s, 6000);
    expect(recordAt(s, 1, 'p1')).toBeUndefined();
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, 7000));
    s = must(lock(s));
    expect(streakOf(s, 'p1')).toBe(2);
    expect(recordAt(s, 2, 'p1')?.streakBonus).toBe(100);
  });

  it('polls add nothing to the total time', () => {
    const play = (questions: Question[]) => {
      let s = openClassic(questions, {});
      s = answerAll(s, { p1: { type: 'single', optionId: 'b' }, p2: { type: 'single', optionId: 'b' }, p3: { type: 'single', optionId: 'a' } }, 1000);
      if (questions.length > 1) {
        s = toNext(s, 3000);
        s = must(submitAnswer(s, 'p1', { type: 'poll', optionId: 'a' }, 4000));
        s = must(submitAnswer(s, 'p2', { type: 'poll', optionId: 'a' }, 18_000));
        s = must(lock(s));
      }
      return s;
    };
    const plain = play([single]);
    const voted = play([single, poll]);
    expect(timeOf(voted, 'p1')).toBe(timeOf(voted, 'p2'));
    expect(timeOf(voted, 'p1')).toBe(timeOf(plain, 'p1'));
    expect(timeOf(voted, 'p3')).toBe(timeOf(plain, 'p3'));
    expect(scores(voted)).toEqual(scores(plain));
  });

  it('one vote only; unknown option — not_found; a text answer to a poll — type_mismatch; time over — time_over', () => {
    const s = openClassic([poll]);
    const voted = must(submitAnswer(s, 'p1', { type: 'poll', optionId: 'a' }, 1000));
    expect(submitAnswer(voted, 'p1', { type: 'poll', optionId: 'b' }, 1500)).toEqual({ ok: false, error: 'already_answered' });
    expect(submitAnswer(s, 'p1', { type: 'poll', optionId: 'z' }, 1000)).toEqual({ ok: false, error: 'not_found' });
    expect(submitAnswer(s, 'p1', { type: 'text', value: 'Весна' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', words('Весна'), 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', { type: 'poll', optionId: 'a' }, 20_001)).toEqual({ ok: false, error: 'time_over' });
    expect(submitAnswer(s, 'p1', { type: 'poll', optionId: 'a' }, 20_000).ok).toBe(true);
    expect(submitAnswer(openClassic([single]), 'p1', { type: 'poll', optionId: 'a' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('cloud words are cleaned: trimmed, deduped by key, capped', () => {
    const s = openClassic([cloud]);
    const three = must(submitAnswer(s, 'p1', words('  Каштани ', 'КАШТАНИ', 'Дніпро', 'Лавра'), 1000));
    expect(recordAt(three, 0, 'p1')).toMatchObject({ points: 0, answer: { type: 'wordcloud', words: ['Каштани', 'Дніпро', 'Лавра'] } });
    const one = openClassic([{ ...cloud, words: 1 }]);
    const capped = must(submitAnswer(one, 'p1', words('  Каштани ', 'КАШТАНИ', 'Дніпро', 'Лавра'), 1000));
    expect(recordAt(capped, 0, 'p1')?.answer).toEqual({ type: 'wordcloud', words: ['Каштани'] });
    expect(submitAnswer(s, 'p1', words(), 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', words('   '), 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', { type: 'poll', optionId: 'a' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('cloudTally counts players, picks the most common spelling, sorts by count', () => {
    let s = openClassic([cloud]);
    s = answerAll(s, { p1: words('каштани', 'Дніпро'), p2: words('каштани', 'Лавра'), p3: words('КАШТАНИ', 'Лавра') });
    const tally = cloudTally(s.plays[0], s.players);
    expect(tally).toEqual([
      { key: 'каштани', text: 'каштани', count: 3, playerIds: ['p1', 'p2', 'p3'], hidden: false },
      { key: 'лавра', text: 'Лавра', count: 2, playerIds: ['p2', 'p3'], hidden: false },
      { key: 'дніпро', text: 'Дніпро', count: 1, playerIds: ['p1'], hidden: false },
    ]);
    expect(cloudVoters(s.plays[0])).toBe(3);

    let tie = openClassic([cloud]);
    tie = answerAll(tie, { p2: words('каштани'), p1: words('Каштани') });
    expect(cloudTally(playOf(tie), tie.players)[0]).toMatchObject({ key: 'каштани', text: 'Каштани', count: 2, playerIds: ['p1', 'p2'] });
    expect(cloudVoters(playOf(tie))).toBe(2);
    expect(cloudTally(openClassic([poll]).plays[0], tie.players)).toEqual([]);
  });

  it('cloudTally breaks equal counts by text (uk)', () => {
    let s = openClassic([cloud]);
    s = answerAll(s, { p1: words('Лавра', 'Дніпро'), p2: words('Арсенал') });
    expect(cloudTally(playOf(s), s.players).map((e) => e.text)).toEqual(['Арсенал', 'Дніпро', 'Лавра']);
  });

  it('hideCloudWord hides and restores a word; unknown key — not_found; works on question, locked and reveal; not on a poll', () => {
    let s = openClassic([cloud]);
    s = answerAll(s, { p1: words('каштани', 'Дніпро'), p2: words('Каштани') });
    expect(s.phase).toBe('question');
    s = must(hideCloudWord(s, 'каштани', true));
    expect(playOf(s).cloudHidden).toEqual(['каштани']);
    expect(cloudTally(playOf(s), s.players)[0]).toMatchObject({ key: 'каштани', hidden: true });
    // повторне ховання не дублює ключ
    expect(must(hideCloudWord(s, 'каштани', true)).plays[0].cloudHidden).toEqual(['каштани']);
    s = must(hideCloudWord(s, 'каштани', false));
    expect(playOf(s).cloudHidden).toEqual([]);
    expect(cloudTally(playOf(s), s.players)[0].hidden).toBe(false);
    expect(hideCloudWord(s, 'лавра', true)).toEqual({ ok: false, error: 'not_found' });

    s = must(lock(s));
    s = must(hideCloudWord(s, 'дніпро', true));
    s = must(next(s, 5000, rng));
    expect(s.phase).toBe('reveal');
    s = must(hideCloudWord(s, 'каштани', true));
    expect(playOf(s).cloudHidden).toEqual(['дніпро', 'каштани']);

    const polled = openClassic([poll]);
    expect(hideCloudWord(polled, 'весна', true)).toEqual({ ok: false, error: 'wrong_phase' });
    const lobby = lobbyWith(makeQuiz([cloud]), 'Анна');
    expect(hideCloudWord(lobby, 'каштани', true)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('no buff fits a poll or a cloud', () => {
    for (const question of [poll, cloud]) {
      const s = openClassic([question]);
      for (const kind of BUFF_KINDS) expect(buffBlock(s, 'p1', kind, 1000)).toBe('off_vote');
    }
  });

  it('a waiting debuff does not fire on a poll and fires on the next scored question', () => {
    const quiz = makeQuiz([poll, single], { leaderboard: 'end' });
    let s = must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра')));
    s = must(adjustScore(s, 'p1', 500, 0));
    s = must(buyDebuff(s, 'p1', 'p2', 'fog', 0));
    s = must(next(s, 1000, rng));
    expect(playOf(s).question.type).toBe('poll');
    expect(s.debuffs.p2).toMatchObject({ kind: 'fog', firedAt: null, since: null });
    s = toNext(tick(s, 2000), 30_000);
    expect(playOf(s).question.type).toBe('single');
    expect(s.debuffs.p2).toMatchObject({ kind: 'fog', firedAt: s.questionIndex, since: 30_000 });
  });

  it('override refuses polls and clouds', () => {
    for (const [question, answer] of [
      [poll, { type: 'poll', optionId: 'a' }],
      [cloud, words('Каштани')],
    ] as const) {
      let s = openClassic([question]);
      s = must(submitAnswer(s, 'p1', answer, 1000));
      s = must(next(must(lock(s)), 2000, rng));
      expect(s.phase).toBe('reveal');
      expect(override(s, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    }
  });
});
