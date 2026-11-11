import { describe, expect, it } from 'vitest';
import { lock, next, pause, type GameState } from './game';
import { jigsawHold, jigsawPlace } from './jigsaw';
import { hostView, playerView, stageView } from './views';
import { classicRound, jigsaw, jigsawQuiz } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

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

const fresh = () => toJigsaw(startRound(lobbyWith(jigsawQuiz(), ...PLAYERS), 0));
const teamStart = () => must(next(teamGame(teamQuiz([classicRound('c1', [jigsaw])]), LAYOUT), 0, rng0));
const cell = (piece: number) => ({ piece, x: piece % jigsaw.cols, y: Math.floor(piece / jigsaw.cols), rot: 0 });
const place = (s: GameState, actor: string, piece: number, at: number, member = actor) => must(jigsawPlace(s, actor, member, 0, cell(piece), at));
function build(s: GameState, actor: string, pieces: number[], at: number, member = actor): GameState {
  let cur = s;
  for (const k of pieces) cur = place(cur, actor, k, at, member);
  return cur;
}
const stageInfo = (s: GameState) => {
  const info = stageView(s).jigsaw;
  if (info === undefined) throw new Error('no jigsaw');
  return info;
};
const mine = (s: GameState, id: string, now?: number) => {
  const me = playerView(s, id, now)?.me.jigsaw;
  if (me === undefined) throw new Error('no me.jigsaw');
  return me;
};

describe('jigsaw views', () => {
  it('the question carries the photo and the grid, after an earlier round with its round-local number', () => {
    const s = fresh();
    expect(s.questionIndex).toBe(1);
    const view = playerView(s, 'p1')!;
    expect(view.questionIndex).toBe(0);
    expect(view.question?.imageUrl).toBeNull();
    expect(view.question?.jigsaw).toEqual({ photo: jigsaw.photo, aspect: jigsaw.aspect, focus: jigsaw.focus, rows: 3, cols: 4, tabs: jigsaw.tabs, preview: jigsaw.preview });
    expect(stageView(s).question?.jigsaw?.rows).toBe(3);
    expect(hostView(s).question?.jigsaw?.cols).toBe(4);
    // пазл після раунду: подія з номером у раунді проходить, з індексом plays — ні
    expect(jigsawPlace(s, 'p1', 'p1', 1, cell(0), s.startedAt! + 100)).toEqual({ ok: false, error: 'jigsaw_stale' });
  });

  it('the stage sees every board with progress', () => {
    const s = build(fresh(), 'p1', [0, 1, 2, 3, 4], fresh().startedAt! + 1000);
    for (const info of [stageInfo(s), hostView(s).jigsaw!]) {
      expect(info.boards.map((b) => [b.playerId, b.nickname, b.placed.length, b.total, b.done, b.timeMs, b.points, b.tones])).toEqual([
        ['p1', 'Оля', 5, 12, false, null, null, null],
        ['p2', 'Тарас', 0, 12, false, null, null, null],
        ['p3', 'Петро', 0, 12, false, null, null, null],
      ]);
    }
    // телефон бачить прогрес усіх (план), але власні шматочки й блоки — лише в me.jigsaw
    expect(playerView(s, 'p2')!.jigsaw?.boards[0].placed).toHaveLength(5);
    expect(mine(s, 'p2').placed).toEqual([]);
    expect(mine(s, 'p1')).toMatchObject({ placed: [0, 1, 2, 3, 4], seq: 5, done: false, canPlace: true, result: null });
  });

  it('teams see tones and teammates holds, with the hold reaching the views', () => {
    const s0 = teamStart();
    const t = 1000;
    const a = place(place(s0, 't1', 0, t, 'm1'), 't1', 1, t, 'm2');
    const info = stageInfo(a).boards.find((b) => b.playerId === 't1')!;
    expect(info.tones).toBe('12');
    expect(stageInfo(a).boards).toHaveLength(2);
    const held = must(jigsawHold(a, 't1', 'm1', 0, 3, t + 100));
    // hold не збільшує seq дошки, але змінює стан, а з ним і зріз
    expect(held).not.toBe(a);
    expect(mine(held, 'm2', t + 200).held).toEqual([{ piece: 3, tone: '1' }]);
    expect(mine(held, 'm2', t + 2100).held).toEqual([]);
    expect(mine(held, 'm1', t + 200).held).toEqual([]);
    expect(mine(held, 'm2', t + 200).seq).toBe(mine(a, 'm2', t + 200).seq);
    expect(mine(held, 'm3', t + 200)).toMatchObject({ placed: [], held: [] });
  });

  it('reveal ranks by time', () => {
    const s0 = fresh();
    const T = s0.startedAt!;
    let s = build(s0, 'p3', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], T + 1000);
    s = build(s, 'p2', [0, 1, 2], T + 1000);
    s = place(s, 'p3', 11, T + 10_000);
    s = build(s, 'p1', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], T + 11_000);
    s = place(s, 'p1', 11, T + 20_000);
    const reveal = must(next(must(lock(s, T + 30_000)), T + 31_000, rng0));
    expect(reveal.phase).toBe('reveal');
    const boards = stageInfo(reveal).boards;
    expect(boards.map((b) => [b.playerId, b.done, b.timeMs, b.points])).toEqual([
      ['p3', true, 10_000, 300],
      ['p1', true, 20_000, 150],
      ['p2', false, null, 0],
    ]);
    expect(mine(reveal, 'p1').result).toEqual({ points: 150 });
    expect(mine(reveal, 'p2').result).toEqual({ points: 0 });
  });

  it('can place only while open', () => {
    const s = fresh();
    const T = s.startedAt!;
    expect(mine(s, 'p1').canPlace).toBe(true);
    expect(mine(must(pause(s, T + 10)), 'p1').canPlace).toBe(false);
    const done = build(s, 'p1', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], T + 5000);
    expect(mine(done, 'p1')).toMatchObject({ done: true, canPlace: false, timeMs: 5000 });
    expect(mine(done, 'p2').canPlace).toBe(true);
    const locked = must(lock(build(s, 'p2', [0], T + 10), T + 20));
    expect(mine(locked, 'p2').canPlace).toBe(false);
  });
});
