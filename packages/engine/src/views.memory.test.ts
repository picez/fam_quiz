import { describe, expect, it } from 'vitest';
import { memoryLayout } from '@quiz/shared';
import { lock, next, pause, removePlayer, type GameState } from './game';
import { memoryFlip, type MemoryFlip } from './memory';
import { hostView, playerView, stageView } from './views';
import { classicRound, memory, memoryQuiz } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

/** p1 Оля, p2 Тарас, p3 Петро. */
const PLAYERS = ['Оля', 'Тарас', 'Петро'];
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const rng0 = () => 0;
const LAYOUT_6 = memoryLayout(6, 42);
const cellsOf = (pair: number): [number, number] => [LAYOUT_6.indexOf(2 * pair), LAYOUT_6.indexOf(2 * pair + 1)];
const TEXTS = memory.pairs.flatMap((p) => [p.a.text, p.b.text]).filter((t) => t !== '');
const IMAGE = memory.pairs[5].b.imageUrl!;

function toMemory(s0: GameState): GameState {
  let s = s0;
  if (s.phase === 'question') s = must(lock(s, 1000));
  for (let i = 0; i < 20 && !(s.phase === 'question' && s.plays[s.questionIndex].question.id === 'mm1'); i++) s = must(s.phase === 'question' ? lock(s, 2000) : next(s, 2000, rng0));
  return s;
}
const fresh = () => toMemory(startRound(lobbyWith(memoryQuiz(), ...PLAYERS), 0));
const teamStart = () => toMemory(must(next(teamGame(teamQuiz([classicRound('c0', [{ ...memory, id: 'x0' }]), classicRound('c1', [memory])]), LAYOUT), 0, rng0)));
const T = (s: GameState) => s.startedAt!;
function sure(flip: MemoryFlip): GameState {
  if (!flip.ok) throw new Error(flip.error);
  return flip.state;
}
const flip = (s: GameState, actor: string, cell: number, now: number, member = actor, qi = 0) => sure(memoryFlip(s, actor, member, qi, cell, now));
const match = (s: GameState, actor: string, pair: number, now: number, member = actor, qi = 0) => {
  const [a, b] = cellsOf(pair);
  return flip(flip(s, actor, a, now, member, qi), actor, b, now, member, qi);
};
const miss = (s: GameState, actor: string, now: number, member = actor) => flip(flip(s, actor, cellsOf(0)[0], now, member), actor, cellsOf(1)[0], now, member);
const mine = (s: GameState, id: string, now?: number) => {
  const me = playerView(s, id, now)?.me.memory;
  if (me === undefined) throw new Error('no me.memory');
  return me;
};
const stageInfo = (s: GameState) => {
  const info = stageView(s).memory;
  if (info === undefined) throw new Error('no memory');
  return info;
};
const revealed = (s: GameState, at: number) => must(next(must(lock(s, at)), at + 1000, rng0));

describe('memory views', () => {
  it('closed cards never reach a phone', () => {
    const s0 = fresh();
    expect(s0.questionIndex).toBe(1);
    const t = T(s0);
    for (const s of [s0, must(lock(s0, t + 5000))]) {
      const q = playerView(s, 'p1')!.question!;
      expect(q.memory).toEqual({ id: 'mm1', grid: '3x4', cols: 3, rows: 4, total: 6, pairs: null });
      expect(Object.keys(q.memory!)).not.toContain('seed');
      expect(q.choices).toEqual([]);
      expect(q.right).toEqual([]);
      expect(q.imageUrl).toBeNull();
    }
    const cell = cellsOf(0)[0];
    const s = flip(s0, 'p1', cell, t + 1000);
    const text = LAYOUT_6[cell] % 2 === 0 ? memory.pairs[0].a.text : memory.pairs[0].b.text;
    const secret = [...TEXTS.filter((x) => x !== text), IMAGE, '"seed":42'];
    for (const json of [JSON.stringify(stageView(s)), JSON.stringify(hostView(s)), JSON.stringify(playerView(s, 'p2', t + 1000)), JSON.stringify(playerView(s, 'p3', t + 1000))]) {
      for (const word of secret) expect(json).not.toContain(word);
      expect(json).not.toContain(text);
    }
    const own = JSON.stringify(playerView(s, 'p1', t + 1000));
    expect(own).toContain(text);
    for (const word of secret) expect(own).not.toContain(word);
    const me = mine(s, 'p1', t + 1000);
    expect(me.cells).toHaveLength(12);
    expect(me.cells.filter((c) => c !== null)).toHaveLength(1);
    expect(me.cells[cell]).toEqual({ text, imageUrl: null, state: 'open', tone: null });
    // телефон іншого гравця не має карток
    expect(mine(s, 'p2', t + 1000).cells.every((c) => c === null)).toBe(true);
    const r = revealed(s, t + 5000);
    expect(r.phase).toBe('reveal');
    expect(stageView(r).question?.memory?.pairs).toEqual(memory.pairs);
    const all = mine(r, 'p1').cells;
    expect(all).toHaveLength(12);
    expect(all.every((c) => c !== null)).toBe(true);
    expect(all.filter((c) => c?.imageUrl === IMAGE)).toHaveLength(1);
  });

  it('a wrong pair is visible while shown', () => {
    const s0 = fresh();
    const t = T(s0) + 1000;
    const s = miss(s0, 'p1', t);
    const [c1, c2] = [cellsOf(0)[0], cellsOf(1)[0]];
    const at500 = mine(s, 'p1', t + 500);
    expect(at500.closesInMs).toBe(500);
    expect(at500.cells.flatMap((c, i) => (c === null ? [] : [[i, c.state]]))).toEqual([c1, c2].sort((a, b) => a - b).map((i) => [i, 'shown']));
    expect(at500.canFlip).toBe(false);
    expect(at500.moves).toBe(1);
    const at1000 = mine(s, 'p1', t + 1000);
    expect(at1000.cells.every((c) => c === null)).toBe(true);
    expect(at1000.closesInMs).toBeNull();
    expect(at1000.canFlip).toBe(true);
  });

  it('the stage and host get counts only', () => {
    const s0 = fresh();
    const t = T(s0);
    const s = flip(match(match(s0, 'p1', 0, t + 1000), 'p1', 1, t + 2000), 'p1', cellsOf(2)[0], t + 3000);
    for (const info of [stageInfo(s), hostView(s).memory!]) {
      expect(info.boards.map((b) => [b.playerId, b.nickname, b.pairs, b.total, b.moves, b.done, b.timeMs, b.points])).toEqual([
        ['p1', 'Оля', 2, 6, 2, false, null, null],
        ['p2', 'Тарас', 0, 6, 0, false, null, null],
        ['p3', 'Петро', 0, 6, 0, false, null, null],
      ]);
      for (const b of info.boards) {
        expect(Object.keys(b)).not.toContain('cells');
        expect(Object.keys(b)).not.toContain('matched');
      }
    }
    expect(playerView(s, 'p2')!.memory?.boards).toHaveLength(3);
    // поза запитанням зрізу немає
    expect(stageView(lobbyWith(memoryQuiz(), ...PLAYERS)).memory).toBeUndefined();
  });

  it('teammates see the move and the finder colours', () => {
    const s0 = teamStart();
    expect(s0.plays[s0.questionIndex].question.id).toBe('mm1');
    const t = T(s0);
    const done = match(s0, 't1', 0, t + 1000, 'm1');
    const first = cellsOf(1)[0];
    const s = flip(done, 't1', first, t + 2000, 'm1');
    const tarasView = mine(s, 'm2', t + 2500);
    expect(tarasView.cells[first]).toMatchObject({ state: 'open', tone: '1' });
    expect(tarasView.busy).toEqual({ nickname: 'Оля', tone: '1' });
    expect(tarasView.canFlip).toBe(false);
    for (const c of cellsOf(0)) expect(tarasView.cells[c]).toMatchObject({ state: 'matched', tone: '1' });
    const olya = mine(s, 'm1', t + 2500);
    expect(olya.busy).toBeNull();
    expect(olya.canFlip).toBe(true);
    // суперники нічого не бачать
    const rival = mine(s, 'm3', t + 2500);
    expect(rival.cells.every((c) => c === null)).toBe(true);
    expect(rival.busy).toBeNull();
    expect(rival.canFlip).toBe(true);
    // хід спливає за 5 с: перша картка закрита, сітка вільна
    const later = mine(s, 'm2', t + 2000 + 5000);
    expect(later.cells[first]).toBeNull();
    expect(later.busy).toBeNull();
    expect(later.canFlip).toBe(true);
  });

  it('a removed teammate hands the move back and a foreign turn blocks flips', () => {
    const s0 = teamStart();
    const t = T(s0);
    const s = flip(s0, 't1', cellsOf(0)[0], t + 1000, 'm1');
    expect(mine(s, 'm2', t + 1500).canFlip).toBe(false);
    const gone = must(removePlayer(s, 'm1', t + 1600));
    const after = mine(gone, 'm2', t + 1700);
    expect(after.cells.every((c) => c === null)).toBe(true);
    expect(after.busy).toBeNull();
    expect(after.canFlip).toBe(true);
    // the move stays with an unknown person (should have been dropped) - the card still cannot be flipped
    const board = s.plays[s.questionIndex].memory!.boards.t1;
    const ghost: GameState = {
      ...s,
      plays: s.plays.map((play, i) => (i === s.questionIndex ? { ...play, memory: { ...play.memory!, boards: { ...play.memory!.boards, t1: { ...board, turn: { ...board.turn!, by: 'ghost' } } } } } : play)),
    };
    const blocked = mine(ghost, 'm2', t + 1700);
    expect(blocked.busy).toBeNull();
    expect(blocked.canFlip).toBe(false);
  });

  it('no flips during the intro', () => {
    const s0 = fresh();
    expect(mine(s0, 'p1', T(s0) - 1).canFlip).toBe(false);
    expect(mine(s0, 'p1', T(s0)).canFlip).toBe(true);
  });

  it('reveal ranks by time', () => {
    const s0 = fresh();
    const t = T(s0);
    let s = s0;
    for (let k = 0; k < 6; k++) s = match(s, 'p2', k, t + 10_000);
    expect(s.phase).toBe('question');
    s = match(match(s, 'p1', 0, t + 11_000), 'p1', 1, t + 11_000);
    for (let k = 0; k < 6; k++) s = match(s, 'p3', k, t + 20_000);
    const r = revealed(s, t + 30_000);
    expect(r.phase).toBe('reveal');
    const boards = stageInfo(r).boards;
    expect(boards.map((b) => [b.playerId, b.pairs, b.done, b.timeMs])).toEqual([
      ['p2', 6, true, 10_000],
      ['p3', 6, true, 20_000],
      ['p1', 2, false, null],
    ]);
    expect(boards.map((b) => b.points)).toEqual([300, 150, 0]);
    expect(mine(r, 'p3').result).toEqual({ points: 150 });
    expect(mine(r, 'p1').result).toEqual({ points: 0 });
  });

  it('can flip only while open', () => {
    const s0 = fresh();
    const t = T(s0);
    expect(mine(s0, 'p1', t + 100).canFlip).toBe(true);
    expect(mine(must(pause(s0, t + 200)), 'p1', t + 300).canFlip).toBe(false);
    expect(mine(miss(s0, 'p1', t + 1000), 'p1', t + 1200).canFlip).toBe(false);
    let full = s0;
    for (let k = 0; k < 5; k++) full = match(full, 'p1', k, t + 1000);
    expect(mine(full, 'p1', t + 1100).canFlip).toBe(true);
    const won = match(full, 'p1', 5, t + 2000);
    expect(mine(won, 'p1', t + 2100).done).toBe(true);
    expect(mine(won, 'p1', t + 2100).canFlip).toBe(false);
    expect(mine(must(lock(s0, t + 3000)), 'p1', t + 3100).canFlip).toBe(false);
  });
});
