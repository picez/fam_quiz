import { describe, expect, it } from 'vitest';
import { autopilotQuiz, BUFF_KINDS, type Quiz } from '@quiz/shared';
import {
  anyonePresent,
  authorPause,
  authorRemoveBluff,
  authorResume,
  authorTeamForm,
  autopilotStart,
  createAutopilotGame,
  isAuthor,
} from './autopilot';
import { bluffPlayOf, pickBluff, writeLie } from './bluff';
import { pickCell } from './board';
import { buffBlock, takeBuff } from './buffs';
import { pickContestant, useLifeline } from './ladder';
import { addPlayer, createGame, lock, next, setConnected, start, type GameState, type Rng } from './game';
import { captainOf, dealTeams, pickTeam, rollTeamRest, setTeamForm, teamMembers } from './teams';
import { bluff, boardRound, classicRound, ladderQuestions, ladderRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
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

  it('pausing during a «nobody» pause makes it the author pause, keeping the time left', () => {
    const paused = must(authorPause(atReveal(), T0 + 2000));
    const nobody: GameState = { ...paused, autopilot: { authorId: 'a', at: T0 + 5000, hold: 'nobody', left: 1200 } };
    const held = must(authorPause(nobody, T0 + 3000));
    expect(held.paused).toBe(true);
    expect(held.pausedAt).toBe(paused.pausedAt);
    expect(held.autopilot).toEqual({ authorId: 'a', at: null, hold: 'author', left: 1200 });
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

describe('host hint in autopilot (11g)', () => {
  const hintQuiz = (hint?: string): Quiz =>
    makeRoundsQuiz([classicRound('r1', [{ ...withId(single, 'q1'), ...(hint === undefined ? {} : { hint }) }])], { buffs: [...BUFF_KINDS] });
  const open = (s: GameState): GameState => must(next(s, T0, rng));
  const pilotOpen = (quiz: Quiz) => open(must(autopilotStart(pilotLobby(quiz, 'Ігор'), T0, rng)));

  it('a hint buff is unfit without the text, and takeBuff refuses it', () => {
    const s = pilotOpen(hintQuiz());
    expect(buffBlock(s, 'a', 'hint')).toBe('unfit_host');
    expect(takeBuff(s, 'a', 'hint', T0 + 5000, rng)).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('with the text the buff is taken and carries it', () => {
    const s = pilotOpen(hintQuiz('Подумай про річки'));
    expect(buffBlock(s, 'a', 'hint')).toBeNull();
    const taken = must(takeBuff(s, 'a', 'hint', T0 + 5000, rng));
    expect(taken.plays[taken.questionIndex].buffs?.a?.hint).toEqual({ text: 'Подумай про річки', aloud: false });
  });

  it('with a host and no text the buff is taken and waits for the host', () => {
    const s = open(must(start(must(addPlayer(createGame(hintQuiz()), { id: 'a', nickname: 'Марта' })), T0)));
    expect(buffBlock(s, 'a', 'hint')).toBeNull();
    const taken = must(takeBuff(s, 'a', 'hint', T0 + 5000, rng));
    expect(taken.plays[taken.questionIndex].buffs?.a?.hint?.text).toBeNull();
  });

  it('a board cell: the hint buff is unfit without the text and fine with it', () => {
    const cellQuiz = (hint?: string): Quiz =>
      makeRoundsQuiz([boardRound('g1', [{ title: 'Ріки', cells: [{ ...withId(single, 'b1'), ...(hint === undefined ? {} : { hint }) }, withId(single, 'b2')] }])], {
        buffs: [...BUFF_KINDS],
      });
    const atCell = (quiz: Quiz): GameState => {
      // Один гравець: кубиків немає, після заставки — поле, хід автора.
      const board = open(must(autopilotStart(pilotLobby(quiz), T0, rng)));
      expect(board.phase).toBe('board');
      return must(pickCell(board, 'a', 'b1', T0 + 1000, rng));
    };
    const bare = atCell(cellQuiz());
    expect(bare.phase).toBe('question');
    expect(buffBlock(bare, 'a', 'hint')).toBe('unfit_host');
    expect(buffBlock(atCell(cellQuiz('Про воду')), 'a', 'hint')).toBeNull();
  });

  it('a ladder hint lifeline needs the text in autopilot', () => {
    const climb = (questions: typeof ladderQuestions) => {
      const lobby = must(addPlayer(pilotLobby(makeRoundsQuiz([ladderRound('rl', questions)]), 'Ігор'), { id: 'p3', nickname: 'Віра' }));
      return must(next(must(pickContestant(must(autopilotStart(lobby, T0, rng)), 'p2')), T0, rng));
    };
    const bare = climb(ladderQuestions);
    expect(useLifeline(bare, 'p2', 'hint', T0 + 5000, rng)).toEqual({ ok: false, error: 'buff_unfit' });
    const written = climb(ladderQuestions.map((q) => ({ ...q, hint: 'Нагадування' })));
    const used = must(useLifeline(written, 'p2', 'hint', T0 + 5000, rng));
    expect(used.plays[used.questionIndex].ladder?.lifelines.hint?.text).toBe('Нагадування');
  });
});

describe('author bluff removal (11g final review)', () => {
  const bluffQuiz = (teams = false): Quiz =>
    teams ? teamQuiz([classicRound('r1', [bluff, single])]) : makeRoundsQuiz([classicRound('r1', [bluff, single])]);
  const options = (s: GameState) => bluffPlayOf(s)!.bluff.options;
  const option = (s: GameState, text: string) => options(s).find((o) => o.text === text)!;
  const kind = (s: GameState, k: 'truth' | 'spare') => options(s).find((o) => o.kind === k)!;
  const PICK_FIRST = { ok: false, error: 'pick_first' };
  const NOT_ALLOWED = { ok: false, error: 'not_allowed' };

  /** Автор a, Ігор p2, Віра p3 написали «Рим», «Мілан», «Париж» — фаза вибору. */
  function soloChoice(): GameState {
    let s = must(next(must(autopilotStart(pilotLobby(bluffQuiz(), 'Ігор', 'Віра'), T0, rng)), T0, rng));
    for (const [id, lie] of [['a', 'Рим'], ['p2', 'Мілан'], ['p3', 'Париж']]) s = must(writeLie(s, id, lie, T0 + 1000));
    expect(bluffPlayOf(s)?.bluff.stage).toBe('choice');
    return s;
  }

  it('before the author picks, every removal is refused alike, so the truth cannot be told apart', () => {
    let s = soloChoice();
    // Інші вже вибрали — однаково: важить лише вибір автора.
    s = must(pickBluff(s, 'p2', option(s, 'Париж').id, T0 + 2000));
    for (const o of options(s)) expect(authorRemoveBluff(s, o.id)).toEqual(PICK_FIRST);
    expect(authorRemoveBluff(s, 'b99')).toEqual(PICK_FIRST);
  });

  it('after the pick only an unpicked lie is removed; the truth, a spare, the own pick and a lie others picked are not', () => {
    let s = soloChoice();
    const milan = option(s, 'Мілан');
    const paris = option(s, 'Париж');
    const rome = option(s, 'Рим');
    s = must(pickBluff(s, 'a', milan.id, T0 + 2000));
    s = must(pickBluff(s, 'p2', paris.id, T0 + 2000));
    expect(authorRemoveBluff(s, kind(s, 'truth').id)).toEqual(NOT_ALLOWED);
    expect(authorRemoveBluff(s, kind(s, 'spare').id)).toEqual(NOT_ALLOWED);
    // Свій вибір прибрати не можна: інакше автор вибрав би знову.
    expect(authorRemoveBluff(s, milan.id)).toEqual(NOT_ALLOWED);
    // Вигадку, яку вже вибрали інші, теж: їхній вибір не знімається.
    expect(authorRemoveBluff(s, paris.id)).toEqual(NOT_ALLOWED);
    const removed = must(authorRemoveBluff(s, rome.id));
    expect(option(removed, 'Рим').removed).toBe(true);
    const picks = bluffPlayOf(removed)!.bluff.picks;
    expect(picks.a.optionId).toBe(milan.id);
    expect(picks.p2.optionId).toBe(paris.id);
    expect(pickBluff(removed, 'a', kind(removed, 'truth').id, T0 + 3000)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('a team game: the pick of the author team counts, not of another team', () => {
    let s = pilotLobby(bluffQuiz(true));
    s = must(addPlayer(s, { id: 'm2', nickname: 'Ігор' }));
    s = must(authorTeamForm(s, 'pick'));
    s = must(pickTeam(s, 'a', 't1'));
    s = must(pickTeam(s, 'm2', 't2'));
    s = must(next(must(autopilotStart(s, T0, rng)), T0, rng));
    s = must(writeLie(s, 't1', 'Рим', T0 + 1000));
    s = must(writeLie(s, 't2', 'Мілан', T0 + 1000));
    expect(bluffPlayOf(s)?.bluff.stage).toBe('choice');
    s = must(pickBluff(s, 't2', option(s, 'Рим').id, T0 + 2000));
    expect(authorRemoveBluff(s, option(s, 'Мілан').id)).toEqual(PICK_FIRST);
    s = must(pickBluff(s, 't1', option(s, 'Мілан').id, T0 + 2000));
    expect(s.phase).toBe('locked');
  });

  it('a team game: after the author team picked, a lie of the other team is removed', () => {
    let s = pilotLobby(bluffQuiz(true));
    for (const [id, nickname] of [['m2', 'Ігор'], ['m3', 'Віра']]) s = must(addPlayer(s, { id, nickname }));
    s = must(authorTeamForm(s, 'pick'));
    s = must(pickTeam(s, 'a', 't1'));
    s = must(pickTeam(s, 'm2', 't2'));
    s = must(pickTeam(s, 'm3', 't2'));
    s = must(next(must(autopilotStart(s, T0, rng)), T0, rng));
    s = must(writeLie(s, 't1', 'Рим', T0 + 1000));
    s = must(writeLie(s, 't2', 'Мілан', T0 + 1000));
    s = must(pickBluff(s, 't1', kind(s, 'spare').id, T0 + 2000));
    const removed = must(authorRemoveBluff(s, option(s, 'Мілан').id));
    expect(option(removed, 'Мілан').removed).toBe(true);
    expect(bluffPlayOf(removed)!.bluff.picks.t1.optionId).toBe(kind(s, 'spare').id);
  });

  it('a hosted game: not_allowed', () => {
    const s = soloChoice();
    const { autopilot: _pilot, ...hosted } = s;
    expect(authorRemoveBluff(hosted, option(s, 'Мілан').id)).toEqual(NOT_ALLOWED);
  });
});
