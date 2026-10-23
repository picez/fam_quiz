import { describe, expect, it } from 'vitest';
import type { ErrorCode } from '@quiz/shared';
import { adjustScore } from './adjust';
import { buyDebuff, cancelDebuff, setDebuff, shopBlock } from './debuffs';
import { placeWager } from './final';
import { end, lock, next, pause, removePlayer, start, type GameState } from './game';
import { toDuelQuestion } from './testing/duel';
import { classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, text, withId } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const T0 = 1_000_000;
const rng = () => 0;
const quiz = (settings = {}) => ({ ...makeQuiz([single, text, withId(single, 's2')]), settings: { leaderboard: 'each' as const, ...settings } });
/** Заставка першого раунду, у Олени (p1) 500 балів від ведучого. */
function rich(settings = {}): GameState {
  const started = must(start(lobbyWith(quiz(settings), 'Олена', 'Тарас', 'Віра')));
  return must(adjustScore(started, 'p1', 500, T0));
}
const scoreOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
/** Результат покупки p1 → p2 (туман): 'ok' або код помилки. */
const tryBuy = (s: GameState): 'ok' | ErrorCode => {
  const r = buyDebuff(s, 'p1', 'p2', 'fog', T0);
  return r.ok ? 'ok' : r.error;
};

describe('buying a debuff', () => {
  it('charges the price as a debuff adjustment with the buyer and the target and arms the debuff from the buyer', () => {
    const s = must(buyDebuff(rich({ debuffPrices: { fog: 150 } }), 'p1', 'p2', 'fog', T0 + 1000));
    expect(scoreOf(s, 'p1')).toBe(350);
    expect(s.adjustments.at(-1)).toMatchObject({ playerId: 'p1', points: -150, source: 'debuff', target: 'p2', debuff: 'fog', at: T0 + 1000 });
    expect(s.debuffs.p2).toEqual({ kind: 'fog', firedAt: null, since: null, by: 'p1' });
    // спрацьовує, як від ведучого: у наступному запитанні цілі
    const opened = must(next(s, T0 + 2000, rng));
    expect(opened.debuffs.p2).toMatchObject({ firedAt: opened.questionIndex, since: T0 + 2000, by: 'p1' });
  });

  it('the default price is 200', () => {
    const s = must(buyDebuff(rich(), 'p1', 'p2', 'mud', T0));
    expect(scoreOf(s, 'p1')).toBe(300);
    expect(s.adjustments.at(-1)).toMatchObject({ points: -200, source: 'debuff', target: 'p2', debuff: 'mud' });
  });

  it('refuses when the points are short and allows exactly the price', () => {
    const poor = must(adjustScore(must(start(lobbyWith(quiz(), 'Олена', 'Тарас'))), 'p1', 199, T0));
    expect(buyDebuff(poor, 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'points_short' });
    const exact = must(adjustScore(poor, 'p1', 1, T0));
    const bought = must(buyDebuff(exact, 'p1', 'p2', 'fog', T0));
    expect(scoreOf(bought, 'p1')).toBe(0);
    // від'ємний рахунок (бали від ведучого −300) — теж points_short, і ціна 50 не проходить при 49
    const negative = must(adjustScore(must(start(lobbyWith(quiz({ debuffPrices: { mud: 50 } }), 'Олена', 'Тарас'))), 'p1', -300, T0));
    expect(buyDebuff(negative, 'p1', 'p2', 'mud', T0)).toEqual({ ok: false, error: 'points_short' });
    const almost = must(adjustScore(negative, 'p1', 349, T0));
    expect(buyDebuff(almost, 'p1', 'p2', 'mud', T0)).toEqual({ ok: false, error: 'points_short' });
    expect(must(buyDebuff(must(adjustScore(almost, 'p1', 1, T0)), 'p1', 'p2', 'mud', T0)).players[0].score).toBe(0);
  });

  it('not for yourself, not a debuff the quiz does not allow, not an unknown player, not when the shop is off', () => {
    expect(buyDebuff(rich(), 'p1', 'p1', 'fog', T0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(buyDebuff(rich({ debuffs: ['mud'] }), 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(buyDebuff(rich({ debuffShop: false }), 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(buyDebuff(rich({ debuffShop: true }), 'p1', 'p2', 'fog', T0).ok).toBe(true);
    expect(buyDebuff(rich(), 'p1', 'nobody', 'fog', T0)).toEqual({ ok: false, error: 'not_found' });
    expect(buyDebuff(rich(), 'nobody', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'not_found' });
    // ведучий насилає й тоді, коли гравцям купувати не можна
    expect(setDebuff(rich({ debuffShop: false }), 'p2', 'fog').ok).toBe(true);
  });

  it('a target with a debuff is busy whoever sent it', () => {
    const fromHost = must(setDebuff(rich(), 'p2', 'shake'));
    expect(fromHost.debuffs.p2.by).toBeNull();
    expect(buyDebuff(fromHost, 'p1', 'p2', 'fog', T0)).toEqual({ ok: false, error: 'debuff_busy' });
    const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
    expect(setDebuff(bought, 'p2', 'mud')).toEqual({ ok: false, error: 'debuff_busy' });
    // і покупка від іншого гравця
    const vira = must(adjustScore(bought, 'p3', 500, T0));
    expect(buyDebuff(vira, 'p3', 'p2', 'mud', T0)).toEqual({ ok: false, error: 'debuff_busy' });
  });

  it('one purchase per buyer per question cycle', () => {
    // заставка раунду: купив — більше не може; інший покупець — може
    let s = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
    expect(shopBlock(s, 'p1')).toBe('bought');
    expect(buyDebuff(s, 'p1', 'p3', 'mud', T0)).toEqual({ ok: false, error: 'debuff_bought' });
    expect(shopBlock(s, 'p3')).toBeNull();
    // перше запитання відкрито — той самий цикл (ще жодне запитання не закрито)
    s = must(next(s, T0 + 1000, rng));
    expect(s.phase).toBe('question');
    expect(shopBlock(s, 'p1')).toBe('bought');
    expect(buyDebuff(s, 'p1', 'p3', 'mud', T0 + 1500)).toEqual({ ok: false, error: 'debuff_bought' });
    // запитання закрито → розкриття: новий цикл
    s = must(lock(s));
    s = must(next(s, T0 + 3000, rng));
    expect(s.phase).toBe('reveal');
    expect(shopBlock(s, 'p1')).toBeNull();
    s = must(buyDebuff(s, 'p1', 'p3', 'mud', T0 + 3500));
    expect(shopBlock(s, 'p1')).toBe('bought');
    // наступне запитання відкрито — той самий цикл, що й розкриття
    while (s.phase !== 'question') s = must(next(s, T0 + 4000, rng));
    expect(shopBlock(s, 'p1')).toBe('bought');
    expect(buyDebuff(s, 'p1', 'p2', 'shake', T0 + 4500)).toEqual({ ok: false, error: 'debuff_bought' });
    // бали від ведучого в цьому циклі покупкою не рахуються
    expect(shopBlock(must(adjustScore(s, 'p3', 300, T0 + 4500)), 'p3')).toBeNull();
  });

  it('cannot buy while answers are locked, in a duel, in the final round or on pause; can on intro, question, reveal, table and round end', () => {
    const lobby = lobbyWith(
      makeRoundsQuiz([classicRound('r1', [single, withId(single, 's2')]), finalRound('f', withId(single, 'f1'))], { leaderboard: 'each' }),
      'Олена',
      'Тарас',
    );
    expect(tryBuy(lobby)).toBe('wrong_phase');
    let s = must(adjustScore(must(start(lobby)), 'p1', 5000, T0));
    const seen: string[] = [];
    // кожен етап гри: класика, потім фінал; у кожному — чи можна купити, і на паузі — paused
    for (let step = 0; step < 30 && s.phase !== 'finished'; step += 1) {
      const final = s.quiz.rounds[s.roundIndex]?.type === 'final';
      seen.push(`${final ? 'final ' : ''}${s.phase}: ${tryBuy(s)}`);
      if (!final && s.phase === 'question') seen.push(`paused question: ${tryBuy(must(pause(s, T0 + 100)))}`);
      if (s.phase === 'wager') {
        s = must(placeWager(s, 'p1', 0, T0 + 200, rng));
        s = must(placeWager(s, 'p2', 0, T0 + 200, rng));
        continue;
      }
      s = s.phase === 'question' ? must(lock(s)) : must(next(s, T0 + 400, rng));
    }
    expect(tryBuy(s)).toBe('wrong_phase');
    const ofClassic = seen.filter((line) => !line.startsWith('final '));
    expect(ofClassic).toEqual([
      'intro: ok',
      'question: ok',
      'paused question: paused',
      'locked: wrong_phase',
      'reveal: ok',
      'leaderboard: ok',
      'question: ok',
      'paused question: paused',
      'locked: wrong_phase',
      'reveal: ok',
      'round_end: ok',
    ]);
    const ofFinal = seen.filter((line) => line.startsWith('final '));
    expect(ofFinal.length).toBeGreaterThan(2);
    for (const line of ofFinal) expect(line).toMatch(/: wrong_phase$/);
    expect(ofFinal.some((line) => line.startsWith('final wager'))).toBe(true);
    expect(ofFinal.some((line) => line.startsWith('final question'))).toBe(true);
    // shopBlock каже те саме
    expect(shopBlock(must(lock(must(next(must(start(lobby)), T0, rng)))), 'p1')).toBe('phase');
    expect(shopBlock(must(pause(must(next(must(start(lobby)), T0, rng)), T0)), 'p1')).toBe('paused');
    // дуель: свої ставки, звичайного запитання немає
    const duel = toDuelQuestion();
    expect(duel.phase).toBe('duel');
    expect(buyDebuff(duel, 'p3', 'p1', 'fog', T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(shopBlock(duel, 'p3')).toBe('phase');
    // кінець гри
    expect(tryBuy(must(end(rich(), T0)))).toBe('wrong_phase');
  });

  it('the host cannot cancel a bought debuff but still cancels his own', () => {
    const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
    expect(cancelDebuff(bought, 'p2')).toEqual({ ok: false, error: 'not_allowed' });
    expect(cancelDebuff(must(setDebuff(rich(), 'p2', 'fog')), 'p2').ok).toBe(true);
    expect(cancelDebuff(rich(), 'p2')).toEqual({ ok: false, error: 'not_found' });
  });

  it('a kicked buyer leaves the debuff on the target; a kicked target takes it away and the price stays spent', () => {
    const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
    const noBuyer = must(removePlayer(bought, 'p1'));
    expect(noBuyer.debuffs.p2).toEqual({ kind: 'fog', firedAt: null, since: null, by: 'p1' });
    expect(noBuyer.adjustments.some((a) => a.playerId === 'p1')).toBe(false);
    const noTarget = must(removePlayer(bought, 'p2'));
    expect(Object.hasOwn(noTarget.debuffs, 'p2')).toBe(false);
    expect(noTarget.adjustments.at(-1)).toMatchObject({ playerId: 'p1', points: -200, source: 'debuff', target: 'p2' });
    expect(scoreOf(noTarget, 'p1')).toBe(300);
  });
});
