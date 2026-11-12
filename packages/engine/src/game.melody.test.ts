import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type RoundRules } from '@quiz/shared';
import { buffBlock, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { lock, next, override, pause, recordOf, removePlayer, roundQuestionNumber, submitAnswer, type GameState } from './game';
import { melodyHeard, melodyOpen, melodyPaid, melodyStartEnd } from './melody';
import { actorOf } from './team-act';
import { FIRST_BUFFS } from './testing/buffs';
import { classicRound, makeRoundsQuiz, melody, melodyQuiz, single, text } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

/** p1 Оля, p2 Тарас, p3 Петро. */
const PLAYERS = ['Оля', 'Тарас', 'Петро'];
/** «Соняшники» t1 (Оля m1, Тарас m2), «Маки» t2 (Петро m3, Ганна m4). */
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const rng0 = () => 0;

/** Пройти перший раунд і відкрити запитання id другого: номер у раунді 0, індекс у plays 1. */
function toQuestion(s0: GameState, id = 'ml1'): GameState {
  let s = s0;
  if (s.phase === 'question' && s.plays[s.questionIndex].question.id !== id) s = must(lock(s, 1000));
  for (let i = 0; i < 20 && !(s.phase === 'question' && s.plays[s.questionIndex].question.id === id); i++) s = must(s.phase === 'question' ? lock(s, 2000) : next(s, 2000, rng0));
  return s;
}
const toMelody = (s: GameState) => toQuestion(s, 'ml1');

/** Вікторина: класика з одним single → класика з melody (і text) за правилами rules. */
const quizWith = (rules: Partial<RoundRules> = {}, speedBonus = true) =>
  makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [melody, text], { rules: { ...DEFAULT_RULES, ...rules }, speedBonus })]);

const fresh = (settings: Parameters<typeof melodyQuiz>[0] = {}) => toMelody(startRound(lobbyWith(melodyQuiz(settings), ...PLAYERS), 0));
const freshWith = (rules: Partial<RoundRules> = {}, speedBonus = true) => toMelody(startRound(lobbyWith(quizWith(rules, speedBonus), ...PLAYERS), 0));
const T = (s: GameState) => s.startedAt!;
const open = (s: GameState, who: string, step: number, t: number, member = who, questionIndex = 0) => melodyOpen(s, who, member, questionIndex, step, t);
/** Відкрити шматки 1…n одним гравцем. */
function upTo(s: GameState, who: string, n: number, t = T(s) + 500, member = who): GameState {
  let cur = s;
  for (let k = 1; k <= n; k++) cur = must(open(cur, who, k, t, member));
  return cur;
}
const say = (s: GameState, who: string, value: string, t: number) => submitAnswer(s, who, { type: 'melody', value }, t);
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);
const toReveal = (s: GameState, t: number) => {
  const r = must(next(must(lock(s, t)), t, rng0));
  expect(r.phase).toBe('reveal');
  return r;
};

describe('melody: the engine', () => {
  it('opens chunks one by one by the round-local number', () => {
    const s = fresh();
    expect(s.questionIndex).toBe(1);
    expect(roundQuestionNumber(s)).toBe(0);
    expect(s.plays[1].melody).toEqual({ heard: {} });
    expect(s.plays[0].melody).toBeUndefined();
    const t = T(s) + 1000;
    const one = must(open(s, 'p1', 1, t));
    expect(one.plays[1].melody?.heard.p1).toBe(1);
    expect(melodyHeard(one.plays[1], 'p1')).toBe(1);
    expect(melodyHeard(one.plays[1], 'p2')).toBe(0);
    // номер у раунді (0), не індекс у plays (1)
    expect(open(s, 'p1', 1, t, 'p1', 1)).toEqual({ ok: false, error: 'melody_stale' });
    expect(open(one, 'p1', 3, t)).toEqual({ ok: false, error: 'melody_step' });
    const two = must(open(one, 'p1', 2, t));
    expect(two.plays[1].melody?.heard.p1).toBe(2);
    // повтор відкритого — той самий стан
    const again = open(two, 'p1', 1, t);
    expect(again.ok && again.state).toBe(two);
    expect(melodyPaid(two.plays[1], 'p1')).toBe(2);
    expect(melodyPaid(two.plays[0], 'p1')).toBeUndefined();
  });

  it('names the moment the splash before a melody ends, so the rooms resend the slices', () => {
    const s = fresh();
    expect(melodyStartEnd(s, T(s) - 500)).toBe(T(s));
    expect(melodyStartEnd(s, T(s))).toBeNull();
    expect(melodyStartEnd(must(lock(s, T(s) + 1000)), T(s) - 500)).toBeNull();
  });

  it('refuses chunks out of time', () => {
    const s = fresh();
    const now = T(s) + 1000;
    expect(open(must(pause(s, now)), 'p1', 1, now)).toEqual({ ok: false, error: 'paused' });
    expect(open({ ...s, heldAt: now }, 'p1', 1, now)).toEqual({ ok: false, error: 'paused' });
    expect(open(s, 'p1', 1, T(s) - 1)).toEqual({ ok: false, error: 'not_started' });
    // кінець включно (clock > deadline), як у memory: за мить після 60 с
    expect(open(s, 'p1', 1, T(s) + 60_000).ok).toBe(true);
    expect(open(s, 'p1', 1, T(s) + 60_001)).toEqual({ ok: false, error: 'time_over' });
    expect(open(must(lock(s, now)), 'p1', 1, now)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(open(s, 'p9', 1, now)).toEqual({ ok: false, error: 'not_found' });
    // перше запитання — не melody
    const first = startRound(lobbyWith(melodyQuiz(), ...PLAYERS), 0);
    expect(open(first, 'p1', 1, 500)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('points by the longest chunk heard', () => {
    const base = fresh();
    const t = T(base) + 5000;
    [1000, 800, 600, 400, 250].forEach((points, i) => {
      const n = i + 1;
      const s = must(say(upTo(base, 'p1', n, t), 'p1', 'Щедрик', t + 100));
      expect(record(s, 'p1')).toMatchObject({ points, basePoints: points, grade: 'correct', accepted: true, accuracy: [1, 0.8, 0.6, 0.4, 0.25][i] });
      expect(record(s, 'p1')!.answer).toEqual({ type: 'melody', value: 'Щедрик', heard: n });
    });
  });

  it('typos and spellings count as in text', () => {
    const heard = upTo(fresh(), 'p1', 1);
    const t = T(heard) + 1000;
    for (const value of ['щедрік', 'Shchedryk', 'carol of the bells']) expect([value, record(must(say(heard, 'p1', value, t)), 'p1')?.points]).toEqual([value, 1000]);
    expect(record(must(say(heard, 'p1', 'Шедрик', t)), 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
  });

  it('a wrong answer gives zero even with a minus rule', () => {
    const s = freshWith({ penalty: 'minus' });
    const t = T(s) + 1000;
    const wrong = must(say(upTo(s, 'p1', 2, t), 'p1', 'Колядка', t));
    expect(record(wrong, 'p1')).toMatchObject({ points: 0, basePoints: 0, grade: 'wrong' });
    // контроль: text того самого раунду з minus — від'ємні бали
    const onText = toQuestion(must(lock(wrong, t + 1000)), 'q4');
    const answered = must(submitAnswer(onText, 'p1', { type: 'text', value: 'Колядка' }, T(onText) + 1000));
    expect(record(answered, 'p1')!.points).toBeLessThan(0);
  });

  it('no speed bonus', () => {
    const s = upTo(freshWith({}, true), 'p1', 2);
    const early = must(say(s, 'p1', 'Щедрик', T(s) + 1000));
    const late = must(say(s, 'p1', 'Щедрик', T(s) + 50_000));
    expect(record(early, 'p1')!.points).toBe(800);
    expect(record(late, 'p1')!.points).toBe(800);
  });

  it('a classic ×2 doubles', () => {
    const s = upTo(freshWith({ multiplier: 2 }), 'p1', 2);
    expect(record(must(say(s, 'p1', 'Щедрик', T(s) + 1000)), 'p1')!.points).toBe(1600);
  });

  it('one try', () => {
    const s = upTo(fresh(), 'p1', 2);
    const t = T(s) + 1000;
    const answered = must(say(s, 'p1', 'Колядка', t));
    expect(say(answered, 'p1', 'Щедрик', t + 10)).toEqual({ ok: false, error: 'already_answered' });
    expect(open(answered, 'p1', 3, t + 10)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('answering needs a chunk', () => {
    const s = fresh();
    expect(say(s, 'p1', 'Щедрик', T(s) + 1000)).toEqual({ ok: false, error: 'melody_unheard' });
  });

  it('the phone cannot claim a shorter chunk', () => {
    const s = upTo(fresh(), 'p1', 4);
    const answered = must(submitAnswer(s, 'p1', { type: 'melody', value: 'Щедрик', heard: 1 } as Answer, T(s) + 1000));
    expect(record(answered, 'p1')).toMatchObject({ points: 400, answer: { heard: 4 } });
  });

  it('the host override pays by the chunk', () => {
    const s = upTo(freshWith({ partial: 50 }), 'p1', 2);
    const t = T(s) + 1000;
    const wrong = must(say(s, 'p1', 'Колядка', t));
    expect(record(wrong, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    const revealed = toReveal(wrong, t + 100);
    const right = must(override(revealed, 'p1', 'correct'));
    expect(record(right, 'p1')).toMatchObject({ grade: 'correct', points: 800, overridden: true });
    const partial = must(override(revealed, 'p1', 'partial'));
    expect(record(partial, 'p1')).toMatchObject({ grade: 'partial', points: 400 });
  });

  it('teams share chunks, the first answer counts', () => {
    const quiz = teamQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [melody])], 2, 'captain');
    const s = toMelody(must(next(teamGame(quiz, LAYOUT), 0, rng0)));
    expect(roundQuestionNumber(s)).toBe(0);
    expect(s.plays[s.questionIndex].melody).toEqual({ heard: {}, by: {} });
    for (const [member, team] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']] as const) {
      expect(actorOf(s, member, 'answer'), member).toEqual({ ok: true, id: team });
    }
    const t = T(s) + 1000;
    // чужий учасник не відкриває за команду
    expect(open(s, 't1', 1, t, 'm3')).toEqual({ ok: false, error: 'not_found' });
    const two = must(open(must(open(s, 't1', 1, t, 'm1')), 't1', 2, t, 'm2'));
    expect(two.plays[two.questionIndex].melody).toEqual({ heard: { t1: 2 }, by: { t1: 'm2' } });
    // Тарас (не капітан) відповідає за команду
    const answered = must(say(two, 't1', 'Щедрик', t + 100));
    expect(record(answered, 't1')).toMatchObject({ points: 800, grade: 'correct' });
    expect(say(answered, 't1', 'Щедрик', t + 200)).toEqual({ ok: false, error: 'already_answered' });
    // «Маки» мають своє heard
    expect(open(answered, 't2', 2, t, 'm4')).toEqual({ ok: false, error: 'melody_step' });
    const maky = must(open(answered, 't2', 1, t, 'm4'));
    expect(maky.plays[maky.questionIndex].melody).toEqual({ heard: { t1: 2, t2: 1 }, by: { t1: 'm2', t2: 'm4' } });
  });

  it('buffs and debuffs are off', () => {
    const s = fresh({ buffs: [...FIRST_BUFFS], debuffs: ['fog'] });
    for (const kind of FIRST_BUFFS) expect([kind, buffBlock(s, 'p1', kind)]).toEqual([kind, 'off_melody']);
    expect(takeBuff(s, 'p1', 'double', T(s) + 100, rng0).ok).toBe(false);
    expect(setDebuff(s, 'p2', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('a waiting debuff waits past the melody', () => {
    const quiz = makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [melody])], { debuffs: ['fog'] });
    let s = startRound(lobbyWith(quiz, ...PLAYERS), 0);
    s = must(setDebuff(s, 'p2', 'fog'));
    s = toMelody(s);
    expect(s.plays[s.questionIndex].question.type).toBe('melody');
    expect(s.debuffs.p2).toMatchObject({ kind: 'fog', firedAt: null });
  });

  it('a removed player leaves no chunks', () => {
    const s = upTo(fresh(), 'p1', 2);
    const removed = must(removePlayer(s, 'p1', T(s) + 2000));
    expect(removed.plays[removed.questionIndex].melody?.heard).not.toHaveProperty('p1');
  });

  it('a removed team member leaves no by entry', () => {
    const quiz = teamQuiz([classicRound('c1', [melody])]);
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    const opened = must(open(s, 't1', 1, T(s) + 1000, 'm2'));
    expect(opened.plays[0].melody?.by).toEqual({ t1: 'm2' });
    const removed = must(removePlayer(opened, 'm2', T(s) + 2000));
    expect(removed.plays[0].melody).toEqual({ heard: { t1: 1 }, by: {} });
  });
});
