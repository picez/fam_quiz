import { describe, expect, it } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, text, withId } from '@quiz/engine/testing';
import { defaultTeams, type Quiz } from '@quiz/shared';
import { startTeamGame } from '../testing/team-game';
import { FakeScheduler } from '../testing/fake-scheduler';
import type { SavedGameData } from './continuation';
import { HOST_ABSENCE_MS, RoomManager, type Identity, type Room, type RoomEvent, type SavedRoom } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const quiz = (): Quiz => makeQuiz([single, text, single]);
const twoRounds = (teams = false): Quiz =>
  makeRoundsQuiz([classicRound('r0', [single]), classicRound('r1', [withId(single, 'q2')]), classicRound('r2', [withId(single, 'q3')])], teams ? { teams: defaultTeams(2) } : {});

function world() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const events: { room: Room; event: RoomEvent }[] = [];
  manager.onEvent((room, event) => events.push({ room, event }));
  const savedOf = (): SavedGameData => {
    const last = events.at(-1)?.event;
    if (last?.type !== 'closed' || last.saved === undefined) throw new Error(`last event is ${JSON.stringify(last?.type)}, not closed with saved`);
    return last.saved;
  };
  return { scheduler, manager, events, savedOf };
}

type World = ReturnType<typeof world>;

/** Ведучий 'u1', Олена ('u2') і Тарас (гість); запитання 1 зіграно (Олена правильно), таблиця, «Зберегти». */
function savedGame(w: World = world()) {
  const { manager } = w;
  const room = manager.create(quiz(), 'u1', null);
  manager.connect(room, HOST);
  const enter = (nickname: string, userId: string | null) => {
    const joined = manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olena = enter('Олена', 'u2');
  const taras = enter('Тарас', null);
  const host = (action: Parameters<RoomManager['host']>[1]) => expect(manager.host(room, action)).toEqual({ ok: true });
  host({ type: 'start' });
  host({ type: 'next' });
  manager.answer(room, olena, correct);
  manager.answer(room, taras, wrong);
  host({ type: 'next' });
  host({ type: 'next' });
  expect(room.state.phase).toBe('leaderboard');
  const scores = Object.fromEntries(room.state.players.map((p) => [p.id, p.score]));
  expect(scores[olena]).toBeGreaterThan(0);
  w.scheduler.advance(60_000);
  host({ type: 'save' });
  return { ...w, old: room, olena, taras, scores, saved: w.savedOf() };
}

/** Точне продовження збереженої гри. */
function continued() {
  const ctx = savedGame();
  ctx.scheduler.advance(3_600_000);
  const result = ctx.manager.continueSaved(ctx.old.id, 'u1', viaJson(ctx.saved));
  if (!result.ok) throw new Error(result.error);
  return { ...ctx, room: result.room };
}

const scoreOf = (room: Room, id: string) => room.state.players.find((p) => p.id === id)?.score;

describe('an exact continuation (13b)', () => {
  it('opens over the same game id with a new code, paused at the checkpoint moment, with the same scores', () => {
    const ctx = continued();
    const { room, old } = ctx;
    expect(room.id).toBe(old.id);
    expect(room.code).not.toBe(old.code);
    expect(ctx.manager.get(room.code)).toBe(room);
    expect(room.state.paused).toBe(true);
    // Пауза — з миті контрольної точки, не «зараз»: дедлайни після точки не застосовуються.
    expect(room.state.pausedAt).toBe(ctx.saved.at);
    expect(room.state.phase).toBe('leaderboard');
    expect(room.state.awaiting).toEqual([]);
    expect(scoreOf(room, ctx.olena)).toBe(ctx.scores[ctx.olena]);
    expect(scoreOf(room, ctx.taras)).toBe(ctx.scores[ctx.taras]);
    expect(room.playerTokens.size).toBe(0);
    expect(room.playerUsers.get(ctx.olena)).toBe('u2');
    expect(room.continued).toEqual({ bound: new Set(), carry: null, replaces: null });
    expect(ctx.manager.slots(room.code, null)).toEqual({ slots: [{ id: ctx.taras, nickname: 'Тарас', team: null }], mine: null });
  });

  it('a second continuation of the same game is refused while the first is open', () => {
    const ctx = continued();
    expect(ctx.manager.openFor(ctx.old.id)).toBe(true);
    expect(ctx.manager.openFor('00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(ctx.manager.continueSaved(ctx.old.id, 'u1', ctx.saved)).toEqual({ ok: false, error: 'continue_open' });
  });

  it('is refused on a frozen manager', () => {
    const ctx = savedGame();
    ctx.manager.freeze();
    expect(ctx.manager.continueSaved(ctx.old.id, 'u1', ctx.saved)).toEqual({ ok: false, error: 'restarting' });
  });
});

describe('slots of a continuation (13b)', () => {
  it('an account sees its own slot, and joining with it claims that slot without a new nickname', () => {
    const ctx = continued();
    const { manager, room } = ctx;
    expect(manager.slots(room.code, 'u2')).toEqual({ slots: [{ id: ctx.taras, nickname: 'Тарас', team: null }], mine: { id: ctx.olena, nickname: 'Олена', team: null } });
    const joined = manager.join(room.code, 'хтось', 'u2');
    expect(joined).toMatchObject({ ok: true, playerId: ctx.olena });
    expect(room.state.players.find((p) => p.id === ctx.olena)?.nickname).toBe('Олена');
    expect(room.state.players).toHaveLength(2);
    expect(manager.slots('999999', null)).toBeNull();
  });

  it('a slot of an account is not for a guest or another account', () => {
    const ctx = continued();
    expect(ctx.manager.claim(ctx.room.code, ctx.olena, null)).toEqual({ ok: false, error: 'not_allowed' });
    expect(ctx.manager.claim(ctx.room.code, ctx.olena, 'u9')).toEqual({ ok: false, error: 'not_allowed' });
    // Свій — і вдруге (другий пристрій).
    expect(ctx.manager.claim(ctx.room.code, ctx.olena, 'u2')).toMatchObject({ ok: true, playerId: ctx.olena });
    expect(ctx.manager.claim(ctx.room.code, ctx.olena, 'u2')).toMatchObject({ ok: true, playerId: ctx.olena });
  });

  it('a guest slot is taken once', () => {
    const ctx = continued();
    const first = ctx.manager.claim(ctx.room.code, ctx.taras, null);
    expect(first).toMatchObject({ ok: true, playerId: ctx.taras });
    expect(ctx.manager.claim(ctx.room.code, ctx.taras, null)).toEqual({ ok: false, error: 'slot_taken' });
    expect(ctx.manager.slots(ctx.room.code, null)?.slots).toEqual([]);
    if (!first.ok) throw new Error('claim');
    expect(ctx.manager.identify(ctx.room.code, 'player', first.token)?.identity.playerId).toBe(ctx.taras);
  });

  it('an account taking a free guest slot binds it; the same account cannot take a second one', () => {
    const ctx = continued();
    const { manager, room } = ctx;
    const late = manager.join(room.code, 'Ірина', null);
    if (!late.ok) throw new Error(late.error);
    expect(manager.claim(room.code, ctx.taras, 'u3')).toMatchObject({ ok: true, playerId: ctx.taras });
    expect(room.playerUsers.get(ctx.taras)).toBe('u3');
    expect(room.continued?.bound.has(ctx.taras)).toBe(true);
    // Ірина вже з токеном; вільного гостьового місця для u3 немає й так, але правило — «одне місце на акаунт».
    room.playerTokens.clear();
    expect(manager.claim(room.code, late.playerId, 'u3')).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('an unknown slot, a team id and an ordinary room give not_found; no room gives game_not_found', () => {
    const ctx = continued();
    expect(ctx.manager.claim(ctx.room.code, '00000000-0000-4000-8000-000000000000', null)).toEqual({ ok: false, error: 'not_found' });
    expect(ctx.manager.claim('999999', ctx.taras, null)).toEqual({ ok: false, error: 'game_not_found' });
    const plain = ctx.manager.create(quiz(), 'u1', null);
    const joined = ctx.manager.join(plain.code, 'Оля', null);
    if (!joined.ok) throw new Error(joined.error);
    expect(ctx.manager.claim(plain.code, joined.playerId, null)).toEqual({ ok: false, error: 'not_found' });
    expect(ctx.manager.slots(plain.code, null)).toEqual({ slots: [], mine: null });
  });

  it('the id of a team is not a slot', () => {
    const w = world();
    const { room, teams } = startTeamGame(w.manager, twoRounds(true), [['Оля', 'Петро'], ['Віра']], { Оля: 'u2' }, 'u1');
    w.manager.connect(room, HOST);
    expect(w.manager.host(room, { type: 'save' })).toEqual({ ok: true });
    const result = w.manager.continueSaved(room.id, 'u1', w.savedOf());
    if (!result.ok) throw new Error(result.error);
    expect(w.manager.claim(result.room.code, teams[0], null)).toEqual({ ok: false, error: 'not_found' });
  });

  it('claim is refused with restarting on a frozen manager', () => {
    const ctx = continued();
    ctx.manager.freeze();
    expect(ctx.manager.claim(ctx.room.code, ctx.taras, null)).toEqual({ ok: false, error: 'restarting' });
  });
});

describe('newcomers and the game going on (13b)', () => {
  it('a newcomer joins between questions with 0; during a question the door is shut', () => {
    const ctx = continued();
    const { manager, room } = ctx;
    const irina = manager.join(room.code, 'Ірина', null);
    expect(irina).toMatchObject({ ok: true });
    if (!irina.ok) throw new Error('join');
    expect(room.state.players.find((p) => p.id === irina.playerId)).toMatchObject({ nickname: 'Ірина', score: 0 });
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    expect(manager.join(room.code, 'Гліб', null)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the scores grow from the saved ones; the absent guest does not hold the question', () => {
    const ctx = continued();
    const { manager, room } = ctx;
    manager.connect(room, HOST);
    const olena = manager.join(room.code, '', 'u2');
    if (!olena.ok) throw new Error(olena.error);
    manager.connect(room, { role: 'player', playerId: olena.playerId });
    expect(room.state.players.find((p) => p.id === ctx.taras)?.connected).toBe(false);
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.answer(room, ctx.olena, { type: 'text', value: 'Одеса' })).toEqual({ ok: true });
    // Олена — єдина на зв'язку: запитання закрилося без Тараса.
    expect(room.state.phase).toBe('locked');
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(scoreOf(room, ctx.olena)).toBeGreaterThan(ctx.scores[ctx.olena]);
    expect(scoreOf(room, ctx.taras)).toBe(ctx.scores[ctx.taras]);
  });

  it('a team person claiming a slot keeps the team and the captaincy', () => {
    const w = world();
    const { room, members } = startTeamGame(w.manager, twoRounds(true), [['Оля', 'Петро'], ['Віра', 'Ігор']], { Оля: 'u2' }, 'u1');
    w.manager.connect(room, HOST);
    const before = room.state.teams!;
    expect(w.manager.host(room, { type: 'save' })).toEqual({ ok: true });
    const result = w.manager.continueSaved(room.id, 'u1', viaJson(w.savedOf()));
    if (!result.ok) throw new Error(result.error);
    const next = result.room;
    expect(w.manager.slots(next.code, null)?.slots.map((s) => [s.nickname, s.team])).toEqual([
      ['Петро', 'Червоні'],
      ['Віра', 'Сині'],
      ['Ігор', 'Сині'],
    ]);
    expect(w.manager.claim(next.code, members['Віра'], null)).toMatchObject({ ok: true, playerId: members['Віра'] });
    const vira = next.state.teams!.members.find((m) => m.id === members['Віра']);
    expect(vira?.teamId).toBe(before.members.find((m) => m.id === members['Віра'])?.teamId);
    expect(next.state.teams!.captains).toEqual(before.captains);
  });
});

describe('an autopilot continuation (13b)', () => {
  it('gives the author a token, waits for the author and goes on after the author resumes', () => {
    const w = world();
    const created = w.manager.createAutopilot(twoRounds(), 'u1', null, 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room } = created;
    w.manager.connect(room, { role: 'player', playerId: created.playerId });
    const ira = w.manager.join(room.code, 'Іра', null);
    if (!ira.ok) throw new Error(ira.error);
    w.manager.connect(room, { role: 'player', playerId: ira.playerId });
    expect(w.manager.author(room, created.playerId, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('intro');
    expect(w.manager.author(room, created.playerId, { type: 'save' })).toEqual({ ok: true });
    const result = w.manager.continueSaved(room.id, 'u1', viaJson(w.savedOf()));
    if (!result.ok) throw new Error(result.error);
    expect(result.author?.playerId).toBe(created.playerId);
    const next = result.room;
    expect(next.state.autopilot?.hold).toBe('author');
    expect(next.state.paused).toBe(true);
    const author = w.manager.identify(next.code, 'player', result.author!.token);
    expect(author?.identity.playerId).toBe(created.playerId);
    w.manager.connect(next, author!.identity);
    expect(w.manager.author(next, created.playerId, { type: 'resume' })).toEqual({ ok: true });
    expect(next.state.paused).toBe(false);
  });
});

describe('freeing a slot (13b)', () => {
  it('the host frees a taken slot: the token is gone, the player and the score stay; only a binding made in this room is dropped', () => {
    const ctx = continued();
    const { manager, room, events } = ctx;
    const taras = manager.claim(room.code, ctx.taras, 'u3');
    const olena = manager.claim(room.code, ctx.olena, 'u2');
    if (!taras.ok || !olena.ok) throw new Error('claim');
    manager.connect(room, { role: 'player', playerId: ctx.taras });
    expect(manager.host(room, { type: 'release', playerId: ctx.taras })).toEqual({ ok: true });
    expect(events.map((e) => e.event).filter((e) => e.type === 'kicked')).toEqual([{ type: 'kicked', playerId: ctx.taras, reason: 'released' }]);
    expect(manager.identify(room.code, 'player', taras.token)).toBeNull();
    expect(room.state.players.find((p) => p.id === ctx.taras)).toMatchObject({ score: ctx.scores[ctx.taras], connected: false });
    expect(room.playerUsers.has(ctx.taras)).toBe(false);
    expect(room.continued?.bound.has(ctx.taras)).toBe(false);
    expect(manager.slots(room.code, null)?.slots.map((s) => s.id)).toEqual([ctx.taras]);

    expect(manager.host(room, { type: 'release', playerId: ctx.olena })).toEqual({ ok: true });
    expect(manager.identify(room.code, 'player', olena.token)).toBeNull();
    expect(room.playerUsers.get(ctx.olena)).toBe('u2');
    expect(manager.host(room, { type: 'release', playerId: '00000000-0000-4000-8000-000000000000' })).toEqual({ ok: false, error: 'not_found' });
  });

  it('a freed place does not hand the occupant’s away time to the next one (12e)', () => {
    const ctx = continued();
    const { manager, room } = ctx;
    manager.connect(room, HOST);
    const first = manager.claim(room.code, ctx.taras, null);
    if (!first.ok) throw new Error('claim');
    manager.connect(room, { role: 'player', playerId: ctx.taras });
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    ctx.scheduler.advance(2_000);
    expect(manager.away(room, ctx.taras, true)).toEqual({ ok: true });
    expect(room.hidden.has(ctx.taras)).toBe(true);
    expect(room.awayCredit.has(ctx.taras)).toBe(true);
    expect(room.state.plays[room.state.questionIndex].away?.[ctx.taras]).toBeDefined();
    // Як на проді: спершу звільнення, потім сокет, що закривається, кличе disconnect.
    expect(manager.host(room, { type: 'release', playerId: ctx.taras })).toEqual({ ok: true });
    manager.disconnect(room, { role: 'player', playerId: ctx.taras });
    expect(room.gaps.has(ctx.taras)).toBe(false);
    expect(room.hidden.has(ctx.taras)).toBe(false);
    expect(room.gaps.has(ctx.taras)).toBe(false);
    expect(room.awayCredit.has(ctx.taras)).toBe(false);
    expect(room.state.plays[room.state.questionIndex].away?.[ctx.taras]).toBeUndefined();

    // Наступний займає місце, сторінка не ховається: штрафу немає.
    const second = manager.claim(room.code, ctx.taras, null);
    if (!second.ok) throw new Error('claim again');
    manager.connect(room, { role: 'player', playerId: ctx.taras });
    ctx.scheduler.advance(10_000);
    expect(room.state.plays[room.state.questionIndex].away?.[ctx.taras]).toBeUndefined();
    expect(manager.away(room, ctx.taras, false)).toEqual({ ok: true });
    expect(room.state.plays[room.state.questionIndex].away?.[ctx.taras]?.ms ?? 0).toBe(0);
  });

  it('in an ordinary room freeing is not allowed', () => {
    const w = world();
    const room = w.manager.create(quiz(), 'u1', null);
    const joined = w.manager.join(room.code, 'Оля', null);
    if (!joined.ok) throw new Error(joined.error);
    expect(w.manager.host(room, { type: 'release', playerId: joined.playerId })).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('the author frees others but not themself', () => {
    const w = world();
    const created = w.manager.createAutopilot(twoRounds(), 'u1', null, 'Марта');
    if (!created.ok) throw new Error(created.error);
    const ira = w.manager.join(created.room.code, 'Іра', null);
    if (!ira.ok) throw new Error(ira.error);
    w.manager.author(created.room, created.playerId, { type: 'start' });
    w.manager.author(created.room, created.playerId, { type: 'save' });
    const result = w.manager.continueSaved(created.room.id, 'u1', w.savedOf());
    if (!result.ok) throw new Error(result.error);
    const next = result.room;
    expect(w.manager.claim(next.code, ira.playerId, null)).toMatchObject({ ok: true });
    expect(w.manager.author(next, created.playerId, { type: 'release', playerId: created.playerId })).toEqual({ ok: false, error: 'not_allowed' });
    expect(w.manager.author(next, created.playerId, { type: 'release', playerId: ira.playerId })).toEqual({ ok: true });
    expect([...next.playerTokens.values()]).toEqual([created.playerId]);
  });
});

describe('a restart from the round (12r path, 13b)', () => {
  const GAME = '11111111-1111-4111-8111-111111111111';

  it('opens a lobby with the saved players offline under new ids; «Start» carries the round and the points', () => {
    const w = world();
    const result = w.manager.restartSaved({
      gameId: GAME,
      quiz: twoRounds(),
      quizId: null,
      hostUserId: 'u1',
      autopilot: false,
      roundIndex: 1,
      participants: [
        { id: 'old-olya', nickname: 'Оля', userId: 'u2', score: 2000, isTeam: false, teamId: null },
        { id: 'old-petro', nickname: 'Петро', userId: null, score: 0, isTeam: false, teamId: null },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    const { room } = result;
    expect(room.state.phase).toBe('lobby');
    expect(room.state.players.map((p) => [p.nickname, p.connected])).toEqual([
      ['Оля', false],
      ['Петро', false],
    ]);
    const olya = room.state.players[0].id;
    expect(['old-olya', 'old-petro']).not.toContain(olya);
    expect(room.id).not.toBe(GAME);
    expect(room.playerUsers.get(olya)).toBe('u2');
    expect(room.continued?.replaces).toBe(GAME);
    expect(w.manager.openFor(GAME)).toBe(true);
    expect(w.manager.restartSaved({ gameId: GAME, quiz: twoRounds(), quizId: null, hostUserId: 'u1', autopilot: false, roundIndex: 0, participants: [] })).toEqual({ ok: false, error: 'continue_open' });
    expect(w.manager.slots(room.code, 'u2')?.mine).toEqual({ id: olya, nickname: 'Оля', team: null });
    expect(w.manager.view(room, HOST)).toMatchObject({ continued: { carryRound: 1 } });

    expect(w.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('intro');
    expect(room.state.roundIndex).toBe(1);
    expect(room.state.players[0].score).toBe(2000);
    expect(room.state.adjustments.filter((a) => a.source === 'carry').map((a) => [a.playerId, a.points])).toEqual([[olya, 2000]]);
  });

  it('a carry key of a player removed in the lobby is dropped before the start', () => {
    const w = world();
    const result = w.manager.restartSaved({
      gameId: GAME,
      quiz: twoRounds(),
      quizId: null,
      hostUserId: 'u1',
      autopilot: false,
      roundIndex: 0,
      participants: [
        { id: 'a', nickname: 'Оля', userId: null, score: 300, isTeam: false, teamId: null },
        { id: 'b', nickname: 'Петро', userId: null, score: 100, isTeam: false, teamId: null },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    const petro = result.room.state.players[1].id;
    expect(w.manager.host(result.room, { type: 'kick', playerId: petro })).toEqual({ ok: true });
    expect(w.manager.host(result.room, { type: 'start' })).toEqual({ ok: true });
    expect(result.room.state.players.map((p) => p.score)).toEqual([300]);
  });

  it('a team person goes into the new team of the same name, the team gets its points', () => {
    const w = world();
    const result = w.manager.restartSaved({
      gameId: GAME,
      quiz: twoRounds(true),
      quizId: null,
      hostUserId: 'u1',
      autopilot: false,
      roundIndex: 1,
      participants: [
        { id: 'old-red', nickname: 'Червоні', userId: null, score: 500, isTeam: true, teamId: null },
        { id: 'old-blue', nickname: 'Сині', userId: null, score: 700, isTeam: true, teamId: null },
        { id: 'old-olya', nickname: 'Оля', userId: null, score: 0, isTeam: false, teamId: 'old-red' },
        { id: 'old-vira', nickname: 'Віра', userId: null, score: 0, isTeam: false, teamId: 'old-blue' },
        { id: 'old-ghost', nickname: 'Гість', userId: null, score: 0, isTeam: false, teamId: 'old-gone' },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    const { teams } = result.room.state;
    const blue = teams!.list.find((t) => t.name === 'Сині')!.id;
    const red = teams!.list.find((t) => t.name === 'Червоні')!.id;
    expect(teams!.members.map((m) => [m.nickname, m.teamId, m.connected])).toEqual([
      ['Оля', red, false],
      ['Віра', blue, false],
      ['Гість', null, false],
    ]);
    expect(result.room.continued?.carry).toEqual({ roundIndex: 1, points: { [red]: 500, [blue]: 700 } });
  });

  it('an autopilot restart makes the author the saved participant of the host account', () => {
    const w = world();
    const result = w.manager.restartSaved({
      gameId: GAME,
      quiz: twoRounds(),
      quizId: null,
      hostUserId: 'u1',
      autopilot: true,
      roundIndex: 1,
      participants: [
        { id: 'a', nickname: 'Іра', userId: null, score: 50, isTeam: false, teamId: null },
        { id: 'b', nickname: 'Марта', userId: 'u1', score: 90, isTeam: false, teamId: null },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    const author = result.author!;
    expect(result.room.state.autopilot?.authorId).toBe(author.playerId);
    expect(result.room.state.players.map((p) => p.nickname)).toEqual(['Марта', 'Іра']);
    expect(w.manager.author(result.room, author.playerId, { type: 'start' })).toEqual({ ok: true });
    expect(result.room.state.roundIndex).toBe(1);
    expect(result.room.state.players.map((p) => p.score)).toEqual([90, 50]);
    expect(w.manager.view(result.room, { role: 'player', playerId: author.playerId })).toMatchObject({ author: { continued: { carryRound: 1 } } });
  });
});

describe('a continuation interrupted again (13b)', () => {
  it('the host away for ten minutes on the gathering pause saves the continuation checkpoint with the same scores', () => {
    const ctx = continued();
    const { manager, room } = ctx;
    ctx.scheduler.advance(HOST_ABSENCE_MS);
    expect(manager.get(room.code)).toBeUndefined();
    const saved = ctx.savedOf();
    expect(saved.state.phase).toBe('leaderboard');
    expect(saved.state.players.map((p) => p.score)).toEqual(ctx.saved.state.players.map((p) => p.score));
    // І вдруге продовжується з того самого місця.
    const again = manager.continueSaved(room.id, 'u1', viaJson(saved));
    if (!again.ok) throw new Error(again.error);
    expect(again.room.id).toBe(ctx.old.id);
    expect(manager.host(again.room, { type: 'resume' })).toEqual({ ok: true });
    expect(manager.host(again.room, { type: 'next' })).toEqual({ ok: true });
    expect(again.room.state.questionIndex).toBe(1);
  });
});

describe('views of a continuation (13b)', () => {
  it('the host sees the slots: taken and account', () => {
    const ctx = continued();
    const { manager, room } = ctx;
    expect(manager.claim(room.code, ctx.taras, null)).toMatchObject({ ok: true });
    expect(manager.view(room, HOST)).toMatchObject({
      continued: {
        slots: [
          { id: ctx.olena, nickname: 'Олена', team: null, taken: false, account: true },
          { id: ctx.taras, nickname: 'Тарас', team: null, taken: true, account: false },
        ],
        carryRound: null,
      },
    });
    // Телефон гравця (не автора) місць не бачить.
    expect(manager.view(room, { role: 'player', playerId: ctx.taras })).not.toHaveProperty('continued');
  });

  it('an ordinary room has no continued key', () => {
    const w = world();
    const room = w.manager.create(quiz(), 'u1', null);
    expect(w.manager.view(room, HOST)).not.toHaveProperty('continued');
  });
});

describe('every start reaches a rest point (13b)', () => {
  it('with the newcomers guide there is no checkpoint on the guide; leaving it for the intro takes one', () => {
    const w = world();
    const base = quiz();
    const room = w.manager.create({ ...base, settings: { ...base.settings, newcomers: true } }, 'u1', null);
    w.manager.join(room.code, 'Оля', null);
    expect(w.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('guide');
    expect(room.checkpoint).toBeNull();
    expect(w.manager.host(room, { type: 'save' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(w.manager.host(room, { type: 'guide-skip' })).toEqual({ ok: true });
    expect(room.checkpoint?.state.phase).toBe('intro');
  });

  it('a 12r start with carried points takes the checkpoint on its intro', () => {
    const w = world();
    const result = w.manager.restartSaved({
      gameId: '22222222-2222-4222-8222-222222222222',
      quiz: twoRounds(),
      quizId: null,
      hostUserId: 'u1',
      autopilot: false,
      roundIndex: 2,
      participants: [{ id: 'a', nickname: 'Оля', userId: null, score: 10, isTeam: false, teamId: null }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(w.manager.host(result.room, { type: 'start' })).toEqual({ ok: true });
    expect(result.room.checkpoint?.state).toMatchObject({ phase: 'intro', roundIndex: 2 });
  });
});

describe('a restart of the server (13b)', () => {
  it('snapshot and restore keep continued; bound goes as an array', () => {
    const ctx = continued();
    const { manager, room } = ctx;
    expect(manager.claim(room.code, ctx.taras, 'u3')).toMatchObject({ ok: true });
    const snap = viaJson(manager.snapshot(room)) as SavedRoom;
    expect(snap.continued).toEqual({ bound: [ctx.taras], carry: null, replaces: null });
    const other = new RoomManager(new FakeScheduler(), () => 0.5);
    const restored = other.restore(snap);
    expect(restored?.continued).toEqual({ bound: new Set([ctx.taras]), carry: null, replaces: null });
    expect(other.openFor(ctx.old.id)).toBe(true);

    const plain = ctx.manager.create(quiz(), 'u1', null);
    expect(manager.snapshot(plain)).not.toHaveProperty('continued');
    expect(new RoomManager(new FakeScheduler()).restore(viaJson(manager.snapshot(plain)))?.continued).toBeNull();
  });
});
