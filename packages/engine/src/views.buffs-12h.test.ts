import type { Answer } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { takeBuff } from './buffs';
import { lock, next, submitAnswer, type GameState } from './game';
import { T0, toPowersQuestion } from './testing/buffs';
import { must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng0 = () => 0;
const B: Answer = { type: 'single', optionId: 'b' };
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
/** Іра відповіла «b», Петро підглянув у неї. */
const peeked = (s: GameState = toPowersQuestion()) => must(takeBuff(answer(s, 'p3', B, T0 + 800), 'p2', 'peek', T0 + 1000, rng0, 'p3'));

describe('power views (12h)', () => {
  it('peekable lists who already answered until peek is taken', () => {
    const s = answer(toPowersQuestion(), 'p3', B, T0 + 800);
    expect(playerView(s, 'p2')?.me.buffs?.peekable).toEqual([{ playerId: 'p3', nickname: 'Іра' }]);
    expect(playerView(s, 'p3')?.me.buffs?.peekable).toEqual([]);
    const taken = peeked();
    expect(playerView(taken, 'p2')?.me.buffs?.peekable).toEqual([]);
    expect(playerView(toPowersQuestion(), 'p2')?.me.buffs?.peekable).toEqual([]);
  });

  it('peekable is empty when the quiz does not allow peek', () => {
    const s = answer(toPowersQuestion({ buffs: ['risk'] }), 'p3', B, T0 + 800);
    expect(playerView(s, 'p2')?.me.buffs?.peekable).toEqual([]);
  });

  it('the stage and the host get who peeked at whom; other buffs have no target', () => {
    const s = peeked();
    const tag = { playerId: 'p2', nickname: 'Петро', kind: 'peek', target: { playerId: 'p3', nickname: 'Іра' } };
    expect(stageView(s).buffs).toEqual([tag]);
    expect(stageView(s).buffNotice).toMatchObject({ kind: 'peek', nickname: 'Петро', target: { playerId: 'p3', nickname: 'Іра' } });
    expect(hostView(s).buffs).toEqual([tag]);
    expect(hostView(s).buffNotice?.target).toEqual({ playerId: 'p3', nickname: 'Іра' });
    const risky = must(takeBuff(s, 'p1', 'risk', T0 + 1100, rng0));
    expect(stageView(risky).buffs[0]).toMatchObject({ kind: 'risk', target: null });
    expect(stageView(risky).buffNotice).toMatchObject({ kind: 'risk', target: null });
  });

  it('the peeked answer reaches only the peeker: not the stage, the host buff channels, the target or a third player', () => {
    const s = peeked();
    const secret = '"optionId":"b"';
    expect(JSON.stringify(playerView(s, 'p2')?.me.buffs)).toContain(secret);
    expect(JSON.stringify(stageView(s))).not.toContain(secret);
    const host = hostView(s);
    expect(JSON.stringify({ buffs: host.buffs, notice: host.buffNotice })).not.toContain(secret);
    const target = playerView(s, 'p3');
    expect(JSON.stringify(target?.me.buffs)).not.toContain(secret);
    expect(JSON.stringify(target?.me.peekedBy)).not.toContain(secret);
    const third = playerView(s, 'p1');
    expect(JSON.stringify(third)).not.toContain(secret);
    expect(third?.me.buffs?.active ?? null).toBeNull();
  });

  it('peekedBy goes away on the leaderboard', () => {
    let s = peeked(toPowersQuestion({ leaderboard: 'each' }));
    s = must(next(must(lock(s)), T0 + 5000, rng0));
    expect(playerView(s, 'p3')?.me.peekedBy).not.toBeNull();
    s = must(next(s, T0 + 6000, rng0));
    expect(s.phase).toBe('leaderboard');
    expect(playerView(s, 'p3')?.me.peekedBy).toBeNull();
  });

  it('the host live row shows the peek buff', () => {
    const row = hostView(peeked()).live?.rows.find((r) => r.id === 'p2');
    expect(row).toMatchObject({ buff: 'peek', answered: false, answer: null });
  });

  it('a silent «Ризик» is not counted as answered, but its verdict and points stay', () => {
    let s = must(takeBuff(toPowersQuestion(), 'p1', 'risk', T0 + 300, rng0));
    s = answer(s, 'p3', B, T0 + 800);
    s = must(lock(s));
    expect(stageView(s).answeredCount).toBe(1);
    const row = hostView(s).live?.rows.find((r) => r.id === 'p1');
    expect(row).toMatchObject({ answered: false, answer: null, buff: 'risk', verdict: 'wrong' });
    expect(hostView(s).live?.answered).toBe(1);
    s = must(next(s, T0 + 5000, rng0));
    expect(playerView(s, 'p1')?.me.result).toMatchObject({ grade: 'wrong', points: -1000 });
  });
});
