import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, roundBrief, rulesOf, type Answer } from '@quiz/shared';
import { buffBlock, takeBuff } from './buffs';
import { buyDebuff, debuffsOff, setDebuff, shopBlock } from './debuffs';
import { declareDuel, duelDue, duelWindowOpen } from './duel';
import { lock, next, submitAnswer, type GameState } from './game';
import { decideLadder, pickContestant } from './ladder';
import { classicRound, duels, ladderRound, LADDER_RIGHT, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { playerView } from './views';

const rng = () => 0;
const ladder = ladderRound('rl', undefined, { timer: true });
// Три запитання в r1: поріг дуелей ⌈9 / 3⌉ = 3 досягається на його round_end.
const quizOf = (round = ladder) => ({
  ...makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')]), round, classicRound('r3', [withId(single, 'q9')])], {
    buffs: ['double', 'fifty'],
    debuffs: ['fog', 'shake'],
    leaderboard: 'end',
  }),
  duels,
});

/** r1 зіграно, гра на його round_end (нікому не відповідали). */
function toR1End(round = ladder): GameState {
  let s = startRound(lobbyWith(quizOf(round), 'Оля', 'Петро', 'Віра'), 0, rng);
  for (let i = 0; i < 3; i += 1) {
    s = must(next(must(lock(s)), 1000, rng));
    s = must(next(s, 1000, rng));
  }
  return s;
}

/** Заставка «Мільйонера». */
const toIntro = (round = ladder): GameState => must(next(toR1End(round), 2000, rng));

/** Петро вибраний, l1 відкрито. */
const toL1 = (round = ladder): GameState => must(next(must(pickContestant(toIntro(round), 'p2')), 3000, rng));

/** l1 розкрито й пройдено — етап leaderboard з відкритим рішенням. */
function toDeciding(): GameState {
  let s = must(submitAnswer(toL1(), 'p2', LADDER_RIGHT[0] as Answer, 4000));
  s = must(next(must(lock(s)), 4500, rng));
  s = must(next(s, 5000, rng));
  expect(s.phase).toBe('leaderboard');
  return s;
}

const rich = (s: GameState): GameState => ({ ...s, players: s.players.map((p) => ({ ...p, score: 1000 })) });

describe('ladder isolation', () => {
  it('buffs are off and the row is hidden', () => {
    const s = toL1();
    expect(s.plays[s.questionIndex].question.id).toBe('l1');
    expect(takeBuff(s, 'p1', 'double', 3100, rng)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(takeBuff(s, 'p2', 'double', 3100, rng)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(buffBlock(s, 'p1', 'double')).toBe('off_ladder');
    expect(playerView(s, 'p1')?.me.buffs).toBeNull();
    expect(playerView(s, 'p2')?.me.buffs).toBeNull();
  });

  it('debuffs are off in the round', () => {
    const intro = toIntro();
    const open = toL1();
    const deciding = toDeciding();
    for (const s of [intro, open, deciding]) {
      expect(debuffsOff(s)).toBe(true);
      expect(setDebuff(s, 'p2', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
    }
    const end = { ...deciding, phase: 'round_end' as const };
    expect(debuffsOff(end)).toBe(false);
    expect(setDebuff(end, 'p2', 'fog').ok).toBe(true);
    const shop = rich(open);
    expect(shopBlock(shop, 'p1')).toBe('phase');
    expect(buyDebuff(shop, 'p1', 'p3', 'fog', 3500)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a debuff pending from before waits for the next round', () => {
    // Дебаф наслано на p2 в кінці r1; у l1…l5 він не спрацьовує.
    let s = must(setDebuff(toR1End(), 'p2', 'fog'));
    expect(s.debuffs.p2.firedAt).toBeNull();
    s = must(next(s, 2000, rng));
    s = must(next(must(pickContestant(s, 'p2')), 3000, rng));
    for (let step = 0; step < 5; step += 1) {
      expect(s.plays[s.questionIndex].question.id).toBe(`l${step + 1}`);
      expect(s.debuffs.p2.firedAt).toBeNull();
      s = must(submitAnswer(s, 'p2', LADDER_RIGHT[step] as Answer, (s.startedAt ?? 0) + 1000));
      s = must(next(must(lock(s)), 5000, rng));
      s = must(next(s, 5100, rng));
      expect(s.debuffs.p2.firedAt).toBeNull();
      if (step < 4) {
        s = must(decideLadder(s, 'p2', false, 5200));
        s = must(next(s, 5300, rng));
      }
    }
    // Драбину пройдено: раунд закінчено, далі r3.
    expect(s.phase).not.toBe('question');
    while (s.plays[s.questionIndex]?.question.id !== 'q9' || s.phase !== 'question') s = must(next(s, 6000, rng));
    expect(s.debuffs.p2.firedAt).toBe(s.questionIndex);
  });

  it('no duels in the round', () => {
    const declared = must(declareDuel(toR1End(), 'p1', 'p2')).duel;
    expect(declared?.stage).toBe('declared');
    expect(duelWindowOpen(toR1End())).toBe(true);
    for (const s of [toIntro(), toL1(), toDeciding()]) {
      expect(duelWindowOpen(s)).toBe(false);
      expect(declareDuel(s, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
      expect(duelDue({ ...s, duel: declared })).toBe(false);
    }
    expect(must(next({ ...must(pickContestant(toIntro(), 'p2')), duel: declared }, 3000, rng)).phase).toBe('question');
    const end = { ...toDeciding(), phase: 'round_end' as const };
    expect(duelWindowOpen(end)).toBe(true);
    expect(duelDue({ ...end, duel: declared })).toBe(true);
    expect(must(next({ ...end, duel: declared }, 12_000, rng)).phase).toBe('duel');
  });

  it('no round rules', () => {
    expect(rulesOf(ladder)).toEqual(DEFAULT_RULES);
    expect(roundBrief(ladder)).toMatchObject({ type: 'ladder', penalty: false, streak: null, multiplier: 1, speedBonus: false });
    // Зал: три правильні поспіль — без бонусу за серію.
    let s = toL1();
    for (let step = 0; step < 3; step += 1) {
      const at = (s.startedAt ?? 0) + 1000;
      s = must(submitAnswer(s, 'p1', LADDER_RIGHT[step] as Answer, at));
      s = must(submitAnswer(s, 'p2', LADDER_RIGHT[step] as Answer, at));
      s = must(next(must(lock(s)), 5000, rng));
      expect(s.plays[s.questionIndex].answers.p1).toMatchObject({ accuracy: 1, streakBonus: 0 });
      s = must(next(s, 5100, rng));
      s = must(decideLadder(s, 'p2', false, 5200));
      s = must(next(s, 5300, rng));
    }
  });

  it('the ladder does not count toward total time', () => {
    const before = toIntro().players.map((p) => p.totalTimeMs);
    let s = toL1();
    s = must(submitAnswer(s, 'p1', LADDER_RIGHT[0] as Answer, 6000));
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[0] as Answer, 7000));
    s = must(next(must(lock(s)), 8000, rng));
    expect(s.players.map((p) => p.totalTimeMs)).toEqual(before);
  });
});
