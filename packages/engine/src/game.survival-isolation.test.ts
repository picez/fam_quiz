import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, roundBrief, rulesOf, type Answer } from '@quiz/shared';
import { takeBuff } from './buffs';
import { buyDebuff, debuffsOff, ghostTarget, setDebuff, shopBlock } from './debuffs';
import { declareDuel, duelDue, duelWindowOpen } from './duel';
import { lock, next, submitAnswer, type GameState } from './game';
import { answerTrial, survivalAlive } from './survival';
import { classicRound, duels, makeRoundsQuiz, single, survivalQuestions, survivalRound, survivalTrials, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { playerView } from './views';

const rng = () => 0;
const survival = survivalRound('rs', survivalQuestions, survivalTrials, { bonus: 0 });
// Три запитання в r1: поріг дуелей ⌈9 / 3⌉ = 3 досягається на його round_end.
const quizOf = (round = survival) => ({
  ...makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')]), round, classicRound('r3', [withId(single, 'q9')])], {
    buffs: ['double', 'fifty'],
    debuffs: ['fog', 'shake'],
    leaderboard: 'end',
  }),
  duels,
});

/** r1 зіграно, гра на його round_end (нікому не відповідали). */
function toR1End(round = survival): GameState {
  let s = startRound(lobbyWith(quizOf(round), 'Оля', 'Петро', 'Віра'), 0, rng);
  for (let i = 0; i < 3; i += 1) {
    s = must(next(must(lock(s)), 1000, rng));
    s = must(next(s, 1000, rng));
  }
  return s;
}

/** Перше запитання «Вибування» відкрито. */
const toS1 = (round = survival): GameState => must(next(must(next(toR1End(round), 2000, rng)), 3000, rng));

const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };
const NO: Answer = { type: 'boolean', value: false };

/** s1: p1 і p2 відповіли правильно, p3 — ні; відкрите випробування (питання на виживання) для p3. */
function toTrialOpen(s: GameState): GameState {
  let current = must(submitAnswer(s, 'p1', RIGHT, 4000));
  current = must(submitAnswer(current, 'p2', RIGHT, 4000));
  current = must(submitAnswer(current, 'p3', WRONG, 4000));
  return must(next(must(next(current, 4500, rng)), 5000, rng));
}

/** p3 не пройшов випробування: привид, етап leaderboard. */
function p3Ghost(round = survival): GameState {
  const s = must(answerTrial(toTrialOpen(toS1(round)), 'p3', NO, 6000));
  expect(survivalAlive(s)).toEqual(['p1', 'p2']);
  return s;
}

const rich = (s: GameState): GameState => ({ ...s, players: s.players.map((p) => ({ ...p, score: 1000 })) });

describe('survival isolation', () => {
  it('buffs are off with a reason', () => {
    const s = toS1();
    expect(s.plays[s.questionIndex].question.id).toBe('s1');
    expect(takeBuff(s, 'p1', 'double', 3100, rng)).toEqual({ ok: false, error: 'wrong_phase' });
    const slots = playerView(s, 'p1')?.me.buffs?.slots.map((slot) => [slot.kind, slot.state, slot.block]);
    expect(slots).toEqual([
      ['fifty', 'blocked', 'off_survival'],
      ['double', 'blocked', 'off_survival'],
    ]);
  });

  it('debuffs work on the living', () => {
    const intro = must(next(toR1End(), 2000, rng));
    expect(intro.phase).toBe('intro');
    expect(debuffsOff(intro)).toBe(false);
    const s = must(next(must(setDebuff(intro, 'p2', 'fog')), 3000, rng));
    expect(s.plays[s.questionIndex].question.id).toBe('s1');
    expect(s.debuffs.p2.firedAt).toBe(s.questionIndex);
    expect(s.debuffs.p1).toBeUndefined();
  });

  it('the shop works in the round', () => {
    const s = rich(toS1());
    expect(shopBlock(s, 'p1')).toBeNull();
    const bought = must(buyDebuff(s, 'p1', 'p2', 'fog', 3500));
    expect(bought.debuffs.p2).toMatchObject({ kind: 'fog', firedAt: null, by: 'p1' });
    expect(bought.adjustments.some((a) => a.source === 'debuff' && a.playerId === 'p1')).toBe(true);
  });

  it('ghosts are not debuff targets', () => {
    const s = rich(p3Ghost());
    expect(ghostTarget(s, 'p3')).toBe(true);
    expect(ghostTarget(s, 'p1')).toBe(false);
    expect(setDebuff(s, 'p3', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
    expect(buyDebuff(s, 'p1', 'p3', 'fog', 7000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(setDebuff(s, 'p2', 'fog').ok).toBe(true);
    const end = { ...s, phase: 'round_end' as const };
    expect(ghostTarget(end, 'p3')).toBe(false);
    expect(setDebuff(end, 'p3', 'fog').ok).toBe(true);
    expect(buyDebuff(end, 'p1', 'p3', 'fog', 7000).ok).toBe(true);
  });

  it('a ghost can buy a debuff for the living', () => {
    const bought = must(buyDebuff(rich(p3Ghost()), 'p3', 'p1', 'fog', 7000));
    expect(bought.debuffs.p1).toMatchObject({ kind: 'fog', by: 'p3' });
  });

  it('a debuff pending on a ghost waits for the next round', () => {
    // Дебаф куплено, поки p3 ще жива; вона вибуває на випробуванні — дебаф чекає на s2.
    const bought = must(buyDebuff(rich(toS1()), 'p2', 'p3', 'fog', 3500));
    const s = must(answerTrial(toTrialOpen(bought), 'p3', NO, 6000));
    expect(s.debuffs.p3.firedAt).toBeNull();
    const s2 = must(next(s, 7000, rng));
    expect(s2.plays[s2.questionIndex].question.id).toBe('s2');
    expect(s2.debuffs.p3.firedAt).toBeNull();
  });

  it('a debuff on a ghost fires on the first question of the next round', () => {
    // N = 2: після вибування p3 живих 2, раунд закінчується; дебаф спрацьовує в r3.
    const round = survivalRound('rs', survivalQuestions, survivalTrials, { bonus: 0, survivors: 2 });
    const bought = must(buyDebuff(rich(toS1(round)), 'p2', 'p3', 'fog', 3500));
    let s = must(answerTrial(toTrialOpen(bought), 'p3', NO, 6000));
    s = must(next(s, 7000, rng));
    expect(s.phase).toBe('round_end');
    expect(s.debuffs.p3.firedAt).toBeNull();
    const r3 = must(next(must(next(s, 8000, rng)), 9000, rng));
    expect(r3.plays[r3.questionIndex].question.id).toBe('q9');
    expect(r3.debuffs.p3.firedAt).toBe(r3.questionIndex);
  });

  it('debuffs never fire on a trial', () => {
    const intro = must(setDebuff(must(next(toR1End(), 2000, rng)), 'p2', 'fog'));
    const s = toTrialOpen(must(next(intro, 3000, rng)));
    expect(s.phase).toBe('leaderboard');
    // дебаф p2 спалено на s1 і прибрано із закриттям запитання; нових на випробуванні немає
    expect(s.debuffs.p2).toBeUndefined();
    expect(Object.keys(s.debuffs)).toEqual([]);
  });

  it('no duels in the round', () => {
    const declared = must(declareDuel(toR1End(), 'p1', 'p2')).duel;
    expect(declared?.stage).toBe('declared');
    expect(duelWindowOpen(toR1End())).toBe(true);
    const intro = must(next(toR1End(), 2000, rng));
    for (const s of [intro, toS1(), p3Ghost()]) {
      expect(duelWindowOpen(s)).toBe(false);
      expect(declareDuel(s, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
      expect(duelDue({ ...s, duel: declared })).toBe(false);
    }
    expect(must(next({ ...intro, duel: declared }, 3000, rng)).phase).toBe('question');
    const end = { ...toS1(), phase: 'round_end' as const };
    expect(duelWindowOpen(end)).toBe(true);
    expect(duelDue({ ...end, duel: declared })).toBe(true);
    expect(must(next({ ...end, duel: declared }, 12_000, rng)).phase).toBe('duel');
  });

  it('round rules apply', () => {
    const rules = { penalty: 'minus', partial: null, streak: null, multiplier: 2 } as const;
    const round = survivalRound('rs', survivalQuestions, survivalTrials, { rules, speedBonus: true });
    expect(rulesOf(round)).toEqual(rules);
    expect(rulesOf(round)).not.toEqual(DEFAULT_RULES);
    expect(roundBrief(round)).toMatchObject({ type: 'survival', penalty: true, streak: null, multiplier: 2, speedBonus: true });
    let s = toS1(round);
    s = must(submitAnswer(s, 'p1', RIGHT, 4000));
    s = must(submitAnswer(s, 'p2', RIGHT, 4000));
    s = must(submitAnswer(s, 'p3', WRONG, 4000));
    s = must(next(s, 4500, rng));
    const score = (id: string) => s.players.find((p) => p.id === id)?.score ?? 0;
    expect(score('p1')).toBeGreaterThan(100);
    expect(score('p3')).toBeLessThan(0);
  });
});
