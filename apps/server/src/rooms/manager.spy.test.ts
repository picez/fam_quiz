import { describe, expect, it } from 'vitest';
import { defaultTeams, quizSchema } from '@quiz/shared';
import { spyQuiz } from '@quiz/engine/testing';
import { RoomManager, type Identity, type Room } from './manager';
import { FakeScheduler } from '../testing/fake-scheduler';

// «Шпигун» (38) через менеджер: асоціації, голоси й останній шанс з телефонів, відновлення зі збереженим шпигуном.

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  manager.connect(room, { role: 'player', playerId: joined.playerId });
  return joined.playerId;
}

/** Чотири гравці, rng 0.5 → шпигун — третій (індекс 2); перше запитання відкрите, етап words. */
function opened() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(spyQuiz());
  manager.connect(room, HOST);
  manager.connect(room, STAGE);
  const ids = ['Олена', 'Тарас', 'Петро', 'Марта'].map((name) => enter(manager, room, name)) as [string, string, string, string];
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  const hostSpy = () => {
    const view = manager.view(room, HOST);
    return view?.role === 'host' ? view.spy : undefined;
  };
  const me = (id: string) => {
    const view = manager.view(room, { role: 'player', playerId: id });
    return view?.role === 'player' ? view.me.spy : undefined;
  };
  const sceneStage = () => {
    const view = manager.view(room, STAGE);
    return view?.role === 'stage' ? view.spy?.stage : undefined;
  };
  return { scheduler, manager, room, ids, hostSpy, me, sceneStage };
}

const WORDS = ['запах', 'ранок', 'гарячий', 'ложка'];

describe('spy (38) in the room manager', () => {
  it('words, votes and a last chance through the room', () => {
    const { manager, room, ids, hostSpy, me, sceneStage } = opened();
    const [olena, taras, petro, marta] = ids;
    expect(hostSpy()?.spyId).toBe(petro);
    expect(me(petro)?.word).toBe('чай');
    expect(me(olena)?.word).toBe('кава');
    ids.forEach((id, i) => expect(manager.spyWord(room, id, WORDS[i]!)).toEqual({ ok: true }));
    expect(sceneStage()).toBe('vote');
    expect(manager.spyWord(room, olena, 'ще')).toEqual({ ok: false, error: 'wrong_phase' });
    for (const id of [olena, taras, marta]) expect(manager.spyVote(room, id, petro)).toEqual({ ok: true });
    expect(me(petro)?.guessing).toBe(false);
    expect(manager.spyVote(room, petro, taras)).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    expect(sceneStage()).toBe('guess');
    expect(me(petro)?.guessing).toBe(true);
    expect(manager.spyGuess(room, olena, 'кава')).toEqual({ ok: false, error: 'not_allowed' });
    expect(manager.spyGuess(room, petro, 'кава')).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
    expect(ids.map((id) => room.state.plays[0]!.answers[id]?.points)).toEqual([1000, 1000, 500, 1000]);
  });

  it('a spy taken at open is hidden from the scene and the other phones until reveal', () => {
    const { manager, room, ids } = opened();
    const [olena, , petro] = ids;
    const stage = JSON.stringify(manager.view(room, STAGE));
    const phone = JSON.stringify(manager.view(room, { role: 'player', playerId: olena }));
    for (const json of [stage, phone]) {
      expect(json).not.toContain('чай');
      expect(json).not.toContain('spyId');
    }
    expect(stage).not.toContain('кава');
    expect(JSON.stringify(manager.view(room, { role: 'player', playerId: petro }))).not.toContain('кава');
  });

  it('bad bodies are refused and a stranger cannot act', () => {
    const { manager, room, ids } = opened();
    expect(manager.spyWord(room, ids[0], '   ')).toEqual({ ok: false, error: 'think_word' });
    expect(manager.spyWord(room, 'nobody', 'слово')).not.toEqual({ ok: true });
  });

  it('a restored room keeps the spy, the words and the votes', () => {
    const { scheduler, manager, room, ids, hostSpy, me } = opened();
    const [olena, taras, petro, marta] = ids;
    ids.forEach((id, i) => expect(manager.spyWord(room, id, WORDS[i]!)).toEqual({ ok: true }));
    expect(manager.spyVote(room, olena, petro)).toEqual({ ok: true });
    expect(manager.spyVote(room, marta, taras)).toEqual({ ok: true });
    const before = { host: hostSpy(), phones: ids.map((id) => me(id)) };
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.1);
    const back = next.restore(saved) as Room;
    const view = next.view(back, HOST);
    expect(view?.role === 'host' && view.spy).toEqual(before.host);
    expect(view?.role === 'host' && view.spy?.spyId).toBe(petro);
    ids.forEach((id, i) => {
      const phone = next.view(back, { role: 'player', playerId: id });
      expect(phone?.role === 'player' && phone.me.spy).toEqual(before.phones[i]);
    });
  });

  it('a team quiz with a spy does not pass the quiz schema (so it cannot be saved or started)', () => {
    const result = quizSchema.safeParse(spyQuiz({ teams: defaultTeams(2) }));
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.message)).toContain('spy_teams');
  });
});
