import { describe, expect, it } from 'vitest';
import { classicRound, duels, finalRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { hostView, stageView } from '@quiz/engine';
import { defaultTeams } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { RoomManager, type Identity, type Room } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function quizOf(extra: Record<string, unknown> = {}) {
  return {
    ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1'), withId(single, 'q2')]), finalRound('rf', withId(single, 'qf'))], extra),
    duels,
  };
}

/** Четверо гравців на reveal після q1; Олена оголосила дуель Тарасу (етап declared → category після next). */
function soloRoom() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0);
  const room = manager.create(quizOf());
  manager.connect(room, HOST);
  const ids: Record<string, string> = {};
  for (const name of ['Олена', 'Тарас', 'Іра', 'Марко']) {
    const joined = manager.join(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    ids[name] = joined.playerId;
  }
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  for (const id of Object.values(ids)) manager.answer(room, id, correct);
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  expect(manager.declareDuel(room, ids['Олена'], ids['Тарас'])).toEqual({ ok: true });
  return { scheduler, manager, room, ids };
}

const namesOf = (list: { nickname: string }[]) => list.map((p) => p.nickname);

describe('duel bets through the manager', () => {
  it('moves a bet, rejects duellists and closes with the first duel question', () => {
    const { manager, room, ids } = soloRoom();
    expect(manager.duelBet(room, ids['Іра'], 'challenger')).toEqual({ ok: true });
    expect(namesOf(stageView(room.state).duel?.bets?.challenger ?? [])).toEqual(['Іра']);
    expect(manager.duelBet(room, ids['Іра'], 'opponent')).toEqual({ ok: true });
    const moved = hostView(room.state).duel?.bets;
    expect(namesOf(moved?.challenger ?? [])).toEqual([]);
    expect(namesOf(moved?.opponent ?? [])).toEqual(['Іра']);
    expect(manager.duelBet(room, ids['Олена'], 'opponent')).toEqual({ ok: false, error: 'duel_bet_self' });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.duelBet(room, ids['Марко'], 'challenger')).toEqual({ ok: true });
    expect(manager.duelCategory(room, ids['Олена'], 'dc1')).toEqual({ ok: true });
    expect(manager.duelBet(room, ids['Марко'], null)).toEqual({ ok: false, error: 'duel_bets_closed' });
  });

  it('a restart keeps the bets', () => {
    const { scheduler, manager, room, ids } = soloRoom();
    manager.duelBet(room, ids['Іра'], 'challenger');
    manager.duelBet(room, ids['Марко'], 'opponent');
    manager.host(room, { type: 'next' });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const later = new RoomManager(scheduler, () => 0);
    const back = later.restore(saved) as Room;
    const bets = hostView(back.state).duel?.bets;
    expect(namesOf(bets?.challenger ?? [])).toEqual(['Іра']);
    expect(namesOf(bets?.opponent ?? [])).toEqual(['Марко']);
  });
});

describe('duel bets in a team game', () => {
  function teamRoom() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0);
    const { room, members, teams } = startTeamGame(
      manager,
      quizOf({ teams: defaultTeams(3) }),
      [['Оля', 'Петро'], ['Віра', 'Ігор'], ['Марко', 'Ната']],
    );
    manager.connect(room, HOST);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    for (const id of Object.values(members)) manager.answer(room, id, correct);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.declareDuel(room, members['Оля'], teams[1])).toEqual({ ok: true });
    return { manager, room, members, teams };
  }

  it('only the captain of a third team bets, for the team; a duellist team cannot', () => {
    const { manager, room, members, teams } = teamRoom();
    expect(manager.duelBet(room, members['Ната'], 'challenger')).toEqual({ ok: false, error: 'not_captain' });
    expect(manager.duelBet(room, members['Марко'], 'challenger')).toEqual({ ok: true });
    expect(room.state.duel?.bets).toEqual({ [teams[2]]: 'challenger' });
    expect(manager.duelBet(room, members['Оля'], 'challenger')).toEqual({ ok: false, error: 'duel_bet_self' });
    expect(manager.duelBet(room, members['Віра'], 'challenger')).toEqual({ ok: false, error: 'duel_bet_self' });
  });
});
