import { describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { adjustScore } from './adjust';
import { pickCell } from './board';
import { guessWord, takeHint } from './chain';
import { placeWager } from './final';
import { lock, next, start, type GameState } from './game';
import { dealLetters, letterWord, lettersDue } from './letterwords';
import { listEntry } from './timedlist';
import { ladderWord } from './wordladder';
import { auctionRound, boardRound, chain, classicRound, letterwords, makeQuiz, makeRoundsQuiz, single, timedlist, wordladder } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const rng = () => 0;
const t0 = 1_000_000;
const NOUNS = new Set(['поле', 'пола', 'пора', 'пара', 'тара']);
const isNoun = (key: string) => NOUNS.has(key);

function enter(s: GameState, id: string, words: string[], now = 1000): GameState {
  return words.reduce((current, word) => {
    const result = listEntry(current, id, word, true, now);
    if (!result.ok) throw new Error(`listEntry ${word}: ${result.error}`);
    return result.state;
  }, s);
}

const phone = (s: GameState, id: string) => {
  const view = playerView(s, id);
  if (view === null) throw new Error(`no player ${id}`);
  return view;
};

/** Поле з однією клітинкою-списком; Олена (p1) її вибрала й відповідає сама, Тарас (p2) і Віра (p3) дивляться. */
function boardList(): GameState {
  const round = boardRound('b1', [{ title: 'Космос', cells: [{ mark: 'none', answerMode: 'phone', question: timedlist }] }]);
  const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас', 'Віра'))), 0));
  return must(pickCell(lobby, 'p1', 'q11', 0, rng));
}

/** Класика r1, далі «Аукціон» r2 з одним запитанням; Тарас (p2) купив його за 100, гра на запитанні. */
function soldTo(question: Question, buyer: string | null = 'p2'): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single]), auctionRound('r2', [question], { title: 'Слова', bidStep: 100 })]);
  let s = must(start(lobbyWith(quiz, 'Олена', 'Тарас', 'Віра')));
  s = must(next(s, 0, rng));
  s = must(next(must(lock(s)), 1000, rng));
  s = must(next(s, 2000, rng));
  s = must(adjustScore(s, 'p2', 500, 3000));
  s = must(next(s, 4000, rng));
  s = must(next(s, t0, rng));
  if (buyer !== null) s = must(placeWager(s, buyer, 100, t0, rng));
  return must(next(s, t0 + 1000, rng));
}

describe('a sole answerer is watched live (solo)', () => {
  it('board timed list: the stage and the other phones see the chooser finds, count and misses — never an unfound item', () => {
    let s = enter(boardList(), 'p1', ['Марс', 'Плутон', 'Юпітер']);
    const expected = { playerId: 'p1', nickname: 'Олена', progress: { kind: 'timedlist', found: [{ index: 4, text: 'Марс' }, { index: 5, text: 'Юпітер' }], total: 8, wrong: 1 } };
    expect(stageView(s).solo).toEqual(expected);
    expect(phone(s, 'p2').solo).toEqual(expected);
    expect(phone(s, 'p3').solo).toEqual(expected);
    // Сам гравець бачить своє поле (me.timedlist) як і раніше; живого показу йому й пульту не треба.
    expect(phone(s, 'p1')).not.toHaveProperty('solo');
    expect(phone(s, 'p1').me.timedlist?.found).toHaveLength(2);
    expect(hostView(s)).not.toHaveProperty('solo');
    for (const secret of ['Меркурій', 'Венера', 'Земля', 'Сатурн', 'Нептун', 'Червона планета']) {
      expect(JSON.stringify(stageView(s))).not.toContain(secret);
      expect(JSON.stringify(phone(s, 'p2'))).not.toContain(secret);
    }
    s = must(lock(s, 5000));
    expect(phone(s, 'p2').solo?.progress).toMatchObject({ kind: 'timedlist', wrong: 1 });
    // На розкритті все видно й без живого показу.
    s = must(next(s, 6000));
    expect(s.phase).toBe('reveal');
    expect(stageView(s)).not.toHaveProperty('solo');
  });

  it('a chooser who typed nothing is shown with an empty list', () => {
    expect(stageView(boardList()).solo).toEqual({ playerId: 'p1', nickname: 'Олена', progress: { kind: 'timedlist', found: [], total: 8, wrong: 0 } });
  });

  it('a timed list everyone plays has no solo', () => {
    const s = enter(startRound(lobbyWith(makeQuiz([timedlist]), 'Олена', 'Тарас'), 0), 'p1', ['Марс']);
    expect(stageView(s)).not.toHaveProperty('solo');
    expect(phone(s, 'p2')).not.toHaveProperty('solo');
  });

  it('sold auction word ladder: the others watch the winner chain of words, not the host path', () => {
    let s = soldTo(wordladder);
    expect(stageView(s).solo).toEqual({ playerId: 'p2', nickname: 'Тарас', progress: { kind: 'wordladder', words: [], finished: false } });
    s = must(ladderWord(s, 'p2', 'пола', t0 + 2000, isNoun));
    const solo = { playerId: 'p2', nickname: 'Тарас', progress: { kind: 'wordladder', words: ['пола'], finished: false } };
    expect(stageView(s).solo).toEqual(solo);
    expect(phone(s, 'p1').solo).toEqual(solo);
    expect(phone(s, 'p2')).not.toHaveProperty('solo');
    for (const secret of ['пора', 'пара']) expect(JSON.stringify(stageView(s))).not.toContain(secret);
    s = must(ladderWord(must(ladderWord(must(ladderWord(s, 'p2', 'пора', t0 + 3000, isNoun)), 'p2', 'пара', t0 + 4000, isNoun)), 'p2', 'тара', t0 + 5000, isNoun));
    expect(phone(s, 'p3').solo?.progress).toEqual({ kind: 'wordladder', words: ['пола', 'пора', 'пара', 'тара'], finished: true });
  });

  it('an unsold auction question is played by everyone: no solo', () => {
    const s = soldTo(wordladder, null);
    expect(stageView(s)).not.toHaveProperty('solo');
    expect(phone(s, 'p1')).not.toHaveProperty('solo');
  });

  it('sold auction chain: solved words in full, the rest only their first letter — the winner hints stay his', () => {
    let s = soldTo(chain);
    s = must(guessWord(s, 'p2', 'Риба', t0 + 2000));
    s = must(takeHint(s, 'p2', t0 + 3000));
    const solo = stageView(s).solo;
    expect(solo).toMatchObject({ playerId: 'p2', progress: { kind: 'chain', solved: 1, total: 3, hints: 1 } });
    expect(solo?.progress.kind === 'chain' && solo.progress.masks).toEqual([[...'Риба'], ['О', null, null, null, null], ['К', null, null, null, null, null, null, null]]);
    for (const secret of ['Океан', 'Корабель', 'Ок']) expect(JSON.stringify(solo)).not.toContain(secret);
    expect(phone(s, 'p2')).not.toHaveProperty('solo');
  });

  it('board letter words: the others see the chooser words', () => {
    const round = boardRound('b1', [{ title: 'Побут', cells: [{ mark: 'none', answerMode: 'phone', question: letterwords }] }]);
    const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));
    let s = must(pickCell(lobby, 'p1', 'q12', 0, rng));
    const due = lettersDue(s);
    if (due === null) throw new Error('nothing to deal');
    s = dealLetters(s, { letters: due.letters ?? [...'морквасті'], best: ['морква'], possible: 10 });
    s = must(letterWord(s, 'p1', 'кіт', 1000, () => true));
    expect(phone(s, 'p2').solo).toEqual({ playerId: 'p1', nickname: 'Олена', progress: { kind: 'letterwords', words: [{ text: 'кіт', letters: 3 }] } });
    expect(phone(s, 'p1')).not.toHaveProperty('solo');
  });

  it('team game: the answering team plays as before, the other team watches it', () => {
    const round = boardRound('b1', [{ title: 'Космос', cells: [{ mark: 'none', answerMode: 'phone', question: timedlist }] }]);
    let s = must(next(teamGame(teamQuiz([round]), [['Оля', 'Петро'], ['Віра', 'Ігор']]), 0));
    s = must(pickCell(s, 't1', 'q11', 0, rng));
    s = enter(s, 't1', ['Марс']);
    for (const member of ['m1', 'm2']) {
      expect(phone(s, member)).not.toHaveProperty('solo');
      expect(phone(s, member).me.timedlist?.found).toEqual([{ index: 4, text: 'Марс' }]);
    }
    for (const member of ['m3', 'm4']) expect(phone(s, member).solo).toMatchObject({ playerId: 't1', progress: { kind: 'timedlist', found: [{ index: 4, text: 'Марс' }] } });
  });
});
