import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, memoryLayout } from '@quiz/shared';
import { buffBlock, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { lock, next, override, pause, recordOf, removePlayer, roundQuestionNumber, submitAnswer, tick, type GameState } from './game';
import { hostLive } from './live';
import { memoryFlip, memoryOf, memoryTimersEnd, packMemories, scoreMemory, settleMemory, type MemoryFlip } from './memory';
import { actorOf } from './team-act';
import { FIRST_BUFFS } from './testing/buffs';
import { classicRound, makeRoundsQuiz, memory, memoryQuiz, memorySmall, single } from './testing/fixtures';
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

/** Пройти перший раунд і відкрити memory другого: номер у раунді 0, індекс у plays 1. */
function toMemory(s0: GameState, id = 'mm1'): GameState {
  let s = s0;
  if (s.phase === 'question') s = must(lock(s, 1000));
  for (let i = 0; i < 20 && !(s.phase === 'question' && s.plays[s.questionIndex].question.id === id); i++) s = must(s.phase === 'question' ? lock(s, 2000) : next(s, 2000, rng0));
  return s;
}

const fresh = (names: string[] = PLAYERS, settings: Parameters<typeof memoryQuiz>[0] = {}) => toMemory(startRound(lobbyWith(memoryQuiz(settings), ...names), 0));
const T = (s: GameState) => s.startedAt!;
const LAYOUT_6 = memoryLayout(6, 42);
/** Дві клітинки пари pair за memoryLayout(6, 42). */
const cellsOf = (pair: number, layout = LAYOUT_6): [number, number] => [layout.indexOf(2 * pair), layout.indexOf(2 * pair + 1)];
/** Дві клітинки різних пар. */
const wrongPair = (): [number, number] => [cellsOf(0)[0], cellsOf(1)[0]];

function sure(flip: MemoryFlip): GameState {
  if (!flip.ok) throw new Error(flip.error);
  return flip.state;
}
const flip = (s: GameState, actor: string, cell: number, now: number, member = actor, questionIndex = 0) => memoryFlip(s, actor, member, questionIndex, cell, now);
/** Знайти пару: дві картки в мить now. */
const match = (s: GameState, actor: string, pair: number, now: number, member = actor, layout = LAYOUT_6, questionIndex = 0) => {
  const [a, b] = cellsOf(pair, layout);
  return sure(memoryFlip(sure(memoryFlip(s, actor, member, questionIndex, a, now)), actor, member, questionIndex, b, now));
};
/** Знайти пари 0…upTo−1; остання — у мить now. */
function findAll(s: GameState, actor: string, upTo: number, now: number, member = actor): GameState {
  let cur = s;
  for (let k = 0; k < upTo; k++) cur = match(cur, actor, k, now, member);
  return cur;
}
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);

describe('memory: the engine', () => {
  it('flips after an earlier round by the round-local number', () => {
    const s = fresh();
    expect(s.questionIndex).toBe(1);
    expect(roundQuestionNumber(s)).toBe(0);
    expect(s.plays[1].memory).toEqual({ boards: {} });
    const first = flip(s, 'p1', 5, T(s) + 1000);
    expect(first.ok && first.outcome).toBe('open');
    expect(memoryOf(sure(first), 'p1')).toEqual({ matched: [], open: 5, shown: null, moves: 0, doneMs: null, seq: 1 });
    // номер у раунді (0), не індекс у plays (1)
    expect(flip(s, 'p1', 5, T(s) + 1000, 'p1', 1)).toEqual({ ok: false, error: 'memory_stale' });
    expect(s.plays[0].memory).toBeUndefined();
  });

  it('a pair stays open', () => {
    const s = fresh();
    const [a, b] = cellsOf(0);
    const one = sure(flip(s, 'p1', a, T(s) + 1000));
    const two = flip(one, 'p1', b, T(s) + 1100);
    expect(two.ok && two.outcome).toBe('match');
    expect(memoryOf(sure(two), 'p1')).toEqual({ matched: [a, b], open: null, shown: null, moves: 1, doneMs: null, seq: 2 });
  });

  it('a wrong pair closes after a second', () => {
    const s = fresh();
    const t = T(s) + 5000;
    const [a, b] = wrongPair();
    const missed = flip(sure(flip(s, 'p3', a, t - 100)), 'p3', b, t);
    expect(missed.ok && missed.outcome).toBe('miss');
    const shown = sure(missed);
    expect(memoryOf(shown, 'p3')).toMatchObject({ open: null, shown: { cells: [a, b], until: t + 1000 }, moves: 1 });
    const early = flip(shown, 'p3', cellsOf(2)[0], t + 999);
    expect(early).toEqual({ ok: false, error: 'memory_wait' });
    expect(memoryOf(shown, 'p3')).toBe(memoryOf(shown, 'p3'));
    expect(memoryTimersEnd(shown, t)).toBe(t + 1000);
    expect(memoryTimersEnd(shown, t + 1000)).toBeNull();
    const after = flip(shown, 'p3', cellsOf(2)[0], t + 1000);
    expect(after.ok && after.outcome).toBe('open');
    expect(memoryOf(sure(after), 'p3')).toMatchObject({ shown: null, open: cellsOf(2)[0], moves: 1 });
    // самі показані картки після секунди знову можна відкривати
    expect(flip(shown, 'p3', a, t + 1000).ok).toBe(true);
  });

  it('settleMemory closes expired cards and keeps the same object otherwise', () => {
    const board = { matched: [], open: null, shown: { cells: [1, 2] as [number, number], until: 2000 }, moves: 1, doneMs: null, seq: 3 };
    expect(settleMemory(board, 1999)).toBe(board);
    expect(settleMemory(board, 2000)).toEqual({ ...board, shown: null });
    const team = { matched: [], by: [], open: 4, shown: null, turn: { by: 'm1', until: 5000 }, moves: 0, doneMs: null, seq: 1 };
    expect(settleMemory(team, 4999)).toBe(team);
    expect(settleMemory(team, 5000)).toEqual({ ...team, open: null, turn: null });
  });

  it('refuses bad flips', () => {
    const s = fresh();
    const now = T(s) + 1000;
    expect(flip(s, 'p1', 12, now)).toEqual({ ok: false, error: 'memory_cell' });
    expect(flip(s, 'p1', -1, now)).toEqual({ ok: false, error: 'memory_cell' });
    const matched = match(s, 'p1', 0, now);
    expect(flip(matched, 'p1', cellsOf(0)[1], now + 10)).toEqual({ ok: false, error: 'memory_matched' });
    const open = sure(flip(matched, 'p1', cellsOf(1)[0], now + 20));
    expect(flip(open, 'p1', cellsOf(1)[0], now + 30)).toEqual({ ok: false, error: 'memory_open' });
    expect(memoryOf(open, 'p1')).toMatchObject({ open: cellsOf(1)[0], seq: 3 });
    expect(flip(must(pause(s, now)), 'p1', 0, now)).toEqual({ ok: false, error: 'paused' });
    expect(flip(s, 'p1', 0, T(s) + 90_001)).toEqual({ ok: false, error: 'time_over' });
    expect(flip(s, 'p1', 0, T(s) - 1)).toEqual({ ok: false, error: 'not_started' });
    expect(flip(s, 'p9', 0, now)).toEqual({ ok: false, error: 'not_found' });
    expect(flip(must(lock(s, now)), 'p1', 0, now)).toEqual({ ok: false, error: 'wrong_phase' });
    // перше запитання — не memory
    const first = startRound(lobbyWith(memoryQuiz(), ...PLAYERS), 0);
    expect(flip(first, 'p1', 0, 500)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', { type: 'single', optionId: 'a' }, now)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('the fastest gets the full price, the rest by time, unfinished zero', () => {
    const s = fresh([...PLAYERS, 'Ганна']);
    const a = findAll(s, 'p1', 6, T(s) + 40_000);
    expect(record(a, 'p1')).toMatchObject({ grade: 'correct', points: 300, basePoints: 300, streakBonus: 0, accuracy: 1, accepted: true, timeMs: 40_000 });
    expect(record(a, 'p1')!.answer).toEqual({ type: 'memory', pairs: 6, total: 6, done: true, timeMs: 40_000, moves: 6 });
    expect(flip(a, 'p1', 0, T(s) + 41_000)).toEqual({ ok: false, error: 'memory_done' });
    expect(a.phase).toBe('question');
    const b = findAll(a, 'p2', 6, T(s) + 60_000);
    expect(record(b, 'p2')).toMatchObject({ grade: 'correct', points: 200, basePoints: 200, timeMs: 60_000 });
    const c = findAll(b, 'p3', 5, T(s) + 70_000);
    const closed = tick(c, T(s) + 90_001, rng0);
    expect(closed.phase).toBe('locked');
    expect(record(closed, 'p3')).toMatchObject({ grade: 'wrong', points: 0, basePoints: 0, timeMs: 90_000, accepted: false });
    expect(record(closed, 'p3')!.accuracy).toBeCloseTo(5 / 6);
    expect(record(closed, 'p3')!.answer).toEqual({ type: 'memory', pairs: 5, total: 6, done: false, timeMs: null, moves: 5 });
    expect(record(closed, 'p4')).toBeUndefined();
    expect(scoreMemory(closed)).toBe(closed);
    // і через lock ведучого
    const byHost = must(lock(c, T(s) + 75_000));
    expect(recordOf(byHost, 1, 'p3')).toMatchObject({ grade: 'wrong', points: 0, timeMs: 90_000 });
    expect(recordOf(byHost, 1, 'p1')).toMatchObject({ points: 300 });
  });

  it('a classic ×2 doubles the base, a streak rule keeps basePoints', () => {
    const x2 = makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [memory], { rules: { ...DEFAULT_RULES, multiplier: 2 } })]);
    const s = toMemory(startRound(lobbyWith(x2, ...PLAYERS), 0));
    const a = findAll(s, 'p1', 6, T(s) + 30_000);
    expect(record(a, 'p1')).toMatchObject({ grade: 'correct', points: 600, basePoints: 600 });
    const b = findAll(a, 'p2', 6, T(s) + 45_000);
    expect(record(b, 'p2')).toMatchObject({ points: 400, basePoints: 400 });
    // серія: basePoints — бали за часом, бонус серії лягає зверху й не скидає повільнішого до максимуму (урок 9f030b98)
    const rules = { ...DEFAULT_RULES, streak: { length: 1, bonus: { kind: 'percent' as const, value: 50 } } };
    const streak = makeRoundsQuiz([classicRound('c1', [{ ...single, timeLimit: 30 }]), classicRound('c2', [memory], { rules })]);
    const t = toMemory(startRound(lobbyWith(streak, ...PLAYERS), 0));
    const done = findAll(findAll(t, 'p1', 6, T(t) + 40_000), 'p2', 6, T(t) + 60_000);
    expect(record(done, 'p1')).toMatchObject({ points: 300, basePoints: 300, streakBonus: 0 });
    expect(record(done, 'p2')).toMatchObject({ points: 200, basePoints: 200, streakBonus: 0 });
    const closed = must(lock(done, T(t) + 61_000));
    expect(recordOf(closed, 1, 'p1')).toMatchObject({ basePoints: 300, streakBonus: 150, points: 450 });
    expect(recordOf(closed, 1, 'p2')).toMatchObject({ basePoints: 200, streakBonus: 100, points: 300 });
  });

  it('everyone done closes the question', () => {
    const s = fresh();
    const a = findAll(s, 'p1', 6, T(s) + 10_000);
    const b = findAll(a, 'p2', 6, T(s) + 20_000);
    expect(b.phase).toBe('question');
    expect(findAll(b, 'p3', 6, T(s) + 30_000).phase).toBe('locked');
  });

  it('the puzzles round has no multiplier and no buffs', () => {
    const classic = fresh(PLAYERS, { buffs: [...FIRST_BUFFS], debuffs: ['fog'] });
    expect(buffBlock(classic, 'p1', 'double')).toBe('off_memory');
    expect(takeBuff(classic, 'p1', 'double', T(classic) + 100, rng0).ok).toBe(false);
    expect(setDebuff(classic, 'p2', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
    const s = toMemory(must(lock(classic, T(classic) + 1000)), 'mm2');
    expect(s.plays[s.questionIndex].question.id).toBe('mm2');
    expect(s.plays[s.questionIndex].memory).toEqual({ boards: {} });
    expect(roundQuestionNumber(s)).toBe(1);
    const layout = memoryLayout(memorySmall.pairs.length, memorySmall.seed);
    let cur = s;
    for (let k = 0; k < memorySmall.pairs.length; k++) cur = match(cur, 'p1', k, T(s) + 20_000, 'p1', layout, 1);
    expect(record(cur, 'p1')).toMatchObject({ grade: 'correct', points: 300, basePoints: 300 });
    expect(buffBlock(s, 'p1', 'double')).toBe('off_puzzles');
  });

  it('teams share one grid, one move at a time', () => {
    const quiz = teamQuiz([classicRound('c1', [memory])]);
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    for (const [member, team] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']] as const) {
      expect(actorOf(s, member, 'answer'), member).toEqual({ ok: true, id: team });
    }
    expect(s.plays[0].memory).toEqual({ boards: {}, order: { t1: ['m1', 'm2'], t2: ['m3', 'm4'] } });
    const t = 1000;
    const [a, b] = cellsOf(0);
    const opened = sure(flip(s, 't1', a, t, 'm1'));
    expect(memoryOf(opened, 't1')).toEqual({ matched: [], by: [], open: a, shown: null, turn: { by: 'm1', until: t + 5000 }, moves: 0, doneMs: null, seq: 1 });
    expect(memoryTimersEnd(opened, t)).toBe(t + 5000);
    expect(flip(opened, 't1', b, t + 100, 'm2')).toEqual({ ok: false, error: 'memory_busy' });
    // чужий учасник не відкриває
    expect(flip(opened, 't1', b, t + 100, 'm3')).toEqual({ ok: false, error: 'not_found' });
    const paired = sure(flip(opened, 't1', b, t + 200, 'm1'));
    expect(memoryOf(paired, 't1')).toMatchObject({ matched: [a, b], by: ['m1'], open: null, turn: null, moves: 1 });
    // Тарас одразу може ходити
    const t2 = t + 300;
    const missed = sure(flip(sure(flip(paired, 't1', cellsOf(1)[0], t2, 'm2')), 't1', cellsOf(2)[0], t2, 'm2'));
    expect(memoryOf(missed, 't1')).toMatchObject({ shown: { cells: [cellsOf(1)[0], cellsOf(2)[0]], until: t2 + 1000 }, turn: null, moves: 2 });
    expect(flip(missed, 't1', cellsOf(3)[0], t2 + 500, 'm1')).toEqual({ ok: false, error: 'memory_wait' });
    // Оля відкриває одну картку й більше нічого: за 5 с сітка вільна, перша картка закрита
    const t3 = t2 + 1000;
    const left = sure(flip(missed, 't1', cellsOf(3)[0], t3, 'm1'));
    expect(flip(left, 't1', cellsOf(4)[0], t3 + 4999, 'm2')).toEqual({ ok: false, error: 'memory_busy' });
    expect(settleMemory(memoryOf(left, 't1')!, t3 + 5000)).toMatchObject({ open: null, turn: null });
    const taken = flip(left, 't1', cellsOf(4)[0], t3 + 5000, 'm2');
    expect(taken.ok && taken.outcome).toBe('open');
    expect(memoryOf(sure(taken), 't1')).toMatchObject({ open: cellsOf(4)[0], turn: { by: 'm2', until: t3 + 10_000 }, moves: 2 });
    // «Маки» мають свою дошку й не бачать ходу «Соняшників»
    expect(memoryOf(left, 't2')).toBeNull();
    const maky = flip(left, 't2', cellsOf(3)[1], t3 + 10, 'm4');
    expect(maky.ok && maky.outcome).toBe('open');
    expect(memoryOf(sure(maky), 't2')).toMatchObject({ open: cellsOf(3)[1], turn: { by: 'm4' } });
    // остання пара будь-ким — запис команди
    let all = paired;
    for (let k = 1; k < 6; k++) all = match(all, 't1', k, t + 400 + k, k % 2 === 0 ? 'm1' : 'm2');
    expect(record(all, 't1')).toMatchObject({ grade: 'correct', points: 300 });
    expect(memoryOf(all, 't1')!.by).toEqual(['m1', 'm2', 'm1', 'm2', 'm1', 'm2']);
    expect(record(all, 'm1')).toBeUndefined();
    // у раунді з відповідачем-капітаном ходить і не капітан
    const captain = must(next(teamGame(teamQuiz([classicRound('c1', [memory])], 2, 'captain'), LAYOUT), 0, rng0));
    expect(flip(captain, 't1', a, 1000, 'm2').ok).toBe(true);
  });

  it('the grade is not changed by the host', () => {
    const s = fresh();
    const done = findAll(s, 'p1', 6, T(s) + 40_000);
    expect(override(done, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(override(must(lock(done, T(s) + 41_000)), 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the host sees progress without a verdict', () => {
    const base = fresh();
    const s = findAll(base, 'p1', 2, T(base) + 1000);
    const row = hostLive(s)?.rows.find((r) => r.id === 'p1');
    expect(row?.progress).toEqual({ kind: 'memory', pairs: 2, total: 6, done: false });
  });

  it('a removed player leaves no board', () => {
    const open = fresh();
    const s = match(open, 'p1', 0, T(open) + 1000);
    expect(memoryOf(s, 'p1')).not.toBeNull();
    const removed = must(removePlayer(s, 'p1', T(s) + 2000));
    expect(memoryOf(removed, 'p1')).toBeNull();
    expect(Object.keys(removed.plays[removed.questionIndex].memory!.boards)).toEqual([]);
  });

  it('the next question empties the boards', () => {
    const s = fresh();
    const a = sure(flip(match(s, 'p1', 0, T(s) + 1000), 'p2', 0, T(s) + 2000));
    expect(Object.keys(a.plays[1].memory!.boards).sort()).toEqual(['p1', 'p2']);
    const b = toMemory(must(lock(a, T(s) + 3000)), 'mm2');
    expect(b.plays[1].memory).toEqual({ boards: {} });
    expect(recordOf(b, 1, 'p1')).toMatchObject({ grade: 'wrong', points: 0, answer: { pairs: 1, moves: 1 } });
    expect(recordOf(b, 1, 'p2')).toMatchObject({ grade: 'wrong', points: 0, accuracy: 0 });
    // нічого спорожнювати — той самий масив
    expect(packMemories(b.plays)).toBe(b.plays);
  });
});
