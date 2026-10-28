import { describe, expect, it } from 'vitest';
import { type Answer, type Quiz, type Round } from '@quiz/shared';
import { pickAnswerer } from './answerer';
import { declareDuel, pickDuelCategory } from './duel';
import { lock, next, type GameState } from './game';
import { hostLive } from './live';
import { trialOpen } from './survival';
import { actAnswer } from './team-act';
import { memberConnected } from './teams';
import { hostView, playerView, stageView } from './views';
import { duelQuiz, revealOf } from './testing/duel';
import { pickCell } from './board';
import { decideWipeout, decisionOpen } from './wipeout';
import {
  blitzRound,
  boardRound,
  classicRound,
  finalRound,
  poll,
  single,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  wipeoutLadder,
  wipeoutRound,
  withId,
} from './testing/fixtures';
import { must } from './testing/helpers';
import { teamGame, teamLobby, teamQuiz } from './testing/teams';

const T0 = 1_000_000;
const rng = () => 0;
/** m1 Оля, m2 Петро, m3 Іра — t1 (капітан Оля); m4 Марко, m5 Ната — t2 (капітан Марко). */
const LAYOUT = [
  ['Оля', 'Петро', 'Іра'],
  ['Марко', 'Ната'],
];
const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };
/** Раунд 1 — q1, q2, q3; раунд 2 — q4. */
const ROUNDS = [classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')]), classicRound('r2', [withId(single, 'q4')])];

const game = (rounds: Round[], mode?: 'chosen' | 'rotate'): GameState => teamGame(teamQuiz(rounds, LAYOUT.length, mode), LAYOUT);
const team = (s: GameState, id: string) => playerView(s, id)?.team;
const teamView = (view: { teams: { teams: { id: string; answererId: string | null }[] } | null }, id: string) =>
  view.teams?.teams.find((t) => t.id === id);
const actor = (s: GameState, id: string) => hostLive(s)?.rows.find((r) => r.id === id)?.actor;

/** «Далі», доки не настане потрібний етап. */
function until(s: GameState, done: (s: GameState) => boolean, now = T0): GameState {
  let state = must(next(s, now, rng));
  while (!done(state)) state = must(next(state, now, rng));
  return state;
}

/** До наступного відкритого запитання (з поточного запитання — через «Закрити»). */
const toQuestion = (s: GameState): GameState => until(s.phase === 'question' ? must(lock(s)) : s, (st) => st.phase === 'question');

describe('team answerer views: captain mode', () => {
  it('everything stays with the captain', () => {
    const s = must(next(game(ROUNDS), T0, rng));
    expect(stageView(s).teams).toMatchObject({ answerer: 'captain' });
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m1');
    expect(teamView(stageView(s), 't2')?.answererId).toBe('m4');
    expect(team(s, 'm2')).toMatchObject({ answererId: 'm1', answerer: false, answererMode: 'captain', canPickAnswerer: false, answererPick: null, canAct: false });
    expect(team(s, 'm1')).toMatchObject({ answerer: true, canPickAnswerer: false, canAct: true });
    expect(actor(s, 't1')).toBe('Оля');
  });
});

describe('team answerer views: the captain’s picker', () => {
  it('chosen mode on intro: only the captain may pick; on the question nobody', () => {
    const intro = game(ROUNDS, 'chosen');
    expect(intro.phase).toBe('intro');
    expect(team(intro, 'm1')).toMatchObject({ answererMode: 'chosen', canPickAnswerer: true });
    expect(team(intro, 'm2')).toMatchObject({ canPickAnswerer: false });
    expect(team(intro, 'm4')).toMatchObject({ canPickAnswerer: true });
    const s = must(next(intro, T0, rng));
    expect(s.phase).toBe('question');
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5']) expect(team(s, id)?.canPickAnswerer).toBe(false);
  });

  it('Петро picked for the round on intro: the pick waits, every role sees him next and then answering', () => {
    const intro = must(pickAnswerer(game(ROUNDS, 'chosen'), 'm1', 'm2', 'round'));
    expect(team(intro, 'm1')?.answererPick).toEqual({ memberId: 'm2', scope: 'round' });
    expect(team(intro, 'm2')?.answererPick).toEqual({ memberId: 'm2', scope: 'round' });
    // Вибір чужої команди не видно.
    expect(team(intro, 'm4')?.answererPick).toBeNull();
    expect(teamView(stageView(intro), 't1')?.answererId).toBe('m2');
    expect(team(intro, 'm2')).toMatchObject({ answererId: 'm2', answerer: true });
    const s = must(next(intro, T0, rng));
    expect(team(s, 'm2')).toMatchObject({ answererId: 'm2', answerer: true, canAct: true });
    expect(team(s, 'm1')).toMatchObject({ answererId: 'm2', answerer: false, canAct: false, captain: true });
    expect(team(s, 'm4')).toMatchObject({ answererId: 'm4', answerer: true, canAct: true });
    for (const view of [stageView(s), hostView(s), playerView(s, 'm4'), playerView(s, 'm5')]) {
      expect(view?.teams).toMatchObject({ answerer: 'chosen' });
      expect(teamView(view as never, 't1')?.answererId).toBe('m2');
      expect(teamView(view as never, 't2')?.answererId).toBe('m4');
    }
    expect(actor(s, 't1')).toBe('Петро');
    expect(actor(s, 't2')).toBe('Марко');
  });

  it('a pick for one question: after its question the captain is shown next', () => {
    let s = must(next(must(pickAnswerer(game(ROUNDS, 'chosen'), 'm1', 'm2', 'question')), T0, rng));
    expect(team(s, 'm1')?.answererPick).toBeNull();
    s = must(lock(s));
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m2');
    s = until(s, (st) => st.phase !== 'locked' && st.phase !== 'reveal');
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m1');
  });

  it('the final wager: only the captain acts even with Петро picked', () => {
    const rounds = [classicRound('r1', [single], { speedBonus: false }), finalRound('f', withId(single, 'f1'))];
    let s = must(next(game(rounds, 'chosen'), T0, rng));
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm4', RIGHT, T0 + 1000));
    s = until(s, (st) => st.phase === 'wager', T0 + 2000);
    s = must(pickAnswerer(s, 'm1', 'm2', 'question'));
    expect(team(s, 'm1')).toMatchObject({ canAct: true, canPickAnswerer: true, answererId: 'm2' });
    expect(team(s, 'm2')).toMatchObject({ canAct: false, answerer: true });
  });

  it('the survival trial: the answerer of the round record acts, not the captain', () => {
    const rounds = [survivalRound('rs', survivalQuestions, survivalTrials)];
    let s = must(next(must(pickAnswerer(game(rounds, 'chosen'), 'm1', 'm2', 'question')), T0, rng));
    s = must(actAnswer(s, 'm2', WRONG, T0 + 1000));
    s = must(actAnswer(s, 'm4', RIGHT, T0 + 1000));
    s = until(s, (st) => trialOpen(st), T0 + 2000);
    expect(s.phase).toBe('leaderboard');
    expect(team(s, 'm2')).toMatchObject({ canAct: true, answerer: true, answererId: 'm2' });
    expect(team(s, 'm1')).toMatchObject({ canAct: false, answerer: false });
    expect(actor(s, 't1')).toBe('Петро');
  });
});

describe('team answerer views: privacy and scope', () => {
  it('between questions a player sees the next answerer of the own team only; other teams show their captain', () => {
    let s = must(pickAnswerer(game(ROUNDS, 'chosen'), 'm1', 'm2', 'round'));
    s = must(pickAnswerer(s, 'm4', 'm5', 'question'));
    expect(teamView(playerView(s, 'm4') as never, 't1')?.answererId).toBe('m1');
    expect(teamView(playerView(s, 'm4') as never, 't2')?.answererId).toBe('m5');
    expect(teamView(playerView(s, 'm3') as never, 't1')?.answererId).toBe('m2');
    expect(teamView(playerView(s, 'm3') as never, 't2')?.answererId).toBe('m4');
    expect(team(s, 'm4')?.answererPick).toEqual({ memberId: 'm5', scope: 'question' });
    expect(team(s, 'm3')?.answererPick).toEqual({ memberId: 'm2', scope: 'round' });
    // Сцена й ведучий — як було: обидва наступні відповідачі.
    for (const view of [stageView(s), hostView(s)]) {
      expect(teamView(view, 't1')?.answererId).toBe('m2');
      expect(teamView(view, 't2')?.answererId).toBe('m5');
    }
    // На запитанні це вже не таємниця: усі бачать, хто відповідає.
    s = must(next(s, T0, rng));
    expect(teamView(playerView(s, 'm4') as never, 't1')?.answererId).toBe('m2');
  });

  it('stage and host carry no pick scope', () => {
    const s = must(pickAnswerer(game(ROUNDS, 'chosen'), 'm1', 'm2', 'round'));
    for (const view of [stageView(s), hostView(s)]) {
      for (const t of view.teams?.teams ?? []) expect(Object.keys(t).sort()).toEqual(['answererId', 'captainId', 'color', 'id', 'members', 'name']);
    }
  });

  it('a round pick made on round_end shows for the next round; one made on the last reveal too', () => {
    const walk = (from: GameState, done: (st: GameState) => boolean): GameState => {
      let st = from;
      while (!done(st)) st = must(st.phase === 'question' ? lock(st) : next(st, T0, rng));
      return st;
    };
    let s = walk(game(ROUNDS, 'chosen'), (st) => st.phase === 'round_end');
    s = must(pickAnswerer(s, 'm1', 'm3', 'round'));
    expect(team(s, 'm1')).toMatchObject({ answererId: 'm3', answererPick: { memberId: 'm3', scope: 'round' } });
    s = toQuestion(s);
    expect(s.roundIndex).toBe(1);
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m3');
    let r = walk(game(ROUNDS, 'chosen'), (st) => st.phase === 'reveal' && st.plays[st.questionIndex].question.id === 'q3');
    r = must(pickAnswerer(r, 'm1', 'm3', 'round'));
    expect(team(r, 'm1')?.answererPick).toEqual({ memberId: 'm3', scope: 'round' });
    expect(teamView(stageView(toQuestion(r)), 't1')?.answererId).toBe('m3');
  });

  it('the lobby of a chosen game: the captain answers, nobody picks', () => {
    const lobby = teamLobby(teamQuiz(ROUNDS, 2, 'chosen'), 'Оля', 'Петро');
    const id = lobby.teams?.members[0].id ?? '';
    expect(playerView(lobby, id)?.team).toMatchObject({ answererMode: 'chosen', canPickAnswerer: false, answererPick: null });
  });

  it('before a blitz round or a poll the captain cannot pick', () => {
    const blitzy = game([blitzRound('b1', [single])], 'chosen');
    expect(team(blitzy, 'm1')?.canPickAnswerer).toBe(false);
    let polled = must(next(game([classicRound('r1', [single, poll])], 'chosen'), T0, rng));
    polled = must(lock(polled));
    expect(team(polled, 'm1')?.canPickAnswerer).toBe(false);
    expect(team(must(lock(must(next(game(ROUNDS, 'chosen'), T0, rng)))), 'm1')?.canPickAnswerer).toBe(true);
  });
});

describe('team answerer views: who is not answering shows null on the question', () => {
  it('blitz: no team has an answerer on the question', () => {
    const s = must(next(game([blitzRound('b1', [single])], 'chosen'), T0, rng));
    for (const view of [stageView(s), hostView(s)]) for (const id of ['t1', 't2']) expect(teamView(view, id)?.answererId).toBeNull();
  });

  it('the board: only the team that picked the cell', () => {
    const rounds = [boardRound('g1', [{ title: 'Міста', cells: [withId(single, 'c11'), withId(single, 'c12')] }])];
    let s = until(game(rounds, 'chosen'), (st) => st.phase === 'board');
    s = must(pickCell(s, 't1', 'c11', T0, rng));
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m1');
    expect(teamView(stageView(s), 't2')?.answererId).toBeNull();
  });

  it('«Ва-банк»: a team that took its bank is out of the line', () => {
    let s = must(next(game([wipeoutRound('rw', wipeoutLadder)], 'chosen'), T0, rng));
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm4', RIGHT, T0 + 1000));
    while (!decisionOpen(s)) s = must(next(s, T0 + 2000, rng));
    s = must(decideWipeout(s, 't2', true, T0 + 3000));
    s = must(decideWipeout(s, 't1', false, T0 + 3000));
    s = toQuestion(s);
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m1');
    expect(teamView(stageView(s), 't2')?.answererId).toBeNull();
    expect(teamView(hostView(s), 't2')?.answererId).toBeNull();
  });
});

describe('team answerer views: the turn', () => {
  it('rotate: q2 — Петро; between q2 and q3 — Іра is shown next', () => {
    let s = must(next(game(ROUNDS, 'rotate'), T0, rng));
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m1');
    s = toQuestion(s);
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m2');
    expect(team(s, 'm2')).toMatchObject({ answererMode: 'rotate', answerer: true, canAct: true });
    expect(actor(s, 't1')).toBe('Петро');
    s = until(must(lock(s)), (st) => st.phase !== 'locked' && st.phase !== 'reveal');
    expect(s.phase).not.toBe('question');
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m3');
    expect(team(s, 'm3')).toMatchObject({ answererId: 'm3', answerer: true });
  });
});

describe('team answerer views: the host live row', () => {
  it('the duel: the duelist acts, not the picked one', () => {
    const quiz: Quiz = { ...duelQuiz(), settings: { ...duelQuiz().settings, teams: teamQuiz([], 2, 'chosen').settings.teams } };
    const layout = [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ];
    let s = revealOf(must(next(teamGame(quiz, layout), T0, rng)), T0 + 1000);
    s = must(next(s, T0 + 2000, rng));
    s = revealOf(s, T0 + 3000);
    s = must(pickAnswerer(s, 'm1', 'm2', 'round'));
    s = must(declareDuel(s, 't1', 't2'));
    s = must(pickDuelCategory(must(next(s, T0 + 4000, rng)), 't1', 'dc1', T0 + 60_000, rng));
    expect(actor(s, 't1')).toBe('Оля');
    expect(actor(s, 't2')).toBe('Віра');
  });

  it('Петро picked and offline: the captain is shown and acts', () => {
    let s = must(next(must(pickAnswerer(game(ROUNDS, 'chosen'), 'm1', 'm2', 'round')), T0, rng));
    s = must(memberConnected(s, 'm2', false, T0 + 500));
    expect(teamView(stageView(s), 't1')?.answererId).toBe('m1');
    expect(team(s, 'm1')).toMatchObject({ answererId: 'm1', answerer: true, canAct: true });
    expect(actor(s, 't1')).toBe('Оля');
  });
});
