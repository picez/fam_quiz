import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, roundBrief, rulesOf, type Answer } from '@quiz/shared';
import { takeBuff } from './buffs';
import { buyDebuff, debuffsOff, setDebuff, shopBlock } from './debuffs';
import { declareDuel, duelDue, duelWindowOpen } from './duel';
import { lock, next, submitAnswer, type GameState } from './game';
import { classicRound, duels, makeRoundsQuiz, single, wipeoutLadder, wipeoutRound, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { decideWipeout } from './wipeout';
import { playerView } from './views';

const rng = () => 0;
const wipeout = wipeoutRound('rw', wipeoutLadder);
// Три запитання в r1: поріг дуелей ⌈9 / 3⌉ = 3 досягається на його round_end.
const quiz = {
  ...makeRoundsQuiz(
    [classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')]), wipeout, classicRound('r3', [withId(single, 'q9')])],
    { buffs: ['double', 'fifty'], debuffs: ['fog', 'mud'], leaderboard: 'end' },
  ),
  duels,
};

/** r1 зіграно, гра на його round_end (нікому не відповідали). */
function toR1End(): GameState {
  let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 0, rng);
  for (let i = 0; i < 3; i += 1) {
    s = must(next(must(lock(s)), 1000, rng));
    s = must(next(s, 1000, rng));
  }
  return s;
}

/** Перше запитання «Ва-банк» відкрито. */
const toW1 = (): GameState => must(next(must(next(toR1End(), 2000, rng)), 3000, rng));

/** Усі відповіли правильно на w1, розкрито; далі етап вікна рішення. */
function toWindow(): GameState {
  return playRung(toW1(), 0);
}

const ANSWERS: Answer[] = [
  { type: 'single', optionId: 'b' },
  { type: 'boolean', value: true },
  { type: 'numeric', value: 2100 },
  { type: 'text', value: 'Одеса' },
  { type: 'slider', value: 52 },
];

/** Усі в грі відповідають правильно на сходинку; від закритого запитання до вікна рішення (або round_end на останній). */
function playRung(s: GameState, i: number): GameState {
  let current = s;
  for (const id of ['p1', 'p2', 'p3']) current = must(submitAnswer(current, id, ANSWERS[i], 20_000 * i + 6000));
  return must(next(must(next(current, 20_000 * i + 7000, rng)), 20_000 * i + 8000, rng));
}

/** Усі вибирають «Далі», відкривається наступне запитання. */
const afterWindow = (s: GameState, i: number): GameState => {
  const now = 20_000 * i + 8000;
  return must(next(['p1', 'p2', 'p3'].reduce((current, id) => must(decideWipeout(current, id, false, now + 500)), s), now + 1000, rng));
};

/** Раунд «Ва-банк» зіграно, усі вціліли, гра на його round_end. */
function toWipeoutEnd(): GameState {
  let s = toW1();
  for (let i = 0; i < 5; i += 1) {
    s = playRung(s, i);
    if (i < 4) s = afterWindow(s, i);
  }
  return s;
}

describe('wipeout isolation', () => {
  it('buffs are off with a reason', () => {
    const s = toW1();
    expect(s.plays[s.questionIndex].question.id).toBe('w1');
    expect(takeBuff(s, 'p1', 'double', 3100, rng)).toEqual({ ok: false, error: 'wrong_phase' });
    const slots = playerView(s, 'p1')?.me.buffs?.slots.map((slot) => [slot.kind, slot.state, slot.block]);
    expect(slots).toEqual([
      ['fifty', 'blocked', 'off_wipeout'],
      ['double', 'blocked', 'off_wipeout'],
    ]);
  });

  it('the host cannot send a debuff during the round, but can on its round_end', () => {
    expect(debuffsOff(toR1End())).toBe(false);
    const intro = must(next(toR1End(), 2000, rng));
    expect(intro.phase).toBe('intro');
    for (const s of [intro, toW1(), toWindow()]) {
      expect(debuffsOff(s)).toBe(true);
      expect(setDebuff(s, 'p2', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
    }
    const end = toWipeoutEnd();
    expect(end.phase).toBe('round_end');
    expect(debuffsOff(end)).toBe(false);
    expect(setDebuff(end, 'p2', 'fog').ok).toBe(true);
  });

  it('the shop is closed during the round', () => {
    const rich = (s: GameState): GameState => ({ ...s, players: s.players.map((p) => ({ ...p, score: 1000 })) });
    for (const s of [must(next(toR1End(), 2000, rng)), toW1(), toWindow()]) {
      expect(shopBlock(rich(s), 'p1')).toBe('phase');
      expect(buyDebuff(rich(s), 'p1', 'p2', 'fog', 6000)).toEqual({ ok: false, error: 'wrong_phase' });
    }
    expect(shopBlock(rich(toR1End()), 'p1')).toBeNull();
    expect(shopBlock(rich(toWipeoutEnd()), 'p1')).toBeNull();
  });

  it('a pending debuff waits through the round and fires in the next one', () => {
    let s = must(setDebuff(toR1End(), 'p2', 'fog'));
    s = must(next(s, 2000, rng));
    s = must(next(s, 3000, rng));
    expect(s.plays[s.questionIndex].question.id).toBe('w1');
    expect(s.debuffs.p2.firedAt).toBeNull();
    // дебаф чекає на всіх сходинках
    for (let i = 0; i < 5; i += 1) {
      s = playRung(s, i);
      expect(s.debuffs.p2.firedAt).toBeNull();
      if (i < 4) {
        s = afterWindow(s, i);
        expect(s.debuffs.p2.firedAt).toBeNull();
      }
    }
    expect(s.phase).toBe('round_end');
    const r3 = must(next(must(next(s, 10_000, rng)), 11_000, rng));
    expect(r3.plays[r3.questionIndex].question.id).toBe('q9');
    expect(r3.debuffs.p2.firedAt).toBe(r3.questionIndex);
  });

  it('no duels in the round, but a declared one starts on its round_end', () => {
    const declared = must(declareDuel(toR1End(), 'p1', 'p2')).duel;
    expect(declared?.stage).toBe('declared');
    const intro = must(next(toR1End(), 2000, rng));
    // поріг досягнуто, а в раунді вікно закрите
    expect(duelWindowOpen(toR1End())).toBe(true);
    for (const s of [intro, toW1(), toWindow()]) {
      expect(duelWindowOpen(s)).toBe(false);
      expect(declareDuel(s, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
      expect(duelDue({ ...s, duel: declared })).toBe(false);
    }
    // оголошена раніше дуель не заважає «Далі» на intro
    expect(must(next({ ...intro, duel: declared }, 3000, rng)).phase).toBe('question');
    const end = toWipeoutEnd();
    expect(end.phase).toBe('round_end');
    expect(duelWindowOpen(end)).toBe(true);
    expect(duelDue({ ...end, duel: declared })).toBe(true);
    expect(must(next({ ...end, duel: declared }, 12_000, rng)).phase).toBe('duel');
  });

  it('round rules do not exist', () => {
    expect(rulesOf(wipeout)).toEqual(DEFAULT_RULES);
    expect(roundBrief(wipeout)).toMatchObject({
      type: 'wipeout',
      penalty: false,
      streak: null,
      multiplier: 1,
      speedBonus: false,
      instant: false,
    });
  });
});
