import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@quiz/shared';
import { buffBlock, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { lock, next, override, pause, recordOf, removePlayer, tick, type GameState } from './game';
import { hostLive } from './live';
import { scoreSpotdiff, spotdiffOf, spotdiffTap, type SpotTap } from './spotdiff';
import { actorOf } from './team-act';
import { FIRST_BUFFS } from './testing/buffs';
import { classicRound, makeRoundsQuiz, single, spotdiff, spotdiffQuiz } from './testing/fixtures';
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

/** Пройти перший раунд і відкрити spotdiff другого: номер у раунді 0, індекс у plays 1. */
function toSpotdiff(s0: GameState, id = 'sd1'): GameState {
  let s = s0;
  if (s.phase === 'question') s = must(lock(s, 1000));
  for (let i = 0; i < 20 && !(s.phase === 'question' && s.plays[s.questionIndex].question.id === id); i++) s = must(s.phase === 'question' ? lock(s, 2000) : next(s, 2000, rng0));
  return s;
}

const fresh = (names: string[] = PLAYERS, settings: Parameters<typeof spotdiffQuiz>[0] = {}) => toSpotdiff(startRound(lobbyWith(spotdiffQuiz(settings), ...names), 0));
const T = (s: GameState) => s.startedAt!;
const MISS = { x: 0.05, y: 0.95 };
const at = (k: number) => ({ x: spotdiff.spots[k].x, y: spotdiff.spots[k].y });

function sure(tap: SpotTap): GameState {
  if (!tap.ok) throw new Error(tap.error);
  return tap.state;
}
const tap = (s: GameState, actor: string, point: { x: number; y: number }, now: number, member = actor, questionIndex = 0) =>
  spotdiffTap(s, actor, member, questionIndex, { ...point, width: 400 }, now);
const hit = (s: GameState, actor: string, k: number, now: number, member = actor) => sure(tap(s, actor, at(k), now, member));
/** Знайти кола 0…upTo−1; останнє — у мить now. */
function findAll(s: GameState, actor: string, upTo: number, now: number, member = actor): GameState {
  let cur = s;
  for (let k = 0; k < upTo; k++) cur = hit(cur, actor, k, now, member);
  return cur;
}
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);

describe('spotdiff: the engine', () => {
  it('taps after an earlier round by the round-local number', () => {
    const s = fresh();
    expect(s.questionIndex).toBe(1);
    expect(s.plays[1].spotdiff).toEqual({ boards: {} });
    const first = tap(s, 'p1', { x: 0.6, y: 0.5 }, T(s) + 1000);
    expect(first.ok && first.outcome).toBe('hit');
    expect(spotdiffOf(sure(first), 'p1')).toEqual({ found: [1], misses: { p1: 0 }, frozenUntil: {}, doneMs: null, seq: 1 });
    // номер у раунді (0), не індекс у plays (1)
    expect(tap(s, 'p1', { x: 0.6, y: 0.5 }, T(s) + 1000, 'p1', 1)).toEqual({ ok: false, error: 'spotdiff_stale' });
    expect(s.plays[0].spotdiff).toBeUndefined();
  });

  it('a near tap counts', () => {
    const s = fresh();
    const near = tap(s, 'p1', { x: 0.6 + 0.06 + 0.059, y: 0.5 }, T(s) + 1000);
    expect(near.ok && near.outcome).toBe('hit');
    const far = tap(s, 'p1', { x: 0.6 + 0.06 + 0.061, y: 0.5 }, T(s) + 1000);
    expect(far.ok && far.outcome).toBe('miss');
    expect(spotdiffOf(sure(far), 'p1')).toMatchObject({ found: [], misses: { p1: 1 }, seq: 0 });
  });

  it('three misses freeze for a second', () => {
    const s = fresh();
    const t = T(s) + 5000;
    let cur = sure(tap(s, 'p3', MISS, t - 300));
    cur = sure(tap(cur, 'p3', MISS, t - 200));
    expect(spotdiffOf(cur, 'p3')!.misses).toEqual({ p3: 2 });
    cur = hit(cur, 'p3', 0, t - 100);
    expect(spotdiffOf(cur, 'p3')!.misses).toEqual({ p3: 0 });
    const one = tap(cur, 'p3', MISS, t - 2);
    expect(one.ok && one.outcome).toBe('miss');
    const two = tap(sure(one), 'p3', MISS, t - 1);
    expect(two.ok && two.outcome).toBe('miss');
    const three = tap(sure(two), 'p3', MISS, t);
    expect(three.ok && three.outcome).toBe('freeze');
    const frozen = sure(three);
    expect(spotdiffOf(frozen, 'p3')).toMatchObject({ misses: { p3: 3 }, frozenUntil: { p3: t + 1000 }, found: [0] });
    // під час заморозки тап ігнорується й не рахується: відмова, стан той самий
    expect(tap(frozen, 'p3', at(1), t + 999)).toEqual({ ok: false, error: 'spotdiff_frozen' });
    expect(tap(frozen, 'p3', MISS, t + 999)).toEqual({ ok: false, error: 'spotdiff_frozen' });
    expect(spotdiffOf(frozen, 'p3')!.misses).toEqual({ p3: 3 });
    const after = tap(frozen, 'p3', at(1), t + 1000);
    expect(after.ok && after.outcome).toBe('hit');
    expect(spotdiffOf(sure(after), 'p3')!.found).toEqual([0, 1]);
  });

  it('the freeze grows with every miss in a row (1, 2, 3, 5, 5 s) and a hit resets the count', () => {
    let cur = fresh();
    let t = T(cur) + 1000;
    const frozenFor: number[] = [];
    for (let k = 1; k <= 7; k++) {
      const r = tap(cur, 'p3', MISS, t);
      cur = sure(r);
      expect(spotdiffOf(cur, 'p3')!.misses).toEqual({ p3: k });
      if (k < 3) {
        expect(r.ok && r.outcome).toBe('miss');
        t += 10;
        continue;
      }
      expect(r.ok && r.outcome).toBe('freeze');
      const ms = spotdiffOf(cur, 'p3')!.frozenUntil.p3 - t;
      frozenFor.push(ms);
      // тап під час заморозки не рахується
      expect(tap(cur, 'p3', MISS, t + ms - 1)).toEqual({ ok: false, error: 'spotdiff_frozen' });
      t += ms;
    }
    expect(frozenFor).toEqual([1000, 2000, 3000, 4000, 5000]);
    expect(spotdiffOf(cur, 'p3')!.misses).toEqual({ p3: 7 });
    const reset = hit(cur, 'p3', 0, t);
    expect(spotdiffOf(reset, 'p3')!.misses).toEqual({ p3: 0 });
    const again = tap(reset, 'p3', MISS, t + 10);
    expect(again.ok && again.outcome).toBe('miss');
  });

  it('a found circle is not a miss', () => {
    const s = fresh();
    const one = sure(tap(hit(s, 'p1', 0, T(s) + 100), 'p1', MISS, T(s) + 200));
    expect(spotdiffOf(one, 'p1')!.misses).toEqual({ p1: 1 });
    expect(tap(one, 'p1', at(0), T(s) + 300)).toEqual({ ok: false, error: 'spotdiff_found' });
    expect(tap(one, 'p1', { x: 0.2 + 0.05 + 0.05, y: 0.3 }, T(s) + 300)).toEqual({ ok: false, error: 'spotdiff_found' });
    expect(spotdiffOf(one, 'p1')!.misses).toEqual({ p1: 1 });
  });

  it('refuses paused, late and stale taps', () => {
    const s = fresh();
    const now = T(s) + 1000;
    expect(tap(must(pause(s, now)), 'p1', at(0), now)).toEqual({ ok: false, error: 'paused' });
    expect(tap(s, 'p1', at(0), T(s) + 90_001)).toEqual({ ok: false, error: 'time_over' });
    expect(tap(s, 'p1', at(0), T(s) - 1)).toEqual({ ok: false, error: 'not_started' });
    expect(tap(s, 'p9', at(0), now)).toEqual({ ok: false, error: 'not_found' });
    expect(tap(must(lock(s, now)), 'p1', at(0), now)).toEqual({ ok: false, error: 'wrong_phase' });
    // перше запитання — не spotdiff
    const first = startRound(lobbyWith(spotdiffQuiz(), ...PLAYERS), 0);
    expect(tap(first, 'p1', at(0), 500)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('all found gives the full price and closes for that player', () => {
    const s = fresh();
    const done = findAll(s, 'p1', 3, T(s) + 40_000);
    expect(record(done, 'p1')).toMatchObject({ grade: 'correct', points: 300, basePoints: 300, streakBonus: 0, accuracy: 1, accepted: true, timeMs: 40_000 });
    expect(record(done, 'p1')!.answer).toEqual({ type: 'spotdiff', found: 3, total: 3, done: true, timeMs: 40_000 });
    expect(spotdiffOf(done, 'p1')).toMatchObject({ doneMs: 40_000, seq: 3 });
    expect(tap(done, 'p1', MISS, T(s) + 41_000)).toEqual({ ok: false, error: 'spotdiff_done' });
    expect(done.phase).toBe('question');
  });

  it('partial finds score by share at close', () => {
    const s = fresh();
    const a = findAll(s, 'p2', 2, T(s) + 10_000);
    const b = sure(tap(a, 'p3', MISS, T(s) + 11_000));
    const closed = tick(b, T(s) + 90_001, rng0);
    expect(closed.phase).toBe('locked');
    expect(record(closed, 'p2')).toMatchObject({ grade: 'partial', points: 200, basePoints: 200, streakBonus: 0, timeMs: 90_000, accepted: false });
    expect(record(closed, 'p2')!.accuracy).toBeCloseTo(2 / 3);
    expect(record(closed, 'p2')!.answer).toEqual({ type: 'spotdiff', found: 2, total: 3, done: false, timeMs: null });
    expect(record(closed, 'p3')).toMatchObject({ grade: 'wrong', points: 0, accuracy: 0 });
    expect(record(closed, 'p1')).toBeUndefined();
    expect(scoreSpotdiff(closed)).toBe(closed);
    // і через lock ведучого
    const byHost = must(lock(b, T(s) + 20_000));
    expect(recordOf(byHost, 1, 'p2')).toMatchObject({ grade: 'partial', points: 200, timeMs: 90_000 });
  });

  it('a streak rule does not reset scaled points', () => {
    const rules = { ...DEFAULT_RULES, streak: { length: 1, bonus: { kind: 'percent' as const, value: 50 } } };
    const quiz = makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [spotdiff], { rules })]);
    const s = toSpotdiff(startRound(lobbyWith(quiz, ...PLAYERS), 0));
    const a = findAll(s, 'p2', 2, T(s) + 10_000);
    const closed = must(lock(a, T(s) + 20_000));
    expect(recordOf(closed, 1, 'p2')).toMatchObject({ grade: 'partial', points: 200, basePoints: 200 });
  });

  it('a classic multiplier 2 doubles the full price and the share', () => {
    const rules = { ...DEFAULT_RULES, multiplier: 2 as const };
    const quiz = makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [spotdiff], { rules })]);
    const s = toSpotdiff(startRound(lobbyWith(quiz, ...PLAYERS), 0));
    const a = findAll(s, 'p1', 3, T(s) + 10_000);
    expect(record(a, 'p1')).toMatchObject({ grade: 'correct', points: 600, basePoints: 600 });
    const b = findAll(a, 'p2', 2, T(s) + 20_000);
    const closed = must(lock(b, T(s) + 30_000));
    expect(recordOf(closed, 1, 'p2')).toMatchObject({ grade: 'partial', points: 400, basePoints: 400 });
  });

  it('a streak bonus lands on top of the full price', () => {
    const rules = { ...DEFAULT_RULES, streak: { length: 1, bonus: { kind: 'percent' as const, value: 50 } } };
    const quiz = makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [spotdiff], { rules })]);
    const s = toSpotdiff(startRound(lobbyWith(quiz, ...PLAYERS), 0));
    const a = findAll(s, 'p1', 3, T(s) + 10_000);
    const closed = must(lock(a, T(s) + 20_000));
    expect(recordOf(closed, 1, 'p1')).toMatchObject({ grade: 'correct', basePoints: 300, streakBonus: 150, points: 450 });
  });

  it('the engine clamps the width to 60…4000', () => {
    const s = fresh();
    const right = spotdiff.spots[1].x + spotdiff.spots[1].r;
    const at1 = (dx: number, width: number) => spotdiffTap(s, 'p1', 'p1', 0, { x: right + dx, y: spotdiff.spots[1].y, width }, T(s) + 1000);
    // ширина 0 рахується як 60: допуск 8 %, а не промах
    expect(at1(0.079, 0)).toMatchObject({ ok: true, outcome: 'hit' });
    expect(at1(0.081, 0)).toMatchObject({ ok: true, outcome: 'miss' });
    // величезна ширина — як 4000: допуск 4 %
    expect(at1(0.039, 1e9)).toMatchObject({ ok: true, outcome: 'hit' });
    expect(at1(0.041, 1e9)).toMatchObject({ ok: true, outcome: 'miss' });
  });

  it('a removed player takes the board away', () => {
    const open = fresh();
    const s = hit(open, 'p1', 0, T(open) + 1000);
    expect(spotdiffOf(s, 'p1')).not.toBeNull();
    const removed = must(removePlayer(s, 'p1', T(s) + 2000));
    expect(spotdiffOf(removed, 'p1')).toBeNull();
    expect(Object.keys(removed.plays[removed.questionIndex].spotdiff!.boards)).toEqual([]);
  });

  it('the next question empties a tapped board, the record stays', () => {
    const s = fresh();
    const a = sure(tap(hit(s, 'p1', 0, T(s) + 1000), 'p2', MISS, T(s) + 2000));
    expect(Object.keys(a.plays[1].spotdiff!.boards).sort()).toEqual(['p1', 'p2']);
    const b = toSpotdiff(must(lock(a, T(s) + 3000)), 'sd2');
    expect(b.plays[1].spotdiff).toEqual({ boards: {} });
    expect(recordOf(b, 1, 'p1')).toMatchObject({ grade: 'partial', points: 100 });
    expect(recordOf(b, 1, 'p2')).toMatchObject({ grade: 'wrong', points: 0 });
  });

  it('everyone found all closes the question', () => {
    const s = fresh();
    const a = findAll(s, 'p1', 3, T(s) + 10_000);
    const b = findAll(a, 'p2', 3, T(s) + 20_000);
    expect(b.phase).toBe('question');
    expect(findAll(b, 'p3', 3, T(s) + 30_000).phase).toBe('locked');
  });

  it('the puzzles round has no multiplier and no buffs', () => {
    const classic = fresh(PLAYERS, { buffs: [...FIRST_BUFFS], debuffs: ['fog'] });
    expect(buffBlock(classic, 'p1', 'double')).toBe('off_spotdiff');
    expect(takeBuff(classic, 'p1', 'double', T(classic) + 100, rng0).ok).toBe(false);
    expect(setDebuff(classic, 'p2', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
    const s = toSpotdiff(must(lock(classic, T(classic) + 1000)), 'sd2');
    expect(s.plays[s.questionIndex].question.id).toBe('sd2');
    expect(s.plays[s.questionIndex].spotdiff).toEqual({ boards: {} });
    // минула дошка спорожнена
    expect(s.plays[1].spotdiff).toEqual({ boards: {} });
    const q = s.plays[s.questionIndex].question;
    if (q.type !== 'spotdiff') throw new Error('not spotdiff');
    // номер у раунді «Головоломки» — 1 (після судоку)
    let cur = s;
    for (const spot of q.spots) cur = sure(spotdiffTap(cur, 'p1', 'p1', 1, { x: spot.x, y: spot.y, width: 400 }, T(s) + 20_000));
    expect(record(cur, 'p1')).toMatchObject({ grade: 'correct', points: 300, basePoints: 300 });
    expect(buffBlock(s, 'p1', 'double')).toBe('off_puzzles');
  });

  it('teams share one board, freezes are personal', () => {
    const quiz = teamQuiz([classicRound('c1', [spotdiff])]);
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    for (const [member, team] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']] as const) {
      expect(actorOf(s, member, 'answer'), member).toEqual({ ok: true, id: team });
    }
    const t = 1000;
    const a = hit(s, 't1', 0, t, 'm1');
    expect(spotdiffOf(a, 't1')).toMatchObject({ found: [0], by: ['m1'], seq: 1 });
    // коло, знайдене товаришем, — не промах
    expect(tap(a, 't1', at(0), t + 10, 'm2')).toEqual({ ok: false, error: 'spotdiff_found' });
    // чужий учасник не тапає
    expect(tap(a, 't1', at(1), t + 10, 'm3')).toEqual({ ok: false, error: 'not_found' });
    let b = a;
    for (let k = 0; k < 3; k++) b = sure(tap(b, 't1', MISS, t + 100 + k, 'm1'));
    expect(spotdiffOf(b, 't1')).toMatchObject({ frozenUntil: { m1: t + 102 + 1000 }, misses: { m1: 3 } });
    expect(tap(b, 't1', at(1), t + 200, 'm1')).toEqual({ ok: false, error: 'spotdiff_frozen' });
    const c = hit(b, 't1', 1, t + 200, 'm2');
    expect(spotdiffOf(c, 't1')).toMatchObject({ found: [0, 1], by: ['m1', 'm2'] });
    // «Маки» мають свою дошку
    expect(spotdiffOf(c, 't2')).toBeNull();
    const maky = hit(c, 't2', 1, t + 300, 'm4');
    expect(spotdiffOf(maky, 't2')).toMatchObject({ found: [1], by: ['m4'] });
    // останнє коло будь-ким — запис команди
    const all = hit(c, 't1', 2, t + 400, 'm2');
    expect(record(all, 't1')).toMatchObject({ grade: 'correct', points: 300 });
    expect(record(all, 'm1')).toBeUndefined();
  });

  it('a teammate hit does not reset the other misses', () => {
    const quiz = teamQuiz([classicRound('c1', [spotdiff])]);
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    let a = sure(tap(s, 't1', MISS, 1000, 'm1'));
    a = sure(tap(a, 't1', MISS, 1001, 'm1'));
    const b = hit(a, 't1', 0, 1002, 'm2');
    expect(spotdiffOf(b, 't1')!.misses).toEqual({ m1: 2, m2: 0 });
    // третій промах m1 усе ще морозить
    const c = tap(b, 't1', MISS, 1003, 'm1');
    expect(c.ok && c.outcome).toBe('freeze');
  });

  it('both teams found all closes the question', () => {
    const quiz = teamQuiz([classicRound('c1', [spotdiff])]);
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    const a = findAll(s, 't1', 3, 1000, 'm1');
    expect(a.phase).toBe('question');
    const b = findAll(a, 't2', 3, 2000, 'm4');
    expect(b.phase).toBe('locked');
    expect(recordOf(b, 0, 't1')).toMatchObject({ grade: 'correct', points: 300 });
    expect(recordOf(b, 0, 't2')).toMatchObject({ grade: 'correct', points: 300 });
  });

  it('a non-captain taps in a captain round', () => {
    const quiz = teamQuiz([classicRound('c1', [spotdiff])], 2, 'captain');
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    expect(tap(s, 't1', at(0), 1000, 'm2').ok).toBe(true);
  });

  it('the grade is not changed by the host', () => {
    const s = fresh();
    const done = findAll(s, 'p1', 3, T(s) + 40_000);
    expect(override(done, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(override(must(lock(done, T(s) + 41_000)), 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the host sees progress without a verdict', () => {
    const base = fresh();
    const s = findAll(base, 'p1', 2, T(base) + 1000);
    const row = hostLive(s)?.rows.find((r) => r.id === 'p1');
    expect(row?.progress).toEqual({ kind: 'spotdiff', found: 2, total: 3, done: false });
  });
});
