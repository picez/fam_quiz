import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, think, thinkRound } from '@quiz/engine/testing';
import { thinkPlaces } from '@quiz/engine';
import type { Quiz, ThinkWord } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, THINK_WORDS_PER_SECOND, type Identity, type Room, type RoomEvent } from './manager';

// «Думай інакше» (35) через менеджер: слова ведучого лише на пульт, частота, автор автопілота, «Показати» без слів.

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };
const red: ThinkWord = { word: 'червоний', synonyms: ['багряний'] };

/** r1 «Думай інакше»: t1 без слів, t2 і t3 — «червоний»; r2 класика. */
const thinkQuiz = (first: ThinkWord[] = []): Quiz =>
  makeRoundsQuiz([thinkRound('r1', [think('t1', first), think('t2', [red]), think('t3', [red])], { lives: 2, points: 1000 }), classicRound('r2', [single])]);

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Відкрито t1 (без слів) з ведучим, сценою, Оленою й Тарасом. */
function hosted(quiz: Quiz = thinkQuiz()) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(quiz);
  manager.connect(room, HOST);
  manager.connect(room, STAGE);
  const people = ['Олена', 'Тарас'].map((name) => enter(manager, room, name));
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('question');
  return { scheduler, manager, room, people, events };
}

describe('think (35) in the room manager', () => {
  it('think words reach only the host', () => {
    const { manager, room, people, events } = hosted();
    expect(manager.host(room, { type: 'think-words', words: [red] })).toEqual({ ok: true });
    expect(manager.answer(room, people[0].playerId, { type: 'think', value: 'Зелений' })).toEqual({ ok: true });
    const hidden = [STAGE, ...people.map((p) => p.identity)].map((who) => JSON.stringify(manager.view(room, who)));
    for (const json of [...hidden, JSON.stringify(events)]) {
      expect(json).not.toContain('червоний');
      expect(json).not.toContain('багряний');
    }
    expect(JSON.stringify(manager.view(room, people[1].identity))).not.toContain('Зелений');
    expect(JSON.stringify(manager.view(room, HOST))).toContain('багряний');
  });

  it('words are rate limited', () => {
    const { manager, room, scheduler } = hosted();
    for (let i = 0; i < THINK_WORDS_PER_SECOND; i++) expect(manager.host(room, { type: 'think-words', words: [{ word: `слово${i}`, synonyms: [] }] })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'think-words', words: [red] })).toEqual({ ok: false, error: 'too_soon' });
    scheduler.advance(1000);
    expect(manager.host(room, { type: 'think-words', words: [red] })).toEqual({ ok: true });
  });

  it('reveal without words is refused, then works', () => {
    const { manager, room } = hosted();
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: false, error: 'think_no_words' });
    expect(manager.host(room, { type: 'think-words', words: [red] })).toEqual({ ok: true });
    // Після таймера — лише раз.
    expect(manager.host(room, { type: 'think-words', words: [{ word: 'синій', synonyms: [] }] })).toEqual({ ok: false, error: 'think_words_closed' });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
  });

  it('the autopilot author cannot set words', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const created = manager.createAutopilot(thinkQuiz([red]), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    expect(manager.author(created.room, created.playerId, { type: 'think-words', words: [red] })).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('the autopilot plays a think round with the author watching', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
    const created = manager.createAutopilot(thinkQuiz([red]), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room } = created;
    manager.connect(room, { role: 'player', playerId: created.playerId });
    const people = ['Тарас', 'Віра'].map((name) => enter(manager, room, name));
    expect(manager.author(room, created.playerId, { type: 'start' })).toEqual({ ok: true });
    let ended = null as ReturnType<typeof thinkPlaces> | null;
    for (let i = 0; i < 800 && room.state.phase !== 'finished'; i++) {
      const play = room.state.plays[room.state.questionIndex];
      if (room.state.phase === 'question' && play?.think !== undefined) {
        expect(Object.keys(play.think.lives)).not.toContain(created.playerId);
        expect(manager.answer(room, created.playerId, { type: 'think', value: 'ксилофон' })).toEqual({ ok: false, error: 'think_spectator' });
        // Тарас завжди в безпеці, Віра збігається: на t1 вона губить життя, на t2 вибуває, раунд кінчається.
        if (play.answers[people[0].playerId] === undefined) manager.answer(room, people[0].playerId, { type: 'think', value: 'ксилофон' });
        if (play.answers[people[1].playerId] === undefined) manager.answer(room, people[1].playerId, { type: 'think', value: 'червоний' });
      }
      if (room.state.phase === 'round_end' && room.state.roundIndex === 0) ended = thinkPlaces(room.state, 0);
      scheduler.advance(500);
    }
    expect(room.state.phase).toBe('finished');
    expect(ended?.map((r) => [r.id, r.place, r.points])).toEqual([
      [people[0].playerId, 1, 1000],
      [people[1].playerId, 2, 0],
    ]);
    expect(room.state.adjustments.filter((a) => a.source === 'think').map((a) => [a.playerId, a.points])).toEqual([[people[0].playerId, 1000]]);
  });
});
