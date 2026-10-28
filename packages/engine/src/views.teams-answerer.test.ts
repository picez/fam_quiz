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
import { classicRound, finalRound, single, survivalQuestions, survivalRound, survivalTrials, withId } from './testing/fixtures';
import { must } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

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
