import { BUFF_KINDS, type Answer, type BuffKind } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { buffBlock, castVote, giveHint, takeBuff, voteOpen, voteTally } from './buffs';
import { lock, next, pause, removePlayer, resume, setConnected, submitAnswer, tick, type GameState } from './game';
import { othersQuiz, T0, toOthersCell, toOthersQuestion } from './testing/buffs';
import { makeQuiz, multi, numeric, order, single4, text } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng0 = () => 0;
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const single = (optionId: string): Answer => ({ type: 'single', optionId });
const words = (value: string): Answer => ({ type: 'text', value });
const num = (value: number): Answer => ({ type: 'numeric', value });
const take = (s: GameState, id: string, kind: BuffKind, at: number) => must(takeBuff(s, id, kind, at, rng0));
const vote = (s: GameState, voter: string, asker: string, a: Answer, at: number) => must(castVote(s, voter, asker, a, at));

/** Від закритого запитання класики до наступного відкритого. */
const toNext = (s: GameState, at: number) => must(next(must(next(s, at, rng0)), at, rng0));
/** Відкрите n-те запитання othersQuiz (1-базове) о T0. */
const toQ = (n: number, s: GameState = toOthersQuestion()) => {
  let current = s;
  for (let i = 1; i < n; i += 1) current = toNext(must(lock(current)), T0);
  return current;
};

/** q1 о T0: Петро відповів о T0 + 1000, Оля взяла audience о T0 + 2000. */
const asking = () => take(answer(toOthersQuestion(), 'p2', single('b'), T0 + 1000), 'p1', 'audience', T0 + 2000);

describe('audience', () => {
  it('audience: a 15 s vote among those who already answered in the classic round', () => {
    let s = toOthersQuestion();
    expect(buffBlock(s, 'p1', 'audience')).toBe('no_voters');
    expect(takeBuff(s, 'p1', 'audience', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    s = answer(s, 'p2', single('b'), T0 + 1000);
    s = must(takeBuff(s, 'p1', 'audience', T0 + 2000, rng0));
    expect(s.plays[0].buffs?.p1.vote).toEqual({ endsAt: T0 + 17_000, ballots: {} });
    expect(castVote(s, 'p3', 'p1', single('a'), T0 + 3000)).toEqual({ ok: false, error: 'vote_denied' }); // Іра ще не відповіла
    s = must(castVote(s, 'p2', 'p1', single('b'), T0 + 3000));
    expect(castVote(s, 'p2', 'p1', single('a'), T0 + 4000)).toEqual({ ok: false, error: 'already_answered' });
    s = answer(s, 'p3', single('c'), T0 + 5000); // відповіла під час голосування — тепер може
    s = must(castVote(s, 'p3', 'p1', single('c'), T0 + 6000));
    expect(voteTally(single4, s.plays[0].buffs!.p1.vote!.ballots)).toEqual({ cast: 2, counts: { b: 1, c: 1 }, guesses: [] });
    expect(castVote(s, 'p1', 'p1', single('b'), T0 + 6000)).toEqual({ ok: false, error: 'vote_denied' });
    expect(castVote(s, 'p2', 'p3', single('b'), T0 + 6000)).toEqual({ ok: false, error: 'not_found' }); // в Іри немає бафу
    expect(castVote(s, 'p9', 'p1', single('b'), T0 + 6000)).toEqual({ ok: false, error: 'not_found' });
  });

  it('the vote ends after 15 s, when the asker answers, at the question end; pause stops the clock', () => {
    const s = asking();
    expect(voteOpen(s, 'p1', T0 + 17_000)).toBe(true);
    expect(voteOpen(s, 'p1', T0 + 17_001)).toBe(false);
    expect(castVote(s, 'p2', 'p1', single('b'), T0 + 17_001)).toEqual({ ok: false, error: 'vote_closed' });
    expect(castVote(s, 'p2', 'p1', single('b'), T0 + 17_000).ok).toBe(true);

    const answered = answer(s, 'p1', single('b'), T0 + 8000);
    expect(voteOpen(answered, 'p1', T0 + 9000)).toBe(false);
    expect(castVote(answered, 'p2', 'p1', single('b'), T0 + 9000)).toEqual({ ok: false, error: 'vote_closed' });

    const locked = must(lock(s));
    expect(voteOpen(locked, 'p1', T0 + 3000)).toBe(false);
    expect(castVote(locked, 'p2', 'p1', single('b'), T0 + 3000)).toEqual({ ok: false, error: 'wrong_phase' });

    const paused = must(pause(s, T0 + 5000));
    expect(castVote(paused, 'p2', 'p1', single('b'), T0 + 6000)).toEqual({ ok: false, error: 'paused' });
    const resumed = must(resume(paused, T0 + 65_000));
    expect(resumed.plays[0].buffs?.p1.vote?.endsAt).toBe(T0 + 77_000);
    expect(castVote(resumed, 'p2', 'p1', single('b'), T0 + 70_000).ok).toBe(true);

    expect(castVote(s, 'p2', 'p1', words('Київ'), T0 + 3000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('audience fits simple types only and works on a board cell for everyone but the chooser', () => {
    const q4 = answer(toQ(4), 'p2', { type: 'order', itemIds: order.items.map((i) => i.id) }, T0 + 1000);
    expect(buffBlock(q4, 'p1', 'audience')).toBe('unfit_type');
    expect(takeBuff(q4, 'p1', 'audience', T0 + 2000, rng0)).toEqual({ ok: false, error: 'buff_unfit' });

    let cell = toOthersCell();
    expect(buffBlock(cell, 'p1', 'audience')).toBeNull();
    cell = take(cell, 'p1', 'audience', T0 + 1000);
    cell = vote(cell, 'p2', 'p1', single('b'), T0 + 2000);
    cell = vote(cell, 'p3', 'p1', single('a'), T0 + 3000);
    expect(voteTally(single4, cell.plays[0].buffs!.p1.vote!.ballots)).toEqual({ cast: 2, counts: { b: 1, a: 1 }, guesses: [] });
    expect(castVote(cell, 'p1', 'p1', single('b'), T0 + 3000)).toEqual({ ok: false, error: 'vote_denied' });

    let away = toOthersCell();
    away = must(setConnected(away, 'p2', false, T0));
    away = must(setConnected(away, 'p3', false, T0));
    expect(buffBlock(away, 'p1', 'audience')).toBe('no_voters');
  });

  it('audience tallies guesses for text and numeric', () => {
    let s = toQ(3, startRound(lobbyWith(othersQuiz(), 'Оля', 'Петро', 'Іра', 'Марта'), T0, rng0));
    s = answer(s, 'p2', words('Львів'), T0 + 1000);
    s = answer(s, 'p3', words('Київ'), T0 + 1000);
    s = answer(s, 'p4', words('Київ'), T0 + 1000);
    s = take(s, 'p1', 'audience', T0 + 2000);
    s = vote(s, 'p2', 'p1', words('Львів'), T0 + 3000);
    s = vote(s, 'p3', 'p1', words(' львів '), T0 + 3000);
    s = vote(s, 'p4', 'p1', words('Київ'), T0 + 3000);
    expect(voteTally(s.plays[2].question, s.plays[2].buffs!.p1.vote!.ballots)).toEqual({
      cast: 3,
      counts: {},
      guesses: [
        { text: 'Львів', count: 2 },
        { text: 'Київ', count: 1 },
      ],
    });

    const guesses = voteTally(numeric, { p2: num(1990), p3: num(2061), p4: num(2061) });
    expect(guesses).toEqual({ cast: 3, counts: {}, guesses: [{ text: '2061', count: 2 }, { text: '1990', count: 1 }] });
    // Рівна кількість — у порядку першого голосу.
    expect(voteTally(numeric, { p2: num(5), p3: num(3) }).guesses).toEqual([{ text: '5', count: 1 }, { text: '3', count: 1 }]);

    const picks = voteTally(multi, { p2: { type: 'multi', optionIds: ['a', 'c'] }, p3: { type: 'multi', optionIds: ['c'] } });
    expect(picks).toEqual({ cast: 2, counts: { a: 1, c: 2 }, guesses: [] });
    expect(voteTally(othersQuiz().spares![0], { p2: { type: 'boolean', value: true }, p3: { type: 'boolean', value: false } }).counts).toEqual({
      true: 1,
      false: 1,
    });

    const many = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`p${n}`, words(`Місто ${n}`)]));
    expect(voteTally(text, many).guesses).toHaveLength(6);
    expect(voteTally(text, many).cast).toBe(7);
  });

  it('a kicked voter leaves the tally; a kicked asker takes the vote away', () => {
    let s = answer(asking(), 'p3', single('c'), T0 + 2500);
    s = vote(s, 'p2', 'p1', single('b'), T0 + 3000);
    s = vote(s, 'p3', 'p1', single('c'), T0 + 3000);
    s = must(removePlayer(s, 'p2'));
    expect(s.plays[0].buffs?.p1.vote?.ballots).toEqual({ p3: single('c') });
    s = must(removePlayer(s, 'p1'));
    expect(s.plays[0].buffs).toEqual({});
  });
});

describe('host hint', () => {
  it('hint: a written hint shows at once, otherwise the host is asked', () => {
    const s = must(takeBuff(toOthersQuestion(), 'p1', 'hint', T0 + 1000, rng0));
    expect(s.plays[0].buffs?.p1.hint).toEqual({ text: 'Тече через Київ', aloud: false });
    expect(giveHint(s, 'p1', 'інше')).toEqual({ ok: false, error: 'not_found' }); // підказка вже є

    let q2 = take(toQ(2), 'p2', 'hint', T0 + 1000);
    expect(q2.plays[1].buffs?.p2.hint).toEqual({ text: null, aloud: false });
    q2 = must(giveHint(q2, 'p2', 'Близько 2000'));
    expect(q2.plays[1].buffs?.p2.hint).toEqual({ text: 'Близько 2000', aloud: false });
    expect(giveHint(q2, 'p2', 'Ще')).toEqual({ ok: false, error: 'not_found' });
    q2 = take(q2, 'p3', 'hint', T0 + 2000);
    q2 = must(giveHint(q2, 'p3', null));
    expect(q2.plays[1].buffs?.p3.hint).toEqual({ text: null, aloud: true });
    expect(giveHint(q2, 'p1', 'Без бафу')).toEqual({ ok: false, error: 'not_found' });

    const asked = take(toQ(2), 'p2', 'hint', T0 + 1000);
    expect(giveHint(must(lock(asked)), 'p2', 'Пізно')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(must(giveHint(must(pause(asked, T0 + 2000)), 'p2', 'На паузі')).plays[1].buffs?.p2.hint).toEqual({ text: 'На паузі', aloud: false });
    // Відповідь гравця запиту не скасовує.
    const answered = answer(asked, 'p2', num(2000), T0 + 3000);
    expect(must(giveHint(answered, 'p2', null)).plays[1].buffs?.p2.hint).toEqual({ text: null, aloud: true });
  });

  it('a hint request never holds the question', () => {
    let s = take(toQ(2), 'p2', 'hint', T0 + 1000);
    s = answer(s, 'p1', num(2061), T0 + 2000);
    s = answer(s, 'p2', num(2061), T0 + 2000);
    s = answer(s, 'p3', num(2061), T0 + 2000);
    expect(s.phase).toBe('locked');

    const timed = take(toQ(2), 'p2', 'hint', T0 + 1000);
    expect(tick(timed, T0 + 20_000).phase).toBe('locked');
  });

  it('hint works on a board cell and is the same buff rules as 8a', () => {
    let cell = take(toOthersCell(), 'p1', 'hint', T0 + 1000);
    expect(cell.plays[0].buffs?.p1.hint).toEqual({ text: null, aloud: false });
    cell = must(giveHint(cell, 'p1', 'Столиця'));
    expect(cell.plays[0].buffs?.p1.hint).toEqual({ text: 'Столиця', aloud: false });
    expect(takeBuff(toOthersCell(), 'p2', 'hint', T0 + 1000, rng0)).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('only audience and hint buffs carry a vote or a hint', () => {
    const s = take(toQ(2), 'p1', 'swap', T0 + 1000);
    expect(s.plays[1].buffs?.p1).not.toHaveProperty('vote');
    expect(s.plays[1].buffs?.p1).not.toHaveProperty('hint');
    const h = take(toQ(2), 'p1', 'hint', T0 + 1000);
    expect(h.plays[1].buffs?.p1).not.toHaveProperty('vote');
  });
});

describe('buff kinds', () => {
  it('the switch over buff kinds is complete', () => {
    const s = answer(toOthersQuestion(), 'p2', single('b'), T0 + 1000);
    for (const kind of BUFF_KINDS) expect(() => buffBlock(s, 'p1', kind)).not.toThrow();
    expect(buffBlock(s, 'p1', 'audience')).toBeNull();
    expect(buffBlock(s, 'p1', 'hint')).toBeNull();
    expect(buffBlock(s, 'p1', 'swap')).toBeNull();

    const quiz = othersQuiz({ spares: undefined, buffs: ['audience', 'hint'] });
    const bare = { ...quiz, settings: { ...quiz.settings, buffs: [...(quiz.settings.buffs ?? []), 'swap' as const] } };
    const noPool = startRound(lobbyWith(bare, 'Оля', 'Петро', 'Іра'), T0, rng0);
    expect(buffBlock(noPool, 'p1', 'swap')).toBe('spares_out');
    expect(takeBuff(noPool, 'p1', 'swap', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
  });
});
