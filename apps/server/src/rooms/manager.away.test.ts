import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { AWAY_EVENTS_PER_SECOND, AWAY_MS, defaultTeams, SPLASH_MS, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { RoomManager, type Identity, type Room, type RoomEvent } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const right = { type: 'single', optionId: 'b' } as const;
const PLAIN = { speedBonus: false } as const;
const twoSingles = (settings: Partial<Quiz['settings']> = {}) => makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], PLAIN)], settings);

function setup(quiz: Quiz, transitions = false) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { transitions });
  const room = manager.create(quiz);
  manager.connect(room, HOST);
  const events: RoomEvent[] = [];
  manager.onEvent((r, event) => {
    if (r === room) events.push(event);
  });
  return { scheduler, manager, room, events };
}

/** Гравець, що увійшов і відкрив одне з'єднання. */
function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Ведучий, Олена й Тарас на першому запитанні (без заставок). */
function playing(quiz: Quiz = twoSingles()) {
  const ctx = setup(quiz);
  const olena = enter(ctx.manager, ctx.room, 'Олена');
  const taras = enter(ctx.manager, ctx.room, 'Тарас');
  expect(ctx.manager.host(ctx.room, { type: 'start' })).toEqual({ ok: true });
  expect(ctx.manager.host(ctx.room, { type: 'next' })).toEqual({ ok: true });
  expect(ctx.room.state.phase).toBe('question');
  return { ...ctx, olena, taras };
}

/** Ведучий веде гру до наступного запитання (розкриття, таблиця…), по секунді між кроками. */
function toNextQuestion(manager: RoomManager, room: Room, scheduler: FakeScheduler) {
  const from = room.state.questionIndex;
  for (let i = 0; i < 6 && !(room.state.phase === 'question' && room.state.questionIndex !== from); i++) {
    scheduler.advance(1000);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  }
  expect(room.state.phase).toBe('question');
}

const awayOf = (room: Room, person: string, index = room.state.questionIndex) => room.state.plays[index]?.away?.[person];

describe('player:away in a room (12e)', () => {
  it('the room clock counts from leave to return; the host sees the mark on the live row', () => {
    const { scheduler, manager, room, olena } = playing();
    expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true });
    scheduler.advance(4000);
    expect(manager.away(room, olena.playerId, false, { ms: 4000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 4000, count: 1, since: null });
    const live = manager.view(room, HOST);
    const row = live?.role === 'host' ? live.live?.rows.find((r) => r.id === olena.playerId) : undefined;
    expect(row?.away).toEqual([expect.objectContaining({ personId: olena.playerId, ms: 4000, count: 1, out: false })]);
  });

  it('after the own answer a leave does not count', () => {
    const { scheduler, manager, room, olena } = playing();
    expect(manager.answer(room, olena.playerId, right)).toEqual({ ok: true });
    expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true });
    scheduler.advance(5000);
    expect(manager.away(room, olena.playerId, false, { ms: 5000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toBeUndefined();
  });

  it('the answer closes an open interval at the moment of the answer', () => {
    const { scheduler, manager, room, olena } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(2500);
    expect(manager.answer(room, olena.playerId, right)).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 2500, count: 1, since: null });
  });

  it('a pure disconnect costs nothing', () => {
    const { scheduler, manager, room, olena } = playing();
    manager.disconnect(room, olena.identity);
    scheduler.advance(6000);
    manager.connect(room, olena.identity);
    expect(manager.away(room, olena.playerId, false, { ms: 0 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toBeUndefined();
  });

  it('a leave with a disconnect: the online part by the clock plus the overlap with the gap, one leave', () => {
    const { scheduler, manager, room, olena } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.disconnect(room, olena.identity);
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 1000, count: 1, since: null });
    scheduler.advance(5000);
    manager.connect(room, olena.identity);
    scheduler.advance(1000);
    expect(manager.away(room, olena.playerId, false, { ms: 7000 })).toEqual({ ok: true });
    // 1000 до розриву + 5000 перетину з розривом; секунду після перепідключення без away: true сервер не бачив.
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 6000, count: 1, since: null });
  });

  it('a phone still hidden after the reconnect re-sends away: true and the rest counts by the clock, still one leave', () => {
    const { scheduler, manager, room, olena } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.disconnect(room, olena.identity);
    scheduler.advance(5000);
    manager.connect(room, olena.identity);
    manager.away(room, olena.playerId, true);
    scheduler.advance(2000);
    expect(manager.away(room, olena.playerId, false, { ms: 8000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 8000, count: 1, since: null });
  });

  it('a phone that came back while offline cannot claim the visible offline time (sinceReturnMs)', () => {
    const { scheduler, manager, room, olena } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.disconnect(room, olena.identity);
    scheduler.advance(2000); // видимий з цієї миті, але ще без зв'язку
    scheduler.advance(4000);
    manager.connect(room, olena.identity);
    expect(manager.away(room, olena.playerId, false, { ms: 3000, sinceReturnMs: 4000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 3000, count: 1, since: null });
  });

  it('a gap is capped by what the server saw', () => {
    const { scheduler, manager, room, olena } = playing();
    scheduler.advance(2000);
    manager.disconnect(room, olena.identity);
    scheduler.advance(3000);
    manager.connect(room, olena.identity);
    // Телефон заявляє годину: сервер бачив лише розрив 3000 мс.
    expect(manager.away(room, olena.playerId, false, { ms: 3_600_000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 3000, count: 1, since: null });
  });

  it('a gap that began before the question is capped by the time since the question started', () => {
    const { scheduler, manager, room } = setup(twoSingles());
    const olena = enter(manager, room, 'Олена');
    enter(manager, room, 'Тарас');
    manager.host(room, { type: 'start' });
    manager.disconnect(room, olena.identity);
    scheduler.advance(10_000);
    manager.host(room, { type: 'next' });
    scheduler.advance(2000);
    manager.connect(room, olena.identity);
    expect(manager.away(room, olena.playerId, false, { ms: 12_000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 2000, count: 1, since: null });
  });

  it('a phone hidden before the question counts from the end of the splash plus the grace', () => {
    const { scheduler, manager, room } = setup(twoSingles(), true);
    const olena = enter(manager, room, 'Олена');
    manager.host(room, { type: 'start' });
    expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true }); // на вступі раунду
    manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('question');
    scheduler.advance(SPLASH_MS.question);
    scheduler.advance(AWAY_MS.preGrace + 3000);
    manager.away(room, olena.playerId, false, { ms: AWAY_MS.preGrace + 3000 + SPLASH_MS.question + 500 });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 3000, count: 1, since: null });
  });

  it('a pause stops the clock', () => {
    const { scheduler, manager, room, olena } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.host(room, { type: 'pause' });
    scheduler.advance(10_000);
    manager.host(room, { type: 'resume' });
    scheduler.advance(1000);
    manager.away(room, olena.playerId, false, { ms: 12_000 });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 2000, count: 1, since: null });
  });

  it('the penalty lands when the reveal is left, and the host can undo it', () => {
    const { scheduler, manager, room, olena, taras } = playing(twoSingles({ awayPenalty: true }));
    manager.away(room, olena.playerId, true);
    scheduler.advance(3500);
    manager.away(room, olena.playerId, false, { ms: 3500 });
    manager.answer(room, olena.playerId, right);
    manager.answer(room, taras.playerId, right);
    expect(room.state.phase).toBe('locked');
    manager.host(room, { type: 'next' });
    expect(room.state.adjustments.filter((a) => a.source === 'away')).toEqual([]);
    manager.host(room, { type: 'next' });
    const penalty = room.state.adjustments.find((a) => a.source === 'away');
    expect(penalty).toMatchObject({ playerId: olena.playerId, points: -1000 });
    const score = () => room.state.players.find((p) => p.id === olena.playerId)?.score;
    expect(score()).toBe(0);
    expect(manager.host(room, { type: 'undo', target: { seq: penalty?.seq ?? -1 } })).toEqual({ ok: true });
    expect(score()).toBe(1000);
  });

  it('autopilot: the same leave gives the penalty with no host, and the author cannot undo it', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const created = manager.createAutopilot(twoSingles({ awayPenalty: true }), 'u1', null, 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room, playerId: marta } = created;
    manager.connect(room, { role: 'player', playerId: marta });
    const taras = enter(manager, room, 'Тарас');
    expect(manager.author(room, marta, { type: 'start' })).toEqual({ ok: true });
    for (let i = 0; i < 60 && room.state.phase !== 'question'; i++) scheduler.advance(1000);
    expect(room.state.phase).toBe('question');
    expect(manager.away(room, taras.playerId, true)).toEqual({ ok: true });
    scheduler.advance(3500);
    expect(manager.away(room, taras.playerId, false, { ms: 3500 })).toEqual({ ok: true });
    manager.answer(room, taras.playerId, right);
    manager.answer(room, marta, right);
    for (let i = 0; i < 60 && !room.state.adjustments.some((a) => a.source === 'away'); i++) scheduler.advance(1000);
    const penalty = room.state.adjustments.find((a) => a.source === 'away');
    expect(penalty).toMatchObject({ playerId: taras.playerId, points: -1000 });
    expect(manager.author(room, marta, { type: 'undo', target: { seq: penalty?.seq ?? -1 } } as never)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('teams: the person is keyed, the team row carries the mark, the captain answer closes the teammate interval', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const quiz = makeRoundsQuiz([classicRound('r1', [single], PLAIN)], { teams: defaultTeams(2) });
    const { room, members, teams } = startTeamGame(manager, quiz, [['Оля', 'Петро'], ['Віра', 'Ігор']]);
    manager.connect(room, HOST);
    manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('question');
    expect(manager.away(room, members.Петро, true)).toEqual({ ok: true });
    scheduler.advance(2500);
    const view = manager.view(room, HOST);
    const row = view?.role === 'host' ? view.live?.rows.find((r) => r.id === teams[0]) : undefined;
    expect(row?.away).toEqual([expect.objectContaining({ personId: members.Петро, out: true })]);
    expect(manager.answer(room, members.Оля, right)).toEqual({ ok: true });
    expect(awayOf(room, members.Петро)).toEqual({ ms: 2500, count: 1, since: null });
  });

  it(`more than ${AWAY_EVENTS_PER_SECOND} leaves a second are too_soon; a refused event leaves the memory and the state untouched`, () => {
    const { scheduler, manager, room, olena, taras } = playing();
    for (let i = 0; i < AWAY_EVENTS_PER_SECOND; i++) {
      expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true });
      // Повернення, поки телефон прихований, частоти не рахує.
      expect(manager.away(room, olena.playerId, false, { ms: 0 })).toEqual({ ok: true });
    }
    const before = room.state;
    expect(manager.away(room, olena.playerId, true)).toEqual({ ok: false, error: 'too_soon' });
    expect(room.hidden.has(olena.playerId)).toBe(false);
    expect(room.state).toBe(before);
    // Інша людина має своє вікно.
    expect(manager.away(room, taras.playerId, true)).toEqual({ ok: true });
    scheduler.advance(1000);
    expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true });
  });

  it('a return is never rate-limited while the phone is hidden', () => {
    const { scheduler, manager, room, olena } = playing();
    for (let i = 0; i < AWAY_EVENTS_PER_SECOND; i++) expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true });
    expect(manager.away(room, olena.playerId, true)).toEqual({ ok: false, error: 'too_soon' });
    scheduler.advance(500);
    expect(manager.away(room, olena.playerId, false, { ms: 500 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 500, count: 1, since: null });
    // Без виходу повернення знову рахує частоту.
    expect(manager.away(room, olena.playerId, false, { ms: 0 })).toEqual({ ok: false, error: 'too_soon' });
  });

  it('one free return per accepted leave: further returns count against the rate, a disconnect keeps the free one', () => {
    const { scheduler, manager, room, olena } = playing();
    expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true });
    // Перше повернення — у рахунок виходу; далі кожне рахується: разом із виходом 4 за секунду.
    expect(manager.away(room, olena.playerId, false, { ms: 0 })).toEqual({ ok: true });
    for (let i = 1; i < AWAY_EVENTS_PER_SECOND; i++) expect(manager.away(room, olena.playerId, false, { ms: 0 })).toEqual({ ok: true });
    expect(manager.away(room, olena.playerId, false, { ms: 0 })).toEqual({ ok: false, error: 'too_soon' });
    expect(room.awayCredit.has(olena.playerId)).toBe(false);
    // Новий вихід (нова секунда), розрив, повернення без зв'язку — повернення після перепідключення однаково вільне.
    scheduler.advance(1000);
    for (let i = 0; i < AWAY_EVENTS_PER_SECOND; i++) expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true });
    manager.disconnect(room, olena.identity);
    expect(room.hidden.has(olena.playerId)).toBe(false);
    manager.connect(room, olena.identity);
    expect(manager.away(room, olena.playerId, false, { ms: 500 })).toEqual({ ok: true });
    expect(manager.away(room, olena.playerId, false, { ms: 0 })).toEqual({ ok: false, error: 'too_soon' });
  });

  it('a gap across a question change counts only the offline part inside the new question (phone re-sends away: true)', () => {
    const { scheduler, manager, room, olena, taras } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.disconnect(room, olena.identity);
    manager.answer(room, taras.playerId, right);
    toNextQuestion(manager, room, scheduler);
    scheduler.advance(1500);
    manager.connect(room, olena.identity);
    manager.away(room, olena.playerId, true);
    scheduler.advance(3000);
    expect(manager.away(room, olena.playerId, false, { ms: 60_000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId, 0)).toEqual({ ms: 1000, count: 1, since: null });
    expect(awayOf(room, olena.playerId, 1)).toEqual({ ms: 4500, count: 1, since: null });
  });

  it('a gap across a question change without the re-send counts only the offline part inside the new question', () => {
    const { scheduler, manager, room, olena, taras } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.disconnect(room, olena.identity);
    manager.answer(room, taras.playerId, right);
    toNextQuestion(manager, room, scheduler);
    scheduler.advance(1500);
    manager.connect(room, olena.identity);
    scheduler.advance(3000);
    expect(manager.away(room, olena.playerId, false, { ms: 60_000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId, 1)).toEqual({ ms: 1500, count: 1, since: null });
  });

  it('a gap that ended before the current question adds nothing', () => {
    const { scheduler, manager, room, olena, taras } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.disconnect(room, olena.identity);
    manager.answer(room, taras.playerId, right);
    manager.host(room, { type: 'next' }); // розкриття
    scheduler.advance(2000);
    manager.connect(room, olena.identity);
    toNextQuestion(manager, room, scheduler);
    scheduler.advance(2000);
    expect(manager.away(room, olena.playerId, false, { ms: 60_000 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId, 1)).toBeUndefined();
  });

  it('a host pause inside the gap does not count', () => {
    const { scheduler, manager, room, olena } = playing();
    scheduler.advance(1000);
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.disconnect(room, olena.identity); // 1000 на зв'язку
    scheduler.advance(1000);
    manager.host(room, { type: 'pause' });
    scheduler.advance(10_000);
    manager.host(room, { type: 'resume' });
    scheduler.advance(2000);
    manager.connect(room, olena.identity);
    expect(manager.away(room, olena.playerId, false, { ms: 14_000 })).toEqual({ ok: true });
    // 1000 до розриву + 3000 розриву на годиннику запитання (пауза 10 с — ні).
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 4000, count: 1, since: null });
  });

  it('a gap left from long ago does not swallow a later separate leave', () => {
    const { scheduler, manager, room, olena } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(1000);
    manager.disconnect(room, olena.identity);
    scheduler.advance(1000);
    manager.connect(room, olena.identity); // звіт повернення загубився
    scheduler.advance(10_000);
    manager.away(room, olena.playerId, true);
    scheduler.advance(2500);
    expect(manager.away(room, olena.playerId, false, { ms: 2500 })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 3500, count: 2, since: null });
  });

  it('away: true in the lobby counts from the start of the first question plus the grace', () => {
    const { scheduler, manager, room } = setup(twoSingles());
    const olena = enter(manager, room, 'Олена');
    expect(manager.away(room, olena.playerId, true)).toEqual({ ok: true });
    manager.host(room, { type: 'start' });
    scheduler.advance(5000);
    manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('question');
    scheduler.advance(AWAY_MS.preGrace + 2000);
    manager.away(room, olena.playerId, false, { ms: AWAY_MS.preGrace + 7000 });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 2000, count: 1, since: null });
  });

  for (const type of ['end-round', 'end'] as const) {
    it(`${type} straight from the question lands the penalty through commit`, () => {
      const { scheduler, manager, room, olena } = playing(twoSingles({ awayPenalty: true }));
      manager.away(room, olena.playerId, true);
      scheduler.advance(3500);
      manager.away(room, olena.playerId, false, { ms: 3500 });
      manager.answer(room, olena.playerId, right);
      expect(manager.host(room, { type })).toEqual({ ok: true });
      expect(room.state.adjustments.filter((a) => a.source === 'away')).toEqual([expect.objectContaining({ playerId: olena.playerId, points: -1000 })]);
    });
  }

  it('a kick while out closes the interval at the kick', () => {
    const { scheduler, manager, room, olena } = playing();
    manager.away(room, olena.playerId, true);
    scheduler.advance(2000);
    expect(manager.host(room, { type: 'kick', playerId: olena.playerId })).toEqual({ ok: true });
    expect(awayOf(room, olena.playerId)).toEqual({ ms: 2000, count: 1, since: null });
    expect(room.hidden.has(olena.playerId)).toBe(false);
  });

  it('an unchanged state answers ok without a commit or a broadcast', () => {
    const { manager, room, olena, events } = playing();
    events.length = 0;
    const before = room.state;
    expect(manager.away(room, olena.playerId, false, { ms: 0 })).toEqual({ ok: true });
    expect(room.state).toBe(before);
    expect(events).toEqual([]);
  });

  it('an unknown person is not_found', () => {
    const { manager, room } = playing();
    expect(manager.away(room, 'nobody', true)).toEqual({ ok: false, error: 'not_found' });
  });

  it('a kick forgets the person in the away memory', () => {
    const { manager, room, olena } = playing();
    manager.away(room, olena.playerId, true);
    manager.disconnect(room, olena.identity);
    expect(manager.host(room, { type: 'kick', playerId: olena.playerId })).toEqual({ ok: true });
    expect(room.hidden.has(olena.playerId)).toBe(false);
    expect(room.gaps.has(olena.playerId)).toBe(false);
    expect(room.awayRate.has(olena.playerId)).toBe(false);
  });
});
