import { describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { clues, numeric, pin, single, slider, survey, withId } from '@quiz/engine/testing';
import type { AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { PENALTY_ATTEMPT } from './db/schema';
import { gameAchievements, kyivHour, type AchievementWho } from './game-achievements';

const P = 'p-olya';
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

/** Завершена соло-гра двох гравців (Оля перша); старт об 11:00 і фініш о 12:00 за Києвом. */
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
      { participantId: 'p-petro', userId: null, members: [], rank: 2, score: 100 },
    ],
    rows: [],
    adjustments: [],
    ...patch,
    questions,
  };
}

const earned = (game: AchievementGame, who: AchievementWho = SOLO) => gameAchievements(game, who);

describe('kyivHour', () => {
  it('reads the hour in Kyiv, winter and summer time', () => {
    expect(kyivHour(new Date('2026-10-29T01:30:00Z'))).toBe(3);
    expect(kyivHour(new Date('2026-07-01T03:30:00Z'))).toBe(6);
    expect(kyivHour(new Date('2026-01-01T22:10:00Z'))).toBe(0);
  });
});

describe('gameAchievements: speed', () => {
  it('fast_answer: an accepted answer under 2 s with a real time limit', () => {
    expect(earned(fakeGame({ rows: [row(0, { timeMs: 1999 })] }))).toContain('fast_answer');
    expect(earned(fakeGame({ rows: [row(0, { timeMs: 2000 })] }))).not.toContain('fast_answer');
    expect(earned(fakeGame({ rows: [row(0, { timeMs: 1500, accepted: false })] }))).not.toContain('fast_answer');
    expect(earned(fakeGame({ questions: [q(0, { limitMs: null })], rows: [row(0, { timeMs: 1500 })] }))).not.toContain('fast_answer');
    expect(earned(fakeGame({ rows: [row(0, { timeMs: 0 })] }))).not.toContain('fast_answer');
  });

  it('fast_10: ten different questions under 3 s; two blitz attempts on one question count once', () => {
    const questions = range(10).map((i) => q(i));
    expect(earned(fakeGame({ questions, rows: range(10).map((i) => row(i, { timeMs: 2999 })) }))).toContain('fast_10');
    expect(earned(fakeGame({ questions, rows: range(9).map((i) => row(i, { timeMs: 2999 })) }))).not.toContain('fast_10');
    const twice = [...range(9).map((i) => row(i, { timeMs: 2999 })), row(8, { attempt: 1, timeMs: 2500 })];
    expect(earned(fakeGame({ questions, rows: twice }))).not.toContain('fast_10');
    expect(earned(fakeGame({ questions, rows: range(10).map((i) => row(i, { timeMs: 3000 })) }))).not.toContain('fast_10');
  });

  it('last_second: accepted with at most 1 s left and within the limit', () => {
    expect(earned(fakeGame({ rows: [row(0, { timeMs: 29_000 })] }))).toContain('last_second');
    expect(earned(fakeGame({ rows: [row(0, { timeMs: 28_999 })] }))).not.toContain('last_second');
    expect(earned(fakeGame({ rows: [row(0, { timeMs: 30_001 })] }))).not.toContain('last_second');
    expect(earned(fakeGame({ questions: [q(0, { limitMs: null })], rows: [row(0, { timeMs: 29_500 })] }))).not.toContain('last_second');
  });
});

describe('gameAchievements: sniper', () => {
  const ten = range(10).map((i) => q(i));

  it('solo: at least 90 % of at least 10 own questions', () => {
    expect(earned(fakeGame({ questions: ten, rows: range(10).map((i) => row(i, { accepted: i !== 0 })) }))).toContain('sniper');
    expect(earned(fakeGame({ questions: ten, rows: range(10).map((i) => row(i, { accepted: i > 1 })) }))).not.toContain('sniper');
    const nine = range(9).map((i) => q(i));
    expect(earned(fakeGame({ questions: nine, rows: range(9).map((i) => row(i)) }))).not.toContain('sniper');
  });

  it('solo silence on classic questions is a miss', () => {
    expect(earned(fakeGame({ questions: ten, rows: range(8).map((i) => row(i)) }))).not.toContain('sniper');
  });

  it('silence with «Ризик» counts as an own question even where silence alone would not', () => {
    const questions = [...range(9).map((i) => q(i)), q(9, { cell: { chooserId: P, mark: 1, blitz: false } })];
    const rows = range(9).map((i) => row(i));
    expect(earned(fakeGame({ questions, rows }))).not.toContain('sniper');
    const risk = row(9, { attempt: PENALTY_ATTEMPT, accepted: false, points: -100, buff: 'risk' });
    expect(earned(fakeGame({ questions, rows: [...rows, risk] }))).toContain('sniper');
  });

  it('a team member counts only the team rows she answered', () => {
    const game = fakeGame({
      teams: true,
      questions: ten,
      players: [
        { participantId: 'team-a', userId: null, members: [{ participantId: 'm-olya', userId: 'u-olya' }, { participantId: 'm-vira', userId: 'u-vira' }], rank: 1, score: 900 },
        { participantId: 'team-b', userId: null, members: [], rank: 2, score: 100 },
      ],
      rows: range(10).map((i) => row(i, { participantId: 'team-a', answeredBy: 'm-olya', accepted: i !== 3 })),
    });
    expect(earned(game, { participantId: 'team-a', personId: 'm-olya' })).toContain('sniper');
    expect(earned(game, { participantId: 'team-a', personId: 'm-vira' })).not.toContain('sniper');
  });
});

describe('gameAchievements: accuracy', () => {
  it('eagle_eye: a pin with full price on the main question', () => {
    const questions = [q(0, { question: pin })];
    expect(earned(fakeGame({ questions, rows: [row(0, { payload: { type: 'pin', x: 0.5, y: 0.5 } })] }))).toContain('eagle_eye');
    expect(earned(fakeGame({ questions, rows: [row(0, { payload: { type: 'pin', x: 0.59, y: 0.5 } })] }))).not.toContain('eagle_eye');
    expect(earned(fakeGame({ questions, rows: [row(0, { payload: { type: 'pin', x: 0.5, y: 0.5 }, spareId: 'sp1' })] }))).not.toContain('eagle_eye');
  });

  it('jeweler: a slider or a number exactly right', () => {
    expect(earned(fakeGame({ questions: [q(0, { question: slider })], rows: [row(0, { payload: { type: 'slider', value: 50 } })] }))).toContain('jeweler');
    expect(earned(fakeGame({ questions: [q(0, { question: slider })], rows: [row(0, { payload: { type: 'slider', value: 51 } })] }))).not.toContain('jeweler');
    expect(earned(fakeGame({ questions: [q(0, { question: numeric })], rows: [row(0, { payload: { type: 'numeric', value: 2061 } })] }))).toContain('jeweler');
    expect(earned(fakeGame({ questions: [q(0, { question: numeric })], rows: [row(0, { payload: { type: 'numeric', value: 2070 } })] }))).not.toContain('jeweler');
  });

  it('clairvoyant: «Хто я?» on the first clue; old rows by the timer only', () => {
    const answer = { type: 'clues' as const, value: 'Шевченко' };
    const timer = [q(0, { question: clues })];
    expect(earned(fakeGame({ questions: timer, rows: [row(0, { payload: answer, clue: 1 })] }))).toContain('clairvoyant');
    expect(earned(fakeGame({ questions: timer, rows: [row(0, { payload: answer, clue: 2 })] }))).not.toContain('clairvoyant');
    expect(earned(fakeGame({ questions: timer, rows: [row(0, { payload: answer, timeMs: 4000 })] }))).toContain('clairvoyant');
    expect(earned(fakeGame({ questions: timer, rows: [row(0, { payload: answer, timeMs: 6000 })] }))).not.toContain('clairvoyant');
    const self = [q(0, { question: { ...clues, cluePace: 'self' } as Question })];
    expect(earned(fakeGame({ questions: self, rows: [row(0, { payload: answer, timeMs: 4000 })] }))).not.toContain('clairvoyant');
  });

  it('survey_top: hits the most popular row, of the cloud board when there is one', () => {
    const questions = [q(0, { question: survey })];
    const hit = (rows: (string | null)[]) => ({ type: 'survey' as const, values: rows.map(() => 'х'), rows });
    expect(earned(fakeGame({ questions, rows: [row(0, { payload: hit(['sb', 'sa']) })] }))).toContain('survey_top');
    expect(earned(fakeGame({ questions, rows: [row(0, { payload: hit(['sb', null]) })] }))).not.toContain('survey_top');
    const cloud = [q(0, { question: survey, ref: { roundIndex: 0, questionId: survey.id, surveyRows: [
      { id: 'w1', text: 'Дніпро', popularity: 20, accepted: [] },
      { id: 'w2', text: 'Буковина', popularity: 40, accepted: [] },
    ] } })];
    expect(earned(fakeGame({ questions: cloud, rows: [row(0, { payload: hit(['w2']) })] }))).toContain('survey_top');
    expect(earned(fakeGame({ questions: cloud, rows: [row(0, { payload: hit(['sa']) })] }))).not.toContain('survey_top');
  });

  it('lone_genius: the only right answer among at least four', () => {
    const players = ['p-a', 'p-b', 'p-c'];
    const others = (accepted: boolean) => players.map((id) => row(0, { participantId: id, accepted }));
    expect(earned(fakeGame({ rows: [row(0), ...others(false)] }))).toContain('lone_genius');
    expect(earned(fakeGame({ rows: [row(0), ...others(false).slice(1)] }))).not.toContain('lone_genius');
    expect(earned(fakeGame({ rows: [row(0), ...others(false).slice(1), row(0, { participantId: 'p-a' })] }))).not.toContain('lone_genius');
    const cell = [q(0, { cell: { chooserId: P, mark: 1, blitz: false } })];
    expect(earned(fakeGame({ questions: cell, rows: [row(0), ...others(false)] }))).not.toContain('lone_genius');
  });
});

describe('gameAchievements: outcome', () => {
  const teamGame = (patch: Partial<AchievementGame> = {}) =>
    fakeGame({
      teams: true,
      players: [
        { participantId: 'team-a', userId: null, members: [{ participantId: 'm-olya', userId: 'u-olya' }, { participantId: 'm-vira', userId: 'u-vira' }], rank: 1, score: 900 },
        { participantId: 'team-b', userId: null, members: [{ participantId: 'm-petro', userId: 'u-petro' }], rank: 2, score: 100 },
      ],
      ...patch,
    });

  it('team_win: every member of the winning team; a solo win is not a team win', () => {
    expect(earned(teamGame(), { participantId: 'team-a', personId: 'm-vira' })).toContain('team_win');
    expect(earned(teamGame(), { participantId: 'team-a', personId: 'm-olya' })).toContain('team_win');
    expect(earned(teamGame(), { participantId: 'team-b', personId: 'm-petro' })).not.toContain('team_win');
    expect(earned(fakeGame())).not.toContain('team_win');
  });

  it('an old team game without answeredBy gives answer achievements to nobody, team_win to everyone', () => {
    const game = teamGame({ rows: [row(0, { participantId: 'team-a', timeMs: 1500 })] });
    for (const personId of ['m-olya', 'm-vira']) {
      const got = earned(game, { participantId: 'team-a', personId });
      expect(got).not.toContain('fast_answer');
      expect(got).toContain('team_win');
    }
  });

  it('night_owl: finished between 0:00 and 5:00 in Kyiv', () => {
    expect(earned(fakeGame({ finishedAt: new Date('2026-10-29T01:30:00Z') }))).toContain('night_owl');
    expect(earned(fakeGame({ finishedAt: new Date('2026-10-29T03:30:00Z') }))).not.toContain('night_owl');
    expect(earned(fakeGame({ finishedAt: null }))).not.toContain('night_owl');
  });

  it('early_bird: started between 5:00 and 8:00 in Kyiv', () => {
    expect(earned(fakeGame({ startedAt: new Date('2026-07-01T03:30:00Z') }))).toContain('early_bird');
    expect(earned(fakeGame({ startedAt: new Date('2026-07-01T05:30:00Z') }))).not.toContain('early_bird');
  });

  it('marathon: at least 50 questions', () => {
    expect(earned(fakeGame({ questionsPlayed: 50 }))).toContain('marathon');
    expect(earned(fakeGame({ questionsPlayed: 49 }))).not.toContain('marathon');
  });
});

describe('gameAchievements: the game', () => {
  it('an aborted game gives nothing', () => {
    const questions = range(10).map((i) => q(i));
    const all = fakeGame({
      questions,
      questionsPlayed: 60,
      startedAt: new Date('2026-07-01T03:30:00Z'),
      finishedAt: new Date('2026-10-29T01:30:00Z'),
      rows: range(10).map((i) => row(i, { timeMs: 1500 })),
    });
    expect(earned(all).length).toBeGreaterThan(3);
    expect(earned({ ...all, status: 'aborted' })).toEqual([]);
  });

  it('keeps the catalog order', () => {
    const got = earned(fakeGame({ questionsPlayed: 50, rows: [row(0, { timeMs: 1500 })], finishedAt: new Date('2026-10-29T01:30:00Z') }));
    expect(got).toEqual(['fast_answer', 'night_owl', 'marathon']);
  });
});
