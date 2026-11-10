import { describe, expect, it } from 'vitest';
import { boardRound, classicRound, makeQuiz, makeRoundsQuiz, single, timedlist } from './testing/fixtures';
import { pickCell } from './board';
import { lock, next, pause, resume, start, tick, type GameState } from './game';
import { hostLive } from './live';
import { listEntry } from './timedlist';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const PLAYERS = ['Олена', 'Тарас', 'Віра', 'Хосе'];

function enter(s: GameState, id: string, words: string[], now = 1000): GameState {
  return words.reduce((current, word) => {
    const result = listEntry(current, id, word, true, now);
    if (!result.ok) throw new Error(`listEntry ${word}: ${result.error}`);
    return result.state;
  }, s);
}

/** Олена: Юпітер, Венера, Марс, промах; Тарас: Юпітер, Меркурій; Віра й Хосе: Юпітер. Запитання відкрите. */
function played(): GameState {
  let s = startRound(lobbyWith(makeQuiz([timedlist]), ...PLAYERS), 0);
  s = enter(s, 'p1', ['Юпітер', 'Венера', 'Марс', 'Плутон']);
  s = enter(s, 'p2', ['Юпітер', 'Меркурій']);
  s = enter(s, 'p3', ['Юпітер']);
  return enter(s, 'p4', ['Юпітер']);
}

const stageList = (s: GameState) => {
  const info = stageView(s).timedlist;
  if (info === undefined) throw new Error('no timedlist');
  return info;
};

describe('timed list views', () => {
  it('the public question shows the count and the minus only', () => {
    const s = played();
    expect(stageView(s).question?.timedlist).toEqual({ total: 8, minus: 50 });
    expect(playerView(s, 'p2')?.question?.timedlist).toEqual({ total: 8, minus: 50 });
    expect(stageView(s).question).not.toHaveProperty('items');
  });

  it('never sends an unfound item or a spelling before reveal', () => {
    let s = played();
    for (const phase of ['question', 'locked'] as const) {
      if (phase === 'locked') s = must(lock(s, 5000));
      expect(s.phase).toBe(phase);
      const stage = JSON.stringify(stageView(s));
      for (const secret of ['Меркурій', 'Марс', 'Червона планета', 'Нептун', 'Земля']) expect(stage).not.toContain(secret);
      const p2 = JSON.stringify(playerView(s, 'p2'));
      expect(p2).not.toContain('Марс');
      expect(p2).not.toContain('Венера');
      expect(p2).not.toContain('Червона планета');
      const p3 = JSON.stringify(playerView(s, 'p3'));
      for (const secret of ['Меркурій', 'Марс', 'Венера', 'Червона планета', 'Нептун']) expect(p3).not.toContain(secret);
    }
    const p1 = playerView(played(), 'p1');
    expect(p1?.me.timedlist?.found).toEqual([
      { index: 5, text: 'Юпітер' },
      { index: 2, text: 'Венера' },
      { index: 4, text: 'Марс' },
    ]);
  });

  it('stage rows carry only counts until reveal, then every item with its finders and points', () => {
    let s = played();
    let info = stageList(s);
    expect(info.items).toBeNull();
    expect(info.total).toBe(8);
    expect(info.players).toBe(4);
    expect(info.rows).toEqual([
      { playerId: 'p1', nickname: 'Олена', found: 3, wrong: 1, points: null },
      { playerId: 'p2', nickname: 'Тарас', found: 2, wrong: 0, points: null },
      { playerId: 'p3', nickname: 'Віра', found: 1, wrong: 0, points: null },
      { playerId: 'p4', nickname: 'Хосе', found: 1, wrong: 0, points: null },
    ]);
    s = must(next(must(lock(s, 5000)), 6000));
    expect(s.phase).toBe('reveal');
    info = stageList(s);
    expect(info.items).toHaveLength(8);
    expect(info.items?.[4]).toEqual({ index: 5, text: 'Юпітер', finders: ['p1', 'p2', 'p3', 'p4'], points: 25 });
    expect(info.items?.[1]).toMatchObject({ text: 'Венера', finders: ['p1'], points: 100 });
    expect(info.items?.[2]).toMatchObject({ text: 'Земля', finders: [] });
    expect(JSON.stringify(info)).not.toContain('Червона планета');
    expect(info.rows.map((r) => r.points)).toEqual([25 + 100 + 100 - 50, 25 + 100, 25, 25]);
    expect(playerView(s, 'p2')?.me.timedlist?.found).toEqual([
      { index: 5, text: 'Юпітер' },
      { index: 1, text: 'Меркурій' },
    ]);
  });

  it('the host sees the whole list and the finders live', () => {
    const s = played();
    const info = hostView(s).timedlist;
    expect(info?.items).toHaveLength(8);
    expect(info?.items?.[4]).toEqual({ index: 5, text: 'Юпітер', finders: ['p1', 'p2', 'p3', 'p4'], points: null });
    expect(info?.items?.[3]?.finders).toEqual(['p1']);
    expect(hostLive(s)?.rows.find((r) => r.id === 'p1')?.progress).toEqual({
      kind: 'timedlist',
      found: ['Юпітер', 'Венера', 'Марс'],
      total: 8,
      wrong: 1,
    });
    expect(hostLive(s)?.rows.find((r) => r.id === 'p4')?.answered).toBe(true);
    const idle = startRound(lobbyWith(makeQuiz([timedlist]), ...PLAYERS), 0);
    expect(hostLive(idle)?.rows.map((r) => r.answered)).toEqual([false, false, false, false]);
    expect(stageView(idle).answeredCount).toBe(0);
    expect(stageView(s).answeredCount).toBe(4);
  });

  it('a team member sees the team finds', () => {
    const layout = [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ];
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [timedlist])]), layout), 0));
    s = enter(s, 't1', ['Юпітер']);
    expect(playerView(s, 'm2')?.me.timedlist?.found).toEqual([{ index: 5, text: 'Юпітер' }]);
    expect(playerView(s, 'm1')?.me.timedlist?.found).toEqual([{ index: 5, text: 'Юпітер' }]);
    expect(playerView(s, 'm3')?.me.timedlist?.found).toEqual([]);
  });

  it('canType follows phase, pause and done', () => {
    let s = played();
    expect(playerView(s, 'p1')?.me.timedlist).toMatchObject({ total: 8, wrong: 1, canType: true, done: false });
    const paused = must(pause(s, 2000));
    expect(playerView(paused, 'p1')?.me.timedlist?.canType).toBe(false);
    expect(playerView(must(resume(paused, 3000)), 'p1')?.me.timedlist?.canType).toBe(true);
    s = enter(s, 'p3', ['Меркурій', 'Венера', 'Земля', 'Марс', 'Сатурн', 'Уран', 'Нептун']);
    expect(playerView(s, 'p3')?.me.timedlist).toMatchObject({ canType: false, done: true });
    expect(playerView(s, 'p1')?.me.timedlist?.canType).toBe(true);
    expect(playerView(must(lock(s, 5000)), 'p1')?.me.timedlist?.canType).toBe(false);
  });

  it('other questions keep their views unchanged', () => {
    const s = startRound(lobbyWith(makeQuiz([single]), ...PLAYERS), 0);
    for (const view of [stageView(s), hostView(s), playerView(s, 'p1'), playerView(s, 'p1')?.me]) {
      expect(view).not.toHaveProperty('timedlist');
    }
    expect(stageView(s).question).not.toHaveProperty('timedlist');
  });
});

describe('timed list on a board cell', () => {
  const round = boardRound('b1', [{ title: 'Космос', cells: [{ mark: 'x3', answerMode: 'phone', question: timedlist }] }]);
  const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));

  it('a chooser who typed nothing counts as not answered until the close, then has a record with 0; the other player has no list', () => {
    const s = must(pickCell(lobby, 'p1', 'q11', 0, () => 0));
    expect(playerView(s, 'p1')?.me.timedlist).toMatchObject({ found: [], canType: true, done: false });
    expect(playerView(s, 'p2')?.me).not.toHaveProperty('timedlist');
    expect(stageView(s).answeredCount).toBe(0);
    expect(hostLive(s)?.rows.find((r) => r.id === 'p1')?.answered).toBe(false);
    expect(stageList(s)).toMatchObject({ players: 1, rows: [{ playerId: 'p1', found: 0 }] });
    const typed = enter(s, 'p1', ['Марс']);
    expect(stageView(typed).answeredCount).toBe(1);
    expect(JSON.stringify(stageView(typed))).not.toContain('Марс');
    const closed = tick(s, 90_001);
    expect(stageView(closed).answeredCount).toBe(1);
    expect(stageList(must(next(closed, 91_000)))).toMatchObject({ players: 1, rows: [{ playerId: 'p1', found: 0, points: 0 }] });
  });
});
