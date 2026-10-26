import { describe, expect, it } from 'vitest';
import { autopilotQuiz, type Quiz } from '@quiz/shared';
import {
  anyonePresent,
  authorPause,
  authorResume,
  autopilotStart,
  createAutopilotGame,
  isAuthor,
} from './autopilot';
import { addPlayer, createGame, lock, next, setConnected, start, type GameState, type Rng } from './game';
import { captainOf, dealTeams, rollTeamRest, setTeamForm, teamMembers } from './teams';
import { boardRound, classicRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { must } from './testing/helpers';
import { teamQuiz } from './testing/teams';

const T0 = 1_000_000;
const rng: Rng = () => 0.3;
/** Детермінований ряд для кубиків: різні числа по колу. */
const cycle = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length];
};

const classicQuiz = (): Quiz => makeRoundsQuiz([classicRound('r1', [single])]);
const voiceBoardQuiz = (): Quiz =>
  makeRoundsQuiz([
    boardRound('g1', [
      { title: 'Ріки', cells: [{ question: withId(single, 'b1'), answerMode: 'voice' }, withId(single, 'b2')] },
    ]),
  ]);

/** Автопілот: автор a (Марта) і ще гравці p2, p3, … */
function pilotLobby(quiz: Quiz, ...others: string[]): GameState {
  const created = must(createAutopilotGame(quiz, { id: 'a', nickname: 'Марта' }, { transitions: false }));
  return others.reduce((s, nickname, i) => must(addPlayer(s, { id: `p${i + 2}`, nickname })), created);
}

describe('autopilot state (11g)', () => {
  it('creates the game with its author as a connected player, on the autopilot quiz', () => {
    const quiz = voiceBoardQuiz();
    const result = createAutopilotGame(quiz, { id: 'a', nickname: 'Марта' }, { transitions: false });
    expect(result.ok).toBe(true);
    const s = must(result);
    expect(s.autopilot).toEqual({ authorId: 'a', at: null });
    expect(s.players).toEqual([{ id: 'a', nickname: 'Марта', connected: true, score: 0, totalTimeMs: 0, streak: 0 }]);
    expect(s.quiz).toEqual(autopilotQuiz(quiz));
    const round = s.quiz.rounds[0];
    expect(round.type === 'board' && round.categories[0].cells[0].answerMode).toBe('phone');
    expect(s.phase).toBe('lobby');
  });

  it('an empty nickname is refused as by addPlayer', () => {
    const result = createAutopilotGame(classicQuiz(), { id: 'a', nickname: '  ' });
    expect(result).toEqual({ ok: false, error: 'nickname_invalid' });
  });

  it('in a team quiz the author is a member without a team', () => {
    const s = must(createAutopilotGame(teamQuiz([classicRound('r1', [single])]), { id: 'a', nickname: 'Марта' }));
    expect(s.players).toEqual([]);
    expect(s.teams?.members).toEqual([{ id: 'a', nickname: 'Марта', connected: true, teamId: null }]);
    expect(s.autopilot).toEqual({ authorId: 'a', at: null });
  });

  it('knows the author', () => {
    const s = pilotLobby(classicQuiz(), 'Ігор');
    expect(isAuthor(s, 'a')).toBe(true);
    expect(isAuthor(s, 'p2')).toBe(false);
    const hosted = must(addPlayer(createGame(classicQuiz()), { id: 'a', nickname: 'Марта' }));
    expect(isAuthor(hosted, 'a')).toBe(false);
  });

  it('anyonePresent: solo by players, teams by members', () => {
    const solo = pilotLobby(classicQuiz());
    expect(anyonePresent(solo)).toBe(true);
    expect(anyonePresent(must(setConnected(solo, 'a', false, T0)))).toBe(false);
    const teams = must(addPlayer(must(createAutopilotGame(teamQuiz([classicRound('r1', [single])]), { id: 'a', nickname: 'Марта' })), { id: 'm2', nickname: 'Ігор' }));
    expect(anyonePresent(teams)).toBe(true);
    const oneOff = must(setConnected(teams, 'a', false, T0));
    expect(anyonePresent(oneOff)).toBe(true);
    expect(anyonePresent(must(setConnected(oneOff, 'm2', false, T0)))).toBe(false);
  });
});

describe('author start (11g)', () => {
  it('solo: starts like start', () => {
    const s = pilotLobby(classicQuiz(), 'Ігор');
    const started = must(autopilotStart(s, T0, rng));
    expect(started).toEqual(must(start(s, T0)));
    expect(started.phase).toBe('intro');
    const guided = pilotLobby({ ...classicQuiz(), settings: { ...classicQuiz().settings, newcomers: true } }, 'Ігор');
    expect(must(autopilotStart(guided, T0, rng)).phase).toBe('guide');
  });

  it('not an autopilot → not_allowed; outside the lobby → wrong_phase', () => {
    const hosted = must(addPlayer(createGame(classicQuiz()), { id: 'a', nickname: 'Марта' }));
    expect(autopilotStart(hosted, T0, rng)).toEqual({ ok: false, error: 'not_allowed' });
    const started = must(autopilotStart(pilotLobby(classicQuiz()), T0, rng));
    expect(autopilotStart(started, T0, rng)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  for (const form of ['host', 'random'] as const) {
    it(`teams «${form}»: everyone is dealt a team at start`, () => {
      const lobby = must(setTeamForm(pilotLobby(teamQuiz([classicRound('r1', [single])]), 'Ігор', 'Олена', 'Тарас'), form));
      const dealt = must(dealTeams(must(setTeamForm(lobby, 'random')), cycle(0.1, 0.7, 0.4, 0.9)));
      const started = must(autopilotStart(lobby, T0, cycle(0.1, 0.7, 0.4, 0.9)));
      expect(started.phase).toBe('intro');
      expect(started.teams?.members.map((m) => m.teamId)).toEqual(dealt.teams?.members.map((m) => m.teamId));
      expect(started.teams?.members.every((m) => m.teamId !== null)).toBe(true);
      expect(started.teams?.form).toBe(form);
      // капітан — перший за приходом у своїй команді
      for (const team of started.teams?.list ?? []) {
        const members = teamMembers(started, team.id);
        if (members.length > 0) expect(captainOf(started, team.id)).toBe(members[0].id);
      }
    });
  }

  it('teams «pick»: the one who did not pick goes to the smallest team, as with start', () => {
    let lobby = pilotLobby(teamQuiz([classicRound('r1', [single])]), 'Ігор', 'Олена');
    lobby = must(setTeamForm(lobby, 'pick'));
    const picked = { ...lobby, teams: { ...lobby.teams!, members: lobby.teams!.members.map((m, i) => (i < 2 ? { ...m, teamId: 't1' } : m)) } };
    const started = must(autopilotStart(picked, T0, rng));
    expect(started).toEqual(must(start(picked, T0)));
    expect(started.teams?.members.find((m) => m.id === 'p3')?.teamId).toBe('t2');
  });

  it('teams «dice»: a lobby dice tour first, then the game starts once it is closed', () => {
    const lobby = must(setTeamForm(pilotLobby(teamQuiz([classicRound('r1', [single])]), 'Ігор', 'Олена'), 'dice'));
    const touring = must(autopilotStart(lobby, T0, rng));
    expect(touring.phase).toBe('lobby');
    expect(touring.teams?.dice?.waiting).toEqual(['a', 'p2', 'p3']);
    expect(touring.autopilot?.starting).toBe(true);
    expect(autopilotStart(touring, T0, rng)).toEqual({ ok: false, error: 'dice_pending' });
    const rolled = must(rollTeamRest(touring, cycle(0.1, 0.5, 0.9)));
    expect(rolled.teams?.members.every((m) => m.teamId !== null)).toBe(true);
    const started = must(autopilotStart(rolled, T0, rng));
    expect(started.phase).toBe('intro');
    expect(started.autopilot).toEqual({ authorId: 'a', at: null });
  });
});

describe('author pause (11g)', () => {
  function atReveal(): GameState {
    let s = must(autopilotStart(pilotLobby(classicQuiz(), 'Ігор'), T0, rng));
    s = must(next(s, T0, rng));
    s = must(lock(s));
    s = must(next(s, T0 + 1000, rng));
    expect(s.phase).toBe('reveal');
    return s;
  }

  it('pauses with hold author; refuses when paused, in the lobby, or in a hosted game', () => {
    const paused = must(authorPause(atReveal(), T0 + 2000));
    expect(paused.paused).toBe(true);
    expect(paused.autopilot?.hold).toBe('author');
    expect(authorPause(paused, T0 + 3000)).toEqual({ ok: false, error: 'paused' });
    expect(authorPause(pilotLobby(classicQuiz()), T0)).toEqual({ ok: false, error: 'wrong_phase' });
    const hosted = must(next(must(lock(must(next(must(start(must(addPlayer(createGame(classicQuiz()), { id: 'a', nickname: 'Марта' })), T0)), T0, rng)))), T0, rng));
    expect(authorPause(hosted, T0)).toEqual({ ok: false, error: 'not_allowed' });
    expect(authorResume(hosted, T0)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('resumes without hold and left, after either kind of pause', () => {
    const paused = must(authorPause(atReveal(), T0 + 2000));
    const withLeft: GameState = { ...paused, autopilot: { ...paused.autopilot!, left: 1500 } };
    const resumed = must(authorResume(withLeft, T0 + 5000));
    expect(resumed.paused).toBe(false);
    expect(resumed.autopilot).toEqual({ authorId: 'a', at: null });
    const nobody: GameState = { ...paused, autopilot: { authorId: 'a', at: null, hold: 'nobody', left: 800 } };
    const back = must(authorResume(nobody, T0 + 5000));
    expect(back.paused).toBe(false);
    expect(back.autopilot).toEqual({ authorId: 'a', at: null });
    expect(authorResume(atReveal(), T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
