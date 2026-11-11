import { describe, expect, it } from 'vitest';
import { lock, next, type GameState } from './game';
import { spotdiffTap } from './spotdiff';
import { hostView, playerView, stageView } from './views';
import { classicRound, spotdiff, spotdiffQuiz } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const PLAYERS = ['Оля', 'Тарас', 'Петро'];
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const rng0 = () => 0;

/** Пройти перший раунд і відкрити «Знайди відмінності» другого: номер у раунді 0, індекс у plays 1. */
function toSpot(s0: GameState): GameState {
  let s = s0;
  if (s.phase === 'question') s = must(lock(s, 1000));
  for (let i = 0; i < 12 && !(s.phase === 'question' && s.plays[s.questionIndex].question.type === 'spotdiff'); i++) s = must(next(s, 2000, rng0));
  return s;
}

const fresh = () => toSpot(startRound(lobbyWith(spotdiffQuiz(), ...PLAYERS), 0));
const teamStart = () => must(next(teamGame(teamQuiz([classicRound('c1', [spotdiff])]), LAYOUT), 0, rng0));
const tap = (s: GameState, actor: string, i: number, at: number, member = actor): GameState => {
  const c = spotdiff.spots[i];
  return must(spotdiffTap(s, actor, member, 0, { x: c.x, y: c.y, width: 400 }, at));
};
const stageInfo = (s: GameState) => {
  const info = stageView(s).spotdiff;
  if (info === undefined) throw new Error('no spotdiff');
  return info;
};
const mine = (s: GameState, id: string) => {
  const me = playerView(s, id)?.me.spotdiff;
  if (me === undefined) throw new Error('no me.spotdiff');
  return me;
};
const revealed = (s: GameState, T: number) => must(next(must(lock(s, T + 60_000)), T + 61_000, rng0));

describe('spotdiff views', () => {
  it('spots stay secret until reveal', () => {
    const s0 = fresh();
    const T = s0.startedAt!;
    expect(s0.questionIndex).toBe(1);
    const s = tap(tap(s0, 'p1', 0, T + 1000), 'p1', 1, T + 2000);
    const view = playerView(s, 'p2')!;
    expect(view.question?.imageUrl).toBeNull();
    expect(view.question?.spotdiff).toEqual({ original: spotdiff.original, changed: spotdiff.changed, aspect: spotdiff.aspect, total: 3, spots: null });
    expect(stageView(s).question?.spotdiff?.spots).toBeNull();
    const locked = must(lock(s, T + 5000));
    expect(locked.phase).toBe('locked');
    expect(stageView(locked).question?.spotdiff?.spots).toBeNull();
    for (const json of [JSON.stringify(stageView(locked)), JSON.stringify(playerView(locked, 'p2')), JSON.stringify(stageView(s)), JSON.stringify(view)]) {
      expect(json).not.toContain('0.85');
    }
    const reveal = revealed(s, T);
    expect(reveal.phase).toBe('reveal');
    expect(stageView(reveal).question?.spotdiff?.spots).toEqual(spotdiff.spots);
    expect(stageView(reveal).question?.imageUrl).toBeNull();
  });

  it('the stage sees counts only', () => {
    const s0 = fresh();
    const T = s0.startedAt!;
    const s = tap(tap(s0, 'p1', 0, T + 1000), 'p1', 1, T + 2000);
    const info = stageInfo(s);
    expect(info.boards.map((b) => [b.playerId, b.nickname, b.found, b.total, b.done, b.timeMs, b.points])).toEqual([
      ['p1', 'Оля', 2, 3, false, null, null],
      ['p2', 'Тарас', 0, 3, false, null, null],
      ['p3', 'Петро', 0, 3, false, null, null],
    ]);
    expect(Object.keys(info.boards[0])).not.toContain('spots');
    expect(JSON.stringify(info)).not.toContain('"x"');
    // запис відповіді не тече до розкриття
    expect(JSON.stringify(stageView(must(lock(s, T + 5000))))).not.toContain('"type":"spotdiff","found"');
  });

  it('the host sees the places', () => {
    const s0 = fresh();
    const T = s0.startedAt!;
    const s = tap(tap(s0, 'p1', 1, T + 1000), 'p1', 0, T + 2000);
    const host = hostView(s).spotdiff!;
    expect(host.spots).toEqual(spotdiff.spots);
    expect(host.boards.find((b) => b.playerId === 'p1')).toMatchObject({ found: 2, spots: [1, 0] });
    expect(host.boards.find((b) => b.playerId === 'p2')).toMatchObject({ found: 0, spots: [] });
  });

  it('a phone sees its own finds with tones', () => {
    const s0 = fresh();
    const T = s0.startedAt!;
    const s = tap(s0, 'p1', 2, T + 1000);
    expect(mine(s, 'p1').found).toEqual([{ index: 2, ...spotdiff.spots[2], tone: null }]);
    expect(mine(s, 'p2').found).toEqual([]);
    expect(mine(s, 'p1')).toMatchObject({ total: 3, done: false, canTap: true, seq: 1, timeMs: null, result: null });

    const t0 = teamStart();
    const tt = t0.startedAt!;
    const a = tap(tap(t0, 't1', 0, tt + 1000, 'm1'), 't1', 1, tt + 2000, 'm2');
    expect(mine(a, 'm2').found.map((f) => [f.index, f.tone])).toEqual([[0, '1'], [1, '2']]);
    expect(mine(a, 'm1').found).toHaveLength(2);
    expect(mine(a, 'm3').found).toEqual([]);
    expect(JSON.stringify(playerView(a, 'm3'))).not.toContain('0.6');
  });

  it('reveal ranks by finds', () => {
    const s0 = fresh();
    const T = s0.startedAt!;
    let s = tap(s0, 'p2', 0, T + 1000);
    s = tap(tap(tap(s, 'p3', 0, T + 1000), 'p3', 1, T + 5000), 'p3', 2, T + 9000);
    s = tap(tap(tap(s, 'p1', 0, T + 1000), 'p1', 1, T + 3000), 'p1', 2, T + 4000);
    const reveal = revealed(s, T);
    expect(stageInfo(reveal).boards.map((b) => [b.playerId, b.found, b.done, b.timeMs, b.points])).toEqual([
      ['p1', 3, true, 4000, 300],
      ['p3', 3, true, 9000, 300],
      ['p2', 1, false, null, 100],
    ]);
    expect(mine(reveal, 'p2').result).toEqual({ points: 100 });
    expect(mine(reveal, 'p1')).toMatchObject({ result: { points: 300 }, done: true, timeMs: 4000 });
  });

  it('can tap only while open', () => {
    const s0 = fresh();
    const T = s0.startedAt!;
    expect(mine(s0, 'p1').canTap).toBe(true);
    const full = tap(tap(tap(s0, 'p1', 0, T + 1000), 'p1', 1, T + 2000), 'p1', 2, T + 3000);
    expect(mine(full, 'p1').canTap).toBe(false);
    expect(mine(full, 'p2').canTap).toBe(true);
    expect(mine(must(lock(s0, T + 5000)), 'p1').canTap).toBe(false);
  });
});
