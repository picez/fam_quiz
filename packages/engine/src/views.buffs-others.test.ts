import type { Answer, BuffKind, Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { castVote, giveHint, takeBuff } from './buffs';
import { pickCell } from './board';
import { acceptAnswer, lock, next, pause, start, submitAnswer, type GameState } from './game';
import { T0, toBuffQuestion, toOthersCell, toOthersQuestion } from './testing/buffs';
import { bool, boardRound, makeRoundsQuiz, single4, withId } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng0 = () => 0;
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const single = (optionId: string): Answer => ({ type: 'single', optionId });
const yes: Answer = { type: 'boolean', value: true };
const take = (s: GameState, id: string, kind: BuffKind, at: number) => must(takeBuff(s, id, kind, at, rng0));
const json = (view: unknown) => JSON.stringify(view);
/** Від відкритого запитання класики до розкриття. */
const toReveal = (s: GameState, at: number) => must(next(must(lock(s)), at, rng0));
/** Від відкритого запитання класики до наступного відкритого. */
const toNext = (s: GameState, at: number) => must(next(toReveal(s, at), at, rng0));

const SPARE_TEXT = 'Яка річка тече через Київ?';
/** Запасне s3 single4 з власним текстом і підказкою (b правильний). */
const SPARE: Question = { ...single4, id: 's3', text: SPARE_TEXT, hint: 'Запасна підказка' };

describe('views: hints, votes and spares', () => {
  it('the hint reaches only its player', () => {
    let s = take(toOthersQuestion(), 'p1', 'hint', T0);
    expect(playerView(s, 'p1')?.me.buffs?.active?.hint).toEqual({ state: 'text', text: 'Тече через Київ' });
    for (const view of [stageView(s), playerView(s, 'p2'), playerView(s, 'p3')]) expect(json(view)).not.toContain('Тече через Київ');
    expect(hostView(s).hints).toEqual([]); // підказка з редактора — запиту немає
    s = toReveal(s, T0 + 30_000);
    expect(s.phase).toBe('reveal');
    for (const view of [stageView(s), playerView(s, 'p1'), playerView(s, 'p2')]) expect(json(view)).not.toContain('Тече через Київ');
    expect(hostView(s).correct).toMatchObject({ hint: 'Тече через Київ' });

    // q2 без підказки в редакторі: запит до ведучого.
    s = must(next(s, T0 + 30_000, rng0));
    s = take(s, 'p2', 'hint', T0 + 31_000);
    expect(playerView(s, 'p2')?.me.buffs?.active?.hint).toEqual({ state: 'waiting', text: null });
    expect(hostView(s).hints).toEqual([{ playerId: 'p2', nickname: 'Петро', at: T0 + 31_000 }]);
    s = must(giveHint(s, 'p2', 'Близько 2000'));
    expect(playerView(s, 'p2')?.me.buffs?.active?.hint).toEqual({ state: 'text', text: 'Близько 2000' });
    expect(hostView(s).hints).toEqual([]);
    s = take(s, 'p3', 'hint', T0 + 32_000);
    expect(hostView(s).hints).toEqual([{ playerId: 'p3', nickname: 'Іра', at: T0 + 32_000 }]);
    s = must(giveHint(s, 'p3', null));
    expect(playerView(s, 'p3')?.me.buffs?.active?.hint).toEqual({ state: 'aloud', text: null });
    expect(hostView(s).hints).toEqual([]);
    for (const view of [stageView(s), playerView(s, 'p1'), playerView(s, 'p3')]) expect(json(view)).not.toContain('Близько 2000');
    expect(playerView(s, 'p1')?.me.buffs?.active).toBeNull();
  });

  it('a hint request disappears when the question closes', () => {
    let s = toNext(toOthersQuestion(), T0); // q2
    s = take(s, 'p2', 'hint', T0 + 1000);
    expect(hostView(s).hints).toHaveLength(1);
    expect(hostView(must(lock(s))).hints).toEqual([]);
  });

  it('votes reach only the asker and never carry the answer', () => {
    let s = answer(toOthersQuestion(), 'p2', single('b'), T0 + 1000);
    s = take(s, 'p1', 'audience', T0 + 2000);
    expect(playerView(s, 'p2')?.me.vote).toEqual({ asker: { playerId: 'p1', nickname: 'Оля' }, endsAt: T0 + 17_000, remainingMs: null });
    expect(playerView(s, 'p3')?.me.vote).toBeNull(); // Іра ще не відповіла
    expect(playerView(s, 'p1')?.me.vote).toBeNull();
    expect(json(playerView(s, 'p2'))).not.toContain('correctId');
    s = must(castVote(s, 'p2', 'p1', single('b'), T0 + 3000));
    expect(playerView(s, 'p1')?.me.buffs?.active?.votes).toEqual({
      endsAt: T0 + 17_000,
      remainingMs: null,
      closed: false,
      cast: 1,
      counts: { b: 1 },
      guesses: [],
    });
    expect(playerView(s, 'p2')?.me.vote).toBeNull(); // уже голосував
    for (const view of [stageView(s), hostView(s), playerView(s, 'p2'), playerView(s, 'p3')]) {
      expect(json(view)).not.toContain('"ballots"');
      expect(json(view)).not.toContain('"counts":{"b"');
    }
    // Оля відповіла: голосування закрите, запрошень немає.
    const closed = answer(s, 'p1', single('b'), T0 + 3500);
    expect(playerView(closed, 'p1')?.me.buffs?.active?.votes).toMatchObject({ closed: true, cast: 1 });
    expect(closed.phase).toBe('question');
    // Петро відповів, але ще не голосував: після відповіді Олі запрошення зникає.
    const asking = take(answer(toOthersQuestion(), 'p2', single('b'), T0 + 1000), 'p1', 'audience', T0 + 2000);
    expect(playerView(asking, 'p2')?.me.vote).not.toBeNull();
    expect(playerView(answer(asking, 'p1', single('a'), T0 + 2500), 'p2')?.me.vote).toBeNull();

    s = answer(s, 'p3', single('c'), T0 + 4000);
    expect(playerView(s, 'p3')?.me.vote).toMatchObject({ asker: { playerId: 'p1', nickname: 'Оля' } });

    const paused = must(pause(s, T0 + 5000));
    expect(playerView(paused, 'p1')?.me.buffs?.active?.votes).toMatchObject({ endsAt: null, remainingMs: 12_000 });
    expect(playerView(paused, 'p3')?.me.vote).toMatchObject({ endsAt: null, remainingMs: 12_000 });
  });

  it('a spare question reaches only its player in the classic round', () => {
    let s = take(toOthersQuestion({ spares: [SPARE] }), 'p1', 'swap', T0 + 15_000);
    const own = playerView(s, 'p1');
    expect(own?.question?.text).toBe(SPARE_TEXT);
    expect(own?.limitMs).toBe(20_000);
    expect(own?.me.buffs?.active?.spare).toBe(true);
    expect(json(own)).not.toContain('correctId');
    expect(json(own)).not.toContain('Запасна підказка');
    expect(stageView(s).question?.text).toBe(single4.text);
    expect(playerView(s, 'p2')?.question?.text).toBe(single4.text);
    expect(playerView(s, 'p2')?.limitMs).toBe(20_000);
    for (const view of [stageView(s), playerView(s, 'p2'), playerView(s, 'p3')]) expect(json(view)).not.toContain(SPARE_TEXT);
    expect(hostView(s).correct).toMatchObject({ id: 'q1', text: single4.text });

    s = answer(s, 'p1', single('b'), T0 + 18_000);
    s = answer(s, 'p2', single('a'), T0 + 18_500);
    const host = hostView(s);
    expect(host.responses.find((r) => r.playerId === 'p1')?.spare).toEqual(SPARE);
    expect(host.responses.find((r) => r.playerId === 'p2')?.spare).toBeNull();
    for (const view of [stageView(s), playerView(s, 'p2'), playerView(s, 'p3')]) expect(json(view)).not.toContain(SPARE_TEXT);

    s = toReveal(s, T0 + 40_000);
    expect(s.phase).toBe('reveal');
    const { hint: _hint, ...bare } = SPARE;
    expect(playerView(s, 'p1')?.reveal).toEqual(bare);
    expect(playerView(s, 'p1')?.question?.text).toBe(SPARE_TEXT);
    expect(playerView(s, 'p2')?.reveal).toMatchObject({ id: 'q1', text: single4.text });
    expect(playerView(s, 'p2')?.reveal).not.toHaveProperty('hint');
    expect(stageView(s).stats).toEqual({ answered: 1, accepted: 0, counts: { a: 1 } });
    for (const view of [stageView(s), playerView(s, 'p2'), playerView(s, 'p3')]) expect(json(view)).not.toContain(SPARE_TEXT);
  });

  it('a spare on a board cell is shown to everyone', () => {
    let s = take(toOthersCell(), 'p1', 'swap', T0 + 15_000);
    // Межа часу — запасного (max(решта, 20 с)), як у підрахунку балів, а не повна межа основного.
    for (const view of [stageView(s), playerView(s, 'p1'), playerView(s, 'p2'), hostView(s)]) expect(view?.limitMs).toBe(20_000);
    // Клітинка на 30 с, заміна на 5-й секунді: межа запасного 25 с, а не 30 с основного.
    const round = boardRound('g1', [{ title: 'Міста', cells: [{ ...single4, id: 'c11', timeLimit: 30 }] }], { check: 'auto', answerMode: 'phone' });
    const quiz = { ...makeRoundsQuiz([round], { leaderboard: 'end', buffs: ['swap'] }), spares: [withId(bool, 's1')] };
    const cell = must(pickCell(must(next(must(start(lobbyWith(quiz, 'Оля', 'Петро'))), T0)), 'p1', 'c11', T0, rng0));
    expect(stageView(cell).limitMs).toBe(30_000);
    const swapped = take(cell, 'p1', 'swap', T0 + 5000);
    for (const view of [stageView(swapped), playerView(swapped, 'p1'), playerView(swapped, 'p2'), hostView(swapped)]) expect(view?.limitMs).toBe(25_000);
    expect(stageView(s).question?.text).toBe(bool.text);
    expect(stageView(s).question?.type).toBe('boolean');
    expect(playerView(s, 'p2')?.question?.text).toBe(bool.text);
    expect(playerView(s, 'p1')?.question?.text).toBe(bool.text);
    expect(hostView(s).correct).toMatchObject({ id: 's1', correct: true });
    expect(stageView(s).board?.cell).toMatchObject({ category: 'Міста', id: 'c12' });
    for (const view of [stageView(s), playerView(s, 'p2')]) expect(json(view)).not.toContain('"correct"');

    s = answer(s, 'p1', yes, T0 + 2000);
    // Відповідь чекає на «Прийняти»: її бачать усі (spotlight), правильної відповіді ще немає.
    for (const view of [stageView(s), playerView(s, 'p2')]) expect(json(view)).not.toContain('"correct"');
    s = must(acceptAnswer(s, 'p1', T0 + 3000));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).reveal).toMatchObject({ id: 's1', text: bool.text });
    expect(stageView(s).stats).toEqual({ answered: 1, accepted: 1, counts: { true: 1 } });
    expect(playerView(s, 'p2')?.reveal).toMatchObject({ id: 's1' });
    expect(hostView(s).responses[0].spare).toMatchObject({ id: 's1' });
  });

  it('a player answering a spare is never asked to vote on the main question', () => {
    let s = take(toOthersQuestion({ spares: [SPARE] }), 'p2', 'swap', T0 + 1000);
    s = answer(s, 'p2', single('b'), T0 + 2000); // Петро відповів на запасне
    s = answer(s, 'p3', single('c'), T0 + 2500);
    s = take(s, 'p1', 'audience', T0 + 3000);
    expect(playerView(s, 'p2')?.me.vote).toBeNull();
    expect(playerView(s, 'p3')?.me.vote).not.toBeNull();
    expect(castVote(s, 'p2', 'p1', single('b'), T0 + 4000)).toEqual({ ok: false, error: 'vote_denied' });
    // Лише Петро з відповіддю, і та на запасне: голосувати нікому.
    let lone = take(toOthersQuestion({ spares: [SPARE] }), 'p2', 'swap', T0 + 1000);
    lone = answer(lone, 'p2', single('b'), T0 + 2000);
    expect(takeBuff(lone, 'p1', 'audience', T0 + 3000, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('a quiz without the new buffs changes nothing', () => {
    let s = toBuffQuestion();
    for (const kind of ['fifty', 'double', 'time'] as const) {
      const id = kind === 'fifty' ? 'p1' : kind === 'double' ? 'p2' : 'p3';
      s = take(s, id, kind, T0);
      expect(playerView(s, id)?.me.buffs?.active).toMatchObject({ kind, hint: null, votes: null, spare: false });
      expect(playerView(s, id)?.me.vote).toBeNull();
    }
    s = answer(s, 'p2', single('b'), T0 + 1000);
    expect(hostView(s).hints).toEqual([]);
    expect(hostView(s).responses[0].spare).toBeNull();
  });
});
