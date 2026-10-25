import { describe, expect, it } from 'vitest';
import { defaultTeams, hallPoints, type Answer, type Quiz, type Round } from '@quiz/shared';
import { adjustScore } from './adjust';
import { pickCell } from './board';
import { pickBluff, writeLie } from './bluff';
import { activeDebuff, buyDebuff } from './debuffs';
import { placeWager } from './final';
import { lock, next, override, recordOf, type GameState, type Result } from './game';
import { contestantOf, pickContestant, useLifeline } from './ladder';
import { pickDoor, survivalAlive } from './survival';
import { actAnswer, actorOf, type TeamAct } from './team-act';
import { decideWipeout, decisionOpen, wipeoutIn } from './wipeout';
import {
  LADDER_RIGHT,
  bluff,
  boardRound,
  classicRound,
  finalRound,
  ladderQuestions,
  ladderRound,
  makeRoundsQuiz,
  single,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  wipeoutLadder,
  wipeoutRound,
  withId,
  withPoints,
} from './testing/fixtures';
import { acceptAll, must } from './testing/helpers';
import { teamGame } from './testing/teams';

const rng = () => 0;
const T0 = 1_000_000;
/** m1 Оля, m2 Петро — t1 (капітан Оля); m3 Віра, m4 Ігор — t2 (капітан Віра). */
const LAYOUT = [
  ['Оля', 'Петро'],
  ['Віра', 'Ігор'],
];
const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };

const quizOf = (rounds: Round[], count = 2, settings = {}): Quiz => makeRoundsQuiz(rounds, { teams: defaultTeams(count), ...settings });
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const current = (s: GameState) => s.plays[s.questionIndex];

/** Дія людини за команду: actorOf(act), далі — функція рушія з id команди. */
function as(s: GameState, memberId: string, act: TeamAct, run: (id: string) => Result): Result {
  const actor = actorOf(s, memberId, act);
  return actor.ok ? run(actor.id) : actor;
}

/** «Далі», доки не настане потрібний етап. */
function until(s: GameState, done: (s: GameState) => boolean, now: number): GameState {
  let state = must(next(s, now, rng));
  while (!done(state)) state = must(next(state, now, rng));
  return state;
}

describe('teams as players: the board', () => {
  const q = (id: string, points: number) => withPoints(withId(single, id), points);
  const quiz = quizOf([
    boardRound('g1', [
      { title: 'Міста', cells: [q('c11', 100), { question: q('c12', 200), answerMode: 'voice' }] },
      { title: 'Річки', cells: [q('c21', 100), q('c22', 200)] },
    ]),
  ]);

  it('turns go round the teams; the captain picks and answers; a voice cell is graded for the team', () => {
    let s = must(next(teamGame(quiz, LAYOUT), T0, rng));
    expect(s.phase).toBe('board');
    expect(s.board?.circle).toEqual(['t1', 't2']);
    expect(pickCell(s, 't2', 'c11', T0, rng)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(as(s, 'm2', 'captain', (id) => pickCell(s, id, 'c11', T0, rng))).toEqual({ ok: false, error: 'not_captain' });
    s = must(as(s, 'm1', 'captain', (id) => pickCell(s, id, 'c11', T0, rng)));
    expect(current(s).board?.chooserId).toBe('t1');
    expect(actAnswer(s, 'm2', RIGHT, T0 + 1000)).toEqual({ ok: false, error: 'not_captain' });
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    // відповідь з телефона чекає «Прийняти» ведучого
    s = acceptAll(s, T0 + 1500);
    s = until(s, (st) => st.phase === 'board', T0 + 2000);
    expect(score(s, 't1')).toBe(100);
    // хід команди t2: усна клітинка, ведучий оцінює команду
    s = must(as(s, 'm3', 'captain', (id) => pickCell(s, id, 'c12', T0 + 3000, rng)));
    s = must(override(s, 't2', 'correct', T0 + 4000));
    s = must(next(s, T0 + 5000, rng));
    expect(score(s, 't2')).toBe(200);
  });
});

describe('teams as players: the final', () => {
  const quiz = quizOf([classicRound('r1', [single], { speedBonus: false }), finalRound('f', withId(single, 'f1'))], 2, { leaderboard: 'end' });

  it('one wager per team from the team score; right — plus the wager', () => {
    let s = must(next(teamGame(quiz, LAYOUT), T0, rng));
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm3', WRONG, T0 + 1000));
    s = until(s, (st) => st.phase === 'wager', T0 + 2000);
    expect(score(s, 't1')).toBe(1000);
    expect(as(s, 'm1', 'captain', (id) => placeWager(s, id, 1001, T0 + 3000, rng))).toEqual({ ok: false, error: 'wager_invalid' });
    expect(as(s, 'm2', 'captain', (id) => placeWager(s, id, 400, T0 + 3000, rng))).toEqual({ ok: false, error: 'not_captain' });
    s = must(as(s, 'm1', 'captain', (id) => placeWager(s, id, 400, T0 + 3000, rng)));
    s = must(as(s, 'm3', 'captain', (id) => placeWager(s, id, 0, T0 + 3000, rng)));
    expect(s.phase).toBe('question');
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 4000));
    s = must(actAnswer(s, 'm3', WRONG, T0 + 4000));
    s = until(s.phase === 'question' ? must(lock(s)) : s, (st) => st.phase === 'reveal', T0 + 5000);
    expect(score(s, 't1')).toBe(1400);
  });
});

describe('teams as players: wipeout', () => {
  const quiz = quizOf([wipeoutRound('rw', wipeoutLadder)]);

  it('a wrong team burns; the captain takes the bank', () => {
    let s = must(next(teamGame(quiz, LAYOUT), T0, rng));
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm3', WRONG, T0 + 1000));
    s = must(next(s, T0 + 1500, rng));
    s = must(next(s, T0 + 2000, rng));
    expect(decisionOpen(s)).toBe(true);
    expect(wipeoutIn(s)).toEqual(['t1']);
    expect(as(s, 'm2', 'captain', (id) => decideWipeout(s, id, true, T0 + 3000))).toEqual({ ok: false, error: 'not_captain' });
    s = must(as(s, 'm1', 'captain', (id) => decideWipeout(s, id, true, T0 + 3000)));
    expect(score(s, 't1')).toBe(100);
    expect(score(s, 't2')).toBe(0);
  });
});

describe('teams as players: survival', () => {
  // Три команди: після вибуття однієї раунд триває, і привид-команда відповідає «для себе».
  const quiz = quizOf([survivalRound('rs', survivalQuestions, survivalTrials, { trial: 'luck' })], 3);
  const LAYOUT3 = [...LAYOUT, ['Гліб', 'Дана']];

  it('a team on the edge picks a door by its captain; the ghost team answers for itself by its captain', () => {
    let s = must(next(teamGame(quiz, LAYOUT3), T0, rng));
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm3', WRONG, T0 + 1000));
    s = must(actAnswer(s, 'm5', RIGHT, T0 + 1000));
    s = must(next(s, T0 + 1500, rng));
    s = must(next(s, T0 + 2000, rng));
    const trial = current(s).survival?.trial;
    expect(trial?.kind).toBe('luck');
    const trap = trial?.traps.t2 ?? -1;
    expect(as(s, 'm4', 'captain', (id) => pickDoor(s, id, trap, T0 + 3000))).toEqual({ ok: false, error: 'not_captain' });
    s = must(as(s, 'm3', 'captain', (id) => pickDoor(s, id, trap, T0 + 3000)));
    expect(survivalAlive(s)).toEqual(['t1', 't3']);
    s = until(s, (st) => st.phase === 'question', T0 + 4000);
    const bool: Answer = { type: 'boolean', value: true };
    expect(actAnswer(s, 'm4', bool, T0 + 5000)).toEqual({ ok: false, error: 'not_captain' });
    s = must(actAnswer(s, 'm3', bool, T0 + 5000));
    expect(current(s).survival?.ghosts.t2).toMatchObject({ correct: true });
    expect(recordOf(s, s.questionIndex, 't2')).toBeUndefined();
  });
});

describe('teams as players: the ladder', () => {
  it('the host picks a team; the captain answers and takes lifelines; the hall is the other team', () => {
    const quiz = quizOf([ladderRound('rl')]);
    let s = teamGame(quiz, LAYOUT);
    s = must(pickContestant(s, 't2'));
    s = must(next(s, T0, rng));
    expect(contestantOf(s)).toBe('t2');
    expect(as(s, 'm4', 'captain', (id) => useLifeline(s, id, 'audience', T0 + 500, rng))).toEqual({ ok: false, error: 'not_captain' });
    s = must(as(s, 'm3', 'captain', (id) => useLifeline(s, id, 'audience', T0 + 500, rng)));
    // зал — команда t1 через капітана
    expect(actAnswer(s, 'm2', LADDER_RIGHT[0], T0 + 1000)).toEqual({ ok: false, error: 'not_captain' });
    s = must(actAnswer(s, 'm1', LADDER_RIGHT[0], T0 + 1000));
    expect(current(s).ladder?.lifelines.audience).toMatchObject({ closed: true, ballots: { t1: LADDER_RIGHT[0] } });
    s = must(actAnswer(s, 'm3', LADDER_RIGHT[0], T0 + 2000));
    expect(s.phase).toBe('locked');
    s = must(next(s, T0 + 3000, rng));
    expect(score(s, 't1')).toBe(hallPoints(100));
  });

  it('«lowest score» picks the team with the lower score', () => {
    const quiz = quizOf([classicRound('r1', [single]), ladderRound('rl', ladderQuestions, { pick: 'lowest' })]);
    let s = must(next(teamGame(quiz, LAYOUT), T0, rng));
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm3', WRONG, T0 + 1000));
    s = until(s, (st) => st.roundIndex === 1 && st.phase === 'intro', T0 + 2000);
    s = must(next(s, T0 + 3000, rng));
    expect(contestantOf(s)).toBe('t2');
  });
});

describe('teams as players: bluff', () => {
  const quiz = quizOf([classicRound('r1', [bluff])]);

  it('one lie per team by the captain; the team cannot pick its own lie', () => {
    let s = must(next(teamGame(quiz, LAYOUT), T0, rng));
    s = must(as(s, 'm1', 'captain', (id) => writeLie(s, id, 'Рим', T0 + 1000)));
    expect(as(s, 'm2', 'captain', (id) => writeLie(s, id, 'Відень', T0 + 1100))).toEqual({ ok: false, error: 'not_captain' });
    expect(as(s, 'm1', 'captain', (id) => writeLie(s, id, 'Відень', T0 + 1100))).toEqual({ ok: false, error: 'already_answered' });
    s = must(as(s, 'm3', 'captain', (id) => writeLie(s, id, 'Прага', T0 + 1200)));
    const options = current(s).bluff?.options ?? [];
    expect(current(s).bluff?.stage).toBe('choice');
    const own = options.find((o) => o.authors.includes('t1'));
    const truth = options.find((o) => o.kind === 'truth');
    expect(as(s, 'm1', 'captain', (id) => pickBluff(s, id, own?.id ?? '', T0 + 2000))).toEqual({ ok: false, error: 'bluff_own' });
    s = must(as(s, 'm1', 'captain', (id) => pickBluff(s, id, truth?.id ?? '', T0 + 2000)));
    expect(current(s).bluff?.picks.t1).toMatchObject({ optionId: truth?.id });
  });
});

describe('teams as players: debuffs', () => {
  it('a team buys a debuff from the team points for another team; it fires in the next question', () => {
    const quiz = quizOf([classicRound('r1', [single, withId(single, 'q2')])], 2, { leaderboard: 'each' });
    let s = must(adjustScore(teamGame(quiz, LAYOUT), 't1', 500, T0));
    s = must(as(s, 'm1', 'captain', (id) => buyDebuff(s, id, 't2', 'fog', T0)));
    expect(score(s, 't1')).toBe(300);
    s = must(next(s, T0 + 1000, rng));
    expect(activeDebuff(s, 't2')?.kind).toBe('fog');
  });
});
