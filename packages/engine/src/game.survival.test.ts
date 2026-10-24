import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type RoundRules } from '@quiz/shared';
import {
  end,
  endRound,
  lock,
  next,
  override,
  recordOf,
  streakCounts,
  submitAnswer,
  withCurrentPlay,
  withTotals,
  type GameState,
  type SurvivalTrial,
} from './game';
import { awardSurvivalBonus, edgeNow, survivalAlive, survivalPlayOf, survivalVerdict } from './survival';
import { classicRound, makeRoundsQuiz, single, survivalQuestions, survivalRound, survivalTrials } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';

const rng = () => 0;
type RoundOptions = Parameters<typeof survivalRound>[3];
const quizWith = (options: RoundOptions = {}, leaderboard: 'each' | 'end' = 'each') =>
  makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials, options), classicRound('r2', [single])], { leaderboard });
const lobby = (options: RoundOptions = {}) => lobbyWith(quizWith(options), 'Оля', 'Петро', 'Віра');

/** Правильна (grade 'correct') і неправильна відповідь на кожне запитання s1…s5. */
const RIGHT: Answer[] = [
  { type: 'single', optionId: 'b' },
  { type: 'boolean', value: true },
  { type: 'numeric', value: 2061 },
  { type: 'text', value: 'Одеса' },
  { type: 'slider', value: 50 },
];
const WRONG: Answer[] = [
  { type: 'single', optionId: 'a' },
  { type: 'boolean', value: false },
  { type: 'numeric', value: 3000 },
  { type: 'text', value: 'Львів' },
  { type: 'slider', value: 90 },
];

const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
/** Номер поточного запитання раунду (0 — s1). */
const step = (s: GameState) => survivalQuestions.findIndex((q) => q.id === s.plays[s.questionIndex].question.id);

/** Відповіді на поточне запитання о now (right — правильно, wrong — неправильно), закриття й розкриття. */
function play(s: GameState, answers: Record<string, 'right' | 'wrong'>, now: number): GameState {
  let current = s;
  const i = step(s);
  for (const [id, kind] of Object.entries(answers)) current = must(submitAnswer(current, id, kind === 'right' ? RIGHT[i] : WRONG[i], now));
  if (current.phase === 'question') current = must(lock(current));
  return must(next(current, now + 500, rng));
}

/** Усі троє правильно (з at + 1000), «Далі» до наступного запитання. */
function pass(s: GameState, at: number): GameState {
  const revealed = play(s, { p1: 'right', p2: 'right', p3: 'right' }, at + 1000);
  return must(next(must(next(revealed, at + 2000, rng)), at + 3000, rng));
}

/** Вписує закрите випробування після поточного запитання: ids вибули (до задачі 3 — замість справжнього випробування). */
function knockOut(s: GameState, ...ids: string[]): GameState {
  const current = survivalPlayOf(s);
  if (current === null) throw new Error('no survival play');
  const trial: SurvivalTrial = {
    kind: 'question',
    fellBack: false,
    stage: 'closed',
    questionId: 't1',
    presented: [],
    answers: {},
    traps: {},
    doors: {},
    fallback: {},
    out: ids,
  };
  return withTotals(withCurrentPlay(s, { ...current, survival: { ...current.survival, trial } }));
}

/** s1: Оля правильно, Петро й Віра помилилися; «Далі» → сторінка; Петро й Віра вибули. */
function afterFirstOut(options: RoundOptions = {}): GameState {
  const revealed = play(startRound(lobby(options), 0, rng), { p1: 'right', p2: 'wrong', p3: 'wrong' }, 1000);
  return knockOut(must(next(revealed, 2000, rng)), 'p2', 'p3');
}

/** Віра (p3) вибула на s1 (Оля й Петро правильно); відкрито s2. */
function withGhost(options: RoundOptions = {}): GameState {
  const revealed = play(startRound(lobby(options), 0, rng), { p1: 'right', p2: 'right', p3: 'wrong' }, 1000);
  return must(next(knockOut(must(next(revealed, 2000, rng)), 'p3'), 3000, rng));
}

describe('survival: alive players and the edge', () => {
  it('everyone is alive at the start', () => {
    const s = startRound(lobby(), 0, rng);
    expect(s.phase).toBe('question');
    expect(survivalAlive(s)).toEqual(['p1', 'p2', 'p3']);
    expect(s.plays[0].survival).toEqual({ ghosts: {}, edge: null, trial: null, end: false });
  });

  it('alive players score like classic', () => {
    const rules: RoundRules = { penalty: 'minus', partial: null, multiplier: 2, streak: { length: 2, bonus: { kind: 'fixed', value: 50 } } };
    let s = startRound(lobby({ rules, speedBonus: true }), 0, rng);
    // s1 (100, 20 с): Оля за 5 с — 100 × 0,875 × 2; Петро помилився — −200
    s = must(submitAnswer(s, 'p1', RIGHT[0], 5000));
    s = must(lock(must(submitAnswer(s, 'p2', WRONG[0], 1000))));
    expect(recordOf(s, 0, 'p1')?.points).toBe(175);
    expect(recordOf(s, 0, 'p2')?.points).toBe(-200);
    expect(recordOf(s, 0, 'p3')).toBeUndefined();
    // s2 одразу: 200 і серія 2 — +50
    s = must(next(must(next(must(next(s, 6000, rng)), 7000, rng)), 10_000, rng));
    expect(s.plays[1].question.id).toBe('s2');
    s = must(lock(must(submitAnswer(s, 'p1', RIGHT[1], 10_000))));
    expect(recordOf(s, 1, 'p1')?.points).toBe(250);
    expect(score(s, 'p1')).toBe(425);
    expect(score(s, 'p2')).toBe(-200);
  });

  it('a mistake or silence puts a living player on the edge', () => {
    let s = startRound(lobby(), 0, rng);
    s = must(submitAnswer(s, 'p1', RIGHT[0], 1000));
    s = must(submitAnswer(s, 'p2', WRONG[0], 1000));
    s = must(lock(s));
    // до розкриття вердикту немає
    expect(survivalVerdict(s)).toBeNull();
    s = must(next(s, 2000, rng));
    expect(s.phase).toBe('reveal');
    expect(edgeNow(s)).toEqual(['p2', 'p3']);
    expect(survivalVerdict(s)).toBe('trial');
  });

  it('a host override on the reveal changes the edge', () => {
    let s = startRound(lobby(), 0, rng);
    for (let i = 0; i < 3; i += 1) s = pass(s, i * 10_000);
    expect(s.plays[s.questionIndex].question.id).toBe('s4');
    s = must(submitAnswer(s, 'p1', RIGHT[3], 40_000));
    s = must(submitAnswer(s, 'p2', { type: 'text', value: 'Одесса' }, 40_000));
    s = must(next(must(submitAnswer(s, 'p3', RIGHT[3], 40_000)), 41_000, rng));
    expect(edgeNow(s)).toEqual(['p2']);
    s = must(override(s, 'p2', 'correct'));
    expect(edgeNow(s)).toEqual([]);
    expect(survivalVerdict(s)).toBe('all_right');
    // перелік фіксується на «Далі»
    s = must(next(s, 42_000, rng));
    expect(s.plays[s.questionIndex].survival?.edge).toEqual([]);
  });

  it('partial counts as a mistake', () => {
    let s = startRound(lobby({ rules: { ...DEFAULT_RULES, partial: 50 } }), 0, rng);
    for (let i = 0; i < 2; i += 1) s = pass(s, i * 10_000);
    expect(s.plays[s.questionIndex].question.id).toBe('s3');
    s = must(submitAnswer(s, 'p1', { type: 'numeric', value: 2100 }, 30_000));
    expect(recordOf(s, s.questionIndex, 'p1')?.grade).toBe('partial');
    s = must(submitAnswer(s, 'p2', RIGHT[2], 30_000));
    s = must(next(must(submitAnswer(s, 'p3', RIGHT[2], 30_000)), 31_000, rng));
    expect(edgeNow(s)).toEqual(['p1']);
    expect(survivalVerdict(s)).toBe('trial');
  });

  it('when everyone alive erred nobody is out', () => {
    let s = play(startRound(lobby(), 0, rng), { p1: 'wrong', p2: 'wrong', p3: 'wrong' }, 1000);
    s = must(next(s, 2000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(s.plays[0].survival?.edge).toEqual(['p1', 'p2', 'p3']);
    expect(s.plays[0].survival?.trial).toBeNull();
    expect(survivalVerdict(s)).toBe('all_wrong');
    expect(s.endsAt).toBeNull();
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('question');
    expect(s.plays[1].question.id).toBe('s2');
    expect(survivalAlive(s)).toEqual(['p1', 'p2', 'p3']);
  });

  it('when everyone was right there is no trial', () => {
    const s = must(next(play(startRound(lobby(), 0, rng), { p1: 'right', p2: 'right', p3: 'right' }, 1000), 2000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(survivalVerdict(s)).toBe('all_right');
    expect(s.plays[0].survival?.edge).toEqual([]);
    expect(s.plays[0].survival?.trial).toBeNull();
  });

  it('the leaderboard setting does not matter', () => {
    const quiz = quizWith({}, 'end');
    const s = must(next(play(startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 0, rng), { p1: 'right', p2: 'wrong' }, 1000), 2000, rng));
    expect(s.phase).toBe('leaderboard');
  });
});

describe('survival: ghosts', () => {
  it('a ghost answers for herself without points', () => {
    const s = withGhost();
    expect(s.plays[1].question.id).toBe('s2');
    expect(survivalAlive(s)).toEqual(['p1', 'p2']);
    expect(submitAnswer(s, 'p3', { type: 'single', optionId: 'b' }, 3500)).toEqual({ ok: false, error: 'type_mismatch' });
    const answered = must(submitAnswer(s, 'p3', RIGHT[1], 4000));
    expect(Object.keys(answered.plays[1].answers)).toEqual([]);
    expect(answered.plays[1].survival?.ghosts.p3).toEqual({ answer: RIGHT[1], correct: true, timeMs: 1000 });
    expect(score(answered, 'p3')).toBe(score(s, 'p3'));
    expect(submitAnswer(answered, 'p3', RIGHT[1], 4500)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('ghosts do not hold the question', () => {
    let s = withGhost();
    s = must(submitAnswer(s, 'p1', RIGHT[1], 4000));
    s = must(submitAnswer(s, 'p2', RIGHT[1], 4000));
    expect(s.phase).toBe('locked');
  });

  it('a ghost answer keeps streaks and accuracy untouched', () => {
    const rules: RoundRules = { ...DEFAULT_RULES, streak: { length: 2, bonus: { kind: 'fixed', value: 50 } } };
    let s = withGhost({ rules });
    s = play(must(submitAnswer(s, 'p3', RIGHT[1], 4000)), { p1: 'right', p2: 'right' }, 4000);
    s = must(next(must(next(s, 5000, rng)), 6000, rng));
    s = play(must(submitAnswer(s, 'p3', RIGHT[2], 7000)), { p1: 'right', p2: 'right' }, 7000);
    expect(streakCounts(s, 3).p3).toBe(0);
    expect(streakCounts(s, 3).p1).toBe(3);
    expect(recordOf(s, 1, 'p3')).toBeUndefined();
    expect(recordOf(s, 2, 'p3')).toBeUndefined();
    expect(score(s, 'p3')).toBe(0);
  });
});

describe('survival: the end and the bonus', () => {
  it('the round ends when alive ≤ survivors after someone is out', () => {
    const s = must(next(afterFirstOut(), 3000, rng));
    expect(s.phase).toBe('round_end');
    expect(s.plays).toHaveLength(1);
    expect(s.plays[0].survival?.end).toBe(true);
    const bonuses = s.adjustments.filter((a) => a.source === 'survival');
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0]).toMatchObject({ source: 'survival', points: 500, playerId: 'p1', roundIndex: 0 });
    expect(score(s, 'p1')).toBe(600);
  });

  it('few players play every question', () => {
    let s = startRound(lobbyWith(quizWith(), 'Оля'), 0, rng);
    for (let i = 0; i < 5; i += 1) {
      s = must(next(play(s, { p1: i % 2 === 0 ? 'right' : 'wrong' }, 1000 + i * 10_000), 2000 + i * 10_000, rng));
      expect(s.phase).toBe('leaderboard');
      s = must(next(s, 3000 + i * 10_000, rng));
    }
    expect(s.phase).toBe('round_end');
    expect(s.plays).toHaveLength(5);
    expect(s.adjustments.filter((a) => a.source === 'survival').map((a) => a.playerId)).toEqual(['p1']);
  });

  it('running out of questions ends the round with the bonus for everyone alive', () => {
    let s = startRound(lobby(), 0, rng);
    for (let i = 0; i < 5; i += 1) {
      s = must(next(play(s, { p1: 'right', p2: 'right', p3: 'right' }, 1000 + i * 10_000), 2000 + i * 10_000, rng));
      s = must(next(s, 3000 + i * 10_000, rng));
    }
    expect(s.phase).toBe('round_end');
    expect(s.plays[4].survival?.end).toBe(true);
    expect(s.adjustments.filter((a) => a.source === 'survival').map((a) => [a.playerId, a.points])).toEqual([
      ['p1', 500],
      ['p2', 500],
      ['p3', 500],
    ]);
    expect(score(s, 'p2')).toBe(1000);
  });

  it('the bonus is given once', () => {
    const s = must(next(afterFirstOut(), 3000, rng));
    const again = awardSurvivalBonus(s, 4000);
    expect(again.adjustments).toEqual(s.adjustments);
    expect(score(again, 'p1')).toBe(600);
    expect(endRound(s, 4000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('bonus 0 adds nothing', () => {
    const s = must(next(afterFirstOut({ bonus: 0 }), 3000, rng));
    expect(s.phase).toBe('round_end');
    expect(s.adjustments.filter((a) => a.source === 'survival')).toEqual([]);
    expect(s.plays[0].survival?.end).toBe(true);
  });

  it('ending the round mid-question is like classic', () => {
    let s = must(next(play(startRound(lobby(), 0, rng), { p1: 'right', p2: 'right', p3: 'wrong' }, 1000), 2000, rng));
    s = must(next(s, 3000, rng));
    s = must(submitAnswer(s, 'p1', RIGHT[1], 4000));
    const ended = must(endRound(s, 5000));
    expect(ended.phase).toBe('round_end');
    expect(recordOf(ended, 1, 'p1')?.grade).toBe('correct');
    expect(ended.plays[1].survival).toMatchObject({ edge: null, trial: null, end: true });
    // ніхто не вибув: бонус усім трьом
    expect(ended.adjustments.filter((a) => a.source === 'survival').map((a) => a.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(score(ended, 'p1')).toBe(700);
  });

  it('ending the game pays the bonus too', () => {
    const s = withGhost();
    const ended = must(end(s, 5000));
    expect(ended.phase).toBe('finished');
    expect(ended.adjustments.filter((a) => a.source === 'survival').map((a) => a.playerId)).toEqual(['p1', 'p2']);
    expect(ended.plays[1].survival?.end).toBe(true);
    expect(score(ended, 'p1')).toBe(600);
  });

  it('a survival question opens with the «Запитання N» splash', () => {
    const s = startRound(lobbyWithSplash(quizWith(), 'Оля', 'Петро'), 0, rng);
    expect(s.phase).toBe('question');
    expect(s.splash?.kind).toBe('question');
  });

  it('the classic round after it plays as before', () => {
    let s = must(next(must(next(afterFirstOut(), 3000, rng)), 4000, rng));
    expect(s.phase).toBe('intro');
    expect(s.roundIndex).toBe(1);
    expect(survivalAlive(s)).toEqual([]);
    s = must(next(s, 5000, rng));
    expect(s.phase).toBe('question');
    expect(s.plays[1].survival).toBeUndefined();
    s = must(lock(must(submitAnswer(s, 'p2', { type: 'single', optionId: 'b' }, 5000))));
    expect(score(s, 'p2')).toBe(1000);
    expect(score(s, 'p1')).toBe(600);
  });
});
