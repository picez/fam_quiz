import { describe, expect, it } from 'vitest';
import { bool, classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { defaultTeams, type GameView, type LikePayload, type Phase, type PlayerView, type Quiz } from '@quiz/shared';
import type { LikeKey } from '../like-store';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { likesView } from './likes';
import { RoomManager, type Identity, type Room, type RoomEvent } from './manager';

/** Лайки зрізу гравця (у зрізах сцени й пульта поля немає). */
const likesOf = (view: GameView | null) => (view as PlayerView | null)?.likes;
const STAGE: Identity = { role: 'stage', playerId: null };
const HOST: Identity = { role: 'host', playerId: null };
const QUIZ_ID = 'quiz-17a';

function likeQuiz(settings: Parameters<typeof makeRoundsQuiz>[1] = {}): Quiz {
  return {
    ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1'), withId(single, 'q2'), withId(single, 'q3')])], { buffs: ['swap'], leaderboard: 'end', ...settings }),
    spares: [withId(bool, 's1')],
  };
}

const none = (): Set<LikeKey> => new Set();

function world() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const events: { room: Room; event: RoomEvent }[] = [];
  manager.onEvent((room, event) => events.push({ room, event }));
  const room = manager.create(likeQuiz(), 'a', QUIZ_ID);
  manager.connect(room, HOST);
  const enter = (nickname: string, userId: string | null) => {
    const joined = manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olya = enter('Оля', 'o');
  const petro = enter('Петро', 'p');
  const guest = enter('Гість', null);
  const to = (phase: Phase, index?: number) => {
    for (let i = 0; i < 50 && !(room.state.phase === phase && (index === undefined || room.state.questionIndex === index)); i++) {
      expect(manager.host(room, { type: room.state.phase === 'question' ? 'lock' : 'next' })).toEqual({ ok: true });
    }
    expect(room.state.phase).toBe(phase);
  };
  const start = () => expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  const likes = (playerId: string) => likesOf(manager.view(room, { role: 'player', playerId }));
  const likeEvents = () => events.filter((e) => e.event.type === 'like').map((e) => (e.event as Extract<RoomEvent, { type: 'like' }>).change);
  const ready = (author: string | null = 'a') => manager.setLikes(room, { author, mine: new Map([['o', none()], ['p', none()]]) });
  const like = (by: string, payload: LikePayload) => manager.like(room, by, payload);
  return { scheduler, manager, events, room, olya, petro, guest, to, start, likes, likeEvents, ready, like };
}

describe('likes in the room (17a)', () => {
  it('before the read there is no heart and a like is unavailable', () => {
    const w = world();
    w.start();
    w.to('reveal', 0);
    expect(w.likes(w.olya)).toBeUndefined();
    expect('likes' in (w.manager.view(w.room, { role: 'player', playerId: w.olya }) as PlayerView)).toBe(false);
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: false, error: 'like_unavailable' });
    expect(w.likeEvents()).toEqual([]);
  });

  it('Оля hearts the revealed question; a repeat changes nothing; stage and host never see likes', () => {
    const w = world();
    w.ready();
    w.start();
    w.to('reveal', 0);
    expect(w.likes(w.olya)).toEqual({ question: false });
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: true });
    expect(w.likeEvents()).toEqual([{ userId: 'o', kind: 'question', questionId: 'q1', gameId: w.room.id, quizId: QUIZ_ID, liked: true }]);
    expect(w.likes(w.olya)).toEqual({ question: true });
    expect(w.likes(w.petro)).toEqual({ question: false });
    expect('likes' in w.manager.view(w.room, STAGE)!).toBe(false);
    expect('likes' in w.manager.view(w.room, HOST)!).toBe(false);
    const count = w.events.length;
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: true });
    expect(w.events.length).toBe(count);
  });

  it('the guest is refused and sees no heart', () => {
    const w = world();
    w.ready();
    w.start();
    w.to('reveal', 0);
    expect(w.like(w.guest, { target: 'question', liked: true })).toEqual({ ok: false, error: 'like_guest' });
    expect(w.likes(w.guest)).toBeUndefined();
    expect(w.like('nobody', { target: 'question', liked: true })).toEqual({ ok: false, error: 'not_found' });
  });

  it('the author may not like their own question', () => {
    const w = world();
    w.ready('o');
    w.start();
    w.to('reveal', 0);
    expect(w.likes(w.olya)).toBeUndefined();
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: false, error: 'like_self' });
    expect(w.likes(w.petro)).toEqual({ question: false });
  });

  it('a late tap after Next likes neither question', () => {
    const w = world();
    w.ready();
    w.start();
    w.to('reveal', 0);
    w.to('question', 1);
    expect(w.likes(w.olya)).toBeUndefined();
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(w.likeEvents()).toEqual([]);
  });

  it('a player who swapped hearts the spare they saw', () => {
    const w = world();
    w.ready();
    w.start();
    w.to('question', 1);
    expect(w.manager.buff(w.room, w.petro, 'swap')).toEqual({ ok: true });
    expect(w.manager.host(w.room, { type: 'lock' })).toEqual({ ok: true });
    w.to('reveal', 1);
    expect(w.like(w.petro, { target: 'question', liked: true })).toEqual({ ok: true });
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: true });
    expect(w.likeEvents().map((c) => [c.userId, c.questionId])).toEqual([
      ['p', 's1'],
      ['o', 'q2'],
    ]);
  });

  it('after the game: the quiz, the host and other account players; quiz and host are closed during the reveal', () => {
    const w = world();
    w.ready();
    w.start();
    w.to('reveal', 0);
    expect(w.like(w.olya, { target: 'quiz', liked: true })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(w.like(w.olya, { target: 'host', liked: true })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(w.like(w.olya, { target: 'player', id: w.petro, liked: true })).toEqual({ ok: false, error: 'wrong_phase' });
    w.to('finished');
    expect(w.likes(w.olya)).toEqual({ quiz: false, host: false, people: [{ id: w.petro, nickname: 'Петро', liked: false }] });
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(w.like(w.olya, { target: 'player', id: w.petro, liked: true })).toEqual({ ok: true });
    expect(w.like(w.olya, { target: 'quiz', liked: true })).toEqual({ ok: true });
    expect(w.like(w.olya, { target: 'host', liked: true })).toEqual({ ok: true });
    expect(w.likes(w.olya)).toEqual({ quiz: true, host: true, people: [{ id: w.petro, nickname: 'Петро', liked: true }] });
    expect(w.likeEvents()).toEqual([
      { userId: 'o', kind: 'player', targetUserId: 'p', gameId: w.room.id, quizId: QUIZ_ID, liked: true },
      { userId: 'o', kind: 'quiz', gameId: w.room.id, quizId: QUIZ_ID, liked: true },
      { userId: 'o', kind: 'host', targetUserId: 'a', gameId: w.room.id, quizId: QUIZ_ID, liked: true },
    ]);
    expect(w.like(w.olya, { target: 'player', id: w.petro, liked: false })).toEqual({ ok: true });
    expect(w.likes(w.olya)?.people).toEqual([{ id: w.petro, nickname: 'Петро', liked: false }]);
  });

  it('the same account on two places is one «me»; a guest target is unavailable, an unknown one not found', () => {
    const w = world();
    const second = w.manager.join(w.room.code, 'Оля-2', 'o');
    if (!second.ok) throw new Error(second.error);
    const twin = second.playerId;
    w.ready();
    w.start();
    w.to('finished');
    expect(w.likes(w.olya)?.people).toEqual([{ id: w.petro, nickname: 'Петро', liked: false }]);
    expect(w.likes(w.petro)?.people).toEqual([{ id: w.olya, nickname: 'Оля', liked: false }]);
    expect(w.like(w.olya, { target: 'player', id: twin, liked: true })).toEqual({ ok: false, error: 'like_self' });
    expect(w.like(w.olya, { target: 'player', id: w.olya, liked: true })).toEqual({ ok: false, error: 'like_self' });
    expect(w.like(w.olya, { target: 'player', id: w.guest, liked: true })).toEqual({ ok: false, error: 'like_unavailable' });
    expect(w.like(w.olya, { target: 'player', id: 'nobody', liked: true })).toEqual({ ok: false, error: 'not_found' });
    expect(w.likeEvents()).toEqual([]);
  });

  it('the host who is also a player may not like themselves as host', () => {
    const w = world();
    w.room.playerUsers.set(w.petro, 'a');
    w.manager.setLikes(w.room, { author: 'a', mine: new Map([['a', none()], ['o', none()]]) });
    w.start();
    w.to('finished');
    expect(w.likes(w.petro)).toEqual({ people: [{ id: w.olya, nickname: 'Оля', liked: false }] });
    expect(w.like(w.petro, { target: 'host', liked: true })).toEqual({ ok: false, error: 'like_self' });
    expect(w.like(w.petro, { target: 'quiz', liked: true })).toEqual({ ok: false, error: 'like_self' });
  });

  it('autopilot: no host heart', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const created = manager.createAutopilot(likeQuiz(), 'a', QUIZ_ID, 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room } = created;
    manager.connect(room, { role: 'player', playerId: created.playerId });
    const joined = manager.join(room.code, 'Оля', 'o');
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    manager.setLikes(room, { author: 'a', mine: new Map([['o', none()], ['a', none()]]) });
    expect(manager.author(room, created.playerId, { type: 'start' })).toEqual({ ok: true });
    expect(manager.author(room, created.playerId, { type: 'end' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('finished');
    const view = likesOf(manager.view(room, { role: 'player', playerId: joined.playerId }));
    expect(view).toEqual({ quiz: false, people: [{ id: created.playerId, nickname: 'Марта', liked: false }] });
    expect(manager.like(room, joined.playerId, { target: 'host', liked: true })).toEqual({ ok: false, error: 'like_unavailable' });
    // Автор-гравець не бачить ні свого запитання, ні вікторини, ні ведучого.
    expect(likesOf(manager.view(room, { role: 'player', playerId: created.playerId }))).toEqual({ people: [{ id: joined.playerId, nickname: 'Оля', liked: false }] });
  });

  it('a team game: the person likes the team question; people are persons, not teams', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const events: RoomEvent[] = [];
    manager.onEvent((_, event) => events.push(event));
    const quiz = likeQuiz({ teams: defaultTeams(2), buffs: [] });
    const { room, members } = startTeamGame(manager, quiz, [['Оля', 'Петро'], ['Віра']], { Оля: 'o', Петро: 'p' }, 'a');
    room.quizId = QUIZ_ID;
    manager.connect(room, HOST);
    manager.setLikes(room, { author: 'a', mine: new Map([['o', none()], ['p', none()]]) });
    while (room.state.phase !== 'reveal') expect(manager.host(room, { type: room.state.phase === 'question' ? 'lock' : 'next' })).toEqual({ ok: true });
    expect(likesOf(manager.view(room, { role: 'player', playerId: members['Оля'] }))).toEqual({ question: false });
    expect(manager.like(room, members['Оля'], { target: 'question', liked: true })).toEqual({ ok: true });
    const change = events.flatMap((e) => (e.type === 'like' ? [e.change] : []));
    expect(change).toEqual([{ userId: 'o', kind: 'question', questionId: room.state.plays[room.state.questionIndex].question.id, gameId: room.id, quizId: QUIZ_ID, liked: true }]);
    expect(manager.like(room, room.state.players[0].id, { target: 'question', liked: true })).toEqual({ ok: false, error: 'not_found' });
    expect(manager.host(room, { type: 'end' })).toEqual({ ok: true });
    while ((room.state.phase as Phase) !== 'finished') expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(likesOf(manager.view(room, { role: 'player', playerId: members['Оля'] }))?.people).toEqual([{ id: members['Петро'], nickname: 'Петро', liked: false }]);
    expect(likesView(room, members['Віра'])).toBeUndefined();
  });

  it('13 toggles within 10 s: the thirteenth is too soon; after 10 s it works again', () => {
    const w = world();
    w.ready();
    w.start();
    w.to('reveal', 0);
    for (let i = 0; i < 12; i++) expect(w.like(w.olya, { target: 'question', liked: i % 2 === 0 })).toEqual({ ok: true });
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: false, error: 'too_soon' });
    expect(w.like(w.petro, { target: 'question', liked: true })).toEqual({ ok: true });
    w.scheduler.advance(10_000);
    expect(w.room.state.phase).toBe('reveal');
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: true });
    expect(w.likes(w.olya)).toEqual({ question: true });
  });

  it('setLikes merges: the author stays, accounts are replaced', () => {
    const w = world();
    w.ready();
    w.manager.setLikes(w.room, { mine: new Map([['o', new Set(['q:q1'])]]) });
    expect(w.room.likes.author).toBe('a');
    expect(w.room.likes.mine.get('o')).toEqual(new Set(['q:q1']));
    expect(w.room.likes.mine.get('p')).toEqual(new Set());
    const count = w.events.length;
    w.manager.setLikes(w.room, { mine: new Map([['o', new Set(['q:q1'])]]) });
    expect(w.events.length).toBe(count);
  });

  it('a room without a quiz or a host account has no likes at all', () => {
    const w = world();
    w.ready();
    w.room.quizId = null;
    w.start();
    w.to('reveal', 0);
    expect(w.likes(w.olya)).toBeUndefined();
    expect(w.like(w.olya, { target: 'question', liked: true })).toEqual({ ok: false, error: 'like_unavailable' });
  });
});
