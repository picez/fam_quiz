import { describe, expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { bluff, chain, single, sortQ, wall, withId } from '@quiz/engine/testing';
import type { AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { PENALTY_ATTEMPT, type PlayRef } from './db/schema';
import { gameAchievements, type AchievementWho } from './game-achievements';

const P = 'p-olya';
const PETRO = 'p-petro';
const SOLO: AchievementWho = { participantId: P, personId: null };

/** Зігране запитання: типово класичний раунд, single, 30 с, з балами. */
const q = (index: number, patch: Partial<AchievementQuestion> = {}): AchievementQuestion => {
  const question = patch.question ?? withId(single, `q${index}`);
  return {
    index,
    roundIndex: 0,
    roundType: 'classic',
    question,
    limitMs: 30_000,
    scored: true,
    blitz: false,
    cell: null,
    ref: { roundIndex: patch.roundIndex ?? 0, questionId: question.id },
    ...patch,
  };
};

/** Рядок answer: типово свій, прийнятий, спроба 0, 5 с. */
const row = (questionIndex: number, patch: Partial<AchievementRow> = {}): AchievementRow => ({
  participantId: P,
  questionIndex,
  roundIndex: 0,
  attempt: 0,
  payload: null,
  timeMs: 5000,
  accepted: true,
  points: 100,
  buff: null,
  spareId: null,
  debuff: null,
  clue: null,
  answeredBy: null,
  ...patch,
});

const range = (n: number) => [...Array(n).keys()];

/** Завершена соло-гра двох гравців (Оля перша, Петро другий). */
function fakeGame(patch: Partial<AchievementGame> = {}): AchievementGame {
  const questions = patch.questions ?? [q(0)];
  return {
    gameId: 'g1',
    status: 'finished',
    startedAt: new Date('2026-10-29T09:00:00Z'),
    finishedAt: new Date('2026-10-29T10:00:00Z'),
    questionsPlayed: questions.length,
    teams: false,
    players: [
      { participantId: P, userId: 'u-olya', members: [], rank: 1, score: 500 },
      { participantId: PETRO, userId: null, members: [], rank: 2, score: 100 },
    ],
    rows: [],
    adjustments: [],
    ...patch,
    questions,
  };
}

const earned = (game: AchievementGame, who: AchievementWho = SOLO) => gameAchievements(game, who);

/** Одне запитання з payload свого рядка. */
const withPayload = (question: AchievementQuestion['question'], payload: Answer, accepted = true) =>
  fakeGame({ questions: [q(0, { question })], rows: [row(0, { payload, accepted })] });

describe('gameAchievements: format summaries', () => {
  it('wall_clean: every group found without a mistake', () => {
    expect(earned(withPayload(wall, { type: 'wall', found: 4, groups: 4, mistakes: 0, timeMs: 40_000 }))).toContain('wall_clean');
    expect(earned(withPayload(wall, { type: 'wall', found: 4, groups: 4, mistakes: 1, timeMs: 40_000 }))).not.toContain('wall_clean');
    expect(earned(withPayload(wall, { type: 'wall', found: 3, groups: 4, mistakes: 0, timeMs: null }, false))).not.toContain('wall_clean');
  });

  it('sort_clean: everything sorted without a miss', () => {
    expect(earned(withPayload(sortQ, { type: 'sort', sorted: 4, total: 4, misses: 0, timeMs: 9000 }))).toContain('sort_clean');
    expect(earned(withPayload(sortQ, { type: 'sort', sorted: 4, total: 4, misses: 1, timeMs: 9000 }))).not.toContain('sort_clean');
    expect(earned(withPayload(sortQ, { type: 'sort', sorted: 3, total: 4, misses: 0, timeMs: null }, false))).not.toContain('sort_clean');
  });

  it('chain_full: every hidden word without a hint', () => {
    expect(earned(withPayload(chain, { type: 'chain', solved: 3, hints: 0, timeMs: 12_000 }))).toContain('chain_full');
    expect(earned(withPayload(chain, { type: 'chain', solved: 3, hints: 1, timeMs: 12_000 }))).not.toContain('chain_full');
    expect(earned(withPayload(chain, { type: 'chain', solved: 2, hints: 0, timeMs: 30_000 }, false))).not.toContain('chain_full');
  });
});

describe('gameAchievements: bluff', () => {
  const pick = (truth: boolean, fooled = 0): Answer => ({ type: 'bluff', lie: 'Мадрид', pick: truth ? 'Барселона' : 'Лондон', truth, fooled });
  const bluffs = (n: number) => range(n).map((i) => q(i, { question: withId(bluff, `bl${i}`) }));

  it('bluff_master: an own lie picked by at least three players', () => {
    expect(earned(withPayload(bluff, pick(false, 3), false))).toContain('bluff_master');
    expect(earned(withPayload(bluff, pick(false, 2), false))).not.toContain('bluff_master');
  });

  it('lie_detector: the truth in every bluff of the game, at least three', () => {
    expect(earned(fakeGame({ questions: bluffs(3), rows: range(3).map((i) => row(i, { payload: pick(true) })) }))).toContain('lie_detector');
    const oneLie = range(3).map((i) => row(i, { payload: pick(i !== 1), accepted: i !== 1 }));
    expect(earned(fakeGame({ questions: bluffs(3), rows: oneLie }))).not.toContain('lie_detector');
    expect(earned(fakeGame({ questions: bluffs(2), rows: range(2).map((i) => row(i, { payload: pick(true) })) }))).not.toContain('lie_detector');
    expect(earned(fakeGame({ questions: bluffs(3), rows: range(2).map((i) => row(i, { payload: pick(true) })) }))).not.toContain('lie_detector');
  });
});

describe('gameAchievements: special rounds', () => {
  const ladderGame = (contestant: string, kind: 'top' | 'took') =>
    fakeGame({
      questions: [
        q(0, {
          roundType: 'ladder',
          ref: { roundIndex: 0, questionId: 'q0', ladder: { contestant, step: 4, level: 5, outcome: { kind, passed: 5, points: 1000 } } },
        }),
      ],
    });

  it('ladder_top: the top step of the contestant', () => {
    expect(earned(ladderGame(P, 'top'))).toContain('ladder_top');
    expect(earned(ladderGame(P, 'took'))).not.toContain('ladder_top');
    expect(earned(ladderGame(PETRO, 'top'))).not.toContain('ladder_top');
  });

  /** «Ва-банк» з трьох запитань по 100; wipeout — позначки кожного кроку. */
  const wipeoutGame = (correct: boolean[], wipeout: (PlayRef['wipeout'] | undefined)[], participantId = P) =>
    fakeGame({
      questions: range(3).map((i) => {
        const question = withId(single, `w${i}`);
        return q(i, { roundType: 'wipeout', question: { ...question, points: 100 }, ref: { roundIndex: 0, questionId: question.id, ...(wipeout[i] ? { wipeout: wipeout[i] } : {}) } });
      }),
      rows: range(3).map((i) => row(i, { participantId, accepted: correct[i] })),
    });
  const ended = [{ took: [] }, { took: [] }, { took: [], end: true as const }];

  it('wipeout_bank: the bank carried to the end of the round', () => {
    expect(earned(wipeoutGame([true, true, true], ended))).toContain('wipeout_bank');
    expect(earned(wipeoutGame([true, false, true], ended))).not.toContain('wipeout_bank');
    expect(earned(wipeoutGame([true, true, true], [{ took: [] }, { took: [P] }, { took: [], end: true }]))).not.toContain('wipeout_bank');
    expect(earned(wipeoutGame([false, false, false], ended))).not.toContain('wipeout_bank');
    expect(earned(wipeoutGame([true, true, true], [{ took: [] }, { took: [] }, { took: [] }]))).not.toContain('wipeout_bank');
  });

  const survivalGame = (out: string[]) =>
    fakeGame({
      questions: [
        q(0, { roundType: 'survival', ref: { roundIndex: 0, questionId: 'q0', survival: { edge: [PETRO], trial: { kind: 'question', out } } } }),
        q(1, { roundType: 'survival', ref: { roundIndex: 0, questionId: 'q1', survival: { end: true } } }),
      ],
    });

  it('last_hero: alive at the end of a survival round where someone went out', () => {
    expect(earned(survivalGame([PETRO]))).toContain('last_hero');
    expect(earned(survivalGame([PETRO]), { participantId: PETRO, personId: null })).not.toContain('last_hero');
    expect(earned(survivalGame([]))).not.toContain('last_hero');
  });

  it('duelist: a won duel', () => {
    expect(earned(fakeGame({ adjustments: [{ participantId: P, source: 'duel', points: 200 }] }))).toContain('duelist');
    expect(earned(fakeGame({ adjustments: [{ participantId: P, source: 'duel', points: -200 }] }))).not.toContain('duelist');
    expect(earned(fakeGame({ adjustments: [{ participantId: PETRO, source: 'duel', points: 200 }] }))).not.toContain('duelist');
  });
});

describe('gameAchievements: board', () => {
  const cell = (index: number, patch: Partial<NonNullable<AchievementQuestion['cell']>> = {}) =>
    q(index, { roundType: 'board', cell: { chooserId: P, mark: 1, blitz: false, ...patch } });

  it('board_owner: five own cells answered right', () => {
    expect(earned(fakeGame({ questions: range(5).map((i) => cell(i)), rows: range(5).map((i) => row(i)) }))).toContain('board_owner');
    expect(earned(fakeGame({ questions: range(5).map((i) => cell(i)), rows: range(4).map((i) => row(i)) }))).not.toContain('board_owner');
    const otherChooser = [...range(4).map((i) => cell(i)), cell(4, { chooserId: PETRO })];
    expect(earned(fakeGame({ questions: otherChooser, rows: range(5).map((i) => row(i)) }))).not.toContain('board_owner');
    const blitzCell = [...range(4).map((i) => cell(i)), cell(4, { blitz: true })];
    expect(earned(fakeGame({ questions: blitzCell, rows: range(5).map((i) => row(i)) }))).not.toContain('board_owner');
    const spare = [...range(4).map((i) => row(i)), row(4, { spareId: 'sp1' })];
    expect(earned(fakeGame({ questions: range(5).map((i) => cell(i)), rows: spare }))).toContain('board_owner');
  });

  it('double_jackpot: «Подвійні бали» answered right on a ×2 or ×3 cell', () => {
    expect(earned(fakeGame({ questions: [cell(0, { mark: 3 })], rows: [row(0, { buff: 'double' })] }))).toContain('double_jackpot');
    expect(earned(fakeGame({ questions: [cell(0, { mark: 2 })], rows: [row(0, { buff: 'double' })] }))).toContain('double_jackpot');
    expect(earned(fakeGame({ questions: [cell(0, { mark: 1 })], rows: [row(0, { buff: 'double' })] }))).not.toContain('double_jackpot');
    expect(earned(fakeGame({ questions: [cell(0, { mark: 3 })], rows: [row(0, { buff: 'double', accepted: false })] }))).not.toContain('double_jackpot');
    expect(earned(fakeGame({ questions: [cell(0, { mark: 3 })], rows: [row(0, { buff: 'shield' })] }))).not.toContain('double_jackpot');
  });
});

describe('gameAchievements: buffs and debuffs', () => {
  const questions = range(5).map((i) => q(i));

  it('buff_gourmet: four different buffs, «Ризик» silence too', () => {
    const risk = row(2, { attempt: PENALTY_ATTEMPT, accepted: false, points: -100, buff: 'risk' });
    const four = [row(0, { buff: 'double' }), row(1, { buff: 'shield', accepted: false }), risk, row(3, { buff: 'scope' })];
    expect(earned(fakeGame({ questions, rows: four }))).toContain('buff_gourmet');
    expect(earned(fakeGame({ questions, rows: four.slice(0, 3) }))).not.toContain('buff_gourmet');
    const repeated = [...four.slice(0, 3), row(3, { buff: 'double' })];
    expect(earned(fakeGame({ questions, rows: repeated }))).not.toContain('buff_gourmet');
  });

  it('unbreakable: three right answers under a debuff', () => {
    const three = [row(0, { debuff: 'fog' }), row(1, { debuff: 'mud' }), row(2, { debuff: 'flip' })];
    expect(earned(fakeGame({ questions, rows: three }))).toContain('unbreakable');
    expect(earned(fakeGame({ questions, rows: three.slice(0, 2) }))).not.toContain('unbreakable');
    expect(earned(fakeGame({ questions, rows: [...three.slice(0, 2), row(2, { debuff: 'flip', accepted: false })] }))).not.toContain('unbreakable');
    expect(earned(fakeGame({ questions, rows: [...three.slice(0, 2), row(2)] }))).not.toContain('unbreakable');
  });
});

describe('gameAchievements: formats in a team game', () => {
  const team = (patch: Partial<AchievementGame>) =>
    fakeGame({
      teams: true,
      players: [
        { participantId: 'team-a', userId: null, members: [{ participantId: 'm-olya', userId: 'u-olya' }, { participantId: 'm-vira', userId: 'u-vira' }], rank: 1, score: 900 },
        { participantId: 'team-b', userId: null, members: [], rank: 2, score: 100 },
      ],
      ...patch,
    });
  const OLYA: AchievementWho = { participantId: 'team-a', personId: 'm-olya' };
  const VIRA: AchievementWho = { participantId: 'team-a', personId: 'm-vira' };

  it('board_owner and unbreakable go only to the member who answered', () => {
    const game = team({
      questions: range(5).map((i) => q(i, { roundType: 'board', cell: { chooserId: 'team-a', mark: 1, blitz: false } })),
      rows: range(5).map((i) => row(i, { participantId: 'team-a', answeredBy: 'm-olya', debuff: 'fog' })),
    });
    expect(earned(game, OLYA)).toEqual(expect.arrayContaining(['board_owner', 'unbreakable']));
    expect(earned(game, VIRA)).not.toContain('board_owner');
    expect(earned(game, VIRA)).not.toContain('unbreakable');
  });

  it('ladder_top and wipeout_bank go to every member of the team', () => {
    const game = team({
      questions: [
        ...range(2).map((i) => {
          const question = { ...withId(single, `w${i}`), points: 100 };
          return q(i, { roundType: 'wipeout', question, ref: { roundIndex: 0, questionId: question.id, wipeout: i === 1 ? { took: [], end: true } : { took: [] } } });
        }),
        q(2, {
          roundIndex: 1,
          roundType: 'ladder',
          ref: { roundIndex: 1, questionId: 'q2', ladder: { contestant: 'team-a', step: 4, level: 5, outcome: { kind: 'top', passed: 5, points: 1000 } } },
        }),
      ],
      rows: range(2).map((i) => row(i, { participantId: 'team-a', answeredBy: 'm-olya' })),
    });
    for (const who of [OLYA, VIRA]) expect(earned(game, who)).toEqual(expect.arrayContaining(['ladder_top', 'wipeout_bank']));
  });
});
