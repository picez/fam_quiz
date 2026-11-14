import { single, withId } from '@quiz/engine/testing';
import type { AchievementGame, AchievementQuestion, AchievementRow } from '../achievement-games';
import type { AchievementWho } from '../game-achievements';

/** Фікстури ігрових умов досягнень (12j): Оля — P, Петро — PETRO. */
export const P = 'p-olya';
export const PETRO = 'p-petro';
export const SOLO: AchievementWho = { participantId: P, personId: null };

export const range = (n: number) => [...Array(n).keys()];

/** Зігране запитання: типово класичний раунд, single, 30 с, з балами. */
export const q = (index: number, patch: Partial<AchievementQuestion> = {}): AchievementQuestion => {
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
export const row = (questionIndex: number, patch: Partial<AchievementRow> = {}): AchievementRow => ({
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
  awayMs: null,
  wager: null,
  ...patch,
});

/** Завершена соло-гра двох гравців (Оля перша, Петро другий). */
export function fakeGame(patch: Partial<AchievementGame> = {}): AchievementGame {
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
    appeals: [],
    answerer: null,
    ...patch,
    questions,
  };
}

/** Командна гра: «Буковина» (Оля m-olya, Віра m-vira) і «Дніпро». */
export const TEAM = 'team-a';
export const OLYA_IN_TEAM: AchievementWho = { participantId: TEAM, personId: 'm-olya' };
export const VIRA_IN_TEAM: AchievementWho = { participantId: TEAM, personId: 'm-vira' };
export function teamGame(patch: Partial<AchievementGame> = {}): AchievementGame {
  return fakeGame({
    teams: true,
    players: [
      { participantId: TEAM, userId: null, members: [{ participantId: 'm-olya', userId: 'u-olya' }, { participantId: 'm-vira', userId: 'u-vira' }], rank: 1, score: 500 },
      { participantId: 'team-b', userId: null, members: [], rank: 2, score: 100 },
    ],
    ...patch,
  });
}
