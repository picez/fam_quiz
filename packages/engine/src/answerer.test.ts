import { describe, expect, it } from 'vitest';
import type { Answer, Phase, Quiz } from '@quiz/shared';
import { activePick, answererOf, nextAnswerer, pickAnswerer, queueNext, shownAnswerer, startAnswerers, upcomingPick } from './answerer';
import { pickCell } from './board';
import { chooserOf } from './board-turns';
import { lock, next, pause, start, type GameState } from './game';
import { pickContestant } from './ladder';
import { trialOpen } from './survival';
import { actAnswer, actorOf } from './team-act';
import { dropMember, memberConnected } from './teams';
import { decideWipeout, decisionOpen } from './wipeout';
import {
  blitzRound,
  boardRound,
  classicRound,
  cloud,
  ladderRound,
  makeRoundsQuiz,
  poll,
  single,
  sortQ,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  wipeoutLadder,
  wipeoutRound,
  withId,
} from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame, teamLobby, teamQuiz } from './testing/teams';

const T0 = 1_000_000;
const rng = () => 0;
/** m1 Оля, m2 Петро, m3 Іра — t1 (капітан Оля); m4 Марко, m5 Ната — t2 (капітан Марко). */
const LAYOUT = [
  ['Оля', 'Петро', 'Іра'],
  ['Марко', 'Ната'],
];
/** Раунд 1 — q1, q2, q3; раунд 2 — q4. */
const ROUNDS = [classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')]), classicRound('r2', [withId(single, 'q4')])];

const game = (quiz: Quiz, layout = LAYOUT): GameState => teamGame(quiz, layout);
const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };
/** Етап intro першого раунду, режим «вибирає капітан». */
const intro = game(teamQuiz(ROUNDS, 2, 'chosen'));

/** Крок рушія: на запитанні — «Закрити», інакше — «Далі» (openQuestion сам викликає startAnswerers). */
const step = (s: GameState): GameState => must(s.phase === 'question' ? lock(s) : next(s, T0, rng));

/** Кроки, доки етап не стане phase. */
function until(s: GameState, phase: Phase): GameState {
  let state = step(s);
  while (state.phase !== phase) state = step(state);
  return state;
}

/** До наступного відкритого запитання. */
const toNextQuestion = (s: GameState): GameState => until(s, 'question');

const offline = (s: GameState, id: string): GameState => must(memberConnected(s, id, false, T0));
const online = (s: GameState, id: string): GameState => must(memberConnected(s, id, true, T0));
/** Вибір, записаний в обхід pickAnswerer (той перед бліцом і опитуванням відмовляє): як старий стан чи поле з бліц-клітинкою. */
const withPick = (s: GameState, team: string, memberId: string, scope: 'question' | 'round'): GameState => ({
  ...s,
  teams: { ...s.teams!, answerers: { ...s.teams!.answerers, [team]: { memberId, scope, fromQuestion: s.plays.length, roundIndex: null } } },
});

describe('answerer: the captain picks', () => {
  it('a pick for one question: Петро answers the next question only, then the captain again', () => {
    let s = must(pickAnswerer(intro, 'm1', 'm2', 'question'));
    expect(s.teams?.answerers?.t1).toEqual({ memberId: 'm2', scope: 'question', fromQuestion: 0, roundIndex: null });
    expect(nextAnswerer(s, 't1')).toBe('m2');
    s = startAnswerers(must(next(s, T0, rng)));
    expect(s.teams?.answerers?.t1.roundIndex).toBe(0);
    expect(answererOf(s, 't1')).toBe('m2');
    expect(answererOf(s, 't2')).toBe('m4');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m1');
  });

  it('a pick for the round: Іра answers q1, q2 and q3, the captain answers q4; nothing waits on round_end', () => {
    let s = must(pickAnswerer(intro, 'm1', 'm3', 'round'));
    expect(upcomingPick(s, 't1')).toEqual({ memberId: 'm3', scope: 'round', fromQuestion: 0, roundIndex: null });
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m3');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m3');
    expect(upcomingPick(must(lock(s)), 't1')?.memberId).toBe('m3');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m3');
    s = until(s, 'round_end');
    expect(upcomingPick(s, 't1')).toBeNull();
    expect(nextAnswerer(s, 't1')).toBe('m1');
    s = toNextQuestion(s);
    expect(s.roundIndex).toBe(1);
    expect(answererOf(s, 't1')).toBe('m1');
  });

  it('a pick for the round made on the reveal of the last question of a round works for the next round', () => {
    let s = toNextQuestion(toNextQuestion(toNextQuestion(intro)));
    s = until(s, 'reveal');
    s = must(pickAnswerer(s, 'm1', 'm2', 'round'));
    expect(s.teams?.answerers?.t1).toEqual({ memberId: 'm2', scope: 'round', fromQuestion: 3, roundIndex: null });
    s = until(s, 'round_end');
    expect(upcomingPick(s, 't1')?.memberId).toBe('m2');
    s = toNextQuestion(s);
    expect(s.roundIndex).toBe(1);
    expect(s.teams?.answerers?.t1.roundIndex).toBe(1);
    expect(answererOf(s, 't1')).toBe('m2');
  });

  it('a new pick replaces the old one, the round pick too', () => {
    let s = must(pickAnswerer(intro, 'm1', 'm2', 'round'));
    s = must(pickAnswerer(s, 'm1', 'm3', 'question'));
    expect(s.teams?.answerers?.t1).toEqual({ memberId: 'm3', scope: 'question', fromQuestion: 0, roundIndex: null });
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m3');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m1');
  });

  it('null takes the pick back', () => {
    let s = must(pickAnswerer(intro, 'm1', 'm2', 'question'));
    s = must(pickAnswerer(s, 'm1', null, 'question'));
    expect(s.teams?.answerers?.t1).toBeUndefined();
    expect(nextAnswerer(s, 't1')).toBe('m1');
    expect(answererOf(toNextQuestion(s), 't1')).toBe('m1');
  });

  it('an offline pick falls back to the captain until they are back', () => {
    let s = toNextQuestion(must(pickAnswerer(intro, 'm1', 'm2', 'question')));
    s = offline(s, 'm2');
    expect(answererOf(s, 't1')).toBe('m1');
    s = online(s, 'm2');
    expect(answererOf(s, 't1')).toBe('m2');
  });

  it('the picked one answers with the captain offline; both offline — the next captain', () => {
    let s = toNextQuestion(must(pickAnswerer(intro, 'm1', 'm2', 'question')));
    s = offline(s, 'm1');
    expect(answererOf(s, 't1')).toBe('m2');
    s = offline(s, 'm2');
    expect(answererOf(s, 't1')).toBe('m3');
  });

  it('errors: captain mode, solo, a question, the lobby — wrong_phase; not the captain — not_captain; not on the team — not_found', () => {
    expect(pickAnswerer(game(teamQuiz(ROUNDS)), 'm1', 'm2', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    const solo = must(start(lobbyWith(makeRoundsQuiz(ROUNDS), 'Оля', 'Петро')));
    expect(pickAnswerer(solo, 'p1', 'p2', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pickAnswerer(toNextQuestion(intro), 'm1', 'm2', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pickAnswerer(teamLobby(teamQuiz(ROUNDS, 2, 'chosen'), 'Оля', 'Петро'), 'm1', 'm2', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pickAnswerer(intro, 'm2', 'm2', 'question')).toEqual({ ok: false, error: 'not_captain' });
    expect(pickAnswerer(intro, 'm1', 'm4', 'question')).toEqual({ ok: false, error: 'not_found' });
    expect(pickAnswerer(intro, 'm1', 'nobody', 'question')).toEqual({ ok: false, error: 'not_found' });
    const paused = must(pause(intro, T0));
    expect(must(pickAnswerer(paused, 'm1', 'm2', 'question')).teams?.answerers?.t1.memberId).toBe('m2');
  });

  it('every between-questions phase allows a pick', () => {
    let s = toNextQuestion(intro);
    s = must(lock(s));
    expect(s.phase).toBe('locked');
    expect(pickAnswerer(s, 'm1', 'm2', 'question').ok).toBe(true);
    s = step(s);
    expect(s.phase).toBe('reveal');
    expect(pickAnswerer(s, 'm1', 'm2', 'question').ok).toBe(true);
  });

  it('blitz and polls stay with the captain even with a pick', () => {
    const blitzy = game(teamQuiz([blitzRound('b1', [single])], 2, 'chosen'));
    expect(answererOf(toNextQuestion(withPick(blitzy, 't1', 'm2', 'question')), 't1')).toBe('m1');
    const polled = game(teamQuiz([classicRound('r1', [poll])], 2, 'chosen'));
    expect(answererOf(toNextQuestion(withPick(polled, 't1', 'm2', 'question')), 't1')).toBe('m1');
  });

  it('captain mode: answererOf is the captain whatever the state says', () => {
    let s = game(teamQuiz(ROUNDS));
    s = { ...s, teams: { ...s.teams!, answerers: { t1: { memberId: 'm2', scope: 'round', fromQuestion: 0, roundIndex: 0 } } } };
    const opened = toNextQuestion(s);
    expect(answererOf(opened, 't1')).toBe('m1');
    expect(nextAnswerer(s, 't1')).toBe('m1');
    expect(startAnswerers(opened)).toBe(opened);
  });

  it('shownAnswerer: answererOf on the question, nextAnswerer on the leaderboard', () => {
    let s = toNextQuestion(must(pickAnswerer(intro, 'm1', 'm2', 'question')));
    expect(shownAnswerer(s, 't1')).toBe('m2');
    s = until(s, 'leaderboard');
    expect(shownAnswerer(s, 't1')).toBe('m1');
    s = must(pickAnswerer(s, 'm1', 'm3', 'question'));
    expect(shownAnswerer(s, 't1')).toBe('m3');
  });
});

describe('answerer: rotate', () => {
  const rotate = game(teamQuiz(ROUNDS, 2, 'rotate'));

  it('the turn starts with the captain and goes round the team, round after round', () => {
    let s = toNextQuestion(rotate);
    const seen: [string | null, string | null][] = [[answererOf(s, 't1'), answererOf(s, 't2')]];
    s = toNextQuestion(s);
    expect(s.teams?.turns?.t1).toEqual({ questionIndex: 1, memberId: 'm2' });
    seen.push([answererOf(s, 't1'), answererOf(s, 't2')]);
    s = toNextQuestion(s);
    seen.push([answererOf(s, 't1'), answererOf(s, 't2')]);
    s = toNextQuestion(s);
    seen.push([answererOf(s, 't1'), answererOf(s, 't2')]);
    expect(seen).toEqual([
      ['m1', 'm4'],
      ['m2', 'm5'],
      ['m3', 'm4'],
      ['m1', 'm5'],
    ]);
  });

  it('the next in turn between questions is shown by nextAnswerer', () => {
    let s = toNextQuestion(rotate);
    expect(nextAnswerer(rotate, 't1')).toBe('m1');
    s = until(s, 'reveal');
    expect(nextAnswerer(s, 't1')).toBe('m2');
    expect(queueNext(s, 't1')).toBe('m2');
  });

  it('an offline teammate is skipped and the circle goes on from whoever answered', () => {
    let s = toNextQuestion(rotate);
    s = offline(s, 'm2');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m3');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m1');
  });

  it('a captain pick holds the turn: the turn goes on from where it stood', () => {
    let s = toNextQuestion(rotate);
    s = until(s, 'reveal');
    s = must(pickAnswerer(s, 'm1', 'm1', 'question'));
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m1');
    expect(activePick(s, 't1', s.questionIndex)?.memberId).toBe('m1');
    expect(s.teams?.turns?.t1).toEqual({ questionIndex: 0, memberId: 'm1' });
    expect(s.teams?.turns?.t2).toEqual({ questionIndex: 1, memberId: 'm5' });
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m2');
  });

  it('a blitz play in between does not move the turn', () => {
    let s = game(teamQuiz([classicRound('r1', [single]), blitzRound('b1', [withId(single, 'b1')]), classicRound('r3', [withId(single, 'q3')])], 2, 'rotate'));
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m1');
    s = toNextQuestion(s);
    expect(s.plays[s.questionIndex].blitz).toBeDefined();
    expect(answererOf(s, 't1')).toBe('m1');
    expect(s.teams?.turns?.t1).toEqual({ questionIndex: 0, memberId: 'm1' });
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m2');
  });

  it('on the board the turn moves only for the team that picked the cell', () => {
    const board = boardRound('g1', [
      { title: 'Міста', cells: [withId(single, 'c11'), withId(single, 'c12')] },
      { title: 'Річки', cells: [withId(single, 'c21'), withId(single, 'c22')] },
    ]);
    let s = until(game(teamQuiz([board], 2, 'rotate')), 'board');
    s = startAnswerers(must(pickCell(s, 't1', 'c11', T0, rng)));
    expect(s.teams?.turns).toEqual({ t1: { questionIndex: 0, memberId: 'm1' } });
    s = until(s, 'board');
    s = startAnswerers(must(pickCell(s, 't2', 'c12', T0, rng)));
    expect(s.teams?.turns).toEqual({ t1: { questionIndex: 0, memberId: 'm1' }, t2: { questionIndex: 1, memberId: 'm4' } });
    // друге коло починають Сині
    s = until(s, 'board');
    expect(chooserOf(s)).toBe('t2');
    s = startAnswerers(must(pickCell(s, 't2', 'c21', T0, rng)));
    expect(s.teams?.turns).toEqual({ t1: { questionIndex: 0, memberId: 'm1' }, t2: { questionIndex: 2, memberId: 'm5' } });
    s = until(s, 'board');
    s = startAnswerers(must(pickCell(s, 't1', 'c22', T0, rng)));
    expect(s.teams?.turns?.t1).toEqual({ questionIndex: 3, memberId: 'm2' });
    expect(answererOf(s, 't1')).toBe('m2');
  });

  it('the last in turn is removed: the turn passes to the one before them, so the circle goes on with the one after', () => {
    let s = toNextQuestion(toNextQuestion(rotate));
    expect(s.teams?.turns?.t1.memberId).toBe('m2');
    s = until(s, 'reveal');
    expect(queueNext(s, 't1')).toBe('m3');
    s = must(dropMember(s, 'm2'));
    // Відкрите запитання (розкриття) повертається до капітана, а не до Олі як «попередньої» в черзі.
    expect(s.teams?.turns?.t1).toEqual({ questionIndex: 0, memberId: 'm1' });
    expect(answererOf(s, 't1')).toBe('m1');
    expect(queueNext(s, 't1')).toBe('m3');
    expect(answererOf(toNextQuestion(s), 't1')).toBe('m3');
  });

  it('the rotate answerer is removed mid-question: the captain answers the open question, not the one before them', () => {
    let s = toNextQuestion(toNextQuestion(rotate));
    expect(answererOf(s, 't1')).toBe('m2');
    s = must(dropMember(s, 'm2'));
    expect(s.phase).toBe('question');
    expect(answererOf(s, 't1')).toBe('m1');
    expect(actorOf(s, 'm1', 'answer')).toEqual({ ok: true, id: 't1' });
    expect(answererOf(toNextQuestion(s), 't1')).toBe('m3');
  });

  it('removed between questions (leaderboard): the turn keeps its question, the next opening goes on', () => {
    let s = until(toNextQuestion(toNextQuestion(rotate)), 'leaderboard');
    s = must(dropMember(s, 'm2'));
    expect(s.teams?.turns?.t1).toEqual({ questionIndex: 1, memberId: 'm1' });
    expect(answererOf(toNextQuestion(s), 't1')).toBe('m3');
  });

  it('the captain is the last in turn and is removed: the turn passes to the last member in team order', () => {
    let s = toNextQuestion(rotate);
    expect(s.teams?.turns?.t1.memberId).toBe('m1');
    s = must(dropMember(until(s, 'reveal'), 'm1'));
    expect(s.teams?.turns?.t1).toEqual({ questionIndex: -1, memberId: 'm3' });
    expect(answererOf(s, 't1')).toBe('m2');
    expect(queueNext(s, 't1')).toBe('m2');
  });

  it('removing someone who is not the last in turn leaves the turn alone', () => {
    let s = until(toNextQuestion(toNextQuestion(rotate)), 'reveal');
    const turns = s.teams?.turns;
    s = must(dropMember(s, 'm3'));
    expect(s.teams?.turns).toEqual(turns);
  });
});

describe('answerer: the open question keeps its answerer', () => {
  it('a new pick, a cleared pick or a flipped scope after the opening do not change who answers that question', () => {
    let s = toNextQuestion(must(pickAnswerer(intro, 'm1', 'm2', 'round')));
    expect(s.teams?.current?.t1).toEqual({ questionIndex: 0, memberId: 'm2' });
    s = until(s, 'reveal');
    s = must(pickAnswerer(s, 'm1', 'm3', 'question'));
    expect(answererOf(s, 't1')).toBe('m2');
    expect(nextAnswerer(s, 't1')).toBe('m3');
    expect(answererOf(must(pickAnswerer(s, 'm1', null, 'question')), 't1')).toBe('m2');
    expect(answererOf(must(pickAnswerer(s, 'm1', 'm2', 'question')), 't1')).toBe('m2');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m3');
  });

  it('on a survival trial a new pick or a cleared pick leave the trial with the one who answered the record', () => {
    const quiz = teamQuiz([survivalRound('rs', survivalQuestions, survivalTrials)], 2, 'chosen');
    let s = toNextQuestion(must(pickAnswerer(game(quiz), 'm1', 'm2', 'round')));
    s = must(actAnswer(s, 'm2', WRONG, T0 + 1000));
    s = must(actAnswer(s, 'm4', RIGHT, T0 + 1000));
    while (!trialOpen(s)) s = must(next(s, T0 + 2000, rng));
    expect(answererOf(s, 't1')).toBe('m2');
    s = must(pickAnswerer(s, 'm1', 'm3', 'round'));
    expect(answererOf(s, 't1')).toBe('m2');
    s = must(pickAnswerer(s, 'm1', null, 'round'));
    expect(answererOf(s, 't1')).toBe('m2');
  });

  it('the one picked leaves the team: the open question goes back to the captain', () => {
    let s = toNextQuestion(must(pickAnswerer(intro, 'm1', 'm2', 'question')));
    s = must(dropMember(s, 'm2'));
    expect(s.teams?.current?.t1).toBeUndefined();
    expect(answererOf(s, 't1')).toBe('m1');
  });
});

describe('answerer: a pick for one question waits for a question the team answers', () => {
  it('the board: a pick of the team not choosing waits for its own cell', () => {
    const board = boardRound('g1', [
      { title: 'Міста', cells: [withId(single, 'c11'), withId(single, 'c12')] },
      { title: 'Річки', cells: [withId(single, 'c21'), withId(single, 'c22')] },
    ]);
    let s = until(game(teamQuiz([board], 2, 'chosen')), 'board');
    s = must(pickAnswerer(s, 'm4', 'm5', 'question'));
    s = must(pickCell(s, 't1', 'c11', T0, rng));
    expect(s.teams?.answerers?.t2).toEqual({ memberId: 'm5', scope: 'question', fromQuestion: 1, roundIndex: null });
    expect(s.teams?.current?.t2).toBeUndefined();
    s = until(s, 'board');
    expect(nextAnswerer(s, 't2')).toBe('m5');
    s = must(pickCell(s, 't2', 'c12', T0, rng));
    expect(answererOf(s, 't2')).toBe('m5');
    s = until(s, 'board');
    s = must(pickCell(s, 't2', 'c21', T0, rng));
    expect(answererOf(s, 't2')).toBe('m4');
  });

  it('the ladder of another team: the hall answers, so the pick works there and is used up', () => {
    let s = must(pickContestant(game(teamQuiz([ladderRound('rl'), classicRound('r2', [single])], 2, 'chosen')), 't1'));
    s = must(pickAnswerer(s, 'm4', 'm5', 'question'));
    s = toNextQuestion(s);
    expect(s.teams?.answerers?.t2).toEqual({ memberId: 'm5', scope: 'question', fromQuestion: 0, roundIndex: 0 });
    expect(s.teams?.current?.t2).toEqual({ questionIndex: 0, memberId: 'm5' });
    expect(answererOf(s, 't2')).toBe('m5');
    s = must(lock(s));
    expect(nextAnswerer(s, 't2')).toBe('m4');
  });

  it('a poll: a pick written before it (an old state) waits for the next question', () => {
    let s = withPick(game(teamQuiz([classicRound('r1', [poll, single])], 2, 'chosen')), 't1', 'm2', 'question');
    s = toNextQuestion(s);
    expect(s.teams?.answerers?.t1.fromQuestion).toBe(1);
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m2');
  });

  it('a round pick does not pin on a poll: it waits and pins on the next question with an answerer', () => {
    let s = withPick(game(teamQuiz([classicRound('r1', [poll, single])], 2, 'chosen')), 't1', 'm2', 'round');
    s = toNextQuestion(s);
    expect(s.teams?.answerers?.t1).toEqual({ memberId: 'm2', scope: 'round', fromQuestion: 1, roundIndex: null });
    s = toNextQuestion(s);
    expect(s.teams?.answerers?.t1).toEqual({ memberId: 'm2', scope: 'round', fromQuestion: 1, roundIndex: 0 });
    expect(answererOf(s, 't1')).toBe('m2');
  });

  it('a round pick written before a blitz round is not pinned to it: it holds for the next round', () => {
    const quiz = teamQuiz([blitzRound('b1', [single, withId(single, 'b2')]), classicRound('r2', [withId(single, 'q4'), withId(single, 'q5')])], 2, 'chosen');
    let s = toNextQuestion(withPick(game(quiz), 't1', 'm2', 'round'));
    expect(answererOf(s, 't1')).toBe('m1');
    s = toNextQuestion(toNextQuestion(s));
    expect(s.plays[s.questionIndex].question.id).toBe('q4');
    expect(s.teams?.answerers?.t1).toMatchObject({ roundIndex: 1 });
    expect(answererOf(s, 't1')).toBe('m2');
    expect(answererOf(toNextQuestion(s), 't1')).toBe('m2');
  });
});

describe('answerer: the ladder hall and the end of the game', () => {
  it('rotate before a ladder question: the contestant shows the next in turn, the hall team its captain', () => {
    let s = until(game(teamQuiz([classicRound('r1', [single]), ladderRound('rl')], 2, 'rotate')), 'round_end');
    expect(nextAnswerer(s, 't1')).toBe('m1');
    expect(nextAnswerer(s, 't2')).toBe('m4');
    s = step(s);
    expect(s.phase).toBe('intro');
    // На заставці «Мільйонера» без учасника раунд ще попереду: вибір дозволено, у rotate усі поки що — капітан.
    expect(pickAnswerer(s, 'm1', 'm2', 'round').ok).toBe(true);
    expect(nextAnswerer(s, 't1')).toBe('m1');
    s = must(pickContestant(s, 't1'));
    expect(nextAnswerer(s, 't1')).toBe('m2');
    expect(nextAnswerer(s, 't2')).toBe('m4');
    expect(queueNext(s, 't2')).toBe('m5');
  });

  it('no pick after the last question of the game: every phase from the last lock to the podium refuses', () => {
    let s = must(lock(toNextQuestion(game(teamQuiz([classicRound('r1', [single])], 2, 'chosen')))));
    const seen: string[] = [];
    while (s.phase !== 'finished') {
      seen.push(s.phase);
      expect(pickAnswerer(s, 'm1', 'm2', 'round'), s.phase).toEqual({ ok: false, error: 'wrong_phase' });
      expect(pickAnswerer(s, 'm1', null, 'round').ok, s.phase).toBe(true);
      s = must(next(s, T0, rng));
    }
    expect(seen).toEqual(expect.arrayContaining(['locked', 'reveal']));
  });

  it('a board with cells left still allows a pick', () => {
    const board = boardRound('g1', [{ title: 'Міста', cells: [withId(single, 'c11'), withId(single, 'c12')] }]);
    const s = until(game(teamQuiz([board], 2, 'chosen')), 'board');
    expect(pickAnswerer(s, 'm1', 'm2', 'question').ok).toBe(true);
  });
});

describe('answerer: blitz, polls and clouds next — nothing to pick', () => {
  it('before a blitz round, a poll or a cloud the pick is refused and the next answerer is the captain; clearing still works', () => {
    const blitzy = game(teamQuiz([blitzRound('b1', [single])], 2, 'chosen'));
    expect(pickAnswerer(blitzy, 'm1', 'm2', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pickAnswerer(blitzy, 'm1', 'm2', 'round')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pickAnswerer(blitzy, 'm1', null, 'round').ok).toBe(true);
    const polled = withPick(game(teamQuiz([classicRound('r1', [poll, single])], 2, 'chosen')), 't1', 'm2', 'question');
    expect(nextAnswerer(polled, 't1')).toBe('m1');
    expect(pickAnswerer(polled, 'm1', 'm3', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    const clouded = must(lock(toNextQuestion(game(teamQuiz([classicRound('r1', [single, cloud])], 2, 'rotate')))));
    expect(nextAnswerer(clouded, 't1')).toBe('m1');
    expect(pickAnswerer(clouded, 'm1', 'm2', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a sort question in a blitz round has an answerer, so the pick is allowed', () => {
    const sorted = game(teamQuiz([blitzRound('b1', [sortQ])], 2, 'chosen'));
    expect(must(pickAnswerer(sorted, 'm1', 'm2', 'question')).teams?.answerers?.t1.memberId).toBe('m2');
  });

  it('on round_end and on the last reveal the next round decides', () => {
    const quiz = teamQuiz([classicRound('r1', [single]), blitzRound('b1', [withId(single, 'b1')])], 2, 'chosen');
    let s = until(toNextQuestion(game(quiz)), 'reveal');
    expect(pickAnswerer(s, 'm1', 'm2', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    s = until(s, 'round_end');
    expect(pickAnswerer(s, 'm1', 'm2', 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    const back = teamQuiz([blitzRound('b1', [single]), classicRound('r2', [withId(single, 'q4')])], 2, 'chosen');
    expect(pickAnswerer(until(game(back), 'round_end'), 'm1', 'm2', 'question').ok).toBe(true);
  });
});

describe('answerer: edges', () => {
  it('a round pick is not upcoming after the last question of its round', () => {
    let s = must(pickAnswerer(intro, 'm1', 'm3', 'round'));
    s = toNextQuestion(toNextQuestion(toNextQuestion(s)));
    expect(s.plays[s.questionIndex].question.id).toBe('q3');
    s = must(lock(s));
    expect(upcomingPick(s, 't1')).toBeNull();
    expect(nextAnswerer(s, 't1')).toBe('m1');
    s = until(s, 'reveal');
    expect(upcomingPick(s, 't1')).toBeNull();
    expect(shownAnswerer(s, 't1')).toBe('m3');
  });

  it('wipeout: a team that took its bank does not move the turn', () => {
    let s = toNextQuestion(game(teamQuiz([wipeoutRound('rw', wipeoutLadder)], 2, 'rotate')));
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm4', RIGHT, T0 + 1000));
    while (!decisionOpen(s)) s = must(next(s, T0 + 2000, rng));
    s = must(decideWipeout(s, 't2', true, T0 + 3000));
    s = must(decideWipeout(s, 't1', false, T0 + 3000));
    s = toNextQuestion(s);
    expect(s.teams?.turns).toEqual({ t1: { questionIndex: 1, memberId: 'm2' }, t2: { questionIndex: 0, memberId: 'm4' } });
  });

  it('rotate: a team of one always answers by its only member', () => {
    let s = game(teamQuiz(ROUNDS, 2, 'rotate'), [['Оля'], ['Марко', 'Ната']]);
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m1');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m1');
    expect(answererOf(s, 't2')).toBe('m3');
  });

  it('rotate: the whole team offline — the captain; a member back online is taken in team order', () => {
    let s = toNextQuestion(game(teamQuiz(ROUNDS, 2, 'rotate')));
    s = offline(offline(offline(s, 'm1'), 'm2'), 'm3');
    s = toNextQuestion(s);
    expect(s.teams?.turns?.t1.memberId).toBe('m1');
    expect(answererOf(s, 't1')).toBe('m1');
    s = online(s, 'm3');
    s = toNextQuestion(s);
    expect(answererOf(s, 't1')).toBe('m3');
  });

  it('startAnswerers returns the same object in a solo game and with nothing to pin', () => {
    const solo = must(next(must(start(lobbyWith(makeRoundsQuiz(ROUNDS), 'Оля', 'Петро'))), T0, rng));
    expect(startAnswerers(solo)).toBe(solo);
    const plain = toNextQuestion(intro);
    expect(startAnswerers(plain)).toBe(plain);
    const picked = toNextQuestion(must(pickAnswerer(intro, 'm1', 'm2', 'round')));
    expect(startAnswerers(picked)).toBe(picked);
  });

  it('nextAnswerer with an offline upcoming pick is the captain', () => {
    const s = offline(must(pickAnswerer(intro, 'm1', 'm2', 'question')), 'm2');
    expect(upcomingPick(s, 't1')?.memberId).toBe('m2');
    expect(nextAnswerer(s, 't1')).toBe('m1');
  });
});
