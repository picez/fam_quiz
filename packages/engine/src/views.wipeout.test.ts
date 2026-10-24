import { describe, expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { lock, next, pause, start, submitAnswer, tick, type GameState } from './game';
import { classicRound, makeRoundsQuiz, single, wipeoutLadder, wipeoutRound } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';
import { decideWipeout } from './wipeout';

const rng = () => 0;
const quiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])], { debuffs: ['fog', 'mud'] });
const lobby = () => lobbyWith(quiz, 'Оля', 'Петро', 'Віра');

const RIGHT: Answer[] = [
  { type: 'single', optionId: 'b' },
  { type: 'boolean', value: true },
  { type: 'numeric', value: 2100 },
  { type: 'text', value: 'Одеса' },
  { type: 'slider', value: 52 },
];
const WRONG: Answer = { type: 'single', optionId: 'a' };

const stage = (s: GameState) => stageView(s);
const phone = (s: GameState, id: string) => must2(playerView(s, id));
function must2<T>(value: T | null): T {
  if (value === null) throw new Error('no view');
  return value;
}

/** Усі відповіли; повертає стан на locked. */
function answered(s: GameState, answers: Record<string, Answer>, now = 1000): GameState {
  let current = s;
  for (const [id, answer] of Object.entries(answers)) current = must(submitAnswer(current, id, answer, now));
  return current.phase === 'question' ? must(lock(current)) : current;
}

/** Перша сходинка зіграна, вікно відкрите о 2000. */
function windowOpen(answers: Record<string, Answer> = { p1: RIGHT[0], p2: RIGHT[0], p3: RIGHT[0] }): GameState {
  const revealed = must(next(answered(startRound(lobby(), 0, rng), answers), 1500, rng));
  return must(next(revealed, 2000, rng));
}

describe('wipeout views (10g)', () => {
  it('the ladder shows prices and everyone in on the intro', () => {
    const s = must(start(lobby()));
    const info = stage(s).wipeout;
    expect(s.phase).toBe('intro');
    expect(info?.ladder).toEqual([100, 200, 300, 400, 500]);
    expect(info?.current).toBe(-1);
    expect(info?.done).toBe(0);
    expect(info?.inCount).toBe(3);
    expect(info?.rows.map((r) => [r.status, r.bank, r.decision])).toEqual([
      ['in', 0, null],
      ['in', 0, null],
      ['in', 0, null],
    ]);
    expect(info?.decide).toBeNull();
  });

  it('no new bank or burn reaches the stage or phones before the reveal', () => {
    // w1: все правильно, вікно закриваємо; w2: p1 правильно, p2 неправильно.
    let s = windowOpen();
    for (const id of ['p1', 'p2', 'p3']) s = must(decideWipeout(s, id, false, 3000));
    s = must(next(s, 13_000, rng));
    expect(s.phase).toBe('question');
    s = answered(s, { p1: RIGHT[1], p2: { type: 'boolean', value: false } }, 14_000);
    for (const view of [JSON.stringify(stage(s)), JSON.stringify(phone(s, 'p2')), JSON.stringify(phone(s, 'p1'))]) {
      expect(view).not.toContain('"burned"');
      expect(view).not.toContain('"bank":300');
    }
    expect(phone(s, 'p2').me.wipeout?.status).toBe('in');
    expect(stage(s).wipeout?.done).toBe(1);
    const locked = s.phase;
    expect(locked).toBe('locked');
    const revealed = must(next(s, 15_000, rng));
    expect(revealed.phase).toBe('reveal');
    const rows = stage(revealed).wipeout?.rows ?? [];
    expect(rows.find((r) => r.playerId === 'p2')?.status).toBe('burned');
    expect(rows.find((r) => r.playerId === 'p1')?.status).toBe('in');
    expect(rows.find((r) => r.playerId === 'p1')?.bank).toBe(300);
    expect(stage(revealed).wipeout?.done).toBe(2);
  });

  it('phones and the stage see only who decided; the host sees the choice', () => {
    let s = windowOpen();
    s = must(decideWipeout(s, 'p1', true, 3000));
    const rowOf = (info: ReturnType<typeof stage>['wipeout'], id: string) => info?.rows.find((r) => r.playerId === id);
    expect(rowOf(stage(s).wipeout, 'p1')?.decision).toBe('decided');
    expect(rowOf(stage(s).wipeout, 'p2')?.decision).toBe('pending');
    expect(rowOf(phone(s, 'p2').wipeout, 'p1')?.decision).toBe('decided');
    expect(rowOf(hostView(s).wipeout, 'p1')?.decision).toBe('take');
    expect(rowOf(hostView(s).wipeout, 'p2')?.decision).toBe('pending');
    const json = JSON.stringify(stage(s));
    expect(json).not.toContain('"take"');
    expect(json).not.toContain('"stay"');
    // статус забраного не видно сцені, доки вікно відкрите
    expect(rowOf(stage(s).wipeout, 'p1')?.status).toBe('in');
    expect(rowOf(hostView(s).wipeout, 'p1')?.status).toBe('took');
    // і чужий рахунок у таблиці теж не змінився
    const other = phone(s, 'p2').table?.rows.find((r) => r.participantId === 'p1');
    expect(other?.score).toBe(0);
    expect(phone(s, 'p1').me.score).toBe(100);
    s = must(decideWipeout(s, 'p2', false, 3500));
    expect(JSON.stringify(stage(s))).not.toContain('"stay"');
    expect(rowOf(hostView(s).wipeout, 'p2')?.decision).toBe('stay');
  });

  it('the window carries its clock', () => {
    let s = windowOpen();
    expect(stage(s).wipeout?.decide).toEqual({ endsAt: s.endsAt, remainingMs: null, decided: 0, total: 3 });
    expect(s.endsAt).toBe(12_000);
    s = must(decideWipeout(s, 'p1', false, 3000));
    expect(stage(s).wipeout?.decide?.decided).toBe(1);
    s = must(pause(s, 6000));
    expect(stage(s).wipeout?.decide).toEqual({ endsAt: null, remainingMs: 6000, decided: 1, total: 3 });
  });

  it('me.wipeout: canDecide only in the window, for those in who have not decided', () => {
    const s = windowOpen({ p1: RIGHT[0], p2: RIGHT[0], p3: WRONG });
    expect(phone(s, 'p1').me.wipeout).toEqual({ status: 'in', bank: 100, decision: null, canDecide: true });
    expect(phone(s, 'p3').me.wipeout).toEqual({ status: 'burned', bank: 0, decision: null, canDecide: false });
    const decided = must(decideWipeout(s, 'p1', true, 3000));
    expect(phone(decided, 'p1').me.wipeout).toEqual({ status: 'took', bank: 100, decision: 'take', canDecide: false });
    expect(phone(decided, 'p2').me.wipeout?.canDecide).toBe(true);
    const paused = must(pause(s, 4000));
    expect(phone(paused, 'p2').me.wipeout?.canDecide).toBe(false);
    // за межами вікна — теж ні
    const closed = tick(s, s.endsAt ?? 0);
    expect(phone(closed, 'p2').me.wipeout?.canDecide).toBe(false);
    expect(phone(closed, 'p2').me.wipeout?.status).toBe('took');
  });

  it('the ladder replaces the leaderboard, the table button still works', () => {
    const s = windowOpen();
    expect(s.phase).toBe('leaderboard');
    expect(stage(s).standings).toBeNull();
    expect(phone(s, 'p1').standings).toBeNull();
    expect(phone(s, 'p1').table).not.toBeNull();
  });

  it('the host loses the debuff menu during the round', () => {
    const s = startRound(lobby(), 0, rng);
    expect(hostView(s).allowed.debuffs).toEqual([]);
    expect(hostView(windowOpen()).allowed.debuffs).toEqual([]);
    // на round_end меню повертається
    let end = windowOpen();
    for (let i = 0; i < 5 && end.phase !== 'round_end'; i += 1) {
      if (end.phase === 'leaderboard') end = tick(end, end.endsAt ?? 0);
      end = end.phase === 'question' ? must(lock(end)) : end;
      end = must(next(end, 20_000, rng));
    }
    expect(end.phase).toBe('round_end');
    expect(hostView(end).allowed.debuffs).toEqual(['fog', 'mud']);
  });

  it('outside wipeout there is no ladder', () => {
    const classic = startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро'), 0, rng);
    expect(stage(classic).wipeout).toBeNull();
    expect(phone(classic, 'p1').wipeout).toBeNull();
    expect(phone(classic, 'p1').me.wipeout).toBeNull();
    expect(hostView(classic).wipeout).toBeNull();
  });
});
