import { describe, expect, it } from 'vitest';
import type { MoreLessSide } from '@quiz/shared';
import { pickCell } from './board';
import { boardRound, classicRound, makeQuiz, makeRoundsQuiz, moreless, single } from './testing/fixtures';
import { lock, next, pause, resume, start, type GameState } from './game';
import { hostLive } from './live';
import { moreLessOf, moreLessPick } from './moreless';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const PLAYERS = ['Олена', 'Тарас', 'Віра'];

function picks(s: GameState, id: string, sides: MoreLessSide[], now = 1000): GameState {
  return sides.reduce((current, side) => must(moreLessPick(current, id, moreLessOf(current, id).picks.length, side, now)), s);
}

/** Олена пройшла все правильно (є запис), Тарас — a, a; Віра нічого. */
function played(): GameState {
  return picks(picks(startRound(lobbyWith(makeQuiz([moreless]), ...PLAYERS), 0), 'p1', ['a', 'b', 'a']), 'p2', ['a', 'a']);
}

const stageInfo = (s: GameState) => {
  const info = stageView(s).moreless;
  if (info === undefined) throw new Error('no moreless');
  return info;
};

describe('more or less views', () => {
  it('the public question shows the texts only', () => {
    const s = played();
    const expected = { id: 'm1', prompt: 'Що вище?', a: 'Говерла', b: 'Ейфелева вежа', points: 100 };
    expect(stageView(s).question?.moreless?.pairs[0]).toEqual(expected);
    expect(playerView(s, 'p2')?.question?.moreless?.pairs[0]).toEqual(expected);
    expect(stageView(s).question?.moreless?.pairs).toHaveLength(3);
    const question = JSON.stringify(stageView(s).question);
    expect(question).not.toContain('2061');
    expect(question).not.toContain('correct');
  });

  it('never sends a value, the right side or a grade before reveal', () => {
    let s = played();
    for (const phase of ['question', 'locked'] as const) {
      if (phase === 'locked') s = must(lock(s, 5000));
      expect(s.phase).toBe(phase);
      for (const json of [JSON.stringify(stageView(s)), JSON.stringify(playerView(s, 'p2')), JSON.stringify(playerView(s, 'p1')), JSON.stringify(playerView(s, 'p3'))]) {
        for (const secret of ['2061', '330 м', '2850', '"correct"', '"grade"', '"right":2', '"right":3']) expect(json).not.toContain(secret);
      }
    }
    const own = playerView(played(), 'p1');
    expect(own?.me.moreless).toEqual({ done: 3, total: 3, picks: ['a', 'b', 'a'], canPick: false, marks: null, points: null });
    expect(own?.me.answer).toBeNull();
    expect(own?.me.result).toBeNull();
  });

  it('stage rows carry how far each got until reveal, then right counts and points', () => {
    let s = played();
    let info = stageInfo(s);
    expect(info.pairs).toBeNull();
    expect(info.picks).toBeNull();
    expect(info.rows).toEqual([
      { playerId: 'p1', nickname: 'Олена', done: 3, total: 3, right: null, points: null },
      { playerId: 'p2', nickname: 'Тарас', done: 2, total: 3, right: null, points: null },
      { playerId: 'p3', nickname: 'Віра', done: 0, total: 3, right: null, points: null },
    ]);
    s = must(next(must(lock(s, 5000)), 6000));
    expect(s.phase).toBe('reveal');
    info = stageInfo(s);
    expect(info.rows).toEqual([
      { playerId: 'p1', nickname: 'Олена', done: 3, total: 3, right: 3, points: 400 },
      { playerId: 'p2', nickname: 'Тарас', done: 2, total: 3, right: 1, points: 100 },
      { playerId: 'p3', nickname: 'Віра', done: 0, total: 3, right: 0, points: 0 },
    ]);
    expect(info.pairs).toEqual([
      { id: 'm1', prompt: 'Що вище?', a: { text: 'Говерла', value: '2061 м' }, b: { text: 'Ейфелева вежа', value: '330 м' }, correct: 'a', points: 100, right: 2 },
      { id: 'm2', prompt: 'Що довше?', a: { text: 'Рейн', value: '1233 км' }, b: { text: 'Дунай', value: '2850 км' }, correct: 'b', points: 100, right: 1 },
      { id: 'm3', prompt: 'Що глибше?', a: { text: 'Світязь', value: '58 м' }, b: { text: 'Синевир', value: '22 м' }, correct: 'a', points: 200, right: 1 },
    ]);
    expect(info.picks).toBeNull();
  });

  it('the player sees own marks on reveal', () => {
    const s = must(next(must(lock(played(), 5000)), 6000));
    expect(playerView(s, 'p2')?.me.moreless).toEqual({ done: 2, total: 3, picks: ['a', 'a'], canPick: false, marks: ['right', 'wrong', 'late'], points: 100 });
    expect(playerView(s, 'p1')?.me.moreless).toMatchObject({ marks: ['right', 'right', 'right'], points: 400 });
  });

  it('the host sees values and picks live', () => {
    const s = played();
    const info = hostView(s).moreless;
    expect(info?.pairs?.[0].a.value).toBe('2061 м');
    expect(info?.pairs?.[0].correct).toBe('a');
    expect(info?.picks).toEqual({ p1: ['a', 'b', 'a'], p2: ['a', 'a'], p3: [] });
    expect(info?.rows).toEqual([
      { playerId: 'p1', nickname: 'Олена', done: 3, total: 3, right: 3, points: null },
      { playerId: 'p2', nickname: 'Тарас', done: 2, total: 3, right: 1, points: null },
      { playerId: 'p3', nickname: 'Віра', done: 0, total: 3, right: 0, points: null },
    ]);
    const live = hostLive(s);
    expect(live?.rows.find((r) => r.id === 'p2')?.progress).toEqual({ kind: 'moreless', done: 2, total: 3, right: 1 });
    expect(live?.rows.find((r) => r.id === 'p2')?.answered).toBe(true);
    expect(live?.rows.find((r) => r.id === 'p3')?.answered).toBe(false);
    expect(live?.rows.find((r) => r.id === 'p1')?.answered).toBe(true);
    expect(stageView(s).answeredCount).toBe(2);
  });

  it('a team member watches the answerer progress', () => {
    const layout = [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ];
    const s = picks(must(next(teamGame(teamQuiz([classicRound('r1', [moreless])]), layout), 0)), 't1', ['a', 'a']);
    expect(playerView(s, 'm1')?.me.moreless).toMatchObject({ done: 2, picks: ['a', 'a'], canPick: true });
    expect(playerView(s, 'm2')?.me.moreless).toMatchObject({ done: 2, picks: ['a', 'a'], canPick: false });
    expect(playerView(s, 'm3')?.me.moreless).toMatchObject({ done: 0, canPick: true });
    expect(playerView(s, 'm4')?.me.moreless).toMatchObject({ done: 0, canPick: false });
  });

  it('on a board cell only the chooser has a row and a pad', () => {
    const round = boardRound('b1', [{ title: 'Порівняння', cells: [{ mark: 'x3', answerMode: 'phone', question: moreless }] }]);
    const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));
    const s = must(pickCell(lobby, 'p1', 'q14', 0, () => 0));
    expect(playerView(s, 'p1')?.me.moreless).toMatchObject({ done: 0, canPick: true });
    expect(playerView(s, 'p2')?.me).not.toHaveProperty('moreless');
    expect(stageInfo(s).rows.map((r) => r.playerId)).toEqual(['p1']);
  });

  it('canPick follows phase, pause and the end of the row', () => {
    const s = startRound(lobbyWith(makeQuiz([moreless]), ...PLAYERS), 0);
    expect(playerView(s, 'p1')?.me.moreless?.canPick).toBe(true);
    const paused = must(pause(s, 2000));
    expect(playerView(paused, 'p1')?.me.moreless?.canPick).toBe(false);
    expect(playerView(must(resume(paused, 3000)), 'p1')?.me.moreless?.canPick).toBe(true);
    expect(playerView(must(lock(s, 5000)), 'p1')?.me.moreless?.canPick).toBe(false);
    expect(playerView(picks(s, 'p1', ['a', 'b', 'a']), 'p1')?.me.moreless?.canPick).toBe(false);
  });

  it('other questions keep their views unchanged', () => {
    const s = startRound(lobbyWith(makeQuiz([single]), ...PLAYERS), 0);
    for (const view of [stageView(s), hostView(s), playerView(s, 'p1'), playerView(s, 'p1')?.me]) {
      expect(view).not.toHaveProperty('moreless');
    }
    expect(stageView(s).question).not.toHaveProperty('moreless');
  });
});
