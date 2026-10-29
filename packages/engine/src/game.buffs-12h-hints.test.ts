import { DEFAULT_RULES, type Answer, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { buffBlock, buffOf, letterOf, pickScope, takeBuff } from './buffs';
import { lock, next, recordOf, submitAnswer, type GameState } from './game';
import { T0, toOthersQuestion, toPowersQuestion } from './testing/buffs';
import { bluff, makeQuiz, numeric, pin, single4, slider, text } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng0 = () => 0;
const rngHalf = () => 0.5;
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const take = (s: GameState, id: string, kind: Parameters<typeof takeBuff>[2], at: number, rng = rng0) => must(takeBuff(s, id, kind, at, rng));
const scopeOf = (s: GameState, id: string) => playerView(s, id)?.me.buffs?.active?.scope;
const letterView = (s: GameState, id: string) => playerView(s, id)?.me.buffs?.active?.letter;

/** Від відкритого запитання класики: закриття, розкриття, наступне запитання о at. */
const toNext = (s: GameState, at: number) => must(next(must(next(s.phase === 'question' ? must(lock(s)) : s, at, rng0)), at, rng0));
/** Сили, відкрите запитання n (1-базове); кожне наступне — на 30 с пізніше. */
const toPowers = (n: number, s: GameState = toPowersQuestion()) => {
  let current = s;
  for (let i = 1; i < n; i += 1) current = toNext(current, T0 + i * 30_000);
  return current;
};
const at = (n: number, ms: number) => T0 + (n - 1) * 30_000 + ms;
const toSlider = () => toPowers(3);

/** Одне запитання в класиці з бафами «Бінокль» і «Перша літера». */
const open = (question: Question) => startRound(lobbyWith(makeQuiz([question], { buffs: ['letter', 'scope'] }), 'Оля', 'Петро'), T0, rng0);

describe('binoculars (12h)', () => {
  it('binoculars on a slider: a 20 % range with the right answer inside, placed by rng', () => {
    const s = take(toSlider(), 'p1', 'scope', at(3, 500), rngHalf); // q3: 0–100, правильна 50
    expect(buffOf(s.plays[s.questionIndex], 'p1')?.range).toEqual({ min: 40, max: 60 });
    expect(scopeOf(s, 'p1')).toEqual({ kind: 'range', min: 40, max: 60 });
    expect(buffOf(s.plays[s.questionIndex], 'p1')).not.toHaveProperty('zoom');
  });

  it('a slider range starts at the right answer with rng 0, is pressed to the edge and sticks outward to the step', () => {
    expect(pickScope(slider, rng0)).toEqual({ range: { min: 50, max: 70 } });
    expect(pickScope({ ...slider, correct: 95 }, rng0)).toEqual({ range: { min: 80, max: 100 } });
    expect(pickScope({ ...slider, correct: 5 }, () => 0.9)).toEqual({ range: { min: 0, max: 20 } });
    // Крок 5 від min 3: 42 → 38 вниз, 62 → 63 вгору.
    const stepped = { ...slider, min: 3, max: 103, step: 5, correct: 48 } satisfies Question;
    const { range } = pickScope(stepped, () => 0.3);
    expect(range).toEqual({ min: 38, max: 63 });
    expect((range!.min - 3) % 5).toBe(0);
    expect((range!.max - 3) % 5).toBe(0);
    // Дробовий крок не дає хвостів на кшталт 0.30000000000000004.
    expect(pickScope({ ...slider, min: 0, max: 1, step: 0.1, correct: 0.3 }, () => 0.5)).toEqual({ range: { min: 0.2, max: 0.4 } });
  });

  it('a number range is ±10 %, at least ±2, rounded outward to the decimals of the right answer', () => {
    let s = take(toPowers(4), 'p1', 'scope', at(4, 500), rngHalf); // q4: 2061
    expect(buffOf(s.plays[s.questionIndex], 'p1')?.range).toEqual({ min: 1854, max: 2268 });
    expect(scopeOf(s, 'p1')).toEqual({ kind: 'range', min: 1854, max: 2268 });
    expect(pickScope({ ...numeric, correct: 12 }, rng0)).toEqual({ range: { min: 12, max: 16 } });
    expect(pickScope({ ...numeric, correct: 12 }, () => 1)).toEqual({ range: { min: 8, max: 12 } });
    expect(pickScope({ ...numeric, correct: 1.5 }, rngHalf)).toEqual({ range: { min: -0.5, max: 3.5 } });
    // ±10 % від 31,4 — 3,14: межі з одним знаком, назовні.
    expect(pickScope({ ...numeric, correct: 31.4 }, () => 0.3)).toEqual({ range: { min: 29.5, max: 35.8 } });
    expect(pickScope({ ...numeric, correct: -500 }, rngHalf)).toEqual({ range: { min: -550, max: -450 } });
  });

  it('a pin gets a window of half the width and half the height with the target inside', () => {
    const s = take(toPowers(5), 'p1', 'scope', at(5, 500), rngHalf); // q5: ціль у центрі
    expect(buffOf(s.plays[s.questionIndex], 'p1')?.zoom).toEqual({ x: 0.25, y: 0.25, size: 0.5 });
    expect(buffOf(s.plays[s.questionIndex], 'p1')).not.toHaveProperty('range');
    expect(scopeOf(s, 'p1')).toEqual({ kind: 'zoom', x: 0.25, y: 0.25, size: 0.5 });
    const corner = pickScope({ ...pin, target: { x: 0.9, y: 0.1 } }, rng0);
    expect(corner).toEqual({ zoom: { x: 0.5, y: 0.1, size: 0.5 } });
    // Два виклики rng: перший — x, другий — y.
    const draws = [0.2, 0.8];
    const { zoom } = pickScope({ ...pin, target: { x: 0.6, y: 0.7 } }, () => draws.shift()!);
    expect(zoom!.x).toBeCloseTo(0.5);
    expect(zoom!.y).toBeCloseTo(0.3);
    expect(zoom!.size).toBe(0.5);
    expect(zoom!.x).toBeLessThanOrEqual(0.6);
    expect(zoom!.x + zoom!.size).toBeGreaterThanOrEqual(0.6);
    expect(zoom!.y).toBeLessThanOrEqual(0.7);
    expect(zoom!.y + zoom!.size).toBeGreaterThanOrEqual(0.7);
  });

  it('the right answer is always inside', () => {
    for (const r of [0, 0.13, 0.5, 0.77, 0.999]) {
      for (const correct of [0, 1, 7, 50, 93, 100]) {
        const { range } = pickScope({ ...slider, step: 3, correct }, () => r);
        expect(range!.min).toBeLessThanOrEqual(correct);
        expect(range!.max).toBeGreaterThanOrEqual(correct);
        expect(range!.min).toBeGreaterThanOrEqual(0);
        expect(range!.max).toBeLessThanOrEqual(100);
      }
      for (const correct of [0, 0.25, -3.75, 12, 2061, 123.456]) {
        const { range } = pickScope({ ...numeric, correct }, () => r);
        expect(range!.min).toBeLessThanOrEqual(correct);
        expect(range!.max).toBeGreaterThanOrEqual(correct);
      }
    }
  });

  it('other types get nothing and do not draw', () => {
    let draws = 0;
    const rng = () => {
      draws += 1;
      return 0.5;
    };
    expect(pickScope(text, rng)).toEqual({});
    expect(pickScope(single4, rng)).toEqual({});
    expect(draws).toBe(0);
  });

  it('the range stays the same after a restart', () => {
    const s = take(toSlider(), 'p1', 'scope', at(3, 500), () => 0.37);
    const range = buffOf(s.plays[s.questionIndex], 'p1')?.range;
    const restored = JSON.parse(JSON.stringify(s)) as GameState;
    expect(buffOf(restored.plays[restored.questionIndex], 'p1')?.range).toEqual(range);
    expect(scopeOf(restored, 'p1')).toEqual(scopeOf(s, 'p1'));
  });

  it('binoculars pay the usual points', () => {
    let s = take(toSlider(), 'p1', 'scope', at(3, 500), rngHalf);
    s = answer(s, 'p1', { type: 'slider', value: 50 }, at(3, 1000));
    s = answer(s, 'p2', { type: 'slider', value: 50 }, at(3, 1000));
    s = answer(s, 'p3', { type: 'slider', value: 59 }, at(3, 1000));
    expect(recordOf(s, 2, 'p1')).toMatchObject({ basePoints: 1000, points: 1000, buff: 'scope' });
    expect(recordOf(s, 2, 'p1')?.basePoints).toBe(recordOf(s, 2, 'p2')?.basePoints);
    s = take(toPowers(4), 'p1', 'scope', at(4, 500), rngHalf);
    s = answer(s, 'p1', { type: 'numeric', value: 2061 }, at(4, 1000));
    expect(recordOf(s, 3, 'p1')).toMatchObject({ basePoints: 1000, buff: 'scope' });
  });
});

describe('first letter (12h)', () => {
  it('the phone gets the first letter, the mask and the letter count of the first spelling', () => {
    const s = take(toPowers(2), 'p1', 'letter', at(2, 500)); // q2 text «Одеса»
    expect(letterView(s, 'p1')).toEqual({ first: 'О', mask: 'О _ _ _ _', letters: 5 });
    expect(scopeOf(s, 'p1')).toBeNull();
    const clues = take(toPowers(6), 'p1', 'letter', at(6, 500)); // q6 clues «Шевченко»
    expect(letterView(clues, 'p1')).toEqual({ first: 'Ш', mask: 'Ш _ _ _ _ _ _ _', letters: 8 });
    expect(letterOf(text)).toEqual({ first: 'О', mask: 'О _ _ _ _', letters: 5 });
    expect(letterOf(single4)).toBeNull();
  });

  it('only the owner sees the mask: not another player, the stage or the host', () => {
    const s = take(toPowers(2), 'p1', 'letter', at(2, 500));
    expect(playerView(s, 'p2')?.me.buffs?.active).toBeNull();
    expect(JSON.stringify(stageView(s))).not.toContain('О _');
    expect(JSON.stringify(hostView(s))).not.toContain('О _');
  });

  it('a right answer pays 75 %, a wrong one keeps the full penalty', () => {
    let s = take(toPowers(2), 'p1', 'letter', at(2, 500));
    s = answer(s, 'p1', { type: 'text', value: 'Одеса' }, at(2, 1000));
    expect(recordOf(s, 1, 'p1')).toMatchObject({ basePoints: 750, points: 750, buff: 'letter' });

    let minus = toPowers(2, toPowersQuestion({ rules: { ...DEFAULT_RULES, penalty: 'minus' } }));
    minus = take(minus, 'p1', 'letter', at(2, 500));
    minus = answer(minus, 'p1', { type: 'text', value: 'Київ' }, at(2, 1000));
    expect(recordOf(minus, 1, 'p1')).toMatchObject({ basePoints: -1000, points: -1000, buff: 'letter' });
  });
});

describe('where the first letter and the binoculars go (12h)', () => {
  it('first letter: text and clues only; binoculars: number, slider and pin only; neither on a bluff', () => {
    expect(buffBlock(open(single4), 'p1', 'letter')).toBe('unfit_type');
    expect(buffBlock(open(slider), 'p1', 'letter')).toBe('unfit_type');
    expect(buffBlock(open(text), 'p1', 'letter')).toBeNull();
    expect(buffBlock(open(text), 'p1', 'scope')).toBe('unfit_type');
    expect(buffBlock(open(single4), 'p1', 'scope')).toBe('unfit_type');
    expect(buffBlock(open(numeric), 'p1', 'scope')).toBeNull();
    expect(buffBlock(open(pin), 'p1', 'scope')).toBeNull();
    expect(buffBlock(open(bluff), 'p1', 'letter')).toBe('unfit_bluff');
    expect(buffBlock(open(bluff), 'p1', 'scope')).toBe('unfit_bluff');
    expect(takeBuff(open(single4), 'p1', 'letter', T0 + 500, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('after a swap the spare cannot get the first letter or the binoculars: one buff per question', () => {
    let s = toOthersQuestion({ buffs: ['swap', 'letter', 'scope'] });
    s = toNext(must(lock(s)), T0);
    s = toNext(must(lock(s)), T0); // q3 text «Львів»
    expect(s.plays[s.questionIndex].question.type).toBe('text');
    expect(buffBlock(s, 'p1', 'letter')).toBeNull();
    s = take(s, 'p1', 'swap', T0 + 1000);
    expect(buffOf(s.plays[s.questionIndex], 'p1')?.spare).toBeDefined();
    expect(buffBlock(s, 'p1', 'letter')).toBe('taken');
    expect(buffBlock(s, 'p1', 'scope')).toBe('taken');
    expect(takeBuff(s, 'p1', 'letter', T0 + 1500, rng0)).toEqual({ ok: false, error: 'buff_busy' });
  });
});
