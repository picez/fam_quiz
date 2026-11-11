import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, pin } from '@quiz/engine/testing';
import type { GameView, PlayerView } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const pinsOf = (view: GameView | null) => (view as PlayerView | null)?.pinMarks;

/** Класика з одним запитанням-точкою; Оля й Петро на телефонах. */
function pinRoom() {
  const manager = new RoomManager(new FakeScheduler(), () => 0.5);
  const room = manager.create(makeRoundsQuiz([classicRound('r1', [pin], { speedBonus: false })]), 'a', 'quiz-1');
  manager.connect(room, HOST);
  const enter = (nickname: string) => {
    const joined = manager.join(room.code, nickname, null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olya = enter('Оля');
  const petro = enter('Петро');
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  while (room.state.phase !== 'question') expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  const phone = (playerId: string) => manager.view(room, { role: 'player', playerId });
  return { manager, room, olya, petro, phone };
}

describe('pin question: phones see everyone’s pins after the reveal (29b)', () => {
  it('no other pin reaches a phone before the reveal; on the reveal every phone gets the same pins as the stage', () => {
    const { manager, room, olya, petro, phone } = pinRoom();
    expect(manager.answer(room, olya, { type: 'pin', x: 0.61, y: 0.5 })).toEqual({ ok: true });
    expect(pinsOf(phone(petro))).toBeNull();
    expect(JSON.stringify(phone(petro))).not.toContain('0.61');
    expect(manager.answer(room, petro, { type: 'pin', x: 0.52, y: 0.5 })).toEqual({ ok: true });
    expect(JSON.stringify(phone(olya))).not.toContain('0.52');
    while (room.state.phase !== 'reveal') expect(manager.host(room, { type: room.state.phase === 'question' ? 'lock' : 'next' })).toEqual({ ok: true });
    const stage = manager.view(room, { role: 'stage', playerId: null });
    const stagePins = stage?.role === 'stage' ? stage.pinMarks : undefined;
    for (const id of [olya, petro]) {
      expect(pinsOf(phone(id))?.map((mark) => [mark.nickname, mark.x, mark.y])).toEqual([
        ['Петро', 0.52, 0.5],
        ['Оля', 0.61, 0.5],
      ]);
      expect(pinsOf(phone(id))).toEqual(stagePins);
    }
  });
});
