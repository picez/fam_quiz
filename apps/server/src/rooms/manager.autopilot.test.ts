import { describe, expect, it, vi } from 'vitest';
import { bluff, classicRound, cloud, makeQuiz, makeRoundsQuiz, single, sortQ, text } from '@quiz/engine/testing';
import { paceWindow, sortOf, stageView, type GameState } from '@quiz/engine';
import { defaultTeams, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import type { Scheduler } from './scheduler';
import { AUTOPILOT_EMPTY_MS, HOST_ABSENCE_MS, LOBBY_TTL_MS, RoomManager, type HostAction, type Identity, type Room } from './manager';

const correct = { type: 'single', optionId: 'b' } as const;
const odesa = { type: 'text', value: 'Одеса' } as const;

/** Детермінований rng без нічиїх кубиків: крок золотого перетину. */
function steppingRng(): () => number {
  let i = 0;
  return () => ((i++ * 0.618034) % 1 + 1) % 1;
}

/** Кімната-автопілот: автор Марта на зв'язку, Тарас (і решта з names) увійшли й на зв'язку. */
function autopilot(quiz: Quiz, options: { pacing?: boolean; names?: string[]; warn?: (message: string) => void } = {}) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, steppingRng(), { pacing: options.pacing ?? false, warn: options.warn });
  const created = manager.createAutopilot(quiz, 'u1', 'q1', 'Марта');
  if (!created.ok) throw new Error(created.error);
  const { room } = created;
  const author: Identity = { role: 'player', playerId: created.playerId };
  manager.connect(room, author);
  const others = (options.names ?? ['Тарас']).map((name) => {
    const joined = manager.join(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    const identity: Identity = { role: 'player', playerId: joined.playerId };
    manager.connect(room, identity);
    return { ...joined, identity };
  });
  const act = (action: HostAction, by = created.playerId) => manager.author(room, by, action);
  return { scheduler, manager, room, author, authorId: created.playerId, token: created.token, others, act };
}

const twoQuestions = () => makeQuiz([single, text], { leaderboard: 'each' });

describe('creating an autopilot room (11g)', () => {
  it('the author joins as an offline player with an account; there is no host to identify', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const created = manager.createAutopilot(twoQuestions(), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room, playerId, token } = created;
    expect(room.state.autopilot?.authorId).toBe(playerId);
    expect(room.state.players.map((p) => [p.nickname, p.connected])).toEqual([['Марта', false]]);
    expect(room.playerUsers.get(playerId)).toBe('u1');
    expect(room.hostUserId).toBe('u1');
    expect(room.quizId).toBe('q1');
    expect(manager.identify(room.code, 'host', room.hostToken)).toBeNull();
    expect(manager.identify(room.code, 'player', token)?.identity).toEqual({ role: 'player', playerId });
    expect(manager.identify(room.code, 'stage', room.stageToken)?.room).toBe(room);
    expect(manager.hostOnline(room)).toBe(true);
    manager.connect(room, { role: 'player', playerId });
    expect(room.state.players[0].connected).toBe(true);
  });

  it('refuses a bad nickname and creates nothing while frozen', () => {
    const manager = new RoomManager(new FakeScheduler());
    expect(manager.createAutopilot(twoQuestions(), 'u1', null, '  ')).toMatchObject({ ok: false });
    manager.freeze();
    expect(manager.createAutopilot(twoQuestions(), 'u1', null, 'Марта')).toEqual({ ok: false, error: 'restarting' });
    expect(manager.size).toBe(0);
  });

  it('the stage view is marked; only the author gets the author view', () => {
    const { manager, room, author, others } = autopilot(twoQuestions());
    expect(stageView(room.state).autopilot).toBe(true);
    const mine = manager.view(room, author);
    const theirs = manager.view(room, others[0].identity);
    expect(mine && 'author' in mine ? mine.author : undefined).not.toBeNull();
    expect(theirs && 'author' in theirs ? theirs.author : undefined).toBeNull();
  });
});

describe('author actions (11g)', () => {
  it('the author starts; another player or any other action is not allowed; a hosted room answers forbidden', () => {
    const { manager, room, act, others } = autopilot(twoQuestions());
    expect(act({ type: 'start' }, others[0].playerId)).toEqual({ ok: false, error: 'not_allowed' });
    expect(act({ type: 'start' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('intro');
    for (const action of [
      { type: 'next' },
      { type: 'lock' },
      { type: 'adjust', playerId: others[0].playerId, points: 100 },
      { type: 'time', seconds: 15 },
      { type: 'end-round' },
      { type: 'skip' },
    ] satisfies HostAction[]) {
      expect(act(action)).toEqual({ ok: false, error: 'not_allowed' });
    }
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: false, error: 'forbidden' });

    const hosted = manager.create(twoQuestions());
    const joined = manager.join(hosted.code, 'Олена');
    if (!joined.ok) throw new Error(joined.error);
    expect(manager.author(hosted, joined.playerId, { type: 'start' })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('the author kicks another player but not themselves', () => {
    const { manager, room, act, authorId, others } = autopilot(twoQuestions());
    const taras = others[0];
    expect(act({ type: 'kick', playerId: authorId })).toEqual({ ok: false, error: 'not_allowed' });
    expect(act({ type: 'kick', playerId: taras.playerId })).toEqual({ ok: true });
    expect(room.state.players.map((p) => p.nickname)).toEqual(['Марта']);
    expect(manager.identify(room.code, 'player', taras.token)).toBeNull();
  });

  it('the author ends the game at once', () => {
    const { room, act } = autopilot(twoQuestions());
    act({ type: 'start' });
    expect(act({ type: 'end' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('finished');
  });

  it('cloud words are hidden only at the reveal, by the author only', () => {
    const { scheduler, room, act, manager, authorId, others } = autopilot(makeQuiz([cloud, single]));
    act({ type: 'start' });
    scheduler.advance(8000);
    expect(room.state.phase).toBe('question');
    expect(act({ type: 'cloud-hide', key: 'море', hidden: true })).toEqual({ ok: false, error: 'wrong_phase' });
    manager.answer(room, authorId, { type: 'wordcloud', words: ['сонце', 'море'] });
    manager.answer(room, others[0].playerId, { type: 'wordcloud', words: ['сонце', 'ліс'] });
    expect(room.state.phase).toBe('locked');
    scheduler.advance(1500);
    expect(room.state.phase).toBe('reveal');
    expect(act({ type: 'cloud-hide', key: 'море', hidden: true }, others[0].playerId)).toEqual({ ok: false, error: 'not_allowed' });
    expect(act({ type: 'cloud-hide', key: 'море', hidden: true })).toEqual({ ok: true });
    expect(stageView(room.state).cloud!.map((w) => w.key)).not.toContain('море');
    expect(stageView(room.state).cloud!.map((w) => w.key)).toContain('ліс');
  });

  it('bluff lies are removed at the choice stage only after the author picked; the truth is not; at the reveal it is the wrong phase', () => {
    const { scheduler, room, act, manager, authorId, others } = autopilot(makeQuiz([bluff, single]), { names: ['Тарас', 'Іра'] });
    const people = [authorId, ...others.map((o) => o.playerId)];
    act({ type: 'start' });
    scheduler.advance(8000);
    ['Рим', 'Мілан', 'Париж'].forEach((lie, i) => expect(manager.lie(room, people[i], lie)).toEqual({ ok: true }));
    const options = () => room.state.plays[0].bluff!.options;
    expect(room.state.plays[0].bluff!.stage).toBe('choice');
    const milan = options().find((o) => o.text === 'Мілан')!;
    const paris = options().find((o) => o.text === 'Париж')!;
    const truth = options().find((o) => o.kind === 'truth')!;
    expect(act({ type: 'bluff-remove', optionId: milan.id }, others[0].playerId)).toEqual({ ok: false, error: 'not_allowed' });
    // Автор ще не вибрав: однакова відмова для вигадки й правди.
    expect(act({ type: 'bluff-remove', optionId: milan.id })).toEqual({ ok: false, error: 'pick_first' });
    expect(act({ type: 'bluff-remove', optionId: truth.id })).toEqual({ ok: false, error: 'pick_first' });
    expect(manager.bluff(room, authorId, paris.id)).toEqual({ ok: true });
    expect(act({ type: 'bluff-remove', optionId: paris.id })).toEqual({ ok: false, error: 'not_allowed' });
    expect(act({ type: 'bluff-remove', optionId: milan.id })).toEqual({ ok: true });
    expect(options().find((o) => o.id === milan.id)!.removed).toBe(true);
    expect(room.state.plays[0].bluff!.picks[authorId].optionId).toBe(paris.id);
    expect(act({ type: 'bluff-remove', optionId: truth.id })).toEqual({ ok: false, error: 'not_allowed' });
    for (const id of people.slice(1)) expect(manager.bluff(room, id, truth.id)).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
    scheduler.advance(1500);
    expect(room.state.phase).toBe('reveal');
    const lie = options().find((o) => o.kind !== 'truth' && !o.removed)!;
    expect(act({ type: 'bluff-remove', optionId: lie.id })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a team game with dice: the author picks the form and starts, the rest is thrown after 15 s, then the game starts by itself', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single])], { teams: defaultTeams(2) });
    const { scheduler, room, act, manager, others } = autopilot(quiz, { names: ['Тарас', 'Іра'] });
    expect(act({ type: 'team-form', form: 'dice' }, others[0].playerId)).toEqual({ ok: false, error: 'not_allowed' });
    expect(act({ type: 'team-form', form: 'dice' })).toEqual({ ok: true });
    expect(room.state.teams?.form).toBe('dice');
    expect(act({ type: 'start' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('lobby');
    expect(room.state.autopilot?.starting).toBe(true);
    const tour = room.state.teams!.dice!.waiting;
    expect(tour).toHaveLength(3);
    for (const id of tour.slice(0, 2)) expect(manager.teamRoll(room, id)).toEqual({ ok: true });
    scheduler.advance(14_999);
    expect(room.state.phase).toBe('lobby');
    scheduler.advance(1);
    expect(room.state.teams!.members.every((m) => m.teamId !== null)).toBe(true);
    expect(room.state.phase).toBe('intro');
    expect(room.state.autopilot?.starting).toBeUndefined();
    // Спосіб формування — лише в лобі.
    expect(act({ type: 'team-form', form: 'pick' })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

/** Автопілот на першому запитанні: автор і Тарас на зв'язку. */
function atQuestion(quiz: Quiz = twoQuestions(), pacing = false) {
  const ctx = autopilot(quiz, { pacing });
  expect(ctx.act({ type: 'start' })).toEqual({ ok: true });
  ctx.scheduler.advance(7999);
  expect(ctx.room.state.phase).toBe('intro');
  ctx.scheduler.advance(1);
  expect(ctx.room.state.phase).toBe('question');
  return ctx;
}

/** Обидва відповіли правильно → locked → +1500 reveal. */
function toReveal(ctx: ReturnType<typeof atQuestion>, answer: typeof correct | typeof odesa = correct) {
  expect(ctx.manager.answer(ctx.room, ctx.authorId, answer)).toEqual({ ok: true });
  expect(ctx.manager.answer(ctx.room, ctx.others[0].playerId, answer)).toEqual({ ok: true });
  expect(ctx.room.state.phase).toBe('locked');
  ctx.scheduler.advance(1499);
  expect(ctx.room.state.phase).toBe('locked');
  ctx.scheduler.advance(1);
  expect(ctx.room.state.phase).toBe('reveal');
}

function playThrough(pacing: boolean) {
  const ctx = atQuestion(twoQuestions(), pacing);
  const { scheduler, room } = ctx;
  const changes: { prev: GameState; next: GameState; at: number }[] = [];
  let prev = room.state;
  ctx.manager.onEvent((r) => {
    if (r.state !== prev && r.state.phase !== prev.phase) changes.push({ prev, next: r.state, at: scheduler.now() });
    prev = r.state;
  });
  toReveal(ctx);
  scheduler.advance(5999);
  expect(room.state.phase).toBe('reveal');
  scheduler.advance(1);
  expect(room.state.phase).toBe('leaderboard');
  scheduler.advance(4999);
  expect(room.state.phase).toBe('leaderboard');
  scheduler.advance(1);
  expect(room.state.phase).toBe('question');
  expect(room.state.questionIndex).toBe(1);
  toReveal(ctx, odesa);
  for (let i = 0; i < 20 && room.state.phase !== 'finished'; i++) scheduler.advance(1000);
  expect(room.state.phase).toBe('finished');
  expect(room.state.players.every((p) => p.score > 0)).toBe(true);
  return changes;
}

describe('an autopilot game with no presses (11g)', () => {
  it('goes from the intro to the podium on the table timings', () => {
    playThrough(false);
  });

  it('with 11b pacing no step comes before its pace window', () => {
    const changes = playThrough(true);
    expect(changes.length).toBeGreaterThanOrEqual(7);
    for (const { prev, at } of changes) {
      const until = paceWindow(prev, 'next')?.until ?? 0;
      if (prev.phase !== 'question') expect(at).toBeGreaterThanOrEqual(until);
    }
    const toBoard = changes.find((c) => c.prev.phase === 'reveal' && c.next.phase === 'leaderboard')!;
    expect(toBoard.at - toBoard.prev.stepAt!).toBe(6000);
  });

  it('the engine timer closes an unanswered question, then the autopilot reveals 1.5 s later', () => {
    const { scheduler, room } = atQuestion(makeQuiz([{ ...single, timeLimit: 10 }, text], { leaderboard: 'each' }));
    scheduler.advance(9999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
    scheduler.advance(1500);
    expect(room.state.phase).toBe('reveal');
  });
});

describe('pauses of an autopilot room (11g)', () => {
  it('an author pause holds until the author resumes, then the rest of the reveal runs', () => {
    const ctx = atQuestion();
    const { scheduler, room, act, others } = ctx;
    toReveal(ctx);
    scheduler.advance(2000);
    expect(act({ type: 'pause' }, others[0].playerId)).toEqual({ ok: false, error: 'not_allowed' });
    expect(act({ type: 'pause' })).toEqual({ ok: true });
    scheduler.advance(60_000);
    expect(room.state.phase).toBe('reveal');
    expect(room.state.paused).toBe(true);
    expect(act({ type: 'resume' })).toEqual({ ok: true });
    scheduler.advance(3999);
    expect(room.state.phase).toBe('reveal');
    scheduler.advance(1);
    expect(room.state.phase).toBe('leaderboard');
  });

  it('nobody online pauses the game; the 10 host minutes do not apply; the first return resumes it 3 s later', () => {
    const { scheduler, room, manager, author, others } = atQuestion();
    manager.disconnect(room, author);
    expect(room.state.paused).toBe(false);
    manager.disconnect(room, others[0].identity);
    expect(room.state.paused).toBe(true);
    scheduler.advance(HOST_ABSENCE_MS);
    expect(room.state.phase).toBe('question');
    expect(room.state.paused).toBe(true);
    manager.connect(room, others[0].identity);
    scheduler.advance(2999);
    expect(room.state.paused).toBe(true);
    scheduler.advance(1);
    expect(room.state.paused).toBe(false);
    expect(room.state.phase).toBe('question');
  });

  it('30 minutes with nobody online end the game; a return before that clears the timer', () => {
    const first = atQuestion();
    first.manager.disconnect(first.room, first.author);
    first.manager.disconnect(first.room, first.others[0].identity);
    first.scheduler.advance(AUTOPILOT_EMPTY_MS - 1);
    expect(first.room.state.phase).toBe('question');
    first.scheduler.advance(1);
    expect(first.room.state.phase).toBe('finished');

    const second = atQuestion();
    second.manager.disconnect(second.room, second.author);
    second.manager.disconnect(second.room, second.others[0].identity);
    second.scheduler.advance(AUTOPILOT_EMPTY_MS - 1);
    second.manager.connect(second.room, second.author);
    expect(second.scheduler.pending()).not.toContain(1);
    second.scheduler.advance(3000);
    expect(second.room.state.paused).toBe(false);
    expect(second.room.state.phase).not.toBe('finished');
  });

  it('a lobby with nobody online is not ended by the autopilot timer', () => {
    const { scheduler, room, manager, author, others } = autopilot(twoQuestions());
    manager.disconnect(room, author);
    manager.disconnect(room, others[0].identity);
    scheduler.advance(AUTOPILOT_EMPTY_MS);
    expect(room.state.phase).toBe('lobby');
    expect(room.state.paused).toBe(false);
  });
});


describe('autopilot review fixes (11g)', () => {
  /** Розкриття першого запитання: автор і Тарас на зв'язку. */
  function atReveal() {
    const ctx = atQuestion();
    toReveal(ctx);
    return ctx;
  }

  it('an author pause is lifted when the author stays away for 10 minutes while others play on', () => {
    const { scheduler, room, act, manager, author } = atReveal();
    scheduler.advance(2000);
    expect(act({ type: 'pause' })).toEqual({ ok: true });
    manager.disconnect(room, author);
    scheduler.advance(HOST_ABSENCE_MS - 1);
    expect(room.state.paused).toBe(true);
    scheduler.advance(1);
    expect(room.state.paused).toBe(false);
    expect(room.state.autopilot?.hold).toBeUndefined();
    // Залишок розкриття: 4000 мс.
    scheduler.advance(3999);
    expect(room.state.phase).toBe('reveal');
    scheduler.advance(1);
    expect(room.state.phase).toBe('leaderboard');
  });

  it('an author who comes back within 10 minutes keeps the pause', () => {
    const { scheduler, room, act, manager, author } = atReveal();
    expect(act({ type: 'pause' })).toEqual({ ok: true });
    manager.disconnect(room, author);
    scheduler.advance(HOST_ABSENCE_MS - 1);
    manager.connect(room, author);
    expect(scheduler.pending()).toEqual([]);
    scheduler.advance(HOST_ABSENCE_MS);
    expect(room.state.paused).toBe(true);
    expect(room.state.autopilot?.hold).toBe('author');
  });

  it('an author pause with nobody online still ends in 30 minutes', () => {
    const { scheduler, room, act, manager, author, others } = atReveal();
    expect(act({ type: 'pause' })).toEqual({ ok: true });
    manager.disconnect(room, others[0].identity);
    manager.disconnect(room, author);
    scheduler.advance(AUTOPILOT_EMPTY_MS - 1);
    expect(room.state.phase).toBe('reveal');
    expect(room.state.paused).toBe(true);
    scheduler.advance(1);
    expect(room.state.phase).toBe('finished');
  });

  it('only one pilot timer is pending after back-to-back steps', () => {
    const { scheduler, room } = atReveal();
    expect(scheduler.pending()).toEqual([6000]);
    scheduler.advance(6000);
    expect(room.state.phase).toBe('leaderboard');
    expect(scheduler.pending()).toEqual([5000]);
    scheduler.advance(5000);
    expect(room.state.phase).toBe('question');
    // Лише таймер запитання рушія, кроку автопілота немає.
    expect(room.pilot).toBeNull();
    expect(scheduler.pending()).toEqual([20_000]);
  });

  it('freeze, evict and close clear the pilot timer, and no step happens after a freeze', () => {
    const frozen = atReveal();
    expect(frozen.room.pilot).not.toBeNull();
    const before = frozen.room.state;
    frozen.manager.freeze();
    expect(frozen.room.pilot).toBeNull();
    frozen.scheduler.advance(60_000);
    expect(frozen.room.state).toBe(before);
    expect(frozen.scheduler.pending()).toEqual([]);

    const evicted = atReveal();
    evicted.manager.evict(evicted.room);
    expect(evicted.room.pilot).toBeNull();
    expect(evicted.scheduler.pending()).toEqual([]);

    // Закриття: лобі з туром кубиків, крок якого стоїть далі за LOBBY_TTL_MS.
    const quiz = makeRoundsQuiz([classicRound('r1', [single])], { teams: defaultTeams(2) });
    const lobby = autopilot(quiz, { names: ['Тарас', 'Іра'] });
    lobby.act({ type: 'team-form', form: 'dice' });
    lobby.act({ type: 'start' });
    lobby.room.state = { ...lobby.room.state, autopilot: { ...lobby.room.state.autopilot!, at: lobby.scheduler.now() + 3 * LOBBY_TTL_MS } };
    expect(lobby.manager.join(lobby.room.code, 'Олег').ok).toBe(true);
    expect(lobby.room.pilot).not.toBeNull();
    lobby.scheduler.advance(LOBBY_TTL_MS);
    expect(lobby.manager.get(lobby.room.code)).toBeUndefined();
    expect(lobby.room.pilot).toBeNull();
    expect(lobby.scheduler.pending()).toEqual([]);
  });

  it('a lagging pilot timer never acts on a stage it did not plan: the engine deadline goes first, the step is planned anew', () => {
    const scheduler = new ManualScheduler();
    const manager = new RoomManager(scheduler, steppingRng());
    const created = manager.createAutopilot(twoQuestions(), 'u1', null, 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room } = created;
    const taras = manager.join(room.code, 'Тарас');
    if (!taras.ok) throw new Error(taras.error);
    manager.connect(room, { role: 'player', playerId: created.playerId });
    manager.connect(room, { role: 'player', playerId: taras.playerId });
    manager.author(room, created.playerId, { type: 'start' });
    scheduler.jump(8000);
    scheduler.fire(room.pilot);
    expect(room.state.phase).toBe('question');
    // Мить кроку раніше за кінець запитання (20 с), а таймер спрацьовує вже після нього.
    room.state = { ...room.state, autopilot: { ...room.state.autopilot!, at: scheduler.now() + 5000 } };
    expect(manager.answer(room, created.playerId, correct)).toEqual({ ok: true });
    expect(room.pilot).not.toBeNull();
    scheduler.jump(25_000);
    scheduler.fire(room.pilot);
    expect(room.state.phase).toBe('locked');
    expect(room.state.autopilot?.at).toBe(scheduler.now() + 1500);
  });

  it('a step the engine refuses is logged and retried every 5 s: the game neither stalls nor spins', () => {
    const warn = vi.fn();
    const { scheduler, room, act, manager, others } = autopilot(twoQuestions(), { warn });
    act({ type: 'start' });
    scheduler.advance(8000);
    expect(room.state.phase).toBe('question');
    // Поле без поля: skipTurn рушій відхиляє щоразу.
    room.state = { ...room.state, phase: 'board', board: null, autopilot: { ...room.state.autopilot!, at: scheduler.now() + 1000 } };
    manager.disconnect(room, others[0].identity);
    expect(room.pilot).not.toBeNull();
    scheduler.advance(1000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(room.code);
    expect(room.state.phase).toBe('board');
    expect(room.state.autopilot?.at).toBe(scheduler.now() + 5000);
    scheduler.advance(4999);
    expect(warn).toHaveBeenCalledTimes(1);
    scheduler.advance(1);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(room.state.autopilot?.at).toBe(scheduler.now() + 5000);
  });

  it('tilts are cleared when nobody online pauses the game', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [sortQ])], { teams: defaultTeams(2) });
    const { scheduler, room, act, manager, author, authorId, others } = autopilot(quiz);
    expect(act({ type: 'start' })).toEqual({ ok: true });
    scheduler.advance(8000);
    expect(room.state.phase).toBe('question');
    const teamId = room.state.teams!.members.find((m) => m.id === authorId)!.teamId!;
    const head = sortOf(room.state, teamId).queue[0];
    expect(manager.tilt(room, authorId, { wordId: head, categoryId: 'c1', amount: 0.5 })).toEqual({ ok: true });
    expect(room.tilts.size).toBe(1);
    manager.disconnect(room, others[0].identity);
    manager.disconnect(room, author);
    expect(room.state.paused).toBe(true);
    expect(room.tilts.size).toBe(0);
  });
});

/** Годинник для запізнілих таймерів: час іде лише через jump, таймер спрацьовує лише через fire. */
class ManualScheduler implements Scheduler {
  private time = 1_000_000;
  private sequence = 0;
  private readonly timers = new Map<number, () => void>();

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, _ms: number): unknown {
    this.sequence += 1;
    this.timers.set(this.sequence, fn);
    return this.sequence;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  jump(ms: number): void {
    this.time += ms;
  }

  fire(handle: Room['pilot']): void {
    const fn = this.timers.get(handle as number);
    if (fn === undefined) throw new Error('no such timer');
    this.timers.delete(handle as number);
    fn();
  }
}
