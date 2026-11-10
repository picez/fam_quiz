import { describe, expect, it } from 'vitest';
import { crosswordCells, SPLASH_MS, type Question } from '@quiz/shared';
import { buffBlock, takeBuff } from './buffs';
import { end, lock, next, override, pause, recordOf, removePlayer, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { hostLive } from './live';
import { puzzleFill, puzzleFinish, puzzleOf, puzzleSolution, puzzleSolved, puzzleTotal, scorePuzzle } from './puzzles';
import { actorOf } from './team-act';
import { playerView, stageView } from './views';
import { FIRST_BUFFS } from './testing/buffs';
import { crosswordFull, crosswordKey, makeRoundsQuiz, puzzlesQuiz, puzzlesRound, sudoku } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

/** p1 Оля, p2 Тарас, p3 Петро. */
const PLAYERS = ['Оля', 'Тарас', 'Петро'];
/** m1 Оля, m2 Тарас — t1 («Соняшники»); m3 Петро, m4 Ганна — t2 («Маки»). */
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const rng0 = () => 0;

const quizOf = (questions: Question[], settings: Parameters<typeof makeRoundsQuiz>[1] = {}) => makeRoundsQuiz([puzzlesRound('pz', questions)], settings);
const fresh = (questions: Question[] = [sudoku], names: string[] = PLAYERS) => startRound(lobbyWith(quizOf(questions), ...names), 0);
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);

type Cell = { i: number; v: string };

/** Клітинки для вписування з правильними значеннями (судоку — порожні клітинки, кросворд — усі літери). */
function rightCells(question: Question): Cell[] {
  if (question.type === 'sudoku') return [...question.solution].flatMap((v, i) => (question.givens[i] === '0' ? [{ i, v }] : []));
  if (question.type === 'crossword' && question.layout !== null) {
    return crosswordCells(question.layout, question.entries).flatMap((v, i) => (v === null ? [] : [{ i, v }]));
  }
  return [];
}

/** Вписати клітинки пакетами по 12 (межа події). */
function fills(s: GameState, actor: string, cells: Cell[], member = actor, now = 1000): GameState {
  let current = s;
  for (let k = 0; k < cells.length; k += 12) current = must(puzzleFill(current, actor, member, current.questionIndex, cells.slice(k, k + 12), now));
  return current;
}

const solve = (s: GameState, actor: string, question: Question, now = 1000) => fills(s, actor, rightCells(question), actor, now);
const done = (s: GameState, actor: string, now = 2000) => must(puzzleFinish(s, actor, s.questionIndex, now));

/** Перша порожня клітинка судоку фікстури та її правильна цифра. */
const firstEmpty = sudoku.givens.indexOf('0');
const firstGiven = [...sudoku.givens].findIndex((ch) => ch !== '0');
const wrongDigit = (i: number) => String((Number(sudoku.solution[i]) % 6) + 1);

describe('puzzles: the round', () => {
  it('a puzzles round opens its questions in order with a splash', () => {
    const lobby = lobbyWithSplash(puzzlesQuiz(), ...PLAYERS);
    const intro = must(start(lobby, 0));
    expect(intro.phase).toBe('intro');
    const first = must(next(intro, 10_000, rng0));
    expect(first.phase).toBe('question');
    expect(first.plays[0].question.id).toBe('z1');
    expect(first.splash).toMatchObject({ kind: 'question', at: 10_000 });
    expect(first.startedAt).toBe(10_000 + SPLASH_MS.question);
    expect(first.endsAt).toBe(10_000 + SPLASH_MS.question + 180_000);
    expect(first.plays[0].puzzle).toEqual({ present: ['p1', 'p2', 'p3'], boards: {} });
    // варіантів немає й не перемішуються: present — порожній
    expect(first.presented).toEqual([]);
    const locked = must(lock(first, 20_000));
    expect(locked.phase).toBe('locked');
    const revealed = must(next(locked, 21_000, rng0));
    expect(revealed.phase).toBe('reveal');
    let s = revealed;
    for (let i = 0; i < 5 && s.phase !== 'question'; i++) s = must(next(s, 22_000, rng0));
    expect(s.plays[s.questionIndex].question.id).toBe('z2');
    expect(s.endsAt! - s.startedAt!).toBe(240_000);
  });

  it('only puzzle questions carry a puzzle play', () => {
    const s = fresh();
    expect(puzzleOf(s, 'p1')).toBeNull();
    expect(puzzleTotal(sudoku)).toBe([...sudoku.givens].filter((ch) => ch === '0').length);
    expect(puzzleSolution(sudoku)[firstGiven]).toBe('');
    expect(puzzleSolution(sudoku)[firstEmpty]).toBe(sudoku.solution[firstEmpty]);
    const letters = crosswordCells(crosswordFull.layout, crosswordFull.entries);
    expect(puzzleSolution(crosswordFull)).toEqual(letters.map((v) => v ?? ''));
    expect(puzzleTotal(crosswordFull)).toBe(letters.filter((v) => v !== null).length);
  });
});

describe('puzzles: batches', () => {
  it('fills cells and keeps the last write', () => {
    const s = fresh();
    const i = firstEmpty;
    const one = must(puzzleFill(s, 'p1', 'p1', 0, [{ i, v: '4' }, { i, v: '5' }], 1000));
    expect(puzzleOf(one, 'p1')).toMatchObject({ seq: 1, last: i, done: false });
    expect(puzzleOf(one, 'p1')!.cells[i]).toBe('5');
    expect(puzzleOf(one, 'p1')!.cells).toHaveLength(36);
    // соло: by не пишеться
    expect('by' in puzzleOf(one, 'p1')!).toBe(false);
    // інший гравець — своя дошка, ще не створена
    expect(puzzleOf(one, 'p2')).toBeNull();
    // порожнє значення стирає
    const erased = must(puzzleFill(one, 'p1', 'p1', 0, [{ i, v: '' }], 1100));
    expect(puzzleOf(erased, 'p1')).toMatchObject({ seq: 2, last: i });
    expect(puzzleOf(erased, 'p1')!.cells[i]).toBe('');
    // пакет без змін — той самий стан
    expect(must(puzzleFill(one, 'p1', 'p1', 0, [{ i, v: '5' }], 1200))).toBe(one);
    // стерти на порожній сітці — нічого не створює
    expect(must(puzzleFill(s, 'p1', 'p1', 0, [{ i, v: '' }], 1200))).toBe(s);
    // записів до «Готово» немає
    expect(record(one, 'p1')).toBeUndefined();
  });

  it('refuses a bad batch as a whole', () => {
    const s = fresh();
    const i = firstEmpty;
    const good = { i, v: '1' };
    expect(puzzleFill(s, 'p1', 'p1', 0, [good, { i: firstGiven, v: '1' }], 1000)).toEqual({ ok: false, error: 'puzzle_given' });
    expect(puzzleFill(s, 'p1', 'p1', 0, [good, { i, v: '7' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    expect(puzzleFill(s, 'p1', 'p1', 0, [good, { i, v: '0' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    expect(puzzleFill(s, 'p1', 'p1', 0, [good, { i, v: 'q' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    expect(puzzleFill(s, 'p1', 'p1', 0, [good, { i: 36, v: '1' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    expect(puzzleFill(s, 'p1', 'p1', 0, [good, { i: -1, v: '1' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    expect(puzzleFill(s, 'p1', 'p1', 0, [good, { i: 1.5, v: '1' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    // понад межу події
    const many = Array.from({ length: 13 }, () => good);
    expect(puzzleFill(s, 'p1', 'p1', 0, many, 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    // блок кросворду
    const cw = fresh([crosswordFull]);
    const letters = crosswordCells(crosswordFull.layout, crosswordFull.entries);
    const block = letters.indexOf(null);
    const letter = letters.findIndex((v) => v !== null);
    expect(puzzleFill(cw, 'p1', 'p1', 0, [{ i: letter, v: 'а' }, { i: block, v: 'а' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    expect(puzzleFill(cw, 'p1', 'p1', 0, [{ i: letter, v: '1' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    expect(puzzleFill(cw, 'p1', 'p1', 0, [{ i: letter, v: 'аб' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    // у кожному випадку нічого не записано
    expect(puzzleOf(s, 'p1')).toBeNull();
    expect(puzzleOf(cw, 'p1')).toBeNull();
  });

  it('refuses late and stale batches', () => {
    const quiz = quizOf([sudoku, crosswordFull]);
    const s = startRound(lobbyWith(quiz, ...PLAYERS), 0);
    const cell = [{ i: firstEmpty, v: '1' }];
    expect(puzzleFill(s, 'p9', 'p9', 0, cell, 1000)).toEqual({ ok: false, error: 'not_found' });
    expect(puzzleFill(s, 'p1', 'p1', 1, cell, 1000)).toEqual({ ok: false, error: 'puzzle_stale' });
    expect(puzzleFill(s, 'p1', 'p1', 0, cell, 180_001)).toEqual({ ok: false, error: 'time_over' });
    expect(puzzleFill(s, 'p1', 'p1', 0, cell, 180_000).ok).toBe(true);
    expect(puzzleFill(must(pause(s, 1000)), 'p1', 'p1', 0, cell, 1000)).toEqual({ ok: false, error: 'paused' });
    expect(puzzleFill(must(lock(s, 1000)), 'p1', 'p1', 0, cell, 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(puzzleFinish(s, 'p1', 1, 1000)).toEqual({ ok: false, error: 'puzzle_stale' });
    expect(puzzleFinish(s, 'p1', 0, 180_001)).toEqual({ ok: false, error: 'time_over' });
    // наступне запитання: пакет для минулого — stale
    let second = must(lock(s, 1000));
    for (let i = 0; i < 5 && second.phase !== 'question'; i++) second = must(next(second, 2000, rng0));
    expect(puzzleFill(second, 'p1', 'p1', 0, cell, 3000)).toEqual({ ok: false, error: 'puzzle_stale' });
    // заставка: ще не почалося
    const splashed = must(next(must(start(lobbyWithSplash(quiz, ...PLAYERS), 0)), 10_000, rng0));
    expect(puzzleFill(splashed, 'p1', 'p1', 0, cell, 10_001)).toEqual({ ok: false, error: 'not_started' });
    expect(puzzleFinish(splashed, 'p1', 0, 10_001)).toEqual({ ok: false, error: 'not_started' });
  });

  it('refuses a puzzle batch on another question type', () => {
    const plain = startRound(lobbyWith(makeRoundsQuiz([puzzlesRound('pz', [sudoku])]), 'Оля'), 0);
    const other = { ...plain, plays: plain.plays.map((p) => ({ ...p, question: { ...p.question, type: 'text', accepted: ['так'] } as Question })) };
    expect(puzzleFill(other, 'p1', 'p1', 0, [{ i: 0, v: '1' }], 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(puzzleFinish(other, 'p1', 0, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('crossword letters are normalized', () => {
    const s = fresh([crosswordFull]);
    const letter = crosswordCells(crosswordFull.layout, crosswordFull.entries).findIndex((v) => v !== null);
    const big = must(puzzleFill(s, 'p1', 'p1', 0, [{ i: letter, v: 'Ґ' }], 1000));
    expect(puzzleOf(big, 'p1')!.cells[letter]).toBe('ґ');
    // розкладений символ (е + наголос не літера) і апостроф — ні
    expect(puzzleFill(s, 'p1', 'p1', 0, [{ i: letter, v: '’' }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    expect(puzzleFill(s, 'p1', 'p1', 0, [{ i: letter, v: "'" }], 1000)).toEqual({ ok: false, error: 'puzzle_cell' });
    // ї, складена з і + U+0308, нормалізується в ї
    const yi = must(puzzleFill(s, 'p1', 'p1', 0, [{ i: letter, v: 'ї' }], 1000));
    expect(puzzleOf(yi, 'p1')!.cells[letter]).toBe('ї');
    expect(puzzleOf(big, 'p1')!.cells).toHaveLength(crosswordFull.layout.width * crosswordFull.layout.height);
  });
});

describe('puzzles: done and scoring', () => {
  it('done fixes the grid and scores it at once', () => {
    const s = solve(fresh(), 'p1', sudoku);
    expect(puzzleSolved(sudoku, puzzleOf(s, 'p1')!.cells)).toBe(true);
    const fixed = done(s, 'p1', 5000);
    expect(puzzleOf(fixed, 'p1')!.done).toBe(true);
    expect(record(fixed, 'p1')).toMatchObject({ grade: 'correct', points: 300, basePoints: 300, streakBonus: 0, accuracy: 1, accepted: true, timeMs: 5000 });
    const answer = record(fixed, 'p1')!.answer;
    expect(answer).toEqual({ type: 'puzzle', kind: 'sudoku', grid: sudoku.solution, filled: puzzleTotal(sudoku), total: puzzleTotal(sudoku), solved: true });
    expect(fixed.players.find((p) => p.id === 'p1')?.score).toBe(0);
    expect(fixed.phase).toBe('question');
    expect(puzzleFill(fixed, 'p1', 'p1', 0, [{ i: firstEmpty, v: '1' }], 5100)).toEqual({ ok: false, error: 'puzzle_done' });
    expect(puzzleFinish(fixed, 'p1', 0, 5100)).toEqual({ ok: false, error: 'puzzle_done' });
    // бали з'являються в таблиці на закритті
    expect(must(lock(fixed, 6000)).players.find((p) => p.id === 'p1')?.score).toBe(300);
  });

  it('a wrong grid is wrong', () => {
    const cells = rightCells(sudoku).map((c, k) => (k === 0 ? { ...c, v: wrongDigit(c.i) } : c));
    const s = done(fills(fresh(), 'p1', cells), 'p1');
    const r = record(s, 'p1')!;
    expect(r).toMatchObject({ grade: 'wrong', points: 0, accepted: false, streakBonus: 0 });
    expect(r.accuracy).toBeCloseTo((puzzleTotal(sudoku) - 1) / puzzleTotal(sudoku));
    expect(r.answer).toMatchObject({ type: 'puzzle', solved: false, filled: puzzleTotal(sudoku) });
  });

  it('an empty grid may be done too', () => {
    const s = done(fresh(), 'p2');
    expect(record(s, 'p2')).toMatchObject({ grade: 'wrong', points: 0, accuracy: 0 });
    expect(record(s, 'p2')!.answer).toEqual({ type: 'puzzle', kind: 'sudoku', grid: sudoku.givens, filled: 0, total: puzzleTotal(sudoku), solved: false });
    expect(puzzleOf(s, 'p2')).toMatchObject({ done: true, seq: 0, last: null });
  });

  it('everyone done closes the question', () => {
    let s = fresh();
    s = done(s, 'p1');
    s = done(s, 'p2');
    expect(s.phase).toBe('question');
    s = done(s, 'p3');
    expect(s.phase).toBe('locked');
    // відключений без «Готово» закриття не тримає
    let away = must(setConnected(fresh(), 'p3', false, 500));
    away = done(done(away, 'p1'), 'p2');
    expect(away.phase).toBe('locked');
    expect(record(away, 'p3')).toBeUndefined();
  });

  it('time out scores every grid', () => {
    let s = fresh();
    s = solve(s, 'p2', sudoku);
    s = fills(s, 'p1', [{ i: firstEmpty, v: sudoku.solution[firstEmpty] }]);
    const closed = tick(s, 180_001);
    expect(closed.phase).toBe('locked');
    expect(recordOf(closed, 0, 'p2')).toMatchObject({ grade: 'correct', points: 300, timeMs: 180_000 });
    expect(recordOf(closed, 0, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(recordOf(closed, 0, 'p1')!.answer).toMatchObject({ filled: 1, solved: false });
    // Петро нічого не вписав: запису немає (як у «Більше чи менше» — «був у кімнаті» не відповідь), мінусу немає
    expect(recordOf(closed, 0, 'p3')).toBeUndefined();
    expect(closed.players.map((p) => p.score)).toEqual([0, 300, 0]);
    // закрите запитання вже не рахується вдруге
    expect(scorePuzzle(closed)).toBe(closed);
  });

  it('the host ends the game: grids without done are scored', () => {
    const s = solve(fresh(), 'p2', sudoku);
    const ended = must(end(s, 5000));
    expect(ended.phase).toBe('finished');
    expect(recordOf(ended, 0, 'p2')).toMatchObject({ grade: 'correct', points: 300 });
    expect(ended.players.find((p) => p.id === 'p2')?.score).toBe(300);
  });

  it('the full crossword needs every letter', () => {
    const all = rightCells(crosswordFull);
    const s = done(fills(fresh([crosswordFull]), 'p1', all.slice(1)), 'p1');
    expect(record(s, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    const full = done(fills(fresh([crosswordFull]), 'p1', all), 'p1');
    expect(record(full, 'p1')).toMatchObject({ grade: 'correct', points: 300, accuracy: 1 });
    const grid = (record(full, 'p1')!.answer as { grid: string }).grid;
    expect(grid).toHaveLength(crosswordFull.layout.width * crosswordFull.layout.height);
    expect(grid).toContain('#');
    expect(grid).not.toContain('.');
    // порожні клітинки — '.'
    expect((record(s, 'p1')!.answer as { grid: string }).grid).toContain('.');
  });

  it('the key mode scores only the key cells', () => {
    const solution = puzzleSolution(crosswordKey);
    const keyCells = crosswordKey.layout.keyCells;
    expect(keyCells.map((i) => solution[i]).join('')).toBe('ліс');
    const keyOnly = keyCells.map((i) => ({ i, v: solution[i] }));
    const s = done(fills(fresh([crosswordKey]), 'p1', keyOnly), 'p1');
    expect(record(s, 'p1')).toMatchObject({ grade: 'correct', points: 300, accuracy: 1 });
    expect(record(s, 'p1')!.answer).toMatchObject({ kind: 'crossword', solved: true, filled: 3, total: puzzleTotal(crosswordKey) });
    // одна ключова хибна, решта сітки правильна
    const others = rightCells(crosswordKey).filter((c) => c.i !== keyCells[1]);
    const bad = done(fills(fresh([crosswordKey]), 'p1', [...others, { i: keyCells[1], v: solution[keyCells[1]] === 'а' ? 'б' : 'а' }]), 'p1');
    expect(record(bad, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(record(bad, 'p1')!.accuracy).toBeCloseTo(2 / 3);
  });

  it('teammates share one grid and the last write wins', () => {
    const quiz = teamQuiz([puzzlesRound('pz', [sudoku])]);
    const s = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    expect(s.plays[0].puzzle?.present).toEqual(['t1', 't2']);
    for (const [member, team] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']] as const) {
      expect(actorOf(s, member, 'answer'), member).toEqual({ ok: true, id: team });
    }
    const i = firstEmpty;
    const olya = must(puzzleFill(s, 't1', 'm1', 0, [{ i, v: '3' }], 1000));
    const taras = must(puzzleFill(olya, 't1', 'm2', 0, [{ i, v: '1' }], 1100));
    const board = puzzleOf(taras, 't1')!;
    expect(board.cells[i]).toBe('1');
    expect(board.by?.[i]).toBe('m2');
    expect(board.by).toHaveLength(36);
    expect(board.seq).toBe(2);
    // стирання знімає автора
    const wiped = must(puzzleFill(taras, 't1', 'm1', 0, [{ i, v: '' }], 1150));
    expect(puzzleOf(wiped, 't1')!.by?.[i]).toBe('');
    // учасник іншої команди за «Соняшників» не пише
    expect(puzzleFill(taras, 't1', 'm3', 0, [{ i, v: '2' }], 1200)).toEqual({ ok: false, error: 'not_found' });
    // «Готово» Тараса — за команду
    const fixed = must(puzzleFinish(taras, 't1', 0, 1300));
    expect(record(fixed, 't1')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(puzzleFill(fixed, 't1', 'm1', 0, [{ i, v: '4' }], 1400)).toEqual({ ok: false, error: 'puzzle_done' });
    // «Маки» мають свою дошку
    expect(puzzleOf(fixed, 't2')).toBeNull();
    const maky = must(puzzleFill(fixed, 't2', 'm4', 0, [{ i, v: '6' }], 1500));
    expect(puzzleOf(maky, 't2')!.cells[i]).toBe('6');
    expect(puzzleOf(maky, 't2')!.by?.[i]).toBe('m4');
    expect(puzzleOf(maky, 't1')!.cells[i]).toBe('1');
    // друга команда «Готово» — запитання закрито
    expect(must(puzzleFinish(maky, 't2', 0, 1600)).phase).toBe('locked');
  });

  it('no buffs in the puzzles round', () => {
    const s = startRound(lobbyWith(quizOf([sudoku], { buffs: [...FIRST_BUFFS] }), 'Оля'), 0, rng0);
    expect(buffBlock(s, 'p1', 'double')).toBe('off_puzzles');
    expect(takeBuff(s, 'p1', 'double', 0, rng0).ok).toBe(false);
  });

  it('the grade is not changed by the host', () => {
    const s = fresh();
    expect(submitAnswer(s, 'p1', { type: 'puzzle', kind: 'sudoku', grid: sudoku.solution, filled: 1, total: 1, solved: true }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', { type: 'text', value: 'так' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const fixed = done(s, 'p1');
    expect(override(fixed, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(override(must(lock(fixed, 3000)), 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a done grid stays hidden from the stage and rivals until the reveal', () => {
    const fixed = done(solve(fresh(), 'p1', sudoku), 'p1');
    const locked = must(lock(fixed, 3000));
    for (const s of [fixed, locked]) {
      expect(JSON.stringify(stageView(s))).not.toContain(sudoku.solution);
      expect(JSON.stringify(playerView(s, 'p2'))).not.toContain(sudoku.solution);
    }
    expect(JSON.stringify(stageView(must(next(locked, 4000, rng0))))).toContain(sudoku.solution);
  });

  it('live answers show the fill progress', () => {
    const s = fills(fresh(), 'p1', rightCells(sudoku).slice(0, 2));
    const live = hostLive(s);
    const row = live?.rows.find((r) => r.id === 'p1');
    expect(row?.progress).toEqual({ kind: 'puzzle', filled: 2, total: puzzleTotal(sudoku), done: false });
    expect(row?.answered).toBe(false);
    const fixed = done(s, 'p1');
    expect(hostLive(fixed)?.rows.find((r) => r.id === 'p1')).toMatchObject({ answered: true, progress: { kind: 'puzzle', filled: 2, done: true } });
  });
});

describe('puzzles: players come and go', () => {
  it('removing a player drops their grid', () => {
    let s = fills(fills(fresh(), 'p1', [{ i: firstEmpty, v: '1' }]), 'p2', [{ i: firstEmpty, v: '2' }]);
    s = must(removePlayer(s, 'p2'));
    expect(Object.keys(s.plays[0].puzzle!.boards)).toEqual(['p1']);
    expect(s.plays[0].puzzle!.present).toEqual(['p1', 'p3']);
    // хто лишився, закриває запитання
    s = done(done(s, 'p1'), 'p3');
    expect(s.phase).toBe('locked');
  });

  it('a late joiner fills their own grid', () => {
    const s = fresh();
    expect(s.plays[0].puzzle!.present).toEqual(['p1', 'p2', 'p3']);
    // гравця, що прийшов пізніше, теж приймають
    const late = { ...s, players: [...s.players, { ...s.players[0], id: 'p4', nickname: 'Ганна', score: 0 }] };
    expect(puzzleOf(must(puzzleFill(late, 'p4', 'p4', 0, [{ i: firstEmpty, v: '3' }], 1000)), 'p4')!.cells[firstEmpty]).toBe('3');
  });

  it('closed grids are dropped when the next question opens; the record keeps the grid', () => {
    let s = startRound(lobbyWith(quizOf([sudoku, crosswordFull]), ...PLAYERS), 0);
    s = done(solve(s, 'p1', sudoku), 'p1');
    s = must(lock(s, 3000));
    for (let i = 0; i < 5 && s.phase !== 'question'; i++) s = must(next(s, 4000, rng0));
    expect(s.plays[0].puzzle).toEqual({ present: ['p1', 'p2', 'p3'], boards: {} });
    expect(recordOf(s, 0, 'p1')!.answer).toMatchObject({ grid: sudoku.solution, solved: true });
    expect(s.plays[1].puzzle).toEqual({ present: ['p1', 'p2', 'p3'], boards: {} });
  });
});
