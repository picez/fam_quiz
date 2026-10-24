import type { Answer, BuffKind, Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { buffBlock, questionFor, sparePool, takeBuff } from './buffs';
import { acceptAnswer, next, recordOf, start, submitAnswer, type GameState } from './game';
import { T0 } from './testing/buffs';
import { boardRound, bool, classicRound, makeRoundsQuiz, numeric, single4, text, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng0 = () => 0;
const yes: Answer = { type: 'boolean', value: true };
const take = (s: GameState, id: string, kind: BuffKind, at: number) => must(takeBuff(s, id, kind, at, rng0));
const GLOBAL = [{ ...text, id: 's1', text: 'Яке місто стоїть на Пруті?', accepted: ['Чернівці'] }];
const SPORT = [{ ...withId(bool, 'sp1'), text: 'Футбольний м’яч — круглий?' }, { ...withId(numeric, 'sp2'), text: 'Скільки гравців у волейбольній команді?' }];
const CITIES = [{ ...withId(bool, 'ct1'), text: 'Львів — обласний центр?' }];

/** Поле Спорт (s1x) / Міста (m1x) / Річки (r1x) по 3 клітинки single4; запасні категорій — за аргументами; Оля p1, Петро p2, Іра p3; Оля вибирає cellId о T0. */
function toCell(cellId: string, pools: { sport?: Question[]; cities?: Question[]; global?: Question[] } = { sport: SPORT, cities: CITIES, global: GLOBAL }): GameState {
  const cells = (prefix: string) => [1, 2, 3].map((j) => withId(single4, `${prefix}${j}`));
  const round = boardRound(
    'g1',
    [
      { title: 'Спорт', cells: cells('s'), spares: pools.sport },
      { title: 'Міста', cells: cells('m'), spares: pools.cities },
      { title: 'Річки', cells: cells('r') },
    ],
    { check: 'auto', answerMode: 'phone' },
  );
  const base = makeRoundsQuiz([round], { leaderboard: 'end', buffs: ['swap'] });
  const quiz = pools.global === undefined ? base : { ...base, spares: pools.global };
  return must(pickCell(must(next(must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'))), T0)), 'p1', cellId, T0, rng0));
}

describe('swap on the board takes a spare of the same category (9d)', () => {
  it('a board cell swaps to the next spare of its own category, not the global pool', () => {
    let s = take(toCell('s2'), 'p1', 'swap', T0 + 1000);
    expect(s.plays[0].buffs?.p1.spare?.id).toBe('sp1');
    expect(s.sparesUsed).toEqual(['sp1']);
    expect(questionFor(s, s.plays[0], 'p1').text).toBe('Футбольний м’яч — круглий?');
    s = must(submitAnswer(s, 'p1', yes, T0 + 2000));
    s = must(acceptAnswer(s, 'p1', T0 + 3000));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ accepted: true, spare: 'sp1', buff: 'swap' });
  });

  it('the next spare of a category skips the used ones; another category keeps its own', () => {
    const s = toCell('s1');
    expect(sparePool(s, s.plays[0])).toEqual({ spares: SPORT, scope: 'category' });
    const used = { ...s, sparesUsed: ['sp1'] };
    expect(take(used, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('sp2');
    expect(buffBlock({ ...s, sparesUsed: ['sp1', 'sp2'] }, 'p1', 'swap')).toBe('spares_out');
    const cities = toCell('m1');
    expect(take({ ...cities, sparesUsed: ['sp1', 'sp2'] }, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('ct1');
  });

  it('a category without spares disables swap on its cells — no fallback to the global pool', () => {
    const s = toCell('r1');
    expect(sparePool(s, s.plays[0])).toEqual({ spares: [], scope: 'category' });
    expect(buffBlock(s, 'p1', 'swap')).toBe('no_category_spares');
    expect(takeBuff(s, 'p1', 'swap', T0 + 1000, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    expect(playerView(s, 'p1')?.me.buffs?.slots.find((b) => b.kind === 'swap')?.block).toBe('no_category_spares');
  });

  it('a quiz without category spares keeps the global pool on the board (legacy)', () => {
    const s = toCell('r1', { global: GLOBAL });
    expect(sparePool(s, s.plays[0]).scope).toBe('quiz');
    expect(take(s, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('s1');
  });

  it('classic rounds always use the global pool, even when categories have spares', () => {
    const board = boardRound('g1', [
      { title: 'Спорт', cells: [1, 2, 3].map((j) => withId(single4, `s${j}`)), spares: SPORT },
      { title: 'Міста', cells: [1, 2, 3].map((j) => withId(single4, `m${j}`)) },
      { title: 'Річки', cells: [1, 2, 3].map((j) => withId(single4, `r${j}`)) },
    ]);
    const quiz = { ...makeRoundsQuiz([classicRound('r1', [withId(single4, 'q1')]), board], { buffs: ['swap'] }), spares: GLOBAL };
    const s = startRound(lobbyWith(quiz, 'Оля'), T0, rng0);
    expect(take(s, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('s1');
    // Без загального пулу класика не бере категорійних: та сама причина, що й раніше.
    const { spares: _gone, ...noPool } = quiz;
    expect(buffBlock(startRound(lobbyWith(noPool, 'Оля'), T0, rng0), 'p1', 'swap')).toBe('spares_out');
  });

  it('the stage, phones and host show the category spare; category spares never leak into views before a swap', () => {
    const before = toCell('s1');
    for (const view of [stageView(before), playerView(before, 'p1'), playerView(before, 'p2'), hostView(before)]) {
      expect(JSON.stringify(view)).not.toContain('Футбольний');
      expect(JSON.stringify(view)).not.toContain('Львів — обласний');
    }
    const s = take(before, 'p1', 'swap', T0 + 1000);
    for (const view of [stageView(s), playerView(s, 'p1'), playerView(s, 'p2')]) expect(view?.question?.text).toBe('Футбольний м’яч — круглий?');
    expect(hostView(s).correct).toMatchObject({ id: 'sp1', correct: true });
    const answered = must(acceptAnswer(must(submitAnswer(s, 'p1', yes, T0 + 2000)), 'p1', T0 + 3000));
    expect(hostView(answered).responses[0].spare).toMatchObject({ id: 'sp1' });
    expect(stageView(answered).reveal).toMatchObject({ id: 'sp1' });
  });

  it('a state saved as JSON and read back keeps the category pools (no state format change)', () => {
    const restored = JSON.parse(JSON.stringify(toCell('s1'))) as GameState;
    expect(take(restored, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('sp1');
  });
});
