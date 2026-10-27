import { describe, expect, it } from 'vitest';
import { bluff, boardRound, chain, classicRound, makeQuiz, makeRoundsQuiz, multi, poll, single, text, wall, withId } from '@quiz/engine/testing';
import { GAME_STATE_VERSION } from '@quiz/engine';
import { defaultTeams, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room, type RoomEvent } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };

function setup(quiz: Quiz = makeQuiz([multi, text, single])) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(quiz);
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
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

/** Кімната з ведучим і двома гравцями на першому запитанні. */
function playing(quiz?: Quiz) {
  const ctx = setup(quiz);
  ctx.manager.connect(ctx.room, HOST);
  const olena = enter(ctx.manager, ctx.room, 'Олена');
  const taras = enter(ctx.manager, ctx.room, 'Тарас');
  expect(ctx.manager.host(ctx.room, { type: 'start' })).toEqual({ ok: true });
  expect(ctx.manager.host(ctx.room, { type: 'next' })).toEqual({ ok: true });
  return { ...ctx, olena, taras };
}

/** Олена й Тарас — червоні (капітан Олена), Іра й Марко — сині (капітан Іра); перше запитання. */
function teamPlaying(rounds: Parameters<typeof makeRoundsQuiz>[0]) {
  const { scheduler, manager, room, events } = setup(makeRoundsQuiz(rounds, { teams: defaultTeams(2) }));
  manager.connect(room, HOST);
  const [olena, taras, ira, marko] = ['Олена', 'Тарас', 'Іра', 'Марко'].map((name) => enter(manager, room, name));
  const [red, blue] = room.state.teams!.list.map((t) => t.id);
  for (const [who, team] of [[olena, red], [taras, red], [ira, blue], [marko, blue]] as const) {
    expect(manager.host(room, { type: 'team-assign', memberId: who.playerId, teamId: team })).toEqual({ ok: true });
  }
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('question');
  return { scheduler, manager, room, events, olena, taras, ira, marko, red, blue };
}

describe('solo live drafts (12b)', () => {
  it('a solo player drafts; the host batch has it with changes and time, nobody else sees it, the saved room neither', () => {
    const { scheduler, manager, room, events, olena, taras } = playing();
    const before = room.state;
    events.length = 0;
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: true });
    expect(events).toEqual([{ type: 'draft', id: olena.playerId, by: olena.playerId, teammates: false }]);
    expect(room.state).toBe(before);
    scheduler.advance(300);
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a', 'c'] })).toEqual({ ok: true });
    scheduler.advance(300);
    expect(manager.draft(room, olena.playerId, null)).toEqual({ ok: true });
    scheduler.advance(300);
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['c'] })).toEqual({ ok: true });
    const at = manager.now();
    expect(manager.liveDrafts(room)).toEqual({ questionIndex: 0, trial: false, drafts: [{ id: olena.playerId, draft: { type: 'multi', optionIds: ['c'] }, changes: 3, at }] });
    for (const who of [olena.identity, taras.identity, STAGE, HOST]) expect(JSON.stringify(manager.view(room, who))).not.toContain('"optionIds":["c"]');
    expect(JSON.stringify(manager.snapshot(room))).not.toContain('"optionIds":["c"]');
  });

  it('a cleared field is kept as a change but shown to nobody', () => {
    const { manager, room, events, olena } = playing();
    expect(manager.draft(room, olena.playerId, null)).toEqual({ ok: true });
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: true });
    events.length = 0;
    expect(manager.draft(room, olena.playerId, null)).toEqual({ ok: true });
    expect(events).toHaveLength(1);
    expect(manager.liveDrafts(room).drafts).toEqual([]);
    expect(room.drafts.get(olena.playerId)).toMatchObject({ draft: null, changes: 1 });
    expect(manager.draft(room, olena.playerId, null)).toEqual({ ok: true });
    expect(events).toHaveLength(1);
  });

  it('a submission drops the draft; a later one starts the count anew', () => {
    const { manager, room, olena } = playing();
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: true });
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a', 'b'] })).toEqual({ ok: true });
    expect(manager.answer(room, olena.playerId, { type: 'multi', optionIds: ['a', 'c'] })).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts).toEqual([]);
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['b'] })).toEqual({ ok: true });
    expect(room.drafts.get(olena.playerId)).toMatchObject({ changes: 0 });
  });

  it('a new question drops the draft', () => {
    const { manager, room, olena, taras } = playing();
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: true });
    expect(manager.answer(room, olena.playerId, { type: 'multi', optionIds: ['a', 'c'] })).toEqual({ ok: true });
    expect(manager.answer(room, taras.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && room.state.questionIndex === 0; guard++) manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('question');
    expect(manager.liveDrafts(room)).toEqual({ questionIndex: 1, trial: false, drafts: [] });
  });

  it('a draft of another question type is a type mismatch', () => {
    const { manager, room, olena } = playing();
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'x' })).toEqual({ ok: false, error: 'type_mismatch' });
    expect(manager.draft(room, olena.playerId, { type: 'wallPick', tiles: [0] })).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('more than eight drafts a second are too soon, unchanged ones count too', () => {
    const { scheduler, manager, room, olena, taras } = playing();
    const ids = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 8; i++) {
      expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ids.slice(0, (i % 4) + 1) })).toEqual({ ok: true });
    }
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['d'] })).toEqual({ ok: false, error: 'too_soon' });
    expect(manager.liveDrafts(room).drafts[0].draft).toEqual({ type: 'multi', optionIds: ids });
    // Вікно — на людину: Тарас не постраждав.
    expect(manager.draft(room, taras.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: true });
    scheduler.advance(1000);
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['d'] })).toEqual({ ok: true });
    for (let i = 0; i < 7; i++) expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['d'] })).toEqual({ ok: true });
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['d'] })).toEqual({ ok: false, error: 'too_soon' });
  });

  it('no drafts in the lobby, after the lock or at the reveal', () => {
    const lobby = setup();
    const ira = enter(lobby.manager, lobby.room, 'Іра');
    expect(lobby.manager.draft(lobby.room, ira.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: false, error: 'wrong_phase' });
    const { manager, room, olena } = playing();
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.liveDrafts(room).drafts).toEqual([]);
  });

  it('a stranger is not found', () => {
    const { manager, room } = playing();
    expect(manager.draft(room, 'nobody', { type: 'multi', optionIds: ['a'] })).toEqual({ ok: false, error: 'not_found' });
  });

  it('a draft of someone who does not answer now is kept out of the batch', () => {
    const cell = (id: string, points: number) => ({ ...withId(single, id), points });
    const quiz = makeRoundsQuiz([
      boardRound('g1', [
        { title: 'Міста', cells: [cell('c11', 100), cell('c12', 200)] },
        { title: 'Річки', cells: [cell('c21', 100), cell('c22', 200)] },
      ]),
    ]);
    const { manager, room } = setup(quiz);
    manager.connect(room, HOST);
    const anna = enter(manager, room, 'Анна');
    const bohdan = enter(manager, room, 'Богдан');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.pick(room, anna.playerId, 'c11')).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    expect(manager.draft(room, bohdan.playerId, { type: 'single', optionId: 'a' })).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts).toEqual([]);
    expect(manager.draft(room, anna.playerId, { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts.map((d) => d.id)).toEqual([anna.playerId]);
  });

  it('a kick erases the draft and the rate window of the person', () => {
    const { manager, room, olena } = playing();
    expect(manager.draft(room, olena.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'kick', playerId: olena.playerId })).toEqual({ ok: true });
    expect(room.drafts.has(olena.playerId)).toBe(false);
    expect(room.draftRate.has(olena.playerId)).toBe(false);
    expect(manager.liveDrafts(room).drafts).toEqual([]);
  });

  it('a chain word goes stale after a guess', () => {
    const { manager, room, olena } = playing(makeQuiz([chain]));
    expect(manager.draft(room, olena.playerId, { type: 'chainWord', word: 'Ри' })).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts).toMatchObject([{ id: olena.playerId, draft: { type: 'chainWord', word: 'Ри' } }]);
    expect(manager.guess(room, olena.playerId, 'Риба')).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts).toEqual([]);
  });

  it('wall tiles go stale after a try', () => {
    const { manager, room, olena } = playing(makeQuiz([wall]));
    expect(manager.draft(room, olena.playerId, { type: 'wallPick', tiles: [0, 1] })).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts).toMatchObject([{ id: olena.playerId, draft: { type: 'wallPick', tiles: [0, 1] } }]);
    expect(manager.wall(room, olena.playerId, [0, 1, 2, 3])).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts).toEqual([]);
  });

  it('a bluff lie is a draft only while lies are written, and goes stale once written', () => {
    const { scheduler, manager, room, olena, taras } = playing(makeQuiz([bluff, single]));
    expect(manager.draft(room, olena.playerId, { type: 'lie', text: 'Вигадка' })).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts).toMatchObject([{ id: olena.playerId, draft: { type: 'lie', text: 'Вигадка' } }]);
    expect(manager.lie(room, olena.playerId, 'Рим')).toEqual({ ok: true });
    expect(manager.liveDrafts(room).drafts).toEqual([]);
    scheduler.advance(bluff.timeLimit * 1000 + 1);
    expect(room.state.plays[0]?.bluff?.stage).toBe('choice');
    expect(manager.draft(room, taras.playerId, { type: 'lie', text: 'Вигадка' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a game with no host takes no solo drafts', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const created = manager.createAutopilot(makeQuiz([multi]), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room } = created;
    manager.connect(room, { role: 'player', playerId: created.playerId });
    expect(manager.author(room, created.playerId, { type: 'start' })).toEqual({ ok: true });
    scheduler.advance(8000);
    expect(room.state.phase).toBe('question');
    expect(manager.draft(room, created.playerId, { type: 'multi', optionIds: ['a'] })).toEqual({ ok: false, error: 'not_allowed' });
    expect(manager.liveDrafts(room).drafts).toEqual([]);
  });

  it('a team captain draft reaches the teammates and the batch; wall tiles only the batch', () => {
    const { manager, room, events, olena, taras, red } = teamPlaying([classicRound('r1', [text])]);
    const draft = { type: 'text', value: 'Київ' } as const;
    events.length = 0;
    expect(manager.draft(room, olena.playerId, draft)).toEqual({ ok: true });
    expect(events).toEqual([{ type: 'draft', id: red, by: olena.playerId, teammates: true }]);
    expect(manager.liveDrafts(room).drafts[0]).toMatchObject({ id: red, draft, changes: 0 });
    const teammate = manager.view(room, taras.identity);
    expect(teammate?.role === 'player' && teammate.team?.draft).toEqual(draft);

    const walls = teamPlaying([classicRound('r1', [wall])]);
    expect(walls.manager.draft(walls.room, walls.olena.playerId, { type: 'wallPick', tiles: [2] })).toEqual({ ok: true });
    const mate = walls.manager.view(walls.room, walls.taras.identity);
    expect(mate?.role === 'player' && mate.team?.draft).toBeNull();
    expect(walls.manager.liveDrafts(walls.room).drafts).toMatchObject([{ id: walls.red, draft: { type: 'wallPick', tiles: [2] } }]);
  });

  it('a team poll draft is personal: the host batch has it under the person, teammates never see it', () => {
    const { manager, room, events, olena, taras } = teamPlaying([classicRound('r1', [poll])]);
    events.length = 0;
    expect(manager.draft(room, taras.playerId, { type: 'poll', optionId: 'a' })).toEqual({ ok: true });
    expect(events).toEqual([{ type: 'draft', id: taras.playerId, by: taras.playerId, teammates: false }]);
    expect(manager.liveDrafts(room).drafts).toMatchObject([{ id: taras.playerId, draft: { type: 'poll', optionId: 'a' } }]);
    const mate = manager.view(room, olena.identity);
    expect(mate?.role === 'player' && mate.team?.draft).toBeNull();
    expect(manager.draft(room, 'nobody', { type: 'poll', optionId: 'a' })).toEqual({ ok: false, error: 'not_found' });
  });

  it('the game state version stays 15', () => {
    expect(GAME_STATE_VERSION).toBe(15);
  });
});
