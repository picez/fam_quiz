import { describe, expect, it } from 'vitest';
import type { AchievementId, Answer } from '@quiz/shared';
import { bluff, clues, single, withId } from '@quiz/engine/testing';
import type { AchievementGame, AchievementPlayer } from './achievement-games';
import { antiAchievements } from './anti-achievements';
import { AWAY_ATTEMPT, PENALTY_ATTEMPT } from './db/schema';
import { gameAchievements, type AchievementWho } from './game-achievements';
import { fakeGame, OLYA_IN_TEAM, P, PETRO, q, range, row, SOLO, TEAM, teamGame, VIRA_IN_TEAM } from './testing/achievement-fixtures';

const has = (game: AchievementGame, id: AchievementId, who: AchievementWho = SOLO) => antiAchievements(game, who).has(id);

const player = (participantId: string, rank: number | null, score: number): AchievementPlayer => ({ participantId, userId: null, members: [], rank, score });

/** Неправильна своя відповідь. */
const miss = (index: number, patch: Parameters<typeof row>[1] = {}) => row(index, { accepted: false, points: 0, ...patch });

describe('antiAchievements: the result of the game', () => {
  it('in_debt: a negative score', () => {
    expect(has(fakeGame({ players: [player(P, 2, -100), player(PETRO, 1, 100)] }), 'in_debt')).toBe(true);
    expect(has(fakeGame({ players: [player(P, 2, 0), player(PETRO, 1, 100)] }), 'in_debt')).toBe(false);
  });

  it('zero: 0 points after at least 5 questions', () => {
    const players = [player(P, 2, 0), player(PETRO, 1, 100)];
    expect(has(fakeGame({ players, questions: range(5).map((i) => q(i)) }), 'zero')).toBe(true);
    expect(has(fakeGame({ players, questions: range(4).map((i) => q(i)) }), 'zero')).toBe(false);
  });

  it('last_place: the very last of at least 4, a tie for the last place gives nothing', () => {
    const four = (rank: number) => [player('a', 1, 900), player('b', 2, 500), player('c', 3, 300), player(P, rank, 100)];
    expect(has(fakeGame({ players: four(4) }), 'last_place')).toBe(true);
    expect(has(fakeGame({ players: [player('a', 1, 900), player('b', 2, 500), player(P, 3, 100)] }), 'last_place')).toBe(false);
    expect(has(fakeGame({ players: four(3) }), 'last_place')).toBe(false);
  });

  it('so_close: second, less than 10 % of the winner behind', () => {
    const second = (winner: number, mine: number) => fakeGame({ players: [player(PETRO, 1, winner), player(P, 2, mine)] });
    expect(has(second(1000, 950), 'so_close')).toBe(true);
    expect(has(second(1000, 900), 'so_close')).toBe(false);
    expect(has(second(0, 0), 'so_close')).toBe(false);
    expect(has(fakeGame({ players: [player(P, 1, 1000), player(PETRO, 2, 950)] }), 'so_close')).toBe(false);
  });

  it('an unfinished game gives nothing', () => {
    expect(antiAchievements(fakeGame({ status: 'aborted', players: [player(P, 2, -100), player(PETRO, 1, 100)] }), SOLO).size).toBe(0);
  });
});

describe('antiAchievements: black_stripe', () => {
  const questions = range(10).map((i) => q(i));

  it('5 misses in a row', () => {
    expect(has(fakeGame({ questions, rows: range(5).map((i) => miss(i)) }), 'black_stripe')).toBe(true);
  });

  it('4 misses, a right one, 4 misses — no', () => {
    const rows = [...range(4).map((i) => miss(i)), row(4), ...range(4).map((i) => miss(5 + i))];
    expect(has(fakeGame({ questions, rows }), 'black_stripe')).toBe(false);
  });

  it('a silent Risk is a miss', () => {
    const rows = [...range(4).map((i) => miss(i)), row(4, { attempt: PENALTY_ATTEMPT, accepted: false, points: -100, buff: 'risk' })];
    expect(has(fakeGame({ questions, rows }), 'black_stripe')).toBe(true);
  });

  it('partial points and a won appeal break the stripe', () => {
    const partial = [...range(2).map((i) => miss(i)), miss(2, { points: 50 }), ...range(2).map((i) => miss(3 + i))];
    expect(has(fakeGame({ questions, rows: partial }), 'black_stripe')).toBe(false);
    const appealed = range(5).map((i) => miss(i));
    expect(has(fakeGame({ questions, rows: appealed, appeals: [{ participantId: P, questionIndex: 2, outcome: 'yes', yes: 3, no: 0 }] }), 'black_stripe')).toBe(false);
  });

  it('questions without own rows are skipped, polls do not count', () => {
    const skipped = [0, 1, 3, 4, 5].map((i) => miss(i));
    expect(has(fakeGame({ questions, rows: skipped }), 'black_stripe')).toBe(true);
    const poll = questions.map((one) => (one.index === 2 ? { ...one, scored: false } : one));
    expect(has(fakeGame({ questions: poll, rows: range(5).map((i) => miss(i)) }), 'black_stripe')).toBe(false);
  });

  it('a question undone by the host stays a miss', () => {
    const rows = range(5).map((i) => miss(i, { points: i === 2 ? -100 : 0 }));
    const game = fakeGame({ questions, rows, adjustments: [{ participantId: P, source: 'undo', points: 100 }] });
    expect(has(game, 'black_stripe')).toBe(true);
  });
});

describe('antiAchievements: answers', () => {
  const lie: Answer = { type: 'bluff', lie: 'вигадка', pick: 'чужа вигадка', truth: false, fooled: 0 };

  it('gullible: someone else’s fib picked on 3 questions', () => {
    const questions = range(3).map((i) => q(i, { question: withId(bluff, `b${i}`) }));
    expect(has(fakeGame({ questions, rows: range(3).map((i) => miss(i, { payload: lie })) }), 'gullible')).toBe(true);
    expect(has(fakeGame({ questions, rows: range(2).map((i) => miss(i, { payload: lie })) }), 'gullible')).toBe(false);
    const noPick = range(3).map((i) => miss(i, { payload: i === 0 ? { ...lie, pick: null } : lie }));
    expect(has(fakeGame({ questions, rows: noPick }), 'gullible')).toBe(false);
  });

  it('umbrella: a Shield and a right answer', () => {
    expect(has(fakeGame({ rows: [row(0, { buff: 'shield' })] }), 'umbrella')).toBe(true);
    expect(has(fakeGame({ rows: [miss(0, { buff: 'shield' })] }), 'umbrella')).toBe(false);
  });

  it('same_river: a Second try that stays wrong', () => {
    expect(has(fakeGame({ rows: [miss(0, { buff: 'retry' })] }), 'same_river')).toBe(true);
    expect(has(fakeGame({ rows: [miss(0, { buff: 'retry', points: 50 })] }), 'same_river')).toBe(false);
    expect(has(fakeGame({ rows: [row(0, { buff: 'retry' })] }), 'same_river')).toBe(false);
  });

  it('who_am_i: every clue opened and still wrong', () => {
    const four = withId({ ...clues, clues: clues.clues.slice(0, 4) }, 'c1');
    const game = (patch: Parameters<typeof row>[1]) => fakeGame({ questions: [q(0, { question: four })], rows: [row(0, patch)] });
    expect(has(game({ accepted: false, points: 0, clue: 4 }), 'who_am_i')).toBe(true);
    expect(has(game({ accepted: false, points: 0, clue: 3 }), 'who_am_i')).toBe(false);
    expect(has(game({ clue: 4 }), 'who_am_i')).toBe(false);
    expect(has(game({ accepted: false, points: 0, clue: null }), 'who_am_i')).toBe(false);
  });
});

describe('antiAchievements: all-in and «Ва-банк»', () => {
  it('all_in_lost: an all-in stake and no accepted answer', () => {
    const allIn = [q(0, { roundType: 'final', ref: { roundIndex: 0, questionId: 'q0', final: { allIn: [P] } } })];
    expect(has(fakeGame({ questions: allIn, rows: [miss(0, { wager: 500, points: -500 })] }), 'all_in_lost')).toBe(true);
    expect(has(fakeGame({ questions: allIn, rows: [row(0, { wager: 500, points: 500 })] }), 'all_in_lost')).toBe(false);
    expect(has(fakeGame({ questions: allIn, rows: [row(0, { attempt: PENALTY_ATTEMPT, accepted: false, points: -500 })] }), 'all_in_lost')).toBe(true);
    const old = [q(0, { roundType: 'final' })];
    expect(has(fakeGame({ questions: old, rows: [miss(0, { wager: 500, points: -500 })] }), 'all_in_lost')).toBe(false);
  });

  const wipeout = (end: number | null, steps = 3) =>
    range(steps).map((i) =>
      q(i, {
        roundType: 'wipeout',
        question: withId({ ...single, points: 100 }, `w${i}`),
        ref: { roundIndex: 0, questionId: `w${i}`, wipeout: { took: [], ...(end === i ? { end: true as const } : {}) } },
      }),
    );

  it('burned: the bank lost on the very last step', () => {
    expect(has(fakeGame({ questions: wipeout(2), rows: [row(0), row(1), miss(2)] }), 'burned')).toBe(true);
    expect(has(fakeGame({ questions: wipeout(0, 1), rows: [miss(0)] }), 'burned')).toBe(false);
    expect(has(fakeGame({ questions: wipeout(2), rows: [row(0), miss(1), miss(2)] }), 'burned')).toBe(false);
    expect(has(fakeGame({ questions: wipeout(null), rows: [row(0), row(1), miss(2)] }), 'burned')).toBe(false);
  });
});

describe('antiAchievements: slowpoke, debuffs, appeals, away', () => {
  const questions = range(6).map((i) => q(i));
  const timed = (participantId: string, timeMs: number, n = 5) => range(n).map((i) => row(i, { participantId, timeMs }));
  const three = [player(P, 3, 100), player(PETRO, 1, 300), player('p-vira', 2, 200)];

  it('slowpoke: the highest average time among at least 3 with 5 timed answers', () => {
    const rows = [...timed(P, 20_000), ...timed(PETRO, 5000), ...timed('p-vira', 8000)];
    expect(has(fakeGame({ questions, players: three, rows }), 'slowpoke')).toBe(true);
    const two = [...timed(P, 20_000), ...timed(PETRO, 5000), ...timed('p-vira', 8000, 4)];
    expect(has(fakeGame({ questions, players: three, rows: two }), 'slowpoke')).toBe(false);
    const fewMine = [...timed(P, 20_000, 4), ...timed(PETRO, 5000), ...timed('p-vira', 8000)];
    expect(has(fakeGame({ questions, players: three, rows: fewMine }), 'slowpoke')).toBe(false);
    const tie = [...timed(P, 20_000), ...timed(PETRO, 20_000), ...timed('p-vira', 8000)];
    expect(has(fakeGame({ questions, players: three, rows: tie }), 'slowpoke')).toBe(false);
  });

  it('slowpoke: blitz and spare answers do not count', () => {
    const blitz = questions.map((one) => ({ ...one, blitz: one.index < 2 }));
    const rows = [...timed(P, 20_000), ...timed(PETRO, 5000), ...timed('p-vira', 8000)];
    expect(has(fakeGame({ questions: blitz, players: three, rows }), 'slowpoke')).toBe(false);
    const spare = [...timed(P, 20_000).map((r, i) => (i === 0 ? { ...r, spareId: 's1' } : r)), ...timed(PETRO, 5000), ...timed('p-vira', 8000)];
    expect(has(fakeGame({ questions, players: three, rows: spare }), 'slowpoke')).toBe(false);
  });

  it('debuff_magnet: debuffs on 3 different questions, an away row counts', () => {
    const rows = [row(0, { debuff: 'fog' }), miss(1, { debuff: 'fog' }), row(2, { attempt: AWAY_ATTEMPT, accepted: false, points: 0, awayMs: 2500, debuff: 'mirror' })];
    expect(has(fakeGame({ questions, rows }), 'debuff_magnet')).toBe(true);
    expect(has(fakeGame({ questions, rows: rows.slice(0, 2) }), 'debuff_magnet')).toBe(false);
  });

  it('hammer: a lost appeal without a single yes', () => {
    const lost = (outcome: 'no' | 'tie', yes: number) => fakeGame({ appeals: [{ participantId: P, questionIndex: 0, outcome, yes, no: 3 }] });
    expect(has(lost('no', 0), 'hammer')).toBe(true);
    expect(has(lost('no', 1), 'hammer')).toBe(false);
    expect(has(lost('tie', 0), 'hammer')).toBe(false);
  });

  it('wanderer: out of the game on 3 scored questions, solo only', () => {
    const away = [row(0, { awayMs: 2000 }), miss(1, { awayMs: 5000 }), row(2, { attempt: AWAY_ATTEMPT, accepted: false, points: 0, awayMs: 3000 })];
    expect(has(fakeGame({ questions, rows: away }), 'wanderer')).toBe(true);
    expect(has(fakeGame({ questions, rows: away.slice(0, 2) }), 'wanderer')).toBe(false);
    const team = teamGame({ questions, rows: away.map((r) => ({ ...r, participantId: TEAM, answeredBy: 'm-olya' })) });
    expect(has(team, 'wanderer', OLYA_IN_TEAM)).toBe(false);
    expect(has(team, 'wanderer', VIRA_IN_TEAM)).toBe(false);
  });
});

describe('antiAchievements in a team game', () => {
  const questions = range(6).map((i) => q(i));

  it('black_stripe goes to the answerer only', () => {
    const game = teamGame({ questions, rows: range(5).map((i) => miss(i, { participantId: TEAM, answeredBy: 'm-olya' })) });
    expect(has(game, 'black_stripe', OLYA_IN_TEAM)).toBe(true);
    expect(has(game, 'black_stripe', VIRA_IN_TEAM)).toBe(false);
  });

  it('the result ones go to every person of the team', () => {
    const players: AchievementPlayer[] = [
      { participantId: 'x1', userId: null, members: [], rank: 1, score: 900 },
      { participantId: 'x2', userId: null, members: [], rank: 2, score: 500 },
      { participantId: 'x3', userId: null, members: [], rank: 3, score: 300 },
      { participantId: TEAM, userId: null, members: [{ participantId: 'm-olya', userId: 'u-olya' }, { participantId: 'm-vira', userId: 'u-vira' }], rank: 4, score: -100 },
    ];
    const rows = range(3).map((i) => miss(i, { participantId: TEAM, answeredBy: 'm-vira', debuff: 'fog' }));
    const game = teamGame({ questions, players, rows, appeals: [{ participantId: TEAM, questionIndex: 0, outcome: 'no', yes: 0, no: 4 }] });
    for (const who of [OLYA_IN_TEAM, VIRA_IN_TEAM]) {
      for (const id of ['in_debt', 'last_place', 'debuff_magnet', 'hammer'] as const) expect(has(game, id, who), `${id} ${who.personId}`).toBe(true);
    }
  });

  it('an old team game without answeredBy gives the answer ones to nobody', () => {
    const game = teamGame({ questions, rows: range(5).map((i) => miss(i, { participantId: TEAM, buff: i === 0 ? 'retry' : null })) });
    for (const who of [OLYA_IN_TEAM, VIRA_IN_TEAM]) {
      expect(has(game, 'black_stripe', who)).toBe(false);
      expect(has(game, 'same_river', who)).toBe(false);
    }
  });
});

describe('gameAchievements includes the anti-achievements', () => {
  it('in catalogue order', () => {
    const game = fakeGame({ players: [player(P, 2, -100), player(PETRO, 1, 100)], rows: [row(0, { buff: 'shield' })] });
    const got = gameAchievements(game, SOLO);
    expect(got).toEqual(expect.arrayContaining(['in_debt', 'umbrella']));
    expect(got.indexOf('in_debt')).toBeLessThan(got.indexOf('umbrella'));
  });
});
