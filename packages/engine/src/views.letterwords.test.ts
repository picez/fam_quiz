import { describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { boardRound, classicRound, letterwords, letterwordsRandom, makeQuiz, makeRoundsQuiz, single } from './testing/fixtures';
import { pickCell } from './board';
import { lock, next, pause, resume, start, type GameState } from './game';
import { hostLive } from './live';
import { dealLetters, letterWord, lettersDue } from './letterwords';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const PLAYERS = ['Олена', 'Тарас', 'Віра'];
const BEST = ['комісар', 'самотік'];
const nouns = new Set(['кіт', 'сік', 'рот', 'сом', 'морква']);
const isNoun = (key: string) => nouns.has(key);

function add(s: GameState, id: string, words: string[], now = 1000): GameState {
  return words.reduce((current, word) => {
    const result = letterWord(current, id, word, now, isNoun);
    if (!result.ok) throw new Error(`letterWord ${word}: ${result.error}`);
    return result.state;
  }, s);
}

function dealt(s: GameState): GameState {
  const due = lettersDue(s);
  if (due === null) throw new Error('nothing to deal');
  return dealLetters(s, { letters: due.letters ?? [...'квітнесар'], best: BEST, possible: 196 });
}

/** Олена: кіт, сік, морква; Тарас: рот, сом. Запитання відкрите й роздане. */
function played(question: Question = letterwords): GameState {
  let s = dealt(startRound(lobbyWith(makeQuiz([question]), ...PLAYERS), 0));
  s = add(s, 'p1', ['кіт', 'сік', 'морква']);
  return add(s, 'p2', ['рот', 'сом']);
}

const stageInfo = (s: GameState) => {
  const info = stageView(s).letterwords;
  if (info === undefined) throw new Error('no letterwords');
  return info;
};

describe('letter words views', () => {
  it('the public question shows the letters, the goal and the unit only', () => {
    const s = played();
    expect(stageView(s).question?.letterwords).toEqual({ letters: [...'морквасті'], goal: 'most', per: 'word', unit: 20 });
    expect(playerView(s, 'p2')?.question?.letterwords).toEqual({ letters: [...'морквасті'], goal: 'most', per: 'word', unit: 20 });
    expect(stageView(s).question).not.toHaveProperty('set');
    const random = startRound(lobbyWith(makeQuiz([letterwordsRandom]), ...PLAYERS), 0);
    expect(stageView(random).question?.letterwords).toEqual({ letters: [], goal: 'longest', per: 'letter', unit: 10 });
    expect(stageView(dealt(random)).question?.letterwords?.letters).toEqual([...'квітнесар']);
  });

  it('never sends a word or the best words before reveal', () => {
    let s = played();
    for (const phase of ['question', 'locked'] as const) {
      if (phase === 'locked') s = must(lock(s, 5000));
      expect(s.phase).toBe(phase);
      const stage = JSON.stringify(stageView(s));
      for (const secret of ['морква', 'кіт', 'комісар', 'самотік', '196']) expect(stage).not.toContain(secret);
      const p2 = JSON.stringify(playerView(s, 'p2'));
      expect(p2).not.toContain('морква');
      expect(p2).not.toContain('комісар');
      expect(p2).not.toContain('196');
      const p3 = JSON.stringify(playerView(s, 'p3'));
      for (const secret of ['морква', 'кіт', 'рот', 'комісар']) expect(p3).not.toContain(secret);
    }
    expect(playerView(played(), 'p1')?.me.letterwords?.words).toEqual([
      { text: 'кіт', letters: 3 },
      { text: 'сік', letters: 3 },
      { text: 'морква', letters: 6 },
    ]);
  });

  it('stage rows carry counts until reveal, then the best words and points', () => {
    let s = played();
    let info = stageInfo(s);
    expect(info.best).toBeNull();
    expect(info.possible).toBeNull();
    expect(info.words).toBeNull();
    expect(info.rows).toEqual([
      { playerId: 'p1', nickname: 'Олена', found: 3, top: null, more: null, points: null },
      { playerId: 'p2', nickname: 'Тарас', found: 2, top: null, more: null, points: null },
      { playerId: 'p3', nickname: 'Віра', found: 0, top: null, more: null, points: null },
    ]);
    s = must(next(must(lock(s, 5000)), 6000));
    expect(s.phase).toBe('reveal');
    info = stageInfo(s);
    expect(info.rows).toEqual([
      { playerId: 'p1', nickname: 'Олена', found: 3, top: ['морква', 'кіт', 'сік'], more: 0, points: 60 },
      { playerId: 'p2', nickname: 'Тарас', found: 2, top: ['рот', 'сом'], more: 0, points: 40 },
      { playerId: 'p3', nickname: 'Віра', found: 0, top: [], more: 0, points: 0 },
    ]);
    expect(info.best).toEqual(BEST);
    expect(info.possible).toBe(196);
    expect(info.words).toBeNull();
  });

  it('shows only the three longest words and the rest as a count, and one word for the longest goal', () => {
    let s = dealt(startRound(lobbyWith(makeQuiz([letterwords]), ...PLAYERS), 0));
    s = add(s, 'p1', ['кіт', 'сік', 'рот', 'сом', 'морква']);
    s = must(next(must(lock(s, 5000)), 6000));
    expect(stageInfo(s).rows[0]).toMatchObject({ top: ['морква', 'кіт', 'сік'], more: 2 });
    let l = dealt(startRound(lobbyWith(makeQuiz([{ ...letterwords, goal: 'longest', per: 'letter' }]), ...PLAYERS), 0));
    l = add(l, 'p1', ['кіт', 'морква']);
    l = must(next(must(lock(l, 5000)), 6000));
    expect(stageInfo(l).rows[0]).toMatchObject({ found: 2, top: ['морква'], more: null, points: 120 });
  });

  it('the host sees every word and the best words live', () => {
    const s = played();
    const info = hostView(s).letterwords;
    expect(info?.words).toEqual({ p1: ['кіт', 'сік', 'морква'], p2: ['рот', 'сом'], p3: [] });
    expect(info?.best).toEqual(BEST);
    expect(info?.possible).toBe(196);
    expect(info?.rows.every((r) => r.top === null && r.points === null)).toBe(true);
    expect(hostLive(s)?.rows.find((r) => r.id === 'p1')?.progress).toEqual({ kind: 'letterwords', words: ['кіт', 'сік', 'морква'] });
    expect(hostLive(s)?.rows.find((r) => r.id === 'p1')?.answered).toBe(true);
    expect(hostLive(s)?.rows.find((r) => r.id === 'p3')?.answered).toBe(false);
    expect(stageView(s).answeredCount).toBe(2);
  });

  it('a team member sees the team words', () => {
    const layout = [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ];
    let s = dealt(must(next(teamGame(teamQuiz([classicRound('r1', [letterwords])]), layout), 0)));
    s = add(s, 't1', ['кіт']);
    expect(playerView(s, 'm2')?.me.letterwords?.words).toEqual([{ text: 'кіт', letters: 3 }]);
    expect(playerView(s, 'm1')?.me.letterwords?.words).toEqual([{ text: 'кіт', letters: 3 }]);
    expect(playerView(s, 'm3')?.me.letterwords?.words).toEqual([]);
  });

  it('canType follows phase, pause and the deal', () => {
    const raw = startRound(lobbyWith(makeQuiz([letterwords]), ...PLAYERS), 0);
    expect(playerView(raw, 'p1')?.me.letterwords?.canType).toBe(false);
    const s = dealt(raw);
    expect(playerView(s, 'p1')?.me.letterwords?.canType).toBe(true);
    const paused = must(pause(s, 2000));
    expect(playerView(paused, 'p1')?.me.letterwords?.canType).toBe(false);
    expect(playerView(must(resume(paused, 3000)), 'p1')?.me.letterwords?.canType).toBe(true);
    expect(playerView(must(lock(s, 5000)), 'p1')?.me.letterwords?.canType).toBe(false);
  });

  it('other questions keep their views unchanged', () => {
    const s = startRound(lobbyWith(makeQuiz([single]), ...PLAYERS), 0);
    for (const view of [stageView(s), hostView(s), playerView(s, 'p1'), playerView(s, 'p1')?.me]) {
      expect(view).not.toHaveProperty('letterwords');
    }
    expect(stageView(s).question).not.toHaveProperty('letterwords');
  });

  it('on a board cell only the chooser has the words and the stage shows one row', () => {
    const round = boardRound('b1', [{ title: 'Побут', cells: [{ mark: 'x3', answerMode: 'phone', question: letterwords }] }]);
    const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));
    const s = dealt(must(pickCell(lobby, 'p1', 'q12', 0, () => 0)));
    expect(playerView(s, 'p1')?.me.letterwords).toMatchObject({ words: [], canType: true });
    expect(playerView(s, 'p2')?.me).not.toHaveProperty('letterwords');
    expect(stageInfo(s).rows.map((r) => r.playerId)).toEqual(['p1']);
  });
});
