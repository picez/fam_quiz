import { describe, expect, it } from 'vitest';
import { crosswordNumbers, type Question } from '@quiz/shared';
import { lock, next, pause, removePlayer, resume, type GameState } from './game';
import { hostLive } from './live';
import { puzzleFill, puzzleFinish, puzzleSolution } from './puzzles';
import { hostView, playerView, stageView } from './views';
import { crosswordFull, crosswordKey, makeRoundsQuiz, puzzlesRound, sudoku } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const PLAYERS = ['Оля', 'Тарас', 'Петро'];
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];

const quizOf = (questions: Question[]) => makeRoundsQuiz([puzzlesRound('pz', questions)]);
const fresh = (questions: Question[] = [sudoku]) => startRound(lobbyWith(quizOf(questions), ...PLAYERS), 0);
const empties = [...sudoku.givens].flatMap((ch, i) => (ch === '0' ? [i] : []));
const right = (i: number) => sudoku.solution[i];
const wrongDigit = (i: number) => String((Number(sudoku.solution[i]) % 6) + 1);

function write(s: GameState, actor: string, cells: number[], member = actor, value = right): GameState {
  let current = s;
  for (let k = 0; k < cells.length; k += 12) {
    const batch = cells.slice(k, k + 12).map((i) => ({ i, v: value(i) }));
    current = must(puzzleFill(current, actor, member, current.questionIndex, batch, 1000));
  }
  return current;
}

/** p1 вписала 5 цифр (остання хибна), p2 — 3. */
function played(): GameState {
  const first = write(fresh(), 'p1', empties.slice(0, 4));
  const second = write(first, 'p1', [empties[4]], 'p1', wrongDigit);
  return write(second, 'p2', empties.slice(5, 8));
}

const revealed = (s: GameState) => must(next(must(lock(s, 5000)), 6000));
const stageInfo = (s: GameState) => {
  const info = stageView(s).puzzle;
  if (info === undefined) throw new Error('no puzzle');
  return info;
};
const teamStart = () => must(next(teamGame(teamQuiz([puzzlesRound('pz', [sudoku])]), LAYOUT), 0));

describe('puzzle views', () => {
  it('the stage sees masks, never values', () => {
    const s = played();
    const info = stageInfo(s);
    expect(info.kind).toBe('sudoku');
    expect(info.solution).toBeNull();
    expect(info.boards.map((b) => [b.playerId, b.nickname, b.filled, b.cells, b.solved, b.points])).toEqual([
      ['p1', 'Оля', 5, null, null, null],
      ['p2', 'Тарас', 3, null, null, null],
      ['p3', 'Петро', 0, null, null, null],
    ]);
    const mask = info.boards[0].mask;
    expect(mask).toHaveLength(36);
    for (let i = 0; i < 36; i++) {
      expect(mask[i]).toBe(sudoku.givens[i] !== '0' ? 'g' : empties.slice(0, 5).includes(i) ? '1' : '0');
    }
    expect(info.boards[0].last).toBe(empties[4]);
    expect(info.boards[0].total).toBe(empties.length);
    const json = JSON.stringify(stageView(s));
    expect(json).not.toContain(sudoku.solution);
    expect(json).not.toContain('"cells":[');
  });

  it('a rival phone sees only masks', () => {
    const s = played();
    const mine = playerView(s, 'p2')?.me.puzzle;
    expect(mine?.cells.filter((v) => v !== '')).toHaveLength(3);
    expect(mine?.cells[empties[5]]).toBe(right(empties[5]));
    expect(mine?.result).toBeNull();
    const olya = playerView(s, 'p2')?.puzzle?.boards.find((b) => b.playerId === 'p1');
    expect(olya?.cells).toBeNull();
    expect(olya?.mask[empties[0]]).toBe('1');
    const third = playerView(s, 'p3');
    expect(third?.me.puzzle?.cells.every((v) => v === '')).toBe(true);
    expect(JSON.stringify(third)).not.toContain(sudoku.solution);
    expect(JSON.stringify(third?.puzzle)).not.toContain('"cells":[');
    expect(JSON.stringify(third?.me.puzzle)).not.toContain('"wrong":[');
  });

  it('the crossword question carries no answers', () => {
    for (const question of [crosswordFull, crosswordKey]) {
      const publicQuestion = stageView(fresh([question])).question;
      const json = JSON.stringify(publicQuestion);
      for (const entry of question.entries) expect(json).not.toContain(entry.answer);
      if (question.key !== null) expect(json).not.toContain(question.key);
      const view = publicQuestion?.puzzle;
      if (view?.kind !== 'crossword' || question.layout === null) throw new Error('no crossword');
      const { layout } = question;
      expect(view.width).toBe(layout.width);
      expect(view.height).toBe(layout.height);
      expect(view.mask).toBe(puzzleSolution(question).map((v) => (v === '' ? '0' : '1')).join(''));
      expect(view.keyCells).toEqual(question.mode === 'key' ? layout.keyCells : []);
      const numbers = crosswordNumbers(layout, question.entries);
      expect(view.words).toHaveLength(question.entries.length);
      for (const word of view.words) {
        const placed = layout.words.find((w) => w.row === word.row && w.col === word.col && w.dir === word.dir);
        const entry = question.entries.find((e) => e.id === placed?.id);
        expect(word.clue).toBe(entry?.clue);
        expect(word.number).toBe(numbers.find((n) => n.id === placed?.id)?.number);
        expect(word.length).toBe(numbers.find((n) => n.id === placed?.id)?.length);
      }
    }
    expect(stageView(fresh([sudoku])).question?.puzzle).toEqual({ kind: 'sudoku', givens: sudoku.givens });
  });

  it('the host sees values live', () => {
    const s = played();
    const info = hostView(s).puzzle;
    expect(info?.solution).toEqual(puzzleSolution(sudoku));
    expect(info?.boards[0].cells?.[empties[0]]).toBe(right(empties[0]));
    expect(info?.boards[0].cells?.[empties[4]]).toBe(wrongDigit(empties[4]));
    expect(info?.boards[2].cells?.every((v) => v === '')).toBe(true);
    expect(info?.boards.map((b) => b.solved)).toEqual([null, null, null]);
    expect(info?.boards.map((b) => b.points)).toEqual([null, null, null]);
  });

  it('teams see who filled', () => {
    let s = teamStart();
    s = write(s, 't1', [empties[0], empties[1]], 'm1');
    s = write(s, 't1', [empties[2]], 'm2');
    const t1 = stageInfo(s).boards.find((b) => b.playerId === 't1');
    expect(t1?.mask[empties[0]]).toBe('1');
    expect(t1?.mask[empties[1]]).toBe('1');
    expect(t1?.mask[empties[2]]).toBe('2');
    expect(t1?.filled).toBe(3);
    const mate = playerView(s, 'm2')?.me.puzzle;
    expect(mate?.cells[empties[0]]).toBe(right(empties[0]));
    expect(mate?.mask[empties[2]]).toBe('2');
    expect(mate?.canEdit).toBe(true);
    expect(playerView(s, 'm1')?.me.puzzle?.canEdit).toBe(true);
    const rival = playerView(s, 'm3');
    expect(rival?.me.puzzle?.cells.every((v) => v === '')).toBe(true);
    expect(rival?.puzzle?.boards.find((b) => b.playerId === 't1')?.cells).toBeNull();
    expect(JSON.stringify(rival)).not.toContain(sudoku.solution);
  });

  it('a removed member in by[] is handled quietly', () => {
    let s = teamStart();
    s = write(s, 't1', [empties[0]], 'm1');
    s = write(s, 't1', [empties[1]], 'm2');
    s = must(removePlayer(s, 'm2', 1500));
    const t1 = stageInfo(s).boards.find((b) => b.playerId === 't1');
    expect(t1?.nickname).toBe('Червоні');
    expect(t1?.mask[empties[0]]).toBe('1');
    expect(t1?.mask[empties[1]]).toMatch(/^[1-9]$/);
    expect(t1?.filled).toBe(2);
    expect(hostView(s).puzzle?.boards.find((b) => b.playerId === 't1')?.cells?.[empties[1]]).toBe(right(empties[1]));
    expect(playerView(s, 'm1')?.me.puzzle?.mask[empties[1]]).toMatch(/^[1-9]$/);
  });

  it('reveal shows every grid and the solution', () => {
    let s = write(played(), 'p3', empties);
    s = must(puzzleFinish(s, 'p3', s.questionIndex, 2000));
    s = revealed(s);
    expect(s.phase).toBe('reveal');
    const info = stageInfo(s);
    expect(info.solution).toEqual(puzzleSolution(sudoku));
    expect(info.boards.map((b) => [b.playerId, b.solved, b.points])).toEqual([
      ['p3', true, 300],
      ['p1', false, 0],
      ['p2', false, 0],
    ]);
    expect(info.boards[0].cells?.[empties[0]]).toBe(right(empties[0]));
    expect(hostView(s).puzzle?.boards.map((b) => b.solved)).toEqual([true, false, false]);
    expect(playerView(s, 'p1')?.me.puzzle?.result).toEqual({ solved: false, wrong: empties.slice(4), points: 0 });
    expect(playerView(s, 'p3')?.me.puzzle?.result).toEqual({ solved: true, wrong: [], points: 300 });
    expect(playerView(s, 'p2')?.me.puzzle?.result?.wrong).toEqual(empties.filter((i) => !empties.slice(5, 8).includes(i)));
  });

  it('can edit only while open', () => {
    let s = fresh();
    const edit = (state: GameState, id = 'p1') => playerView(state, id)?.me.puzzle?.canEdit;
    expect(edit(s)).toBe(true);
    s = must(pause(s, 1200));
    expect(edit(s)).toBe(false);
    s = must(resume(s, 1300));
    expect(edit(s)).toBe(true);
    s = write(s, 'p1', [empties[0]]);
    s = must(puzzleFinish(s, 'p1', s.questionIndex, 2000));
    expect(edit(s)).toBe(false);
    expect(edit(s, 'p2')).toBe(true);
    s = must(lock(s, 5000));
    expect(edit(s, 'p2')).toBe(false);
  });

  it('a grid closed by the time is not done: done means the button was pressed', () => {
    // Телефон за done вибирає «Розв’язання зафіксовано», інакше — «Час вийшов» / «Запитання закрито».
    let s = played();
    s = must(puzzleFinish(s, 'p1', s.questionIndex, 2000));
    s = must(lock(s, 5000));
    const mine = (id: string) => playerView(s, id)?.me.puzzle;
    expect(mine('p1')?.done).toBe(true);
    expect(mine('p2')?.done).toBe(false);
    expect(mine('p3')?.done).toBe(false);
    expect(mine('p2')?.canEdit).toBe(false);
    s = must(next(s, 6000));
    expect(mine('p2')?.done).toBe(false);
    expect(mine('p2')?.canEdit).toBe(false);
    expect(mine('p2')?.result).not.toBeNull();
  });

  it('the answered counters agree on the stage and the pad', () => {
    // «Відповів» — той, хто здав сітку: вписування без «Готово» відповіддю не рахується ні на сцені, ні на пульті.
    let s = played();
    expect(stageView(s).answeredCount).toBe(0);
    expect(hostLive(s)?.rows.filter((r) => r.answered)).toHaveLength(0);
    s = must(puzzleFinish(s, 'p3', s.questionIndex, 2000));
    expect(stageView(s).answeredCount).toBe(1);
    expect(hostLive(s)?.rows.filter((r) => r.answered).map((r) => r.id)).toEqual(['p3']);
    s = must(puzzleFinish(s, 'p1', s.questionIndex, 2100));
    expect(stageView(s).answeredCount).toBe(2);
    expect(hostLive(s)?.rows.filter((r) => r.answered)).toHaveLength(2);
  });
});
