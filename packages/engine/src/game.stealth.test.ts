import { describe, expect, it } from 'vitest';
import { defaultTeams, gameCard, type QuizSettings } from '@quiz/shared';
import { adjustScore } from './adjust';
import { takeBuff } from './buffs';
import { buyDebuff, cancelDebuff, lastPurchase, setDebuff } from './debuffs';
import { factInput } from './facts';
import { end, lock, next, pause, removePlayer, setConnected, start, type GameState } from './game';
import { grantPerks, wardReady } from './perks';
import { spendStealth, stealthOffered, stealthReady, takeStealth } from './stealth';
import { classicRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame } from './testing/teams';

const T0 = 1_000_000;
const rng = () => 0;

/** Два класичні раунди по два запитання; stealth, дебафи «Туман» і «Тряска». */
function stealthQuiz(settings: Partial<QuizSettings> = {}) {
  return makeRoundsQuiz(
    [classicRound('r1', [single, withId(single, 's2')]), classicRound('r2', [withId(single, 's3'), withId(single, 's4')])],
    { leaderboard: 'each', buffs: ['stealth'], debuffs: ['fog', 'shake'], ...settings },
  );
}

/** Заставка раунду 1: Оля p1, Петро p2, Тарас p3 — у кожного 1000 балів. */
function game(settings: Partial<QuizSettings> = {}): GameState {
  let s = must(start(lobbyWith(stealthQuiz(settings), 'Оля', 'Петро', 'Тарас')));
  for (const id of ['p1', 'p2', 'p3']) s = must(adjustScore(s, id, 1000, T0));
  return s;
}

/** Крок уперед: запитання — закрити, інакше — next. */
const step = (s: GameState, at = T0 + 1000) => (s.phase === 'question' ? must(lock(s)) : must(next(s, at, rng)));
const until = (s: GameState, phase: GameState['phase']) => {
  let state = s;
  for (let i = 0; i < 30 && state.phase !== phase; i++) state = step(state);
  return state;
};
const scoreOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;

describe('turning stealth on', () => {
  it('turns on any time but once', () => {
    const seen: string[] = [];
    let s = game();
    for (let i = 0; i < 12 && s.phase !== 'finished'; i++) {
      const r = takeStealth(s, 'p1', T0 + 10);
      seen.push(`${s.phase}: ${r.ok ? 'ok' : r.error}`);
      if (s.phase === 'question') {
        const paused = takeStealth(must(pause(s, T0 + 5)), 'p1', T0 + 10);
        seen.push(`paused: ${paused.ok ? 'ok' : paused.error}`);
      }
      s = step(s);
    }
    expect(seen.slice(0, 7)).toEqual(['intro: ok', 'question: ok', 'paused: ok', 'locked: ok', 'reveal: ok', 'leaderboard: ok', 'question: ok']);
    expect(seen).toContain('round_end: ok');
    // лобі й кінець гри — ні
    expect(takeStealth(lobbyWith(stealthQuiz(), 'Оля', 'Петро'), 'p1', T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(takeStealth(must(end(game(), T0)), 'p1', T0)).toEqual({ ok: false, error: 'wrong_phase' });
    // удруге — buff_used
    const on = must(takeStealth(game(), 'p1', T0 + 10));
    expect(on.stealth).toEqual({ p1: { at: T0 + 10, spent: null } });
    expect(takeStealth(on, 'p1', T0 + 20)).toEqual({ ok: false, error: 'buff_used' });
    // без бафа, без купівлі, без дебафів — not_allowed; невідомий — not_found
    expect(takeStealth(game({ buffs: ['double'] }), 'p1', T0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(takeStealth(game({ debuffShop: false }), 'p1', T0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(takeStealth(game({ debuffs: [] }), 'p1', T0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(stealthOffered(game({ debuffs: [] }))).toBe(false);
    expect(takeStealth(game(), 'nobody', T0)).toEqual({ ok: false, error: 'not_found' });
  });

  it('is silent: no buff play, no buff seq, no adjustment; takeBuff turns it on too', () => {
    const before = must(next(game(), T0 + 100, rng));
    const after = must(takeBuff(before, 'p1', 'stealth', T0 + 200, rng));
    expect(after.plays).toBe(before.plays);
    expect(after.buffSeq).toBe(before.buffSeq);
    expect(after.adjustments).toBe(before.adjustments);
    expect(after.stealth).toEqual({ p1: { at: T0 + 200, spent: null } });
    // поза запитанням — теж через takeBuff
    expect(must(takeBuff(game(), 'p1', 'stealth', T0, rng)).stealth?.p1.spent).toBeNull();
  });
});

describe('an anonymous purchase', () => {
  it('an anonymous purchase names no one', () => {
    const on = must(takeStealth(game(), 'p1', T0));
    const s = must(buyDebuff(on, 'p1', 'p2', 'fog', T0 + 50));
    const last = s.adjustments.at(-1)!;
    expect(last).toMatchObject({ playerId: 'p1', points: -200, source: 'debuff', target: 'p2', debuff: 'fog', anon: true });
    expect(s.debuffs.p2).toEqual({ kind: 'fog', firedAt: null, since: null, by: 'p1', anon: true });
    expect(s.stealth?.p1.spent).toBe(last.seq);
    expect(stealthReady(s, 'p1')).toBe(false);
    expect(scoreOf(s, 'p1')).toBe(800);
    expect(lastPurchase(s)).toEqual({ seq: last.seq, at: T0 + 50, buyer: null, target: { playerId: 'p2', nickname: 'Петро' } });
    // без бафа — як і досі
    const plain = must(buyDebuff(game(), 'p1', 'p2', 'fog', T0));
    expect(plain.adjustments.at(-1)!.anon).toBeUndefined();
    expect(plain.debuffs.p2).toEqual({ kind: 'fog', firedAt: null, since: null, by: 'p1' });
    expect(lastPurchase(plain)?.buyer).toEqual({ playerId: 'p1', nickname: 'Оля' });
  });

  it('lasts until the first purchase, across rounds', () => {
    let s = must(takeStealth(game(), 'p1', T0));
    // раунд 1 минув без покупок; баф не згорає
    s = until(s, 'round_end');
    s = step(s);
    expect(s.roundIndex).toBe(1);
    expect(stealthReady(s, 'p1')).toBe(true);
    s = must(buyDebuff(s, 'p1', 'p2', 'fog', T0 + 5000));
    expect(s.adjustments.at(-1)!.anon).toBe(true);
    // наступний цикл: покупка вже з ім'ям
    s = until(s, 'reveal');
    s = must(buyDebuff(s, 'p1', 'p3', 'shake', T0 + 6000));
    expect(s.adjustments.at(-1)!.anon).toBeUndefined();
    expect(s.debuffs.p3).toEqual({ kind: 'shake', firedAt: null, since: null, by: 'p1' });
    expect(lastPurchase(s)?.buyer?.nickname).toBe('Оля');
  });

  it('a failed purchase keeps it', () => {
    const on = must(takeStealth(game(), 'p1', T0));
    // points_short
    const poor = must(adjustScore(on, 'p1', -950, T0));
    expect(buyDebuff(poor, 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'points_short' });
    expect(stealthReady(poor, 'p1')).toBe(true);
    // debuff_busy
    const busy = must(setDebuff(on, 'p2', 'shake'));
    expect(buyDebuff(busy, 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'debuff_busy' });
    expect(stealthReady(busy, 'p1')).toBe(true);
    // target_offline
    const away = must(setConnected(on, 'p2', false, T0));
    expect(buyDebuff(away, 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'target_offline' });
    expect(stealthReady(away, 'p1')).toBe(true);
    // debuff_bought: звичайна покупка в цьому циклі до ввімкнення
    const bought = must(takeStealth(must(buyDebuff(game(), 'p1', 'p2', 'fog', T0)), 'p1', T0 + 10));
    expect(buyDebuff(bought, 'p1', 'p3', 'shake', T0)).toEqual({ ok: false, error: 'debuff_bought' });
    expect(stealthReady(bought, 'p1')).toBe(true);
    // spendStealth без готового бафа — той самий стан
    expect(spendStealth(game(), 'p1', 5)).toEqual(game());
  });

  it('a ward spends it', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 's2')])], { leaderboard: 'each', buffs: ['stealth'], debuffs: ['fog', 'shake'] });
    let s = grantPerks(must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Тарас'))), { p2: { kinds: ['ward'], timeMs: 0 } });
    s = must(adjustScore(s, 'p1', 1000, T0));
    expect(wardReady(s, 'p2')).toBe(true);
    s = must(takeStealth(s, 'p1', T0));
    s = must(buyDebuff(s, 'p1', 'p2', 'fog', T0 + 10));
    expect(scoreOf(s, 'p1')).toBe(800);
    expect(s.adjustments.at(-1)).toMatchObject({ source: 'debuff', anon: true });
    expect(s.debuffs.p2).toBeUndefined();
    expect(wardReady(s, 'p2')).toBe(false);
    expect(stealthReady(s, 'p1')).toBe(false);
    expect(s.stealth?.p1.spent).toBe(s.adjustments.at(-1)!.seq);
    expect(lastPurchase(s)?.buyer).toBeNull();
  });

  it('the real buyer still counts', () => {
    let s = must(buyDebuff(must(takeStealth(game(), 'p1', T0)), 'p1', 'p2', 'fog', T0));
    expect(buyDebuff(s, 'p1', 'p3', 'shake', T0)).toEqual({ ok: false, error: 'debuff_bought' });
    expect(cancelDebuff(s, 'p2')).toEqual({ ok: false, error: 'not_allowed' });
    s = must(end(s, T0 + 100));
    const input = factInput(s);
    expect(gameCard(input, 'p1')?.debuffs.sent).toBe(1);
    expect(gameCard(input, 'p2')?.debuffs.got).toBe(1);
  });

  it("the host's debuff is untouched", () => {
    const on = must(takeStealth(game(), 'p1', T0));
    const s = must(setDebuff(on, 'p2', 'fog'));
    expect(s.debuffs.p2).toEqual({ kind: 'fog', firedAt: null, since: null, by: null });
    expect(stealthReady(s, 'p1')).toBe(true);
  });

  it('removing a player drops their stealth', () => {
    const on = must(takeStealth(must(takeStealth(game(), 'p1', T0)), 'p3', T0));
    const s = must(removePlayer(on, 'p1'));
    expect(s.stealth).toEqual({ p3: { at: T0, spent: null } });
  });
});

describe('teams: the captain hides the team attack', () => {
  it("teams: the captain hides the team's attack", () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 's2')])], {
      teams: defaultTeams(2),
      leaderboard: 'each',
      buffs: ['stealth'],
      debuffs: ['fog'],
    });
    let s = must(adjustScore(teamGame(quiz, [['Оля', 'Петро'], ['Тарас', 'Ася']]), 't1', 500, T0));
    s = must(takeStealth(s, 't1', T0));
    expect(s.stealth).toEqual({ t1: { at: T0, spent: null } });
    s = must(buyDebuff(s, 't1', 't2', 'fog', T0 + 10));
    expect(s.adjustments.at(-1)).toMatchObject({ playerId: 't1', target: 't2', anon: true });
    expect(s.debuffs.t2).toMatchObject({ by: 't1', anon: true });
    expect(lastPurchase(s)).toMatchObject({ buyer: null, target: { playerId: 't2' } });
  });
});
