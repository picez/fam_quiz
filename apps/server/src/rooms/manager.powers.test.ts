import { describe, expect, it } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, single4, slider, text, withId } from '@quiz/engine/testing';
import { GAME_STATE_VERSION } from '@quiz/engine';
import { defaultTeams, type Quiz, type QuizSettings } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { RoomManager, type Identity, type Room } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };
const RIGHT = { type: 'single', optionId: 'b' } as const;
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Кімната з ведучим і Олею, Петром, Ірою; перше запитання відкрито. */
function playing(quiz: Quiz) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(quiz, 'u1', 'q1');
  manager.connect(room, HOST);
  const ids = ['Оля', 'Петро', 'Іра'].map((name) => {
    const joined = manager.join(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  });
  const [olya, petro, ira] = ids;
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('question');
  return { scheduler, manager, room, olya, petro, ira };
}

const powers = (settings: Partial<QuizSettings> = {}) =>
  makeQuiz([single4, withId(text, 'q2')], { speedBonus: false, buffs: ['risk', 'scope', 'peek'], ...settings });

const meOf = (manager: RoomManager, room: Room, playerId: string) => {
  const view = manager.view(room, { role: 'player', playerId });
  if (view?.role !== 'player') throw new Error('no player view');
  return view.me;
};

describe('peek in a room (12h)', () => {
  it('a player peeks at someone who answered: needs a target, sees the answer, the target learns who, the stage and others never see the answer', () => {
    const { manager, room, olya, petro, ira } = playing(powers());
    const answer = { type: 'single', optionId: 'c' } as const;
    expect(manager.answer(room, ira, answer)).toEqual({ ok: true });
    expect(manager.buff(room, petro, 'peek')).toEqual({ ok: false, error: 'peek_target' });
    expect(manager.buff(room, petro, 'peek', olya)).toEqual({ ok: false, error: 'peek_target' });
    expect(manager.buff(room, petro, 'peek', ira)).toEqual({ ok: true });
    expect(meOf(manager, room, petro).buffs?.active?.peek).toEqual({ target: { playerId: ira, nickname: 'Іра' }, answer });
    expect(meOf(manager, room, ira).peekedBy).toMatchObject({ nickname: 'Петро' });
    expect(meOf(manager, room, olya).peekedBy).toBeNull();
    for (const who of [STAGE, { role: 'player', playerId: olya } as const]) {
      expect(JSON.stringify(manager.view(room, who))).not.toContain('"optionId":"c"');
    }
  });

  it('a team peeks at another team through its answerer; the captain who does not answer is not_answerer', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const quiz = makeRoundsQuiz([classicRound('r1', [single4, withId(single4, 'q2')])], {
      buffs: ['peek'],
      teams: { ...defaultTeams(2), answerer: 'chosen' },
    });
    const { room, members, teams } = startTeamGame(manager, quiz, [
      ['Оля', 'Петро', 'Іра'],
      ['Марко', 'Ната'],
    ]);
    manager.connect(room, HOST);
    const [red, blue] = teams;
    expect(manager.pickAnswerer(room, members.Оля, members.Петро, 'round')).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    expect(manager.answer(room, members.Марко, RIGHT)).toEqual({ ok: true });
    expect(manager.buff(room, members.Оля, 'peek', blue)).toEqual({ ok: false, error: 'not_answerer' });
    expect(manager.buff(room, members.Петро, 'peek', blue)).toEqual({ ok: true });
    expect(room.state.plays[0].buffs?.[red]).toMatchObject({ kind: 'peek', peek: blue });
    const redName = room.state.players.find((p) => p.id === red)?.nickname;
    for (const id of [members.Марко, members.Ната]) expect(meOf(manager, room, id).peekedBy?.nickname).toBe(redName);
    expect(meOf(manager, room, members.Петро).buffs?.active?.peek?.answer).toEqual(RIGHT);
  });
});

describe('risk in a room (12h)', () => {
  it('a silent risk is charged when the timer closes the question', () => {
    const { scheduler, manager, room, olya, petro, ira } = playing(powers());
    expect(manager.buff(room, olya, 'risk')).toEqual({ ok: true });
    expect(manager.answer(room, petro, RIGHT)).toEqual({ ok: true });
    expect(manager.answer(room, ira, RIGHT)).toEqual({ ok: true });
    scheduler.advance(60_000);
    expect(room.state.phase).not.toBe('question');
    expect(room.state.players.find((p) => p.id === olya)?.score).toBe(-1000);
    expect(room.state.plays[0].answers[olya]).toMatchObject({ answer: null, buff: 'risk', points: -1000 });
  });

  it('a bot room charges a silent risk by itself and goes on', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const created = manager.createAutopilot(makeQuiz([single, withId(single, 'q2')], { buffs: ['risk'], leaderboard: 'end' }), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room, playerId: marta } = created;
    manager.connect(room, { role: 'player', playerId: marta });
    const joined = manager.join(room.code, 'Тарас');
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    expect(manager.author(room, marta, { type: 'start' })).toEqual({ ok: true });
    for (let guard = 0; guard < 60 && room.state.phase !== 'question'; guard++) scheduler.advance(1000);
    expect(manager.buff(room, marta, 'risk')).toEqual({ ok: true });
    expect(manager.answer(room, joined.playerId, RIGHT)).toEqual({ ok: true });
    for (let guard = 0; guard < 120 && room.state.questionIndex === 0; guard++) scheduler.advance(1000);
    expect(room.state.plays[0].answers[marta]).toMatchObject({ answer: null, buff: 'risk', points: -1000 });
    expect(room.state.players.find((p) => p.id === marta)?.score).toBe(-1000);
    for (let guard = 0; guard < 200 && room.state.phase !== 'finished'; guard++) scheduler.advance(1000);
    expect(room.state.phase).toBe('finished');
  });
});

describe('binoculars across a restart (12h)', () => {
  it('the range is saved as version 21 and comes back the same', () => {
    const quiz = makeQuiz([slider, withId(single, 'q2')], { buffs: ['scope'] });
    const { scheduler, manager, room, olya, petro, ira } = playing(quiz);
    expect(manager.buff(room, olya, 'scope')).toEqual({ ok: true });
    const range = room.state.plays[0].buffs?.[olya]?.range;
    expect(range).toBeDefined();
    const before = meOf(manager, room, olya).buffs?.active?.scope;
    expect(before).toEqual({ kind: 'range', ...range });
    const saved = viaJson(manager.snapshot(room));
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);
    expect(GAME_STATE_VERSION).toBe(21);
    manager.freeze();
    const later = new RoomManager(scheduler, () => 0.5);
    const back = later.restore(saved) as Room;
    expect(back.state.plays[0].buffs?.[olya]?.range).toEqual(range);
    later.connect(back, HOST);
    for (const id of [olya, petro, ira]) later.connect(back, { role: 'player', playerId: id });
    expect(later.host(back, { type: 'resume' })).toEqual({ ok: true });
    expect(meOf(later, back, olya).buffs?.active?.scope).toEqual(before);
  });
});

describe('new debuffs in a room (12h)', () => {
  it('the host sends bubbles only when the quiz allows them; a quiz without the field keeps the old six', () => {
    const allowed = playing(makeQuiz([single, text], { debuffs: ['bubbles'] }));
    expect(allowed.manager.host(allowed.room, { type: 'debuff', playerId: allowed.petro, kind: 'bubbles' })).toEqual({ ok: true });
    const legacy = playing(makeQuiz([single, text]));
    expect(legacy.manager.host(legacy.room, { type: 'debuff', playerId: legacy.petro, kind: 'bubbles' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(legacy.manager.host(legacy.room, { type: 'debuff', playerId: legacy.petro, kind: 'fog' })).toEqual({ ok: true });
  });

  it('a player buys the torch for the default price', () => {
    const { manager, room, olya, petro } = playing(makeQuiz([single, text], { debuffs: ['torch'] }));
    expect(manager.host(room, { type: 'adjust', playerId: olya, points: 250 })).toEqual({ ok: true });
    expect(manager.buyDebuff(room, olya, petro, 'torch')).toEqual({ ok: true });
    expect(room.state.players.find((p) => p.id === olya)?.score).toBe(50);
  });
});
