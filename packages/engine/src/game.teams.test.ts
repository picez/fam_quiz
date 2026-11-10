import { describe, expect, it } from 'vitest';
import { adjustScore } from './adjust';
import { addPlayer, createGame, end, lock, next, recordOf, removePlayer, resume, setConnected, start, submitAnswer, type GameState } from './game';
import { actAnswer } from './team-act';
import { suspend } from './restore';
import { assignTeam, captainOf, dealTeams, pickTeam, presentMembers, rollTeamRest, setCaptain, setTeamForm, startTeamDice } from './teams';
import { placeWager } from './final';
import { auctionRound, betsRound, boardRound, classicRound, makeRoundsQuiz, poll, single, truthRound, wipeoutLadder, wipeoutRound, withId, withPoints } from './testing/fixtures';
import { answeringTeams } from './answerer';
import { submitTruth } from './truth';
import { stageView } from './views';
import { decideWipeout, decisionOpen, wipeoutTable } from './wipeout';
import { must } from './testing/helpers';
import { teamGame, teamLobby, teamQuiz } from './testing/teams';

const quiz3 = teamQuiz([classicRound('r1', [single])], 3);
const quiz2 = teamQuiz([classicRound('r1', [single])], 2);

/** rng з фіксованою послідовністю (по колу). */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const teamOfMember = (s: GameState, id: string) => s.teams?.members.find((m) => m.id === id)?.teamId;
const playerIds = (s: GameState) => s.players.map((p) => p.id);
const listIds = (s: GameState) => s.teams?.list.map((t) => t.id);

describe('team game: creation', () => {
  it('a team quiz creates the teams in settings order; the form is «players pick»; nobody plays yet', () => {
    const state = createGame(quiz3, { teamIds: ['a', 'b', 'c'] });
    expect(state.teams).toEqual({
      form: 'pick',
      list: [
        { id: 'a', name: 'Червоні', color: 0 },
        { id: 'b', name: 'Сині', color: 1 },
        { id: 'c', name: 'Зелені', color: 2 },
      ],
      members: [],
      captains: {},
      dice: null,
      duelists: {},
    });
    expect(state.players).toEqual([]);
  });

  it('without teamIds the ids are t1…tN', () => {
    expect(listIds(createGame(quiz3))).toEqual(['t1', 't2', 't3']);
  });

  it('a solo quiz has no teams key', () => {
    expect('teams' in createGame(makeRoundsQuiz([classicRound('r1', [single])]))).toBe(false);
  });
});

describe('team game: lobby', () => {
  it('a joining person becomes a member without a team; players stay empty', () => {
    const state = teamLobby(quiz3, 'Анна', 'Богдан');
    expect(state.teams?.members).toEqual([
      { id: 'm1', nickname: 'Анна', connected: true, teamId: null },
      { id: 'm2', nickname: 'Богдан', connected: true, teamId: null },
    ]);
    expect(state.players).toEqual([]);
  });

  it('nickname_taken among the people', () => {
    expect(addPlayer(teamLobby(quiz3, 'Анна'), { id: 'm2', nickname: ' анна ' })).toEqual({ ok: false, error: 'nickname_taken' });
  });

  it('room_full on the 51st', () => {
    const full = teamLobby(quiz3, ...Array.from({ length: 50 }, (_, i) => `Гравець ${i + 1}`));
    expect(full.teams?.members).toHaveLength(50);
    expect(addPlayer(full, { id: 'm51', nickname: 'Зайвий' })).toEqual({ ok: false, error: 'room_full' });
  });
});

describe('team game: players pick', () => {
  it('a member picks a team and can change their mind', () => {
    let state = must(pickTeam(teamLobby(quiz3, 'Анна'), 'm1', 't2'));
    expect(teamOfMember(state, 'm1')).toBe('t2');
    state = must(pickTeam(state, 'm1', 't1'));
    expect(teamOfMember(state, 'm1')).toBe('t1');
  });

  it('an unknown team or member → not_found', () => {
    const lobby = teamLobby(quiz3, 'Анна');
    expect(pickTeam(lobby, 'm1', 'zz')).toEqual({ ok: false, error: 'not_found' });
    expect(pickTeam(lobby, 'm9', 't1')).toEqual({ ok: false, error: 'not_found' });
  });

  it('in another form → team_form', () => {
    const lobby = must(setTeamForm(teamLobby(quiz3, 'Анна'), 'host'));
    expect(pickTeam(lobby, 'm1', 't1')).toEqual({ ok: false, error: 'team_form' });
  });
});

describe('team game: the host assigns', () => {
  it('in any form, also back to no team', () => {
    for (const form of ['host', 'pick', 'random', 'dice'] as const) {
      const lobby = must(setTeamForm(teamLobby(quiz3, 'Анна', 'Богдан'), form));
      const moved = must(assignTeam(lobby, 'm2', 't1'));
      expect(teamOfMember(moved, 'm2')).toBe('t1');
      expect(teamOfMember(must(assignTeam(moved, 'm2', null)), 'm2')).toBeNull();
    }
  });

  it('outside the lobby → wrong_phase', () => {
    const game = teamGame(quiz2, [['Анна'], ['Богдан']]);
    expect(assignTeam(game, 'm1', 't2')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('team game: random deal', () => {
  const five = () => must(setTeamForm(teamLobby(quiz2, 'Анна', 'Богдан', 'Віра', 'Галина', 'Дмитро'), 'random'));
  const layout = (s: GameState) => s.teams?.members.map((m) => m.teamId);

  it('only in «random» → else team_form', () => {
    expect(dealTeams(teamLobby(quiz2, 'Анна'), seq(0.1))).toEqual({ ok: false, error: 'team_form' });
  });

  it('nobody to deal → teams_few', () => {
    expect(dealTeams(must(setTeamForm(teamLobby(quiz2), 'random')), seq(0.1))).toEqual({ ok: false, error: 'teams_few' });
  });

  it('five members on two teams → sizes 3 and 2, deterministic for the same rng', () => {
    const dealt = must(dealTeams(five(), seq(0.1, 0.7, 0.4, 0.9)));
    const sizes = ['t1', 't2'].map((t) => dealt.teams?.members.filter((m) => m.teamId === t).length);
    expect(sizes).toEqual([3, 2]);
    expect(layout(must(dealTeams(five(), seq(0.1, 0.7, 0.4, 0.9))))).toEqual(layout(dealt));
  });

  it('dealing again with another rng reshuffles', () => {
    const first = must(dealTeams(five(), seq(0.1, 0.7, 0.4, 0.9)));
    const again = must(dealTeams(first, seq(0.9, 0.05, 0.6, 0.2)));
    expect(layout(again)).not.toEqual(layout(first));
  });
});

describe('team game: captain', () => {
  const game = () => teamGame(quiz2, [['Анна', 'Богдан', 'Віра'], ['Галина']]);

  it('the first by arrival', () => {
    expect(captainOf(game(), 't1')).toBe('m1');
    expect(captainOf(game(), 't2')).toBe('m4');
  });

  it("the host's pick; offline → the next connected after them in a circle; back → captain again; all offline → the pick", () => {
    let state = must(setCaptain(game(), 't1', 'm2'));
    expect(captainOf(state, 't1')).toBe('m2');
    state = must(setConnected(state, 'm2', false, 0));
    expect(captainOf(state, 't1')).toBe('m3');
    state = must(setConnected(state, 'm3', false, 0));
    expect(captainOf(state, 't1')).toBe('m1');
    state = must(setConnected(state, 'm2', true, 0));
    expect(captainOf(state, 't1')).toBe('m2');
    state = must(setConnected(must(setConnected(state, 'm2', false, 0)), 'm1', false, 0));
    expect(captainOf(state, 't1')).toBe('m2');
  });

  it('a member of another team → not_found; finished → wrong_phase', () => {
    expect(setCaptain(game(), 't1', 'm4')).toEqual({ ok: false, error: 'not_found' });
    expect(setCaptain(must(end(game())), 't1', 'm2')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the host can also pick a captain in the lobby', () => {
    const lobby = must(assignTeam(must(assignTeam(teamLobby(quiz2, 'Анна', 'Богдан'), 'm1', 't1')), 'm2', 't1'));
    expect(captainOf(must(setCaptain(lobby, 't1', 'm2')), 't1')).toBe('m2');
  });
});

describe('team game: start', () => {
  it('members without a team go to the smallest teams (first among equals); players are the teams with score 0', () => {
    let lobby = teamLobby(quiz3, 'Анна', 'Богдан', 'Віра', 'Галина', 'Дмитро');
    lobby = must(pickTeam(must(pickTeam(must(pickTeam(lobby, 'm1', 't1')), 'm2', 't1')), 'm3', 't2'));
    const started = must(start(lobby));
    expect(teamOfMember(started, 'm4')).toBe('t3');
    expect(teamOfMember(started, 'm5')).toBe('t2');
    expect(started.players).toEqual([
      { id: 't1', nickname: 'Червоні', connected: true, score: 0, totalTimeMs: 0, streak: 0 },
      { id: 't2', nickname: 'Сині', connected: true, score: 0, totalTimeMs: 0, streak: 0 },
      { id: 't3', nickname: 'Зелені', connected: true, score: 0, totalTimeMs: 0, streak: 0 },
    ]);
    expect(started.phase).toBe('intro');
  });

  it('two members in one team and the other teams empty → teams_few', () => {
    const lobby = must(pickTeam(must(pickTeam(teamLobby(quiz3, 'Анна', 'Богдан'), 'm1', 't2')), 'm2', 't2'));
    expect(start(lobby)).toEqual({ ok: false, error: 'teams_few' });
  });

  it('one member → teams_few', () => {
    expect(start(teamLobby(quiz3, 'Анна'))).toEqual({ ok: false, error: 'teams_few' });
    expect(start(teamLobby(quiz3))).toEqual({ ok: false, error: 'teams_few' });
  });

  it('an empty team drops out of players and the list; the other colors stay', () => {
    const started = teamGame(quiz3, [['Анна'], [], ['Віра']]);
    expect(playerIds(started)).toEqual(['t1', 't3']);
    expect(started.teams?.list).toEqual([
      { id: 't1', name: 'Червоні', color: 0 },
      { id: 't3', name: 'Зелені', color: 2 },
    ]);
  });

  it('a team is connected when any of its people is', () => {
    let lobby = teamLobby(quiz2, 'Анна', 'Богдан', 'Віра');
    lobby = must(pickTeam(must(pickTeam(must(pickTeam(lobby, 'm1', 't1')), 'm2', 't2')), 'm3', 't2'));
    lobby = must(setConnected(must(setConnected(lobby, 'm2', false, 0)), 'm3', false, 0));
    expect(lobby.teams?.members.map((m) => m.connected)).toEqual([true, false, false]);
    expect(must(start(lobby)).players.map((p) => p.connected)).toEqual([true, false]);
  });
});

describe('team game: connection', () => {
  const field = boardRound('g1', [{ title: 'Міста', cells: [withPoints(withId(single, 'c11'), 100), withPoints(withId(single, 'c12'), 200)] }]);
  const onBoard = () => must(next(teamGame(teamQuiz([field]), [['Анна', 'Богдан'], ['Віра']]), 1000));

  it('one member offline while another is online → the team stays connected', () => {
    const state = must(setConnected(onBoard(), 'm1', false, 2000));
    expect(state.players[0].connected).toBe(true);
    expect(state.board?.awaySince).toBeNull();
  });

  it('both offline → the team is offline and the away countdown of its board turn starts; one back → online, countdown cleared', () => {
    const board = onBoard();
    expect(board.phase).toBe('board');
    expect(board.board?.circle[0]).toBe('t1');
    let state = must(setConnected(must(setConnected(board, 'm1', false, 2000)), 'm2', false, 3000));
    expect(state.players[0].connected).toBe(false);
    expect(state.board?.awaySince).toBe(3000);
    state = must(setConnected(state, 'm2', true, 4000));
    expect(state.players[0].connected).toBe(true);
    expect(state.board?.awaySince).toBeNull();
  });
});

describe('team game: removal', () => {
  it('in the lobby the member just disappears', () => {
    const state = must(removePlayer(teamLobby(quiz2, 'Анна', 'Богдан'), 'm1'));
    expect(state.teams?.members.map((m) => m.id)).toEqual(['m2']);
  });

  it('in the game one of two leaves → the team stays and the other becomes captain', () => {
    const state = must(removePlayer(teamGame(quiz2, [['Анна', 'Богдан'], ['Віра']]), 'm1'));
    expect(playerIds(state)).toEqual(['t1', 't2']);
    expect(captainOf(state, 't1')).toBe('m2');
  });

  it('the last member leaving removes the team from players and the list, with its adjustments', () => {
    let state = teamGame(quiz2, [['Анна', 'Богдан'], ['Віра']]);
    state = must(adjustScore(must(adjustScore(state, 't1', 100, 0)), 't2', 50, 0));
    state = must(removePlayer(must(removePlayer(state, 'm1')), 'm2'));
    expect(playerIds(state)).toEqual(['t2']);
    expect(listIds(state)).toEqual(['t2']);
    expect(state.teams?.members.map((m) => m.id)).toEqual(['m3']);
    expect(state.adjustments.map((a) => a.playerId)).toEqual(['t2']);
  });

  it('captains and duelists forget the removed member', () => {
    let state = must(setCaptain(teamGame(quiz2, [['Анна', 'Богдан'], ['Віра', 'Галина']]), 't1', 'm2'));
    state = { ...state, teams: { ...state.teams!, duelists: { t1: 'm2', t2: 'm4' } } };
    state = must(removePlayer(state, 'm2'));
    expect(state.teams?.captains).toEqual({});
    expect(state.teams?.duelists).toEqual({ t2: 'm4' });
  });

  it('removing a team by its id takes its people too', () => {
    const state = must(removePlayer(teamGame(quiz3, [['Анна'], ['Богдан'], ['Віра']]), 't2'));
    expect(playerIds(state)).toEqual(['t1', 't3']);
    expect(listIds(state)).toEqual(['t1', 't3']);
    expect(state.teams?.members.map((m) => m.id)).toEqual(['m1', 'm3']);
  });
});

describe('team game: restart', () => {
  it('suspend takes everyone offline; awaiting is the teams that were online; a returning member clears only their team', () => {
    let state = teamGame(quiz3, [['Анна', 'Богдан'], ['Віра'], ['Галина']]);
    state = must(setConnected(state, 'm4', false, 0));
    state = suspend(state, 1000);
    expect(state.players.every((p) => !p.connected)).toBe(true);
    expect(state.teams?.members.every((m) => !m.connected)).toBe(true);
    // Люди, що були на зв'язку, теж у awaiting — їх і чекає голос без балів.
    expect(state.awaiting).toEqual(['t1', 't2', 'm1', 'm2', 'm3']);
    state = must(setConnected(state, 'm1', true, 2000));
    expect(state.awaiting).toEqual(['t2', 'm2', 'm3']);
    expect(state.players.map((p) => p.connected)).toEqual([true, false, false]);
  });

  it('after a restart a team poll waits only on the people who were online before it', () => {
    const quiz = teamQuiz([classicRound('r1', [poll])], 2);
    let state = must(next(teamGame(quiz, [['Анна', 'Богдан'], ['Віра', 'Галина']]), 1000));
    expect(state.phase).toBe('question');
    // Галина пішла ще до перезапуску.
    state = must(setConnected(state, 'm4', false, 1500));
    state = must(resume(suspend(state, 2000), 3000));
    expect(presentMembers(state).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    for (const id of ['m1', 'm2']) state = must(setConnected(state, id, true, 3000));
    expect(presentMembers(state).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    for (const id of ['m1', 'm2']) state = must(actAnswer(state, id, { type: 'poll', optionId: 'a' }, 3500));
    expect(state.phase).toBe('question');
  });

  it('after a restart a team poll waits on an awaited member who has not returned yet', () => {
    const quiz = teamQuiz([classicRound('r1', [poll])], 2);
    let state = must(next(teamGame(quiz, [['Анна', 'Богдан'], ['Віра']]), 1000));
    state = must(resume(suspend(state, 2000), 3000));
    for (const id of ['m1', 'm3']) state = must(setConnected(state, id, true, 3000));
    for (const id of ['m1', 'm3']) state = must(actAnswer(state, id, { type: 'poll', optionId: 'a' }, 3500));
    expect(state.phase).toBe('question');
    state = must(setConnected(state, 'm2', true, 3600));
    state = must(actAnswer(state, 'm2', { type: 'poll', optionId: 'a' }, 3700));
    expect(state.phase).toBe('locked');
  });
});

describe('team game: removal keeps the team flow going', () => {
  const field = boardRound('g1', [{ title: 'Міста', cells: [withPoints(withId(single, 'c11'), 100), withPoints(withId(single, 'c12'), 200)] }]);

  it('kicking the only online member takes the team offline and starts the away countdown of its board turn', () => {
    let state = must(next(teamGame(teamQuiz([field]), [['Анна', 'Богдан'], ['Віра']]), 1000));
    state = must(setConnected(state, 'm1', false, 2000));
    expect(state.board?.awaySince).toBeNull();
    state = must(removePlayer(state, 'm2', 5000));
    expect(state.players[0]).toMatchObject({ id: 't1', connected: false });
    expect(state.board?.awaySince).toBe(5000);
  });

  it('an open wipeout window waiting only on a team whose last online member is kicked closes', () => {
    const quiz = teamQuiz([wipeoutRound('rw', wipeoutLadder)], 3);
    let state = must(next(teamGame(quiz, [['Анна'], ['Богдан'], ['Віра', 'Галина']]), 0, () => 0));
    for (const id of ['t1', 't2', 't3']) state = must(submitAnswer(state, id, { type: 'single', optionId: 'b' }, 1000));
    if (state.phase === 'question') state = must(lock(state));
    state = must(next(must(next(state, 1500, () => 0)), 2000, () => 0));
    expect(decisionOpen(state)).toBe(true);
    state = must(decideWipeout(must(decideWipeout(state, 't1', false, 3000)), 't2', false, 3000));
    state = must(setConnected(state, 'm3', false, 3200));
    expect(decisionOpen(state)).toBe(true);
    state = must(removePlayer(state, 'm4', 3500));
    expect(decisionOpen(state)).toBe(false);
    expect(wipeoutTable(state).t3.status).toBe('took');
  });

  it("the team's answer stays when a member is kicked", () => {
    let state = must(next(teamGame(quiz2, [['Анна', 'Богдан'], ['Віра']]), 0, () => 0));
    state = must(submitAnswer(state, 't1', { type: 'single', optionId: 'b' }, 1000));
    state = must(removePlayer(state, 'm1', 2000));
    expect(recordOf(state, 0, 't1')).toBeDefined();
  });
});

describe('team game: stale captains', () => {
  it('moving the chosen captain out of the team forgets the choice', () => {
    let lobby = must(assignTeam(must(assignTeam(teamLobby(quiz2, 'Анна', 'Богдан'), 'm1', 't1')), 'm2', 't1'));
    lobby = must(setCaptain(lobby, 't1', 'm2'));
    expect(must(assignTeam(lobby, 'm2', 't2')).teams?.captains).toEqual({});
    expect(must(assignTeam(lobby, 'm2', null)).teams?.captains).toEqual({});
  });

  it('a deal or the dice that move the chosen captain forget the choice; start keeps only valid captains', () => {
    let lobby = must(assignTeam(must(assignTeam(teamLobby(quiz2, 'Анна', 'Богдан', 'Віра'), 'm1', 't1')), 'm2', 't1'));
    lobby = must(setCaptain(lobby, 't1', 'm2'));
    const dealt = must(dealTeams(must(setTeamForm(lobby, 'random')), seq(0.9, 0.9)));
    const t1 = dealt.teams?.members.filter((m) => m.teamId === 't1').map((m) => m.id) ?? [];
    // перемішування лишає порядок m1, m2, m3 → Червоні, Сині, Червоні: m2 пішов із Червоних
    expect(t1).toEqual(['m1', 'm3']);
    expect(dealt.teams?.captains).toEqual({});
    const rolled = must(rollTeamRest(must(startTeamDice(must(setTeamForm(lobby, 'dice')))), seq(0.01, 0.99, 0.5)));
    // m2 кинув 6 → перша смуга (Червоні) разом із m3 (4): вибір лишається; m1 (1) — у Синіх
    expect(rolled.teams?.members.map((m) => m.teamId)).toEqual(['t2', 't1', 't1']);
    expect(rolled.teams?.captains).toEqual({ t1: 'm2' });
    const flipped = must(rollTeamRest(must(startTeamDice(must(setTeamForm(lobby, 'dice')))), seq(0.99, 0.01, 0.5)));
    // тепер m2 кинув 1 → у Синіх: вибір Червоних забуто
    expect(flipped.teams?.members.map((m) => m.teamId)).toEqual(['t1', 't2', 't1']);
    expect(flipped.teams?.captains).toEqual({});
    // вибір капітана, що вже не в цій команді (стан зібрано вручну): на старті його немає
    const stale: GameState = { ...lobby, teams: { ...lobby.teams!, captains: { t1: 'm3' } } };
    expect(must(start(stale)).teams?.captains).toEqual({});
  });
});

describe('team game: guards', () => {
  it('addPlayer and pickTeam after the start → wrong_phase', () => {
    const game = teamGame(quiz2, [['Анна'], ['Богдан']]);
    expect(addPlayer(game, { id: 'm9', nickname: 'Пізній' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pickTeam(game, 'm1', 't2')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('setTeamForm and startTeamDice in a solo game → wrong_phase', () => {
    const solo = createGame(makeRoundsQuiz([classicRound('r1', [single])]));
    expect(setTeamForm(solo, 'dice')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(startTeamDice(solo)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('after a closed tour «dice» again keeps the throws for show, another form clears them', () => {
    const closed = must(rollTeamRest(must(startTeamDice(must(setTeamForm(teamLobby(quiz2, 'Анна', 'Богдан'), 'dice')))), seq(0.9, 0.1)));
    expect(closed.teams?.dice?.tour).toEqual([]);
    expect(must(setTeamForm(closed, 'dice')).teams?.dice).toEqual(closed.teams?.dice);
    expect(must(setTeamForm(closed, 'host')).teams?.dice).toBeNull();
  });
});

describe('team game: auction (27b)', () => {
  it('the captain bids for the team from the shared score', () => {
    const quiz = teamQuiz([classicRound('r1', [single]), auctionRound('r2', [withId(single, 'a1')])], 2);
    let s = teamGame(quiz, [
      ['Олена', 'Тарас'],
      ['Віра', 'Хосе'],
    ]);
    s = must(next(s, 0));
    s = must(next(must(lock(s)), 1000));
    s = must(next(s, 2000));
    s = must(adjustScore(s, 't1', 700, 3000));
    s = must(adjustScore(s, 't2', 300, 3000));
    s = must(next(must(next(s, 4000)), 5000));
    expect(s.phase).toBe('wager');
    expect(s.final?.limits).toEqual({ t1: 700, t2: 300 });
    // Учасник не є гравцем рушія: ставку робить капітан за команду (перевірка act — на сервері).
    expect(placeWager(s, 'm1', 100, 6000, () => 0)).toEqual({ ok: false, error: 'not_found' });
    s = must(placeWager(s, 't2', 100, 6000, () => 0));
    s = must(placeWager(s, 't1', 200, 6000, () => 0));
    // Межа — спільний рахунок команди: t2 (300) не перебиває 400.
    const higher = must(placeWager(must(placeWager(s, 't2', 300, 6000, () => 0)), 't1', 400, 6000, () => 0));
    expect(placeWager(higher, 't2', 500, 6000, () => 0)).toEqual({ ok: false, error: 'bid_over' });
    expect(s.final?.wagers).toEqual({ t1: 200 });
    s = must(next(s, 7000));
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].final?.wagers).toEqual({ t1: 200 });
  });
});

describe('team game: bets (27a)', () => {
  it('the captain bets for the team from the shared score', () => {
    const quiz = teamQuiz([classicRound('r1', [single]), betsRound('r2', [withId(single, 'b1')])], 2);
    let s = teamGame(quiz, [
      ['Олена', 'Тарас'],
      ['Віра', 'Хосе'],
    ]);
    s = must(next(s, 0));
    s = must(next(must(lock(s)), 1000));
    s = must(next(s, 2000));
    expect(s.phase).toBe('round_end');
    s = must(adjustScore(s, 't1', 700, 3000));
    s = must(adjustScore(s, 't2', 300, 3000));
    s = must(next(must(next(s, 4000)), 5000));
    expect(s.phase).toBe('wager');
    expect(s.final?.limits).toEqual({ t1: 700, t2: 300 });
    // Учасник не є гравцем рушія: ставку робить капітан за команду (перевірка act — на сервері).
    expect(placeWager(s, 'm2', 200, 6000, () => 0)).toEqual({ ok: false, error: 'not_found' });
    s = must(placeWager(s, 't1', 500, 6000, () => 0));
    expect(s.final?.wagers).toEqual({ t1: 500 });
    s = must(placeWager(s, 't2', 300, 6000, () => 0));
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].final?.wagers).toEqual({ t1: 500, t2: 300 });
  });

  it('a team that skips the question has no answerer on the stage', () => {
    const quiz = teamQuiz([classicRound('r1', [single]), betsRound('r2', [withId(single, 'b1')])], 2, 'rotate');
    let s = teamGame(quiz, [
      ['Олена', 'Тарас'],
      ['Віра', 'Хосе'],
    ]);
    s = must(next(s, 0));
    s = must(next(must(lock(s)), 1000));
    s = must(next(s, 2000));
    s = must(adjustScore(s, 't1', 700, 3000));
    s = must(adjustScore(s, 't2', 300, 3000));
    s = must(next(must(next(s, 4000)), 5000));
    // Лише t1 ставить; ведучий відкриває раніше — t2 пропускає.
    s = must(next(must(placeWager(s, 't1', 500, 6000, () => 0)), 7000));
    expect(s.phase).toBe('question');
    const answerers = stageView(s).teams?.teams.map((t) => [t.id, t.answererId !== null]);
    expect(answerers).toEqual([
      ['t1', true],
      ['t2', false],
    ]);
  });
});

describe('team game: player truth (28b)', () => {
  it("teams guess by captain; the author's team waits and earns the share", () => {
    const quiz = teamQuiz([classicRound('r1', [single]), truthRound('r2')], 2, 'rotate');
    let s = teamGame(quiz, [
      ['Олена', 'Тарас'],
      ['Віра', 'Хосе'],
    ]);
    // факти пишуть учасники; Тарас (m2, команда t1) — єдиний
    s = must(submitTruth(s, 'm2', 'Я грав в оркестрі', 0));
    expect(Object.keys(s.truth?.facts ?? {})).toEqual(['m2']);
    s = must(next(s, 0));
    s = must(next(must(lock(s)), 1000));
    s = must(next(s, 2000));
    s = must(next(must(next(s, 3000)), 4000, () => 0));
    expect(s.phase).toBe('question');
    const play = s.plays[s.questionIndex];
    expect(play.truth).toEqual({ authorId: 'm2', actorId: 't1', guessers: ['t2'] });
    // варіанти — імена учасників за абеткою
    expect(play.question.type === 'single' ? play.question.options : null).toEqual([
      { id: 'm3', text: 'Віра' },
      { id: 'm1', text: 'Олена' },
      { id: 'm2', text: 'Тарас' },
      { id: 'm4', text: 'Хосе' },
    ]);
    // на «Правді» відповідача немає: жодна команда (і команда автора) не позначена окремо
    expect(answeringTeams(s, play)).toEqual([]);
    expect(stageView(s).teams?.teams.map((t) => t.answererId)).toEqual([null, null]);
    // капітан команди автора не вгадує
    expect(actAnswer(s, 'm1', { type: 'single', optionId: 'm3' }, 5000)).toEqual({ ok: false, error: 'truth_own' });
    // капітан t2 помиляється — команда автора бере повну ціну
    s = must(actAnswer(s, 'm3', { type: 'single', optionId: 'm1' }, 5000));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, s.questionIndex, 't1')).toMatchObject({ answer: null, points: 300, grade: 'correct' });
    expect(recordOf(s, s.questionIndex, 't2')?.points).toBe(0);
    expect(s.players.find((p) => p.id === 't1')?.score).toBe(300);
  });
});
