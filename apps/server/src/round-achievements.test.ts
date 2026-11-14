import { describe, expect, it } from 'vitest';
import { questPoints, type AchievementId, type RoundType } from '@quiz/shared';
import { single, withId } from '@quiz/engine/testing';
import type { AchievementAdjustment, AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { PENALTY_ATTEMPT } from './db/schema';
import { gameAchievements, type AchievementWho } from './game-achievements';
import { cancelledSeqs, roundAchievements } from './round-achievements';
import { fakeGame, OLYA_IN_TEAM, P, PETRO, q, range, row, SOLO, TEAM, teamGame, VIRA_IN_TEAM } from './testing/achievement-fixtures';

const has = (game: AchievementGame, id: AchievementId, who: AchievementWho = SOLO) => roundAchievements(game, who).has(id);

/** Раунд з n запитань одного типу з індексу from. */
const round = (roundType: RoundType, n: number, roundIndex = 0, from = 0): AchievementQuestion[] =>
  range(n).map((i) => q(from + i, { roundType, roundIndex, question: withId(single, `${roundType}${from + i}`) }));

const adjustment = (patch: Partial<AchievementAdjustment>): AchievementAdjustment => ({ participantId: P, source: 'quest', points: 250, seq: 1, roundIndex: 1, undoesSeq: null, ...patch });

/** Командна гра: Оля влучає olya разів, Віра — vira, режим відповідача answerer. */
const team33 = (olya: number, vira: number, answerer: AchievementGame['answerer']) =>
  teamGame({
    answerer,
    questions: round('classic', olya + vira),
    rows: [
      ...range(olya).map((i) => row(i, { participantId: TEAM, answeredBy: 'm-olya' })),
      ...range(vira).map((i) => row(olya + i, { participantId: TEAM, answeredBy: 'm-vira' })),
    ],
  });

describe('roundAchievements (33)', () => {
  it('classic_clean: every question of a classic round (at least 5) answered right; a spare closes it; an appeal does not', () => {
    const questions = round('classic', 5);
    const rows = questions.map((x) => row(x.index));
    expect(has(fakeGame({ questions, rows }), 'classic_clean')).toBe(true);
    const missed = rows.map((r, i) => (i === 2 ? { ...r, accepted: false, points: 0 } : r));
    expect(has(fakeGame({ questions, rows: missed }), 'classic_clean')).toBe(false);
    expect(has(fakeGame({ questions: questions.slice(0, 4), rows: rows.slice(0, 4) }), 'classic_clean')).toBe(false);
    const appealed = fakeGame({ questions, rows: missed, appeals: [{ participantId: P, questionIndex: 2, outcome: 'yes', yes: 3, no: 0 }] });
    expect(has(appealed, 'classic_clean')).toBe(false);
    const spare = rows.map((r, i) => (i === 2 ? { ...r, spareId: 'sp1' } : r));
    expect(has(fakeGame({ questions, rows: spare }), 'classic_clean')).toBe(true);
    // Інший раунд не допомагає: класика з 3 і ще класика з 3.
    const split = [...round('classic', 3, 0), ...round('classic', 3, 1, 3)];
    expect(has(fakeGame({ questions: split, rows: split.map((x) => row(x.index)) }), 'classic_clean')).toBe(false);
  });

  it('classic_clean goes to the whole team', () => {
    const questions = round('classic', 5);
    const game = teamGame({ questions, rows: questions.map((x, i) => row(x.index, { participantId: TEAM, answeredBy: i % 2 === 0 ? 'm-olya' : 'm-vira' })) });
    expect(has(game, 'classic_clean', OLYA_IN_TEAM)).toBe(true);
    expect(has(game, 'classic_clean', VIRA_IN_TEAM)).toBe(true);
  });

  it('cold_bets: a bet placed and won on every question (at least 3)', () => {
    const questions = round('bets', 3);
    const bets = (wagers: number[]) => fakeGame({ questions, rows: questions.map((x, i) => row(x.index, { wager: wagers[i]! })) });
    expect(has(bets([100, 200, 50]), 'cold_bets')).toBe(true);
    expect(has(bets([100, 0, 50]), 'cold_bets')).toBe(false);
    const two = round('bets', 2);
    expect(has(fakeGame({ questions: two, rows: two.map((x) => row(x.index, { wager: 100 })) }), 'cold_bets')).toBe(false);
    const lost = fakeGame({ questions, rows: questions.map((x, i) => row(x.index, { wager: 100, accepted: i !== 1 })) });
    expect(has(lost, 'cold_bets')).toBe(false);
    // Опитування в «Ставках» без балів і ставки не ламає умову, але й не рахується до трьох.
    const withPoll = [...questions, q(3, { roundType: 'bets', scored: false, question: withId(single, 'poll3') })];
    expect(has(fakeGame({ questions: withPoll, rows: questions.map((x) => row(x.index, { wager: 100 })) }), 'cold_bets')).toBe(true);
    const twoAndPoll = [...round('bets', 2), q(2, { roundType: 'bets', scored: false, question: withId(single, 'poll2') })];
    expect(has(fakeGame({ questions: twoAndPoll, rows: [row(0, { wager: 100 }), row(1, { wager: 100 })] }), 'cold_bets')).toBe(false);
  });

  it('sold: the auction lot bought and answered right', () => {
    const questions = round('auction', 1);
    expect(has(fakeGame({ questions, rows: [row(0, { wager: 300 })] }), 'sold')).toBe(true);
    expect(has(fakeGame({ questions, rows: [row(0, { wager: null })] }), 'sold')).toBe(false);
    expect(has(fakeGame({ questions, rows: [row(0, { wager: 300, accepted: false, points: -300 })] }), 'sold')).toBe(false);
  });

  /** Запитання «Правди про гравця»: автор author, учасник рушія actor. */
  const truth = (index: number, author: string, actor: string): AchievementQuestion =>
    q(index, { roundType: 'truth', ref: { roundIndex: 0, questionId: `t${index}`, truth: { question: single, author, authorName: 'Х', actor } } });

  it('mind_reader: the author of every fact of others guessed (at least 3); your own fact does not count', () => {
    const three = [truth(0, PETRO, PETRO), truth(1, 'p-ira', 'p-ira'), truth(2, 'p-marko', 'p-marko')];
    expect(has(fakeGame({ questions: three, rows: three.map((x) => row(x.index)) }), 'mind_reader')).toBe(true);
    const withOwn = [...three, truth(3, P, P)];
    expect(has(fakeGame({ questions: withOwn, rows: three.map((x) => row(x.index)) }), 'mind_reader')).toBe(true);
    expect(has(fakeGame({ questions: three.slice(0, 2), rows: three.slice(0, 2).map((x) => row(x.index)) }), 'mind_reader')).toBe(false);
    const missed = three.map((x, i) => row(x.index, { accepted: i !== 0 }));
    expect(has(fakeGame({ questions: three, rows: missed }), 'mind_reader')).toBe(false);
  });

  it('dark_horse: nobody of at least 3 guessed your fact; in a team game it goes to the author person', () => {
    const guess = (participantId: string, accepted = false): AchievementRow => row(0, { participantId, accepted, points: accepted ? 100 : 0 });
    const others = [guess(PETRO), guess('p-ira'), guess('p-marko')];
    expect(has(fakeGame({ questions: [truth(0, P, P)], rows: others }), 'dark_horse')).toBe(true);
    expect(has(fakeGame({ questions: [truth(0, P, P)], rows: [guess(PETRO), guess('p-ira', true), guess('p-marko')] }), 'dark_horse')).toBe(false);
    expect(has(fakeGame({ questions: [truth(0, P, P)], rows: others.slice(0, 2) }), 'dark_horse')).toBe(false);
    const team = teamGame({ questions: [truth(0, 'm-vira', TEAM)], rows: [guess('team-b'), guess('team-c'), guess('team-d')] });
    expect(has(team, 'dark_horse', VIRA_IN_TEAM)).toBe(true);
    expect(has(team, 'dark_horse', OLYA_IN_TEAM)).toBe(false);
  });

  it('code_breaker: a quest bonus bigger than after every question; an undone bonus does not count, a redone one does', () => {
    const questRounds = [{ roundIndex: 1, questions: 5, bonusPoints: 300 }];
    expect(questPoints(300, 5, 5)).toBe(50);
    expect(has(fakeGame({ questRounds, adjustments: [adjustment({})] }), 'code_breaker')).toBe(true);
    expect(has(fakeGame({ questRounds, adjustments: [adjustment({ points: 50 })] }), 'code_breaker')).toBe(false);
    const undo = adjustment({ seq: 2, source: 'undo', points: -250, undoesSeq: 1 });
    expect(has(fakeGame({ questRounds, adjustments: [adjustment({}), undo] }), 'code_breaker')).toBe(false);
    const redo = adjustment({ seq: 3, source: 'undo', points: 250, undoesSeq: 2 });
    expect(has(fakeGame({ questRounds, adjustments: [adjustment({}), undo, redo] }), 'code_breaker')).toBe(true);
    expect(has(fakeGame({ questRounds: [{ roundIndex: 1, questions: 5, bonusPoints: null }], adjustments: [adjustment({})] }), 'code_breaker')).toBe(false);
    expect(has(fakeGame({ questRounds, adjustments: [adjustment({ participantId: PETRO })] }), 'code_breaker')).toBe(false);
    const team = teamGame({ questRounds, adjustments: [adjustment({ participantId: TEAM })] });
    expect(has(team, 'code_breaker', OLYA_IN_TEAM)).toBe(true);
    expect(has(team, 'code_breaker', VIRA_IN_TEAM)).toBe(true);
  });

  it('cancelledSeqs: an undo cancels, undoing the undo brings it back, a third undo cancels again', () => {
    const base = adjustment({ source: 'host' });
    const undo = (seq: number, target: number) => adjustment({ seq, source: 'undo', undoesSeq: target });
    expect([...cancelledSeqs([base])]).toEqual([]);
    expect([...cancelledSeqs([base, undo(2, 1)])]).toEqual([1]);
    expect([...cancelledSeqs([base, undo(2, 1), undo(3, 2)])]).toEqual([]);
    expect([...cancelledSeqs([undo(4, 1), base, undo(2, 1), undo(3, 2)])]).toEqual([1]);
  });

  it('buffet: answers in rounds of 5 different types; a penalty is not an answer', () => {
    const types: RoundType[] = ['classic', 'blitz', 'board', 'final', 'bets'];
    const questions = types.map((roundType, i) => q(i, { roundType, roundIndex: i }));
    expect(has(fakeGame({ questions, rows: questions.map((x) => row(x.index, { accepted: false, points: 0 })) }), 'buffet')).toBe(true);
    expect(has(fakeGame({ questions, rows: questions.slice(0, 4).map((x) => row(x.index)) }), 'buffet')).toBe(false);
    const penalty = [...questions.slice(0, 4).map((x) => row(x.index)), row(4, { attempt: PENALTY_ATTEMPT, accepted: false, points: -100 })];
    expect(has(fakeGame({ questions, rows: penalty }), 'buffet')).toBe(false);
  });

  it('team_soul: the most right answers of the team people (at least 5, strictly more)', () => {
    const questions = round('classic', 12);
    const team = (olya: number, vira: number, answerer: AchievementGame['answerer'] = 'chosen') =>
      teamGame({
        answerer,
        questions,
        rows: [
          ...range(olya).map((i) => row(i, { participantId: TEAM, answeredBy: 'm-olya' })),
          ...range(vira).map((i) => row(olya + i, { participantId: TEAM, answeredBy: 'm-vira' })),
        ],
      });
    expect(has(team(6, 4), 'team_soul', OLYA_IN_TEAM)).toBe(true);
    expect(has(team(6, 4), 'team_soul', VIRA_IN_TEAM)).toBe(false);
    expect(has(team(5, 5), 'team_soul', OLYA_IN_TEAM)).toBe(false);
    expect(has(team(5, 5), 'team_soul', VIRA_IN_TEAM)).toBe(false);
    expect(has(team(4, 0), 'team_soul', OLYA_IN_TEAM)).toBe(false);
    expect(has(fakeGame({ questions, rows: range(8).map((i) => row(i)) }), 'team_soul')).toBe(false);
    expect(has(team(6, 4, 'rotate'), 'team_soul', OLYA_IN_TEAM)).toBe(true);
  });

  it('team_soul: not in the captain mode (the captain answers everything), and at least two people of the team must hit', () => {
    expect(has(team33(6, 4, 'captain'), 'team_soul', OLYA_IN_TEAM)).toBe(false);
    expect(has(team33(6, 4, null), 'team_soul', OLYA_IN_TEAM)).toBe(false);
    expect(has(team33(6, 0, 'chosen'), 'team_soul', OLYA_IN_TEAM)).toBe(false);
    expect(has(team33(6, 1, 'chosen'), 'team_soul', OLYA_IN_TEAM)).toBe(true);
  });

  it('holiday: not for a game where no question was played', () => {
    expect(has(fakeGame({ startedAt: new Date('2026-12-31T20:00:00Z'), questions: [], questionsPlayed: 0 }), 'holiday')).toBe(false);
  });

  it('holiday: started on 31 December or 1 January in Kyiv', () => {
    expect(has(fakeGame({ startedAt: new Date('2026-12-31T20:00:00Z') }), 'holiday')).toBe(true);
    expect(has(fakeGame({ startedAt: new Date('2026-12-31T22:30:00Z') }), 'holiday')).toBe(true);
    expect(has(fakeGame({ startedAt: new Date('2027-01-01T22:30:00Z') }), 'holiday')).toBe(false);
    expect(has(fakeGame({ startedAt: new Date('2026-12-30T12:00:00Z') }), 'holiday')).toBe(false);
  });

  it('an unfinished game gives nothing; gameAchievements includes the round ones', () => {
    const questions = round('classic', 5);
    const rows = questions.map((x) => row(x.index));
    expect([...roundAchievements(fakeGame({ questions, rows, status: 'running' }), SOLO)]).toEqual([]);
    expect(gameAchievements(fakeGame({ questions, rows, startedAt: new Date('2026-12-31T20:00:00Z') }), SOLO)).toEqual(expect.arrayContaining(['classic_clean', 'holiday']));
  });
});
