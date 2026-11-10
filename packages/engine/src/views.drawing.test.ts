import { describe, expect, it } from 'vitest';
import type { DrawOp } from '@quiz/shared';
import { drawGuess, drawStroke } from './drawing';
import { lock, next, pause, removePlayer, resume, setConnected, type GameState } from './game';
import { hostLive } from './live';
import { classicRound, drawing, makeQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

/** p1 Оля (малює), p2 Тарас, p3 Петро, p4 Ганна. */
const PLAYERS = ['Оля', 'Тарас', 'Петро', 'Ганна'];
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const SPELLINGS = ['соняшник', 'соняшника'];
const STROKES: DrawOp[] = [
  { op: 'begin', c: 0, w: 1, p: [111, 222, 333, 444] },
  { op: 'begin', c: 1, w: 0, p: [555, 666] },
  { op: 'begin', c: 2, w: 2, p: [777, 888, 901, 902] },
];

const solo = (): GameState => startRound(lobbyWith(makeQuiz([{ ...drawing, accepted: SPELLINGS }, single]), ...PLAYERS), 0);
const teams = (): GameState => must(next(teamGame(teamQuiz([classicRound('r1', [{ ...drawing, accepted: SPELLINGS }, single])]), LAYOUT), 0));
const draws = (s: GameState, id: string, ops: DrawOp[] = STROKES): GameState => ops.reduce((c, op) => must(drawStroke(c, id, op, 1000)), s);
const guess = (s: GameState, id: string): GameState => must(drawGuess(s, id, 'соняшник', 1500));
const view = (s: GameState, id: string) => {
  const v = playerView(s, id);
  if (v === null) throw new Error('no view');
  return v;
};
const spoiled = (json: string) => SPELLINGS.some((w) => json.includes(w));

describe('drawing views', () => {
  it('only the drawer and the host see the word', () => {
    for (const make of [solo, teams]) {
      const drawer = make === solo ? 'p1' : 'm1';
      const others = make === solo ? ['p2', 'p3', 'p4'] : ['m2', 'm3', 'm4'];
      let s = draws(make(), drawer);
      for (const phase of ['question', 'locked'] as const) {
        if (phase === 'locked') s = must(lock(s, 5000));
        expect(s.phase).toBe(phase);
        expect(spoiled(JSON.stringify(stageView(s)))).toBe(false);
        for (const id of others) expect(spoiled(JSON.stringify(view(s, id)))).toBe(false);
        expect(view(s, drawer).me.drawing).toMatchObject({ role: 'drawer', word: 'соняшник' });
        expect(hostView(s).drawing?.word).toBe('соняшник');
      }
    }
  });

  it('the public question has no spellings', () => {
    const s = solo();
    expect(stageView(s).question).not.toBeNull();
    expect(stageView(s).question).not.toHaveProperty('accepted');
    expect(view(s, 'p2').question).not.toHaveProperty('accepted');
  });

  it('names of guessers wait for the reveal', () => {
    let s = guess(draws(solo(), 'p1'), 'p2');
    expect(stageView(s).drawing).toMatchObject({ drawerId: 'p1', drawerName: 'Оля', side: 'p1', guessed: 1, could: 3, word: null, guessers: null, drawerPoints: null });
    expect(view(s, 'p3').drawing).toMatchObject({ guessed: 1, could: 3, guessers: null });
    expect(JSON.stringify(view(s, 'p3').drawing)).not.toContain('Тарас');
    expect(JSON.stringify(stageView(s).drawing)).not.toContain('Тарас');
    expect(hostView(s).drawing?.guessers).toEqual([{ id: 'p2', nickname: 'Тарас', points: 100 }]);
    s = guess(s, 'p3');
    s = must(lock(s, 5000));
    s = must(next(s, 5000));
    expect(s.phase).toBe('reveal');
    const expected = { word: 'соняшник', guessed: 2, could: 3, drawerPoints: 67 };
    for (const v of [stageView(s).drawing, view(s, 'p4').drawing, hostView(s).drawing]) {
      expect(v).toMatchObject(expected);
      expect(v?.guessers).toEqual([
        { id: 'p2', nickname: 'Тарас', points: 100 },
        { id: 'p3', nickname: 'Петро', points: 100 },
      ]);
    }
  });

  it('the views carry no strokes', () => {
    const s = draws(solo(), 'p1');
    for (const v of [stageView(s), hostView(s), view(s, 'p1'), view(s, 'p2')]) {
      const json = JSON.stringify(v);
      expect(json).not.toContain('[111,222');
      expect(json).not.toContain('"strokes"');
      expect(v.drawing?.rev).toBe(3);
    }
  });

  it('phone roles', () => {
    let s = draws(solo(), 'p1');
    expect(view(s, 'p1').me.drawing).toMatchObject({ role: 'drawer', canDraw: true, canGuess: false, guessed: false });
    expect(view(s, 'p2').me.drawing).toEqual({ role: 'guesser', word: null, guessed: false, canDraw: false, canGuess: true, points: null });
    s = guess(s, 'p2');
    expect(view(s, 'p2').me.drawing).toMatchObject({ role: 'guesser', guessed: true, canGuess: false });
    expect(view(s, 'p3').me.drawing).toMatchObject({ canGuess: true });
    const held = must(pause(s, 2000));
    expect(view(held, 'p1').me.drawing).toMatchObject({ canDraw: false });
    expect(view(held, 'p3').me.drawing).toMatchObject({ canGuess: false });
    expect(view(must(resume(held, 3000)), 'p3').me.drawing).toMatchObject({ canGuess: true });
    const team = teams();
    expect(view(team, 'm1').me.drawing).toMatchObject({ role: 'drawer', canDraw: true });
    expect(view(team, 'm2').me.drawing).toMatchObject({ role: 'teammate', canGuess: false, canDraw: false, word: null });
    expect(view(team, 'm3').me.drawing).toMatchObject({ role: 'guesser', canGuess: true, word: null });
  });

  it('the answered counters agree on the stage and the host', () => {
    const s = guess(draws(solo(), 'p1'), 'p3');
    for (const v of [stageView(s), hostView(s)]) {
      expect(v.answeredCount).toBe(1);
      expect(v.playerCount).toBe(3);
    }
  });

  it('other questions are unchanged', () => {
    let second = must(lock(solo(), 2000));
    for (let i = 0; i < 5 && second.plays[second.questionIndex].question.type === 'drawing'; i++) second = must(next(second, 2000));
    expect(second.plays[second.questionIndex].question.type).toBe('single');
    for (const v of [stageView(second), hostView(second), view(second, 'p1')]) {
      expect(v).not.toHaveProperty('drawing');
      expect(v).not.toHaveProperty('me.drawing');
    }
    expect(JSON.stringify(stageView(second))).not.toContain('"drawing"');
  });
});

describe('drawing views of a removed player', () => {
  it('skip ids that are no longer in the game', () => {
    let s = guess(guess(draws(solo(), 'p1'), 'p2'), 'p3');
    s = must(lock(s, 5000));
    s = must(next(s, 5000));
    expect(s.phase).toBe('reveal');
    for (const gone of ['p2', 'p1']) {
      s = must(removePlayer(s, gone, 6000));
      for (const v of [stageView(s).drawing, hostView(s).drawing, view(s, 'p4').drawing]) {
        expect(v?.guessers?.every((g) => g.nickname !== '')).toBe(true);
        expect(v?.guessers?.some((g) => g.id === gone)).toBe(false);
        expect(v?.drawerName === null || v?.drawerName !== '').toBe(true);
      }
    }
    expect(hostLive(s)).toBeNull();
  });
});

describe('drawing live rows', () => {
  it('live rows of a drawing show who guessed and who draws', () => {
    const s = guess(draws(solo(), 'p1'), 'p2');
    const live = hostLive(s);
    expect(live).not.toBeNull();
    const rows = live?.rows ?? [];
    expect(rows.find((r) => r.id === 'p1')).toMatchObject({ answered: false, progress: { kind: 'drawing', role: 'drawer', guessed: false } });
    expect(rows.find((r) => r.id === 'p2')).toMatchObject({ answered: true, answer: null, verdict: null, progress: { kind: 'drawing', role: 'guesser', guessed: true } });
    expect(rows.find((r) => r.id === 'p3')).toMatchObject({ answered: false, progress: { kind: 'drawing', role: 'guesser', guessed: false } });
    expect(JSON.stringify(live)).not.toContain('соняшник');
    // лічильник пульта — без художника, як «могли» на сцені
    expect(live).toMatchObject({ answered: 1, total: 3 });
    expect(live?.total).toBe(stageView(s).drawing?.could);
    const away = must(setConnected(s, 'p4', false, 1600));
    expect(hostLive(away)).toMatchObject({ answered: 1, total: 2 });
    expect(stageView(away).drawing?.could).toBe(2);
  });

  it('a team drawing: names on the reveal, the drawer by name, rows by teams', () => {
    // m1 Оля з t1 малює, m3 Петро з t2 («Сині») вгадує
    let s = guess(draws(teams(), 'm1'), 'm3');
    const live = hostLive(s);
    expect(live?.rows.map((r) => r.id)).toEqual(['t1', 't2']);
    expect(live?.rows.find((r) => r.id === 't1')).toMatchObject({ answered: false, progress: { kind: 'drawing', role: 'drawer' } });
    expect(live?.rows.find((r) => r.id === 't2')).toMatchObject({ answered: true, progress: { kind: 'drawing', role: 'guesser', guessed: true } });
    // команда художника не в лічильнику
    expect(live).toMatchObject({ answered: 1, total: 1 });
    expect(stageView(s).drawing).toMatchObject({ drawerId: 'm1', drawerName: 'Оля', side: 't1', guessed: 1, could: 1, guessers: null, word: null });
    expect(hostView(s).drawing).toMatchObject({ drawerName: 'Оля', guessers: [{ id: 't2', nickname: 'Сині', points: 100 }] });
    expect(s.phase).toBe('locked');
    s = must(next(s, 5000));
    expect(s.phase).toBe('reveal');
    for (const v of [stageView(s).drawing, view(s, 'm4').drawing, view(s, 'm2').drawing]) {
      expect(v).toMatchObject({ drawerName: 'Оля', side: 't1', word: 'соняшник', guessers: [{ id: 't2', nickname: 'Сині', points: 100 }], drawerPoints: 100 });
    }
    expect(view(s, 'm4').me.drawing).toMatchObject({ role: 'guesser', guessed: true, points: 100 });
    expect(view(s, 'm2').me.drawing).toMatchObject({ role: 'teammate', guessed: false, points: 100 });
  });
});
