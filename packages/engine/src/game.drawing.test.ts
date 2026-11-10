import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type DrawOp, type Question } from '@quiz/shared';
import { drawGuess, drawingCould, drawingDone, drawingOf, drawingPoints, drawStroke, pickDrawer, scoreDrawing } from './drawing';
import { lock, next, pause, recordOf, removePlayer, setConnected, submitAnswer, type GameState } from './game';
import { actorOf } from './team-act';
import { classicRound, drawing, makeQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, openAt, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

/** p1 Оля, p2 Тарас, p3 Петро, p4 Ганна. */
const PLAYERS = ['Оля', 'Тарас', 'Петро', 'Ганна'];
/** m1 Оля, m2 Тарас — t1 («Соняшники»); m3 Петро, m4 Ганна — t2 («Маки»). */
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const d = (n: number): Question => withId(drawing, `d${n}`);
const BEGIN: DrawOp = { op: 'begin', c: 0, w: 1, p: [10, 10, 20, 20] };

const fresh = (questions: Question[] = [drawing], options: Parameters<typeof makeQuiz>[1] = {}, names: string[] = PLAYERS) =>
  startRound(lobbyWith(makeQuiz(questions, options), ...names), 0);
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);
const drawerOf = (s: GameState) => s.plays[s.questionIndex].drawing?.drawerId;

/** Закрити поточне запитання (якщо відкрите) і пройти до наступного. */
function toNext(s: GameState, now: number): GameState {
  let x = s.phase === 'question' ? must(lock(s, now)) : s;
  for (let i = 0; i < 10 && x.phase !== 'question'; i++) x = must(next(x, now));
  return x;
}

function draws(s: GameState, memberId: string, ops: DrawOp[], now = 1000): GameState {
  return ops.reduce((current, op) => must(drawStroke(current, memberId, op, now)), s);
}

function guesses(s: GameState, ids: string[], text = 'соняшник', now = 1000): GameState {
  return ids.reduce((current, id) => must(drawGuess(current, id, text, now)), s);
}

describe('drawing: who draws', () => {
  it('drawers take turns and skip the offline', () => {
    const q1 = fresh([d(1), d(2), single, d(3), d(4)]);
    expect(q1.plays[0].drawing).toEqual({ drawerId: 'p1', side: 'p1', strokes: [], rev: 0, guessed: [] });
    expect(q1.drawTurns).toEqual({ last: 'p1', members: {} });
    const q2 = toNext(q1, 1000);
    expect(drawerOf(q2)).toBe('p2');
    // звичайне запитання черги не зсуває
    const plain = toNext(q2, 2000);
    expect(plain.plays[plain.questionIndex].question.type).toBe('single');
    expect('drawing' in plain.plays[plain.questionIndex]).toBe(false);
    expect(plain.drawTurns).toEqual({ last: 'p2', members: {} });
    expect(drawerOf(toNext(plain, 3000))).toBe('p3');
    // Петро відключився — малює Ганна, далі по колу Оля
    const away = must(setConnected(plain, 'p3', false, 2500));
    const q3 = toNext(away, 3000);
    expect(drawerOf(q3)).toBe('p4');
    expect(drawerOf(toNext(q3, 4000))).toBe('p1');
  });

  it('nobody online still opens the drawing', () => {
    let lobby = lobbyWith(makeQuiz([drawing]), ...PLAYERS);
    for (const id of ['p1', 'p2', 'p3', 'p4']) lobby = must(setConnected(lobby, id, false, 0));
    const s = startRound(lobby, 0);
    expect(s.phase).toBe('question');
    expect(drawerOf(s)).toBe('p1');
    expect(pickDrawer(lobby)).toEqual({ drawerId: 'p1', side: 'p1' });
  });

  it('an awaited player still counts as online', () => {
    const base = fresh([d(1), d(2)]);
    const s = { ...must(setConnected(base, 'p2', false, 500)), awaiting: ['p2'] };
    expect(drawerOf(toNext(s, 1000))).toBe('p2');
  });

  it('teams take turns and so do their members', () => {
    const quiz = teamQuiz([classicRound('r1', [d(1), d(2), d(3), d(4), d(5)])]);
    const q1 = must(next(teamGame(quiz, LAYOUT), 0));
    expect(q1.plays[0].drawing).toMatchObject({ drawerId: 'm1', side: 't1' });
    expect(q1.drawTurns).toEqual({ last: 't1', members: { t1: 'm1' } });
    const q2 = toNext(q1, 1000);
    expect(q2.plays[1].drawing).toMatchObject({ drawerId: 'm3', side: 't2' });
    expect(q2.drawTurns).toEqual({ last: 't2', members: { t1: 'm1', t2: 'm3' } });
    const q3 = toNext(q2, 2000);
    expect(drawerOf(q3)).toBe('m2');
    const q4 = toNext(q3, 3000);
    expect(drawerOf(q4)).toBe('m4');
    expect(drawerOf(toNext(q4, 4000))).toBe('m1');
    // Тарас відключився — черга «Соняшників» іде Олі
    const away = must(setConnected(q2, 'm2', false, 1500));
    const q3away = toNext(away, 2000);
    expect(q3away.plays[2].drawing).toMatchObject({ drawerId: 'm1', side: 't1' });
    expect(drawerOf(toNext(q3away, 3000))).toBe('m4');
  });

  it('a drawer who drops mid-question stays the drawer', () => {
    const s = must(setConnected(fresh(), 'p1', false, 500));
    expect(drawerOf(s)).toBe('p1');
    const back = must(setConnected(s, 'p1', true, 800));
    expect(must(drawStroke(back, 'p1', BEGIN, 1000)).plays[0].drawing?.rev).toBe(1);
  });
});

describe('drawing: strokes', () => {
  it('only the drawer draws', () => {
    const s = fresh();
    expect(drawStroke(s, 'p2', BEGIN, 1000)).toEqual({ ok: false, error: 'drawing_not_drawer' });
    expect(drawStroke(s, 'p9', BEGIN, 1000)).toEqual({ ok: false, error: 'not_found' });
    const one = must(drawStroke(s, 'p1', BEGIN, 1000));
    expect(one.plays[0].drawing).toMatchObject({ rev: 1, strokes: [{ c: 0, w: 1, p: [10, 10, 20, 20] }] });
    const more = must(drawStroke(one, 'p1', { op: 'more', index: 0, p: [30, 30] }, 1100));
    expect(more.plays[0].drawing).toMatchObject({ rev: 2, strokes: [{ c: 0, w: 1, p: [10, 10, 20, 20, 30, 30] }] });
    expect(drawStroke(more, 'p1', { op: 'more', index: 1, p: [40, 40] }, 1100)).toEqual({ ok: false, error: 'drawing_stale' });
    const two = must(drawStroke(more, 'p1', { op: 'begin', c: 8, w: 2, p: [500, 500] }, 1200));
    expect(drawStroke(two, 'p1', { op: 'more', index: 0, p: [40, 40] }, 1200)).toEqual({ ok: false, error: 'drawing_stale' });
    const undone = must(drawStroke(two, 'p1', { op: 'undo' }, 1300));
    expect(undone.plays[0].drawing).toMatchObject({ rev: 4, strokes: [{ c: 0, w: 1, p: [10, 10, 20, 20, 30, 30] }] });
    const cleared = must(drawStroke(undone, 'p1', { op: 'clear' }, 1400));
    expect(cleared.plays[0].drawing).toMatchObject({ rev: 5, strokes: [] });
    // порожній малюнок: «крок назад» і «очистити» нічого не міняють
    const same = drawStroke(cleared, 'p1', { op: 'undo' }, 1500);
    expect(same.ok && same.state).toBe(cleared);
    const same2 = drawStroke(cleared, 'p1', { op: 'clear' }, 1500);
    expect(same2.ok && same2.state).toBe(cleared);
    expect(drawStroke(cleared, 'p1', { op: 'more', index: 0, p: [1, 1] }, 1500)).toEqual({ ok: false, error: 'drawing_stale' });
    // інший тип запитання
    const other = startRound(lobbyWith(makeQuiz([single]), 'Оля'), 0);
    expect(drawStroke(other, 'p1', BEGIN, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(drawGuess(other, 'p1', 'соняшник', 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(drawingOf(other)).toBeNull();
  });

  it('the drawing has limits', () => {
    const point: DrawOp = { op: 'begin', c: 1, w: 0, p: [1, 1] };
    let many = fresh();
    for (let i = 0; i < 300; i++) many = must(drawStroke(many, 'p1', point, 1000));
    expect(drawStroke(many, 'p1', point, 1000)).toEqual({ ok: false, error: 'drawing_full' });
    // штрих не довший за 400 точок
    const long: number[] = Array.from({ length: 800 }, (_, i) => i % 1000);
    const one = must(drawStroke(fresh(), 'p1', { op: 'begin', c: 0, w: 0, p: long }, 1000));
    expect(drawStroke(one, 'p1', { op: 'more', index: 0, p: [5, 5] }, 1000)).toEqual({ ok: false, error: 'drawing_full' });
    expect(drawStroke(fresh(), 'p1', { op: 'begin', c: 0, w: 0, p: [...long, 5, 5] }, 1000)).toEqual({ ok: false, error: 'drawing_full' });
    // малюнок не більший за 8000 точок
    let full = fresh();
    for (let i = 0; i < 20; i++) full = must(drawStroke(full, 'p1', { op: 'begin', c: 0, w: 0, p: long }, 1000));
    expect(drawStroke(full, 'p1', point, 1000)).toEqual({ ok: false, error: 'drawing_full' });
    // після «очистити» місце звільняється
    const cleared = must(drawStroke(full, 'p1', { op: 'clear' }, 1000));
    expect(must(drawStroke(cleared, 'p1', point, 1000)).plays[0].drawing?.strokes).toHaveLength(1);
    const cleared2 = must(drawStroke(many, 'p1', { op: 'undo' }, 1000));
    expect(drawStroke(cleared2, 'p1', point, 1000).ok).toBe(true);
  });

  it('no drawing in a pause, before the start or after the time', () => {
    const s = fresh();
    const paused = must(pause(s, 1000));
    expect(drawStroke(paused, 'p1', BEGIN, 1000)).toEqual({ ok: false, error: 'paused' });
    expect(drawGuess(paused, 'p2', 'соняшник', 1000)).toEqual({ ok: false, error: 'paused' });
    const splash = openAt(lobbyWithSplash(makeQuiz([drawing]), 'Оля', 'Тарас'), 0);
    expect(splash.splash).not.toBeNull();
    expect(drawStroke(splash, 'p1', BEGIN, 100)).toEqual({ ok: false, error: 'not_started' });
    expect(drawGuess(splash, 'p2', 'соняшник', 100)).toEqual({ ok: false, error: 'not_started' });
    expect(drawStroke(s, 'p1', BEGIN, 60_001)).toEqual({ ok: false, error: 'time_over' });
    expect(drawGuess(s, 'p2', 'соняшник', 60_001)).toEqual({ ok: false, error: 'time_over' });
    expect(drawStroke(s, 'p1', BEGIN, 60_000).ok).toBe(true);
    const locked = must(lock(s, 2000));
    expect(drawStroke(locked, 'p1', BEGIN, 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(drawGuess(locked, 'p2', 'соняшник', 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(drawingOf(locked)).not.toBeNull();
  });
});

describe('drawing: guesses', () => {
  it('a guess forgives typos and tells nothing else', () => {
    const s = fresh();
    const taras = must(drawGuess(s, 'p2', 'соняшнк', 1000));
    expect(record(taras, 'p2')).toEqual({
      answer: { type: 'drawing', guess: 'соняшнк', drew: null },
      timeMs: 1000,
      accepted: true,
      accuracy: 1,
      grade: 'correct',
      basePoints: 100,
      streakBonus: 0,
      points: 100,
      overridden: false,
    });
    expect(taras.plays[0].drawing?.guessed).toEqual(['p2']);
    expect(drawGuess(taras, 'p3', 'ромашка', 1100)).toEqual({ ok: false, error: 'drawing_miss' });
    expect(drawGuess(taras, 'p3', '', 1100)).toEqual({ ok: false, error: 'drawing_miss' });
    expect(drawGuess(taras, 'p2', 'соняшник', 1200)).toEqual({ ok: false, error: 'already_answered' });
    expect(drawGuess(taras, 'p2', 'ромашка', 1200)).toEqual({ ok: false, error: 'already_answered' });
    expect(drawGuess(taras, 'p1', 'соняшник', 1200)).toEqual({ ok: false, error: 'drawing_own' });
    expect(drawGuess(taras, 'p9', 'соняшник', 1200)).toEqual({ ok: false, error: 'not_found' });
    // звичайна відповідь на малюнок не йде
    expect(submitAnswer(s, 'p2', { type: 'text', value: 'соняшник' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p2', { type: 'drawing', guess: 'соняшник', drew: null }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it("the drawer's team does not guess", () => {
    const s = must(next(teamGame(teamQuiz([classicRound('r1', [drawing])]), LAYOUT), 0));
    for (const [member, team] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']] as const) {
      expect(actorOf(s, member, 'answer'), member).toEqual({ ok: true, id: team });
    }
    expect(drawStroke(s, 'm2', BEGIN, 1000)).toEqual({ ok: false, error: 'drawing_not_drawer' });
    expect(drawGuess(s, 'm2', 'соняшник', 1000)).toEqual({ ok: false, error: 'drawing_own' });
    expect(drawGuess(s, 'm1', 'соняшник', 1000)).toEqual({ ok: false, error: 'drawing_own' });
    const maky = must(drawGuess(s, 'm4', 'соняшник', 1000));
    expect(record(maky, 't2')).toMatchObject({ grade: 'correct', points: 100 });
    // єдина команда, що могла, вгадала — запитання закрито
    expect(maky.phase).toBe('locked');
    expect(record(maky, 't1')).toMatchObject({ answer: { type: 'drawing', guess: null, drew: { guessed: 1, could: 1 } }, points: 100, grade: 'correct' });
    const before = must(drawGuess(must(setConnected(s, 'm1', false, 500)), 'm3', 'соняшник', 1000));
    expect(drawGuess(before, 'm4', 'соняшник', 1000)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('drawing: points', () => {
  it('the drawer gets a share for every guesser', () => {
    const s = guesses(fresh(), ['p2', 'p3']);
    expect(s.phase).toBe('question');
    expect(drawingCould(s, s.plays[0])).toEqual(['p2', 'p3', 'p4']);
    expect(drawingPoints(s, s.plays[0])).toBe(100);
    const locked = must(lock(s, 5000));
    expect(record(locked, 'p1')).toEqual({
      answer: { type: 'drawing', guess: null, drew: { guessed: 2, could: 3 } },
      timeMs: 60_000,
      accepted: false,
      accuracy: 2 / 3,
      grade: 'partial',
      basePoints: 67,
      streakBonus: 0,
      points: 67,
      overridden: false,
    });
    expect(record(locked, 'p4')).toMatchObject({ answer: { type: 'drawing', guess: null, drew: null }, points: 0, grade: 'wrong', accepted: false, accuracy: 0 });
    expect(locked.plays[0].drawing?.scored).toEqual({ guessed: 2, could: 3 });
    expect(locked.players.map((p) => p.score)).toEqual([67, 100, 100, 0]);
    // множник раунду ×2; мінус раунду й швидкість не діють
    const rules = { speedBonus: true, rules: { ...DEFAULT_RULES, multiplier: 2 as const, penalty: 'minus' as const } };
    const doubled = must(lock(guesses(fresh([drawing], rules), ['p2', 'p3'], 'соняшник', 30_000), 40_000));
    expect(['p1', 'p2', 'p3', 'p4'].map((id) => record(doubled, id)?.points)).toEqual([133, 200, 200, 0]);
  });

  it('an offline non-guesser does not cost the drawer', () => {
    const s = guesses(fresh(), ['p2', 'p3']);
    const away = must(setConnected(s, 'p4', false, 2000));
    // той, хто не вгадав і пішов, закриття не тримає
    expect(away.phase).toBe('locked');
    expect(record(away, 'p1')).toMatchObject({ answer: { type: 'drawing', guess: null, drew: { guessed: 2, could: 2 } }, points: 100, grade: 'correct', accepted: true, accuracy: 1 });
    expect(record(away, 'p4')).toMatchObject({ points: 0, grade: 'wrong' });
  });

  it('nobody could guess gives the drawer nothing', () => {
    const locked = must(lock(fresh([drawing], {}, ['Оля']), 5000));
    expect(record(locked, 'p1')).toMatchObject({ answer: { type: 'drawing', guess: null, drew: { guessed: 0, could: 0 } }, points: 0, grade: 'wrong', accuracy: 0 });
    // з гравцями, що не вгадали, — так само «неправильно»
    const none = must(lock(fresh(), 5000));
    expect(record(none, 'p1')).toMatchObject({ answer: { type: 'drawing', guess: null, drew: { guessed: 0, could: 3 } }, points: 0, grade: 'wrong' });
  });

  it('everyone guessed closes the question', () => {
    const two = guesses(fresh(), ['p2', 'p3']);
    expect(drawingDone(two)).toBe(false);
    expect(two.phase).toBe('question');
    const all = guesses(two, ['p4']);
    expect(all.phase).toBe('locked');
    expect(record(all, 'p1')).toMatchObject({ points: 100, grade: 'correct' });
    // відключений, що не вгадав, закриття не тримає
    const off = must(setConnected(fresh(), 'p4', false, 500));
    expect(guesses(off, ['p2', 'p3']).phase).toBe('locked');
    // без вгадувачів на зв'язку запитання само не закривається
    expect(fresh([drawing], {}, ['Оля']).phase).toBe('question');
  });

  it('the counts freeze at the close', () => {
    const locked = must(lock(guesses(fresh(), ['p2', 'p3']), 5000));
    const late = must(removePlayer(locked, 'p3'));
    expect(late.plays[0].drawing?.scored).toEqual({ guessed: 2, could: 3 });
    expect(record(late, 'p1')?.points).toBe(67);
    expect(late.players.find((p) => p.id === 'p1')?.score).toBe(67);
    expect(scoreDrawing(late)).toBe(late);
  });

  it('a removed drawer leaves the drawing to nobody', () => {
    const s = draws(fresh(), 'p1', [BEGIN]);
    const removed = must(removePlayer(s, 'p1'));
    expect(removed.plays[0].drawing).toMatchObject({ drawerId: null, side: null, rev: 1 });
    expect(drawStroke(removed, 'p2', BEGIN, 1000)).toEqual({ ok: false, error: 'drawing_not_drawer' });
    const two = guesses(removed, ['p2', 'p3']);
    expect(two.phase).toBe('question');
    const all = guesses(two, ['p4']);
    expect(all.phase).toBe('locked');
    expect(['p2', 'p3', 'p4'].map((id) => record(all, id)?.points)).toEqual([100, 100, 100]);
    // вилучений, що вгадав, зникає з тих, хто вгадав
    const guessedGone = must(removePlayer(guesses(fresh(), ['p2']), 'p2'));
    expect(guessedGone.plays[0].drawing?.guessed).toEqual([]);
    // командна гра: художника вилучено, а його команда отримує бали художника
    const team = must(next(teamGame(teamQuiz([classicRound('r1', [drawing])]), LAYOUT), 0));
    const left = must(removePlayer(team, 'm1'));
    expect(left.plays[0].drawing).toMatchObject({ drawerId: null, side: 't1' });
    expect(drawGuess(left, 'm2', 'соняшник', 1000)).toEqual({ ok: false, error: 'drawing_own' });
    const closed = must(drawGuess(left, 'm3', 'соняшник', 1000));
    expect(closed.phase).toBe('locked');
    expect(record(closed, 't1')).toMatchObject({ points: 100, grade: 'correct' });
  });
});
