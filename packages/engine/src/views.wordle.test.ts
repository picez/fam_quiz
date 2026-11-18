import { describe, expect, it } from 'vitest';
import { lock, next, pause, setConnected, type GameState } from './game';
import { hostLive } from './live';
import { wordleGuess } from './wordle';
import { classicRound, wordle, wordleQuiz } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const NOUNS = ['сосна', 'посол', 'молот', 'хата'];
const isNoun = (k: string) => NOUNS.includes(k);
const rng = () => 0;

function guess(s: GameState, id: string, words: string[], now = 1000): GameState {
  return words.reduce((current, word) => must(wordleGuess(current, id, word, now, isNoun)), s);
}

/** Оля (p1), Тарас (p2), Петро (p3); Оля спробувала «сосна». Запитання «колос» відкрите. */
const played = () => guess(startRound(lobbyWith(wordleQuiz(), 'Оля', 'Тарас', 'Петро'), 0), 'p1', ['сосна']);
const stageWordle = (s: GameState) => {
  const view = stageView(s).wordle;
  if (view === undefined) throw new Error('no wordle');
  return view;
};
const phone = (s: GameState, id: string) => {
  const view = playerView(s, id);
  if (view === null) throw new Error(`no view for ${id}`);
  return view;
};

describe('wordle views (48)', () => {
  it('the stage and other phones see colours only', () => {
    let s = played();
    for (const phase of ['question', 'locked'] as const) {
      if (phase === 'locked') s = must(lock(s));
      expect(s.phase).toBe(phase);
      for (const view of [stageView(s), phone(s, 'p2')]) {
        const json = JSON.stringify(view);
        expect(json, phase).not.toContain('колос');
        expect(json, phase).not.toContain('сосна');
        // жодної літери спроби окремо: на сцені й чужому телефоні немає масиву з «н» (лише в «сосна»)
        expect(json, phase).not.toContain('"н"');
        expect(view.wordle?.word).toBeNull();
        expect(view.wordle?.rows.every((row) => row.guesses === null)).toBe(true);
        expect(view.wordle?.rows.map((row) => [row.playerId, row.marks, row.tries, row.solved, row.points])).toEqual([
          ['p1', [['near', 'hit', 'miss', 'miss', 'miss']], 1, false, null],
          ['p2', [], 0, false, null],
          ['p3', [], 0, false, null],
        ]);
        expect(view.question?.wordle).toEqual({ letters: 5, tries: 6 });
        expect(view.question).not.toHaveProperty('word');
      }
    }
  });

  it('own phone sees own letters, not the word', () => {
    let s = played();
    expect(phone(s, 'p1').me.wordle).toEqual({
      letters: 5,
      tries: 6,
      rows: [{ letters: ['с', 'о', 'с', 'н', 'а'], marks: ['near', 'hit', 'miss', 'miss', 'miss'] }],
      solved: false,
      canGuess: true,
      word: null,
    });
    expect(JSON.stringify(phone(s, 'p1'))).not.toContain('колос');
    // на паузі ходити не можна
    expect(phone(must(pause(s, 2000)), 'p1').me.wordle?.canGuess).toBe(false);
    s = guess(s, 'p1', ['колос'], 2000);
    expect(s.phase).toBe('question');
    const solved = phone(s, 'p1').me.wordle;
    expect(solved).toMatchObject({ solved: true, canGuess: false, word: null });
    expect(solved?.rows.map((row) => row.letters.join(''))).toEqual(['сосна', 'колос']);
    expect(solved?.rows[1].marks).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
    // власні літери Олі — лише на її телефоні
    expect(JSON.stringify(phone(s, 'p2'))).not.toContain('колос');
    expect(JSON.stringify(stageView(s))).not.toContain('колос');
    expect(stageWordle(s).rows[0]).toMatchObject({ solved: true, tries: 2, guesses: null });
  });

  it('the host sees everything live', () => {
    const s = played();
    const host = hostView(s).wordle;
    expect(host?.word).toBe('колос');
    expect(host?.rows.map((row) => row.guesses)).toEqual([[['с', 'о', 'с', 'н', 'а']], [], []]);
    expect(host?.rows[0].marks).toEqual([['near', 'hit', 'miss', 'miss', 'miss']]);
    const row = hostLive(s)?.rows.find((r) => r.id === 'p1');
    expect(row?.progress).toEqual({ kind: 'wordle', tries: 1, guesses: ['сосна'], solved: false });
    expect(hostLive(s)?.rows.find((r) => r.id === 'p2')?.progress).toEqual({ kind: 'wordle', tries: 0, guesses: [], solved: false });
  });

  it('reveal shows the word, letters and points', () => {
    let s = guess(guess(guess(played(), 'p1', ['колос'], 2000), 'p2', ['колос'], 3000), 'p3', ['сосна', 'посол'], 4000);
    s = must(next(must(lock(s)), 10_000, rng));
    expect(s.phase).toBe('reveal');
    const view = stageWordle(s);
    expect(view.word).toBe('колос');
    expect(view.rows.map((row) => [row.playerId, row.guesses?.map((g) => g.join('')), row.solved, row.tries, row.points])).toEqual([
      ['p1', ['сосна', 'колос'], true, 2, 833],
      ['p2', ['колос'], true, 1, 1000],
      ['p3', ['сосна', 'посол'], false, 2, 0],
    ]);
    expect(phone(s, 'p1').me.wordle?.word).toBe('колос');
    expect(phone(s, 'p3').wordle?.rows[1].guesses).toEqual([['к', 'о', 'л', 'о', 'с']]);

    // друге запитання: «м'ясо» — 4 клітинки, на розкритті слово з апострофом
    while (!(s.phase === 'question' && s.questionIndex === 1)) s = must(next(s, 20_000, rng));
    expect(stageView(s).question?.wordle).toEqual({ letters: 4, tries: 6 });
    expect(JSON.stringify(stageView(s))).not.toContain('ясо');
    s = must(next(must(lock(guess(s, 'p1', ['мясо'], 21_000))), 22_000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageWordle(s)).toMatchObject({ word: "м'ясо", letters: 4 });
    expect(stageWordle(s).rows[0]).toMatchObject({ guesses: [['м', 'я', 'с', 'о']], solved: true, points: 600 });
  });

  it('a late joiner plays from zero', () => {
    // Рушій додає гравців лише в лобі, тож «приєдналась на question» — Ірина, що була поза зв'язком при відкритті.
    const lobby = must(setConnected(lobbyWith(wordleQuiz(), 'Оля', 'Тарас', 'Петро', 'Ірина'), 'p4', false, 0));
    let s = guess(startRound(lobby, 0), 'p1', ['сосна']);
    s = must(setConnected(s, 'p4', true, 1500));
    expect(phone(s, 'p4').me.wordle).toMatchObject({ rows: [], solved: false, canGuess: true, word: null });
    expect(stageWordle(s).rows.find((row) => row.playerId === 'p4')).toMatchObject({ nickname: 'Ірина', marks: [], tries: 0 });
    expect(JSON.stringify(phone(s, 'p4'))).not.toContain('сосна');
  });

  it('a team shares one grid; the other team sees colours only', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [wordle])]), [['Оля', 'Тарас'], ['Петро']]), 0));
    s = guess(s, 't1', ['сосна']);
    for (const member of ['m1', 'm2']) expect(phone(s, member).me.wordle?.rows.map((row) => row.letters.join(''))).toEqual(['сосна']);
    expect(phone(s, 'm3').me.wordle?.rows).toEqual([]);
    expect(JSON.stringify(phone(s, 'm3'))).not.toContain('сосна');
    expect(stageWordle(s).rows.map((row) => [row.playerId, row.marks.length])).toEqual([
      ['t1', 1],
      ['t2', 0],
    ]);
  });

  it('no wordle key outside a wordle question', () => {
    const lobby = lobbyWith(wordleQuiz(), 'Оля');
    expect(stageView(lobby)).not.toHaveProperty('wordle');
    expect(hostView(lobby)).not.toHaveProperty('wordle');
    expect(phone(lobby, 'p1').me).not.toHaveProperty('wordle');
  });
});
