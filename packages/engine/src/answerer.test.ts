import { describe, expect, it } from 'vitest';
import type { Phase, Quiz } from '@quiz/shared';
import { activePick, answererOf, nextAnswerer, pickAnswerer, queueNext, shownAnswerer, startAnswerers, upcomingPick } from './answerer';
import { pickCell } from './board';
import { chooserOf } from './board-turns';
import { lock, next, pause, start, type GameState } from './game';
import { dropMember, memberConnected } from './teams';
import { blitzRound, boardRound, classicRound, makeRoundsQuiz, poll, single, withId } from './testing/fixtures';
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

const game = (quiz: Quiz): GameState => teamGame(quiz, LAYOUT);
/** Етап intro першого раунду, режим «вибирає капітан». */
const intro = game(teamQuiz(ROUNDS, 2, 'chosen'));

/** Крок рушія: на запитанні — «Закрити», інакше — «Далі»; щойно відкрите запитання — startAnswerers (як зробить openQuestion). */
function step(s: GameState): GameState {
  const moved = must(s.phase === 'question' ? lock(s) : next(s, T0, rng));
  return moved.phase === 'question' && s.phase !== 'question' ? startAnswerers(moved) : moved;
}

/** Кроки, доки етап не стане phase. */
function until(s: GameState, phase: Phase): GameState {
  let state = step(s);
  while (state.phase !== phase) state = step(state);
  return state;
}

/** До наступного відкритого запитання (з startAnswerers). */
const toNextQuestion = (s: GameState): GameState => until(s, 'question');

const offline = (s: GameState, id: string): GameState => must(memberConnected(s, id, false, T0));
const online = (s: GameState, id: string): GameState => must(memberConnected(s, id, true, T0));

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
    expect(answererOf(toNextQuestion(must(pickAnswerer(blitzy, 'm1', 'm2', 'question'))), 't1')).toBe('m1');
    const polled = game(teamQuiz([classicRound('r1', [poll])], 2, 'chosen'));
    expect(answererOf(toNextQuestion(must(pickAnswerer(polled, 'm1', 'm2', 'question'))), 't1')).toBe('m1');
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

  it('queueNext starts from the captain when the last in turn has left the team', () => {
    let s = toNextQuestion(toNextQuestion(rotate));
    expect(s.teams?.turns?.t1.memberId).toBe('m2');
    s = until(s, 'reveal');
    expect(queueNext(s, 't1')).toBe('m3');
    s = must(dropMember(s, 'm2'));
    expect(queueNext(s, 't1')).toBe('m1');
  });
});
