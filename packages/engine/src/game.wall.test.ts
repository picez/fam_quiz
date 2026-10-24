import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEFAULT_RULES, type Question, type RoundRules } from '@quiz/shared';
import { pickCell } from './board';
import { buffBlock } from './buffs';
import { end, lock, next, override, pause, recordOf, removePlayer, setConnected, start, submitAnswer, tick, type GameState, type Rng } from './game';
import { guessWall, wallOf } from './wall';
import { boardRound, makeQuiz, makeRoundsQuiz, single, wall, wall3, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, openAt, startRound } from './testing/helpers';

const rng: Rng = () => 0;

/** Простий детермінований генератор (LCG) для перевірки порядку плиток за різних rng. */
function seeded(seed: number): Rng {
  let x = seed;
  return () => {
    x = (x * 1_103_515_245 + 12_345) % 2_147_483_648;
    return x / 2_147_483_648;
  };
}

/** Класика з p1 «Анна» і p2 «Богдан», бонус швидкості увімкнено; перше запитання відкрито о 0. */
function openClassic(questions: Question[], random: Rng = rng, rules: Partial<RoundRules> = {}): GameState {
  const quiz = makeQuiz(questions, { leaderboard: 'end', speedBonus: true, rules: { ...DEFAULT_RULES, ...rules } });
  return startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0, random);
}

/** Позиції плиток у порядку показу. */
const at = (s: GameState, ...ids: string[]) => ids.map((id) => s.presented.indexOf(id));
const groupAt = (s: GameState, prefix: string, n = 4) => at(s, ...Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`));
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);
const scores = (s: GameState) => s.players.map((p) => p.score);
const streakOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.streak;

/** Три різні неправильні вибори 4×4. */
const WRONG = [
  ['r1', 'r2', 'r3', 'm1'],
  ['m1', 'm2', 'm3', 'l1'],
  ['l1', 'l2', 'l3', 'i1'],
];

describe('connections wall', () => {
  it('no shown row is a group, whatever the rng', () => {
    for (const random of [() => 0, () => 0.999, seeded(1), seeded(7)]) {
      const s = openClassic([wall], random);
      expect(new Set(s.presented)).toEqual(new Set(wall.groups.flatMap((g) => g.tiles.map((t) => t.id))));
      expect(s.presented).toHaveLength(16);
      for (let row = 0; row < 4; row++) {
        const ids = new Set(s.presented.slice(row * 4, row * 4 + 4));
        expect(wall.groups.some((g) => g.tiles.every((t) => ids.has(t.id)))).toBe(false);
      }
    }
  });

  it('a right group is found, the third right group completes the wall and pays 3 of 4 groups', () => {
    let s = openClassic([wall]);
    expect(s.plays[0].wall).toBeUndefined();
    expect(wallOf(s, 'p1')).toEqual({ found: [], mistakes: 0, tried: [] });
    s = must(guessWall(s, 'p1', at(s, 'r1', 'r2', 'r3', 'r4'), 1000));
    expect(wallOf(s, 'p1').found).toEqual(['gr']);
    expect(record(s, 'p1')).toBeUndefined();
    s = must(guessWall(s, 'p1', at(s, 'm1', 'm2', 'm3', 'm4'), 2000));
    s = must(guessWall(s, 'p1', at(s, 'l1', 'l2', 'l3', 'l4'), 3000));
    expect(wallOf(s, 'p1').found).toEqual(['gr', 'gm', 'gl', 'gi']);
    expect(recordOf(s, 0, 'p1')).toMatchObject({
      points: 750,
      accepted: true,
      grade: 'correct',
      timeMs: 3000,
      accuracy: 0.75,
      streakBonus: 0,
      overridden: false,
      answer: { type: 'wall', found: 4, groups: 4, mistakes: 0, timeMs: 3000 },
    });
    expect(s.phase).toBe('question');
  });

  it('a wrong pick is a mistake; the same wrong pick again is wall_repeat and costs nothing', () => {
    let s = openClassic([wall]);
    s = must(guessWall(s, 'p1', at(s, 'r1', 'r2', 'r3', 'm1'), 1000));
    expect(wallOf(s, 'p1')).toEqual({ found: [], mistakes: 1, tried: ['m1,r1,r2,r3'] });
    expect(guessWall(s, 'p1', at(s, 'm1', 'r3', 'r1', 'r2'), 2000)).toEqual({ ok: false, error: 'wall_repeat' });
    expect(wallOf(s, 'p1').mistakes).toBe(1);
  });

  it('the wall locks at the mistake limit and pays the groups found', () => {
    let s = openClassic([wall]);
    s = must(guessWall(s, 'p1', groupAt(s, 'i'), 1000));
    for (const [k, pick] of [['r1', 'r2', 'r3', 'm1'], ['m1', 'm2', 'm3', 'l1'], ['l1', 'l2', 'l3', 'r4']].entries()) {
      s = must(guessWall(s, 'p1', at(s, ...pick), 2000 + k * 1000));
    }
    expect(wallOf(s, 'p1')).toMatchObject({ found: ['gi'], mistakes: 3 });
    expect(record(s, 'p1')).toMatchObject({
      points: 250,
      accepted: false,
      grade: 'partial',
      timeMs: 4000,
      answer: { type: 'wall', found: 1, groups: 4, mistakes: 3, timeMs: 4000 },
    });
    expect(guessWall(s, 'p1', groupAt(s, 'r'), 5000)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('two groups are correct (half the price)', () => {
    let s = openClassic([wall]);
    s = must(guessWall(s, 'p1', groupAt(s, 'r'), 1000));
    s = must(guessWall(s, 'p1', groupAt(s, 'm'), 2000));
    s = tick(s, 90_001);
    expect(s.phase).toBe('locked');
    expect(recordOf(s, 0, 'p1')).toMatchObject({
      points: 500,
      accepted: true,
      grade: 'correct',
      timeMs: 90_000,
      answer: { type: 'wall', found: 2, groups: 4, mistakes: 0, timeMs: null },
    });
    expect(recordOf(s, 0, 'p2')).toBeUndefined();
    expect(scores(s)).toEqual([500, 0]);
  });

  it('bad picks: wrong size, duplicates, found tiles, out of range → wall_pick', () => {
    let s = openClassic([wall]);
    expect(guessWall(s, 'p1', [0, 1, 2], 1000)).toEqual({ ok: false, error: 'wall_pick' });
    expect(guessWall(s, 'p1', [0, 0, 1, 2], 1000)).toEqual({ ok: false, error: 'wall_pick' });
    expect(guessWall(s, 'p1', [0, 1, 2, 16], 1000)).toEqual({ ok: false, error: 'wall_pick' });
    expect(guessWall(s, 'p1', [-1, 0, 1, 2], 1000)).toEqual({ ok: false, error: 'wall_pick' });
    expect(guessWall(s, 'p1', [0.5, 0, 1, 2], 1000)).toEqual({ ok: false, error: 'wall_pick' });
    s = must(guessWall(s, 'p1', groupAt(s, 'r'), 1000));
    expect(guessWall(s, 'p1', at(s, 'r1', 'm1', 'm2', 'm3'), 2000)).toEqual({ ok: false, error: 'wall_pick' });
    expect(wallOf(s, 'p1').mistakes).toBe(0);
  });

  it('the minus penalty only for a player who tried and found nothing', () => {
    let s = openClassic([wall], rng, { penalty: 'minus' });
    s = must(guessWall(s, 'p1', at(s, ...WRONG[0]), 1000));
    s = tick(s, 90_001);
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: -1000, accepted: false, grade: 'wrong', accuracy: 0 });
    expect(recordOf(s, 0, 'p2')).toBeUndefined();
    expect(scores(s)).toEqual([-1000, 0]);
  });

  it('no speed bonus; the round multiplier applies', () => {
    let s = openClassic([wall], rng, { multiplier: 2 });
    s = must(guessWall(s, 'p1', groupAt(s, 'r'), 1000));
    s = must(guessWall(s, 'p1', groupAt(s, 'm'), 1500));
    s = must(lock(s));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 1000, accepted: true });
  });

  it('everyone done closes the question', () => {
    let s = openClassic([wall]);
    for (const [k, prefix] of ['r', 'm', 'l'].entries()) s = must(guessWall(s, 'p1', groupAt(s, prefix), 1000 + k));
    expect(s.phase).toBe('question');
    for (const [k, pick] of WRONG.entries()) s = must(guessWall(s, 'p2', at(s, ...pick), 2000 + k));
    expect(s.phase).toBe('locked');
    expect(scores(s)).toEqual([750, 0]);
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 0, grade: 'wrong', answer: { found: 0, mistakes: 3 } });
  });

  it('a disconnected player does not hold the question', () => {
    let s = openClassic([wall]);
    s = must(setConnected(s, 'p2', false, 500));
    for (const [k, prefix] of ['r', 'm', 'l'].entries()) s = must(guessWall(s, 'p1', groupAt(s, prefix), 1000 + k));
    expect(s.phase).toBe('locked');
  });

  it('a 3×3 wall: one group is a third and not correct, two groups complete it', () => {
    let s = openClassic([wall3]);
    s = must(guessWall(s, 'p1', groupAt(s, 'a', 3), 1000));
    s = tick(s, 60_001);
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 300, accepted: false, grade: 'partial' });
    let t = openClassic([wall3]);
    expect(guessWall(t, 'p1', groupAt(t, 'a', 4), 1000)).toEqual({ ok: false, error: 'wall_pick' });
    t = must(guessWall(t, 'p1', groupAt(t, 'a', 3), 1000));
    t = must(guessWall(t, 'p1', groupAt(t, 'c', 3), 2000));
    expect(wallOf(t, 'p1').found).toEqual(['ga', 'gc', 'gb']);
    expect(recordOf(t, 0, 'p1')).toMatchObject({ points: 600, accepted: true, grade: 'correct', answer: { found: 3, groups: 3 } });
  });

  it('pause blocks guesses', () => {
    const s = must(pause(openClassic([wall]), 1000));
    expect(guessWall(s, 'p1', groupAt(s, 'r'), 1500)).toEqual({ ok: false, error: 'paused' });
  });

  it('before the splash ends — not_started', () => {
    const s = openAt(lobbyWithSplash(makeQuiz([wall]), 'Анна', 'Богдан'), 0, rng);
    expect(s.splash).not.toBeNull();
    expect(guessWall(s, 'p1', groupAt(s, 'r'), 100)).toEqual({ ok: false, error: 'not_started' });
  });

  it('time over — time_over', () => {
    const s = openClassic([wall]);
    expect(guessWall(s, 'p1', groupAt(s, 'r'), 90_001)).toEqual({ ok: false, error: 'time_over' });
    expect(guessWall(s, 'p1', groupAt(s, 'r'), 90_000).ok).toBe(true);
  });

  it('other refusals: unknown player, another question type, a closed question', () => {
    const s = openClassic([wall]);
    expect(guessWall(s, 'p9', groupAt(s, 'r'), 1000)).toEqual({ ok: false, error: 'not_found' });
    expect(guessWall(must(lock(s)), 'p1', groupAt(s, 'r'), 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    const plain = openClassic([single]);
    expect(guessWall(plain, 'p1', [0, 1, 2, 3], 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('submitAnswer refuses a wall', () => {
    const s = openClassic([wall]);
    expect(submitAnswer(s, 'p1', { type: 'single', optionId: 'a' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const fake = { type: 'wall', found: 4, groups: 4, mistakes: 0, timeMs: 1 } as const;
    expect(submitAnswer(s, 'p1', fake, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(openClassic([single]), 'p1', fake, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('override refuses a wall', () => {
    let s = openClassic([wall]);
    s = must(guessWall(s, 'p1', groupAt(s, 'r'), 1000));
    s = must(next(must(lock(s)), 2000, rng));
    expect(s.phase).toBe('reveal');
    expect(override(s, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('no buff fits a wall', () => {
    const s = openClassic([wall]);
    for (const kind of BUFF_KINDS) expect(buffBlock(s, 'p1', kind, 1000)).toBe('off_wall');
  });

  it('streak: a correct wall continues it', () => {
    let s = openClassic([wall, withId(wall, 'q15')], rng, { streak: { length: 2, bonus: { kind: 'fixed', value: 100 } } });
    s = must(guessWall(s, 'p1', groupAt(s, 'r'), 1000));
    s = must(guessWall(s, 'p1', groupAt(s, 'm'), 2000));
    s = must(next(must(lock(s)), 3000, rng));
    s = must(next(s, 4000, rng));
    expect(s.questionIndex).toBe(1);
    s = must(guessWall(s, 'p1', groupAt(s, 'r'), 5000));
    s = must(guessWall(s, 'p1', groupAt(s, 'm'), 6000));
    s = must(lock(s));
    expect(streakOf(s, 'p1')).toBe(2);
    expect(record(s, 'p1')).toMatchObject({ basePoints: 500, streakBonus: 100, points: 600 });
  });

  it('a removed player leaves no wall progress', () => {
    let s = openClassic([wall]);
    s = must(guessWall(s, 'p1', at(s, ...WRONG[0]), 1000));
    s = must(guessWall(s, 'p2', at(s, ...WRONG[0]), 1000));
    s = must(removePlayer(s, 'p1'));
    expect(s.plays[0].wall).not.toHaveProperty('p1');
    expect(s.plays[0].wall).toHaveProperty('p2');
  });

  it('ending the game mid-wall scores those who tried', () => {
    let s = openClassic([wall]);
    s = must(guessWall(s, 'p2', groupAt(s, 'r'), 1000));
    s = must(end(s));
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 250, grade: 'partial' });
  });
});

describe('connections wall on a board cell answered from the phone', () => {
  /** Поле з p1 «Анна» і p2 «Богдан»: клітинка-стіна ×2 (q13); p1 вибрав її о 0. */
  function onWallCell(rules: Partial<RoundRules> = {}): GameState {
    const round = boardRound(
      'g1',
      [
        { title: 'Стіни', cells: [{ mark: 'x2', answerMode: 'phone', question: wall }] },
        { title: 'Інше', cells: [withId(single, 's1')] },
      ],
      { rules: { ...DEFAULT_RULES, ...rules } },
    );
    const s = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'))), 0));
    return must(pickCell(s, 'p1', 'q13', 0, rng));
  }

  it('only the chooser guesses', () => {
    const s = onWallCell();
    expect(guessWall(s, 'p2', groupAt(s, 'r'), 1000)).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('the last group reveals the cell at once', () => {
    let s = onWallCell();
    for (const [k, prefix] of ['r', 'm', 'l'].entries()) s = must(guessWall(s, 'p1', groupAt(s, prefix), 1000 + k));
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p1')).toMatchObject({ points: 1500, accepted: true, grade: 'correct' });
    expect(scores(s)).toEqual([1500, 0]);
  });

  it('locked at the limit reveals too', () => {
    let s = onWallCell({ penalty: 'none' });
    for (const [k, pick] of WRONG.entries()) s = must(guessWall(s, 'p1', at(s, ...pick), 1000 + k));
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p1')).toMatchObject({ points: 0, accepted: false, grade: 'wrong', answer: { found: 0, mistakes: 3 } });
    expect(scores(s)).toEqual([0, 0]);
  });

  it('a chooser who never touched gets a zero record when time is over', () => {
    let s = onWallCell({ penalty: 'minus' });
    s = tick(s, 90_001);
    expect(s.phase).not.toBe('question');
    expect(recordOf(s, 0, 'p1')).toMatchObject({
      points: 0,
      accepted: false,
      grade: 'wrong',
      timeMs: 90_000,
      answer: { type: 'wall', found: 0, groups: 4, mistakes: 0, timeMs: null },
    });
    expect(recordOf(s, 0, 'p2')).toBeUndefined();
    expect(scores(s)).toEqual([0, 0]);
  });
});
