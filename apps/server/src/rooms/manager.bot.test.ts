import { describe, expect, it } from 'vitest';
import { isAuthor } from '@quiz/engine';
import { classicRound, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import type { Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { likesView } from './likes';
import { AUTOPILOT_EMPTY_MS, HOST_ABSENCE_MS, RoomManager, type Identity, type Room, type RoomEvent } from './manager';

const quiz = (): Quiz => makeRoundsQuiz([classicRound('r1', [single, text, single])]);

function setup() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
  const events: { room: Room; event: RoomEvent }[] = [];
  manager.onEvent((room, event) => events.push({ room, event }));
  return { scheduler, manager, events };
}

function botRoom(manager: RoomManager): Room {
  const created = manager.createBotRoom(quiz(), 'q-bot');
  if (!created.ok) throw new Error(created.error);
  return created.room;
}

function enter(manager: RoomManager, room: Room, nickname: string, userId: string | null = null): { playerId: string; identity: Identity } {
  const joined = manager.join(room.code, nickname, userId);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { playerId: joined.playerId, identity };
}

function playing(manager: RoomManager): { room: Room; olya: { playerId: string; identity: Identity } } {
  const room = botRoom(manager);
  const olya = enter(manager, room, 'Оля', 'u-olya');
  expect(manager.botAct(room.code, 'start')).toEqual({ ok: true });
  return { room, olya };
}

describe('bot rooms (54)', () => {
  it('a bot room has the bot as host, a hidden lobby and no seat', () => {
    const { manager } = setup();
    const room = botRoom(manager);
    expect(room.hostUserId).toBe('quiz-bot');
    expect(room.quizId).toBe('q-bot');
    expect(room.lobby.visibility).toBe('hidden');
    expect(room.state.players).toEqual([]);
    expect(room.state.autopilot?.authorId).toBe('quiz-bot');
    expect(room.playerUsers.size).toBe(0);
    expect(room.playerTokens.size).toBe(0);
    expect(manager.botRooms()).toEqual([room]);
  });

  it('at most three unfinished bot rooms', () => {
    const { manager } = setup();
    // Звичайні кімнати не рахуються.
    manager.create(quiz(), 'u1', 'q1');
    const pilot = manager.createAutopilot(quiz(), 'u2', 'q2', 'Марта');
    expect(pilot.ok).toBe(true);
    const first = playing(manager).room;
    botRoom(manager);
    botRoom(manager);
    expect(manager.createBotRoom(quiz(), 'q-bot')).toEqual({ ok: false, error: 'bot_rooms_full' });
    expect(manager.botAct(first.code, 'end')).toEqual({ ok: true });
    expect(first.state.phase).toBe('finished');
    const fifth = manager.createBotRoom(quiz(), 'q-bot');
    expect(fifth.ok).toBe(true);
    expect(manager.botRooms()).toHaveLength(4);
  });

  it('a frozen manager refuses a new bot room', () => {
    const { manager } = setup();
    manager.freeze();
    expect(manager.createBotRoom(quiz(), 'q-bot')).toEqual({ ok: false, error: 'restarting' });
  });

  it('the bot room starts, pauses, resumes and ends from botAct', () => {
    const { manager, events } = setup();
    const room = botRoom(manager);
    expect(manager.botAct(room.code, 'start')).toEqual({ ok: false, error: 'no_players' });
    enter(manager, room, 'Оля');
    expect(manager.botAct(room.code, 'start')).toEqual({ ok: true });
    expect(room.state.phase).not.toBe('lobby');
    expect(manager.botAct(room.code, 'pause')).toEqual({ ok: true });
    expect(room.state.paused).toBe(true);
    expect(manager.botAct(room.code, 'resume')).toEqual({ ok: true });
    expect(room.state.paused).toBe(false);
    expect(manager.botAct(room.code, 'end')).toEqual({ ok: true });
    expect(room.state.phase).toBe('finished');

    const lobby = botRoom(manager);
    events.length = 0;
    expect(manager.botAct(lobby.code, 'end')).toEqual({ ok: true });
    expect(manager.get(lobby.code)).toBeUndefined();
    expect(events.some((e) => e.room === lobby && e.event.type === 'closed')).toBe(true);

    expect(manager.botAct('000000', 'start')).toEqual({ ok: false, error: 'game_not_found' });
    const hosted = manager.create(quiz(), 'u1', 'q1');
    expect(manager.botAct(hosted.code, 'end')).toEqual({ ok: false, error: 'game_not_found' });
    const pilot = manager.createAutopilot(quiz(), 'u2', 'q2', 'Марта');
    if (!pilot.ok) throw new Error(pilot.error);
    expect(manager.botAct(pilot.room.code, 'end')).toEqual({ ok: false, error: 'game_not_found' });
    expect(pilot.room.state.phase).toBe('lobby');
  });

  it('a player of a bot room cannot act as author', () => {
    const { manager } = setup();
    const room = botRoom(manager);
    const olya = enter(manager, room, 'Оля');
    expect(manager.author(room, olya.playerId, { type: 'start' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(room.state.phase).toBe('lobby');
  });

  it('no player of a bot room gets the author view, in the lobby or in play', () => {
    const { manager, scheduler } = setup();
    const room = botRoom(manager);
    const olya = enter(manager, room, 'Оля', 'u-olya');
    const petro = enter(manager, room, 'Петро');
    const authorOf = (id: string) => (manager.view(room, { role: 'player', playerId: id }) as unknown as { author?: unknown }).author;
    const check = () => {
      for (const p of room.state.players) {
        expect(isAuthor(room.state, p.id), p.nickname).toBe(false);
        expect(authorOf(p.id), p.nickname).toBeNull();
      }
    };
    expect(room.state.players).toHaveLength(2);
    check();
    expect(manager.botAct(room.code, 'start')).toEqual({ ok: true });
    for (let i = 0; i < 20 && room.state.phase !== 'question'; i++) scheduler.advance(1000);
    expect(room.state.phase).toBe('question');
    check();
    // Контроль: у звичайному автопілоті автор цей блок бачить, тож null вище дає саме бот.
    const pilot = manager.createAutopilot(quiz(), 'u-marta', 'q2', 'Марта');
    if (!pilot.ok) throw new Error(pilot.error);
    const marta = pilot.room.state.players[0]!;
    expect((manager.view(pilot.room, { role: 'player', playerId: marta.id }) as unknown as { author?: unknown }).author).not.toBeNull();
    expect([olya.playerId, petro.playerId]).not.toContain('quiz-bot');
  });

  it('a paused bot room resumes by itself after ten minutes', () => {
    const { manager, scheduler } = setup();
    const { room } = playing(manager);
    expect(manager.botAct(room.code, 'pause')).toEqual({ ok: true });
    expect(room.state.paused).toBe(true);
    scheduler.advance(HOST_ABSENCE_MS - 1);
    expect(room.state.paused).toBe(true);
    scheduler.advance(1);
    expect(room.state.paused).toBe(false);
  });

  it('a bot room is never saved: save is refused and an empty game ends', () => {
    const { manager, scheduler, events } = setup();
    const { room, olya } = playing(manager);
    // Дійти до запитання, щоб автозбереження звичайного автопілота спрацювало б.
    for (let i = 0; i < 20 && room.state.phase !== 'question'; i++) scheduler.advance(1000);
    expect(room.state.phase).toBe('question');
    expect(manager.save(room)).toEqual({ ok: false, error: 'not_allowed' });
    events.length = 0;
    manager.disconnect(room, olya.identity);
    scheduler.advance(AUTOPILOT_EMPTY_MS);
    expect(room.state.phase).toBe('finished');
    expect(events.some((e) => e.event.type === 'closed' && 'saved' in e.event && e.event.saved !== undefined)).toBe(false);
  });

  it('likes are off in a bot room', () => {
    const { manager } = setup();
    const { room, olya } = playing(manager);
    manager.setLikes(room, { author: 'quiz-bot', mine: new Map([['u-olya', new Set()]]) });
    expect(manager.botAct(room.code, 'end')).toEqual({ ok: true });
    expect(likesView(room, olya.playerId)).toBeUndefined();
    expect(manager.like(room, olya.playerId, { target: 'quiz', liked: true })).toEqual({ ok: false, error: 'like_unavailable' });
  });

  it('a restart keeps the bot room', () => {
    const { manager } = setup();
    const { room } = playing(manager);
    const saved = manager.snapshot(room);
    const next = setup().manager;
    const back = next.restore(saved);
    expect(back).not.toBeNull();
    expect(back!.hostUserId).toBe('quiz-bot');
    expect(back!.state.autopilot?.authorId).toBe('quiz-bot');
    expect(back!.lobby.visibility).toBe('hidden');
    expect(next.botRooms()).toEqual([back]);
  });
});
