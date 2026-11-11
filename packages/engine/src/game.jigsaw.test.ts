import { describe, expect, it } from 'vitest';
import { buffBlock, takeBuff } from './buffs';
import { lock, next, override, pause, recordOf, resume, setConnected, tick, type GameState } from './game';
import { jigsawHold, jigsawOf, jigsawPlace, jigsawTotal, liveHolds, scoreJigsaw } from './jigsaw';
import { hostLive } from './live';
import { actorOf } from './team-act';
import { FIRST_BUFFS } from './testing/buffs';
import { jigsaw, jigsawQuiz, makeRoundsQuiz, single } from './testing/fixtures';
import { DEFAULT_RULES } from '@quiz/shared';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { classicRound } from './testing/fixtures';

/** p1 Оля, p2 Тарас, p3 Петро. */
const PLAYERS = ['Оля', 'Тарас', 'Петро'];
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const rng0 = () => 0;

/** Пройти перший раунд і відкрити пазл другого: номер у раунді 0, індекс у plays 1. */
function toJigsaw(s0: GameState): GameState {
  let s = s0;
  if (s.phase === 'question') s = must(lock(s, 1000));
  for (let i = 0; i < 12 && !(s.phase === 'question' && s.plays[s.questionIndex].question.type === 'jigsaw'); i++) s = must(next(s, 2000, rng0));
  return s;
}

const fresh = (names: string[] = PLAYERS, settings: Parameters<typeof jigsawQuiz>[0] = {}) => toJigsaw(startRound(lobbyWith(jigsawQuiz(settings), ...names), 0));
const T = (s: GameState) => s.startedAt!;
const cell = (piece: number) => ({ piece, x: piece % jigsaw.cols, y: Math.floor(piece / jigsaw.cols), rot: 0 });
const place = (s: GameState, actor: string, piece: number, at: number, member = actor) => must(jigsawPlace(s, actor, member, 0, cell(piece), at));
/** Поставити шматочки 0…upTo−1; останній — у мить at. */
function build(s: GameState, actor: string, upTo: number, at: number, member = actor): GameState {
  let cur = s;
  for (let k = 0; k < upTo; k++) cur = place(cur, actor, k, at, member);
  return cur;
}
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);

describe('jigsaw: the engine', () => {
  it('places after an earlier round by the round-local number', () => {
    const s = fresh();
    expect(s.questionIndex).toBe(1);
    expect(jigsawTotal(jigsaw)).toBe(12);
    const placed = must(jigsawPlace(s, 'p1', 'p1', 0, cell(0), T(s) + 1000));
    expect(jigsawOf(placed, 'p1')).toMatchObject({ placed: [0], doneMs: null, seq: 1 });
    // номер у раунді (0), не індекс у plays (1)
    expect(jigsawPlace(s, 'p1', 'p1', 1, cell(0), T(s) + 1000)).toEqual({ ok: false, error: 'jigsaw_stale' });
    expect(jigsawHold(s, 'p1', 'p1', 1, 0, T(s) + 1000)).toEqual({ ok: false, error: 'jigsaw_stale' });
    expect(s.plays[0].jigsaw).toBeUndefined();
  });

  it('refuses a piece that does not snap', () => {
    const s = fresh();
    const at = T(s) + 1000;
    expect(jigsawPlace(s, 'p1', 'p1', 0, { ...cell(0), rot: 1 }, at)).toEqual({ ok: false, error: 'jigsaw_miss' });
    expect(jigsawPlace(s, 'p1', 'p1', 0, { ...cell(0), x: 0.3 }, at)).toEqual({ ok: false, error: 'jigsaw_miss' });
    expect(jigsawPlace(s, 'p1', 'p1', 0, { ...cell(0), x: 0.24 }, at).ok).toBe(true);
    expect(jigsawPlace(s, 'p1', 'p1', 0, { ...cell(12), x: 0, y: 0 }, at)).toEqual({ ok: false, error: 'jigsaw_piece' });
    expect(jigsawPlace(s, 'p1', 'p1', 0, { ...cell(0), piece: -1 }, at)).toEqual({ ok: false, error: 'jigsaw_piece' });
    const one = place(s, 'p1', 0, at);
    expect(jigsawPlace(one, 'p1', 'p1', 0, cell(0), at + 10)).toEqual({ ok: false, error: 'jigsaw_placed' });
    expect(jigsawOf(one, 'p1')?.placed).toEqual([0]);
  });

  it('refuses paused, late and stale moves', () => {
    const s = fresh();
    const at = T(s) + 1000;
    expect(jigsawPlace(must(pause(s, at)), 'p1', 'p1', 0, cell(0), at)).toEqual({ ok: false, error: 'paused' });
    expect(jigsawPlace(s, 'p1', 'p1', 0, cell(0), T(s) + 120_001)).toEqual({ ok: false, error: 'time_over' });
    expect(jigsawPlace(s, 'p9', 'p9', 0, cell(0), at)).toEqual({ ok: false, error: 'not_found' });
    const locked = must(lock(s, at));
    expect(jigsawPlace(locked, 'p1', 'p1', 0, cell(0), at)).toEqual({ ok: false, error: 'wrong_phase' });
    // перше запитання — не пазл
    const first = startRound(lobbyWith(jigsawQuiz(), ...PLAYERS), 0);
    expect(jigsawPlace(first, 'p1', 'p1', 0, cell(0), 500)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('the first to finish gets the maximum', () => {
    const s = fresh();
    const done = build(s, 'p1', 12, T(s) + 40_000);
    expect(record(done, 'p1')).toMatchObject({ grade: 'correct', points: 300, accuracy: 1, streakBonus: 0, accepted: true });
    expect(record(done, 'p1')!.answer).toEqual({ type: 'jigsaw', placed: 12, total: 12, done: true, timeMs: 40_000 });
    expect(jigsawOf(done, 'p1')).toMatchObject({ doneMs: 40_000 });
    expect(jigsawPlace(done, 'p1', 'p1', 0, cell(0), T(s) + 41_000)).toEqual({ ok: false, error: 'jigsaw_done' });
    expect(done.phase).toBe('question');
  });

  it('slower finishers get max × fastest / own', () => {
    const s = fresh();
    const a = build(s, 'p1', 12, T(s) + 40_000);
    const b = build(a, 'p2', 12, T(s) + 60_000);
    const c = build(b, 'p3', 12, T(s) + 100_000);
    expect(record(c, 'p1')!.points).toBe(300);
    expect(record(c, 'p2')!.points).toBe(200);
    expect(record(c, 'p3')!.points).toBe(120);
    expect(c.players.find((p) => p.id === 'p3')!.score).toBeGreaterThanOrEqual(0);
  });

  it('a streak rule keeps the time-scaled points and counts the bonus on them', () => {
    const rules = { ...DEFAULT_RULES, streak: { length: 1, bonus: { kind: 'percent' as const, value: 50 } } };
    const quiz = makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [jigsaw], { rules })]);
    const s = toJigsaw(startRound(lobbyWith(quiz, ...PLAYERS), 0));
    const a = build(s, 'p1', 12, T(s) + 40_000);
    const b = build(a, 'p2', 12, T(s) + 60_000);
    const closed = must(lock(b, T(s) + 61_000));
    expect(recordOf(closed, 1, 'p1')).toMatchObject({ basePoints: 300, streakBonus: 150, points: 450 });
    expect(recordOf(closed, 1, 'p2')).toMatchObject({ basePoints: 200, streakBonus: 100, points: 300 });
  });

  it('everyone finished closes the question', () => {
    const s = fresh();
    const a = build(s, 'p1', 12, T(s) + 40_000);
    const b = build(a, 'p2', 12, T(s) + 50_000);
    expect(b.phase).toBe('question');
    expect(build(b, 'p3', 12, T(s) + 60_000).phase).toBe('locked');
    // відключений без пазла закриття не тримає
    const gone = must(setConnected(b, 'p3', false, T(s) + 55_000));
    expect(gone.phase).toBe('locked');
  });

  it('time out gives unfinished boards zero', () => {
    const s = fresh();
    const a = build(s, 'p1', 12, T(s) + 40_000);
    const b = build(a, 'p3', 5, T(s) + 30_000);
    const closed = tick(b, T(s) + 120_001, rng0);
    expect(closed.phase).toBe('locked');
    expect(record(closed, 'p3')).toMatchObject({ grade: 'wrong', points: 0, timeMs: 120_000 });
    expect(record(closed, 'p3')!.accuracy).toBeCloseTo(5 / 12);
    expect(record(closed, 'p3')!.answer).toMatchObject({ type: 'jigsaw', placed: 5, total: 12, done: false, timeMs: null });
    expect(record(closed, 'p2')).toBeUndefined();
    expect(record(closed, 'p1')!.points).toBe(300);
    expect(scoreJigsaw(closed)).toBe(closed);
  });

  it('pause does not count into the finish time', () => {
    const s = fresh();
    const half = build(s, 'p1', 11, T(s) + 10_000);
    const paused = must(pause(half, T(s) + 10_000));
    const resumed = must(resume(paused, T(s) + 70_000));
    const done = place(resumed, 'p1', 11, T(s) + 75_000);
    expect(record(done, 'p1')!.answer).toMatchObject({ timeMs: 15_000 });
  });

  it('the puzzles round has no multiplier and no buffs', () => {
    let s = fresh(PLAYERS, { buffs: [...FIRST_BUFFS] });
    s = must(lock(s, T(s) + 1000));
    for (let i = 0; i < 12 && !(s.phase === 'question' && s.plays[s.questionIndex].question.id === 'j2'); i++) s = must(next(s, 5000, rng0));
    expect(s.plays[s.questionIndex].question.id).toBe('j2');
    expect(s.plays[s.questionIndex].jigsaw).toEqual({ boards: {} });
    const small = (k: number) => ({ piece: k, x: k % 2, y: Math.floor(k / 2), rot: 0 });
    let cur = s;
    for (let k = 0; k < 6; k++) cur = must(jigsawPlace(cur, 'p1', 'p1', 0, small(k), T(s) + 20_000));
    expect(record(cur, 'p1')).toMatchObject({ grade: 'correct', points: 300 });
    expect(buffBlock(s, 'p1', 'double')).toBe('off_puzzles');
  });

  it('a classic round has no buffs on a jigsaw', () => {
    const s = fresh(PLAYERS, { buffs: [...FIRST_BUFFS] });
    expect(buffBlock(s, 'p1', 'double')).toBe('off_jigsaw');
    expect(takeBuff(s, 'p1', 'double', T(s) + 100, rng0).ok).toBe(false);
  });

  it('teams build one puzzle', () => {
    const quiz = teamQuiz([classicRound('c1', [jigsaw])]);
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    for (const [member, team] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']] as const) {
      expect(actorOf(s, member, 'answer'), member).toEqual({ ok: true, id: team });
    }
    const a = must(jigsawPlace(s, 't1', 'm1', 0, cell(0), 1000));
    const b = must(jigsawPlace(a, 't1', 'm2', 0, cell(1), 1100));
    expect(jigsawOf(b, 't1')).toMatchObject({ placed: [0, 1], by: ['m1', 'm2'], seq: 2 });
    // «Маки» мають свою дошку; чужий учасник не ставить
    expect(jigsawOf(b, 't2')).toBeNull();
    expect(jigsawPlace(b, 't1', 'm3', 0, cell(2), 1200)).toEqual({ ok: false, error: 'not_found' });
    expect(jigsawPlace(b, 't1', 'm1', 0, cell(1), 1200)).toEqual({ ok: false, error: 'jigsaw_placed' });
    const maky = must(jigsawPlace(b, 't2', 'm4', 0, cell(5), 1300));
    expect(jigsawOf(maky, 't2')).toMatchObject({ placed: [5], by: ['m4'] });
    // останній шматочок будь-ким — запис команди
    let all = s;
    for (let k = 0; k < 12; k++) all = must(jigsawPlace(all, 't1', k % 2 === 0 ? 'm1' : 'm2', 0, cell(k), 9000));
    expect(record(all, 't1')).toMatchObject({ grade: 'correct', points: 300 });
    expect(record(all, 'm1')).toBeUndefined();
  });

  it('a non-captain places in a captain round', () => {
    const quiz = teamQuiz([classicRound('c1', [jigsaw])], 2, 'captain');
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    expect(jigsawPlace(s, 't1', 'm2', 0, cell(3), 1000).ok).toBe(true);
  });

  it('a held piece is locked for teammates for two seconds', () => {
    const quiz = teamQuiz([classicRound('c1', [jigsaw])]);
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    const t = 1000;
    const held = must(jigsawHold(s, 't1', 'm1', 0, 3, t));
    expect(jigsawOf(held, 't1')!.held).toEqual({ 3: { by: 'm1', until: t + 2000 } });
    expect(jigsawPlace(held, 't1', 'm2', 0, cell(3), t + 1999)).toEqual({ ok: false, error: 'jigsaw_held' });
    expect(jigsawHold(held, 't1', 'm2', 0, 3, t + 1999)).toEqual({ ok: false, error: 'jigsaw_held' });
    expect(jigsawPlace(held, 't1', 'm2', 0, cell(3), t + 2000).ok).toBe(true);
    expect(jigsawHold(held, 't1', 'm2', 0, 3, t + 2000).ok).toBe(true);
    // сам тримач ставить у t + 500; блок знято
    const mine = must(jigsawPlace(held, 't1', 'm1', 0, cell(3), t + 500));
    expect(jigsawOf(mine, 't1')!.held).toEqual({});
    // продовження тримання тим самим учасником; прострочені блоки прибрано
    const again = must(jigsawHold(held, 't1', 'm1', 0, 4, t + 2500));
    expect(Object.keys(jigsawOf(again, 't1')!.held!)).toEqual(['4']);
    expect(liveHolds(jigsawOf(held, 't1')!, t + 2000)).toEqual({});
    expect(liveHolds(jigsawOf(held, 't1')!, t + 1999)).toHaveProperty('3');
    // поставлений шматочок не тримається
    expect(jigsawHold(mine, 't1', 'm2', 0, 3, t + 600)).toEqual({ ok: false, error: 'jigsaw_placed' });
    expect(jigsawHold(held, 't1', 'm1', 1, 3, t)).toEqual({ ok: false, error: 'jigsaw_stale' });
    // «Маки» не заблоковані
    expect(jigsawPlace(held, 't2', 'm3', 0, cell(3), t + 100).ok).toBe(true);
  });

  it('a solo hold changes nothing', () => {
    const s = fresh();
    expect(jigsawHold(s, 'p1', 'p1', 0, 3, T(s) + 100)).toEqual({ ok: true, state: s });
    expect(jigsawHold(s, 'p1', 'p1', 0, 99, T(s) + 100)).toEqual({ ok: false, error: 'jigsaw_piece' });
  });

  it('the grade is not changed by the host', () => {
    const s = fresh();
    const done = build(s, 'p1', 12, T(s) + 40_000);
    expect(override(done, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(override(must(lock(done, T(s) + 41_000)), 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the host sees progress without a verdict', () => {
    const base = fresh();
    const s = build(base, 'p1', 5, T(base) + 1000);
    const row = hostLive(s)?.rows.find((r) => r.id === 'p1');
    expect(row?.progress).toEqual({ kind: 'jigsaw', placed: 5, total: 12, done: false });
  });
});
