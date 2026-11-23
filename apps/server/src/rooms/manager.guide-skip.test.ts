import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { AUTOPILOT_MS, defaultTeams, type GuideSkipView, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type HostAction, type Identity, type Room, type RoomEvent } from './manager';

const guideQuiz = (teams = false): Quiz => makeRoundsQuiz([classicRound('r1', [single])], { newcomers: true, ...(teams ? { teams: defaultTeams(2) } : {}) });

/** Кімната-автопілот на «Як грати»: автор Марта й решта з names на зв'язку. */
function guided(options: { names?: string[]; teams?: boolean } = {}) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
  const created = manager.createAutopilot(guideQuiz(options.teams), 'u1', 'q1', 'Марта');
  if (!created.ok) throw new Error(created.error);
  const { room } = created;
  const author: Identity = { role: 'player', playerId: created.playerId };
  manager.connect(room, author);
  const others = (options.names ?? ['Тарас', 'Іра', 'Олег']).map((name) => {
    const joined = manager.join(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    const identity: Identity = { role: 'player', playerId: joined.playerId };
    manager.connect(room, identity);
    return { ...joined, identity };
  });
  const act = (action: HostAction, by = created.playerId) => manager.author(room, by, action);
  if (options.teams === true) expect(act({ type: 'team-form', form: 'random' })).toEqual({ ok: true });
  expect(act({ type: 'start' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('guide');
  return { scheduler, manager, room, author, authorId: created.playerId, others, act };
}

const skipOf = (manager: RoomManager, room: Room, identity: Identity): GuideSkipView | undefined => manager.view(room, identity)?.guide?.skip;
const STAGE: Identity = { role: 'stage', playerId: null };

describe('guide skip vote (75)', () => {
  it('a vote shows on the phone and the stage, a second tap with false takes it back', () => {
    const { manager, room, author, others } = guided();
    const taras = others[0];
    expect(manager.guideVote(room, taras.playerId, true)).toEqual({ ok: true });
    expect(skipOf(manager, room, taras.identity)).toEqual({ votes: 1, of: 4, mine: true });
    expect(skipOf(manager, room, author)).toEqual({ votes: 1, of: 4, mine: false });
    expect(skipOf(manager, room, STAGE)).toEqual({ votes: 1, of: 4 });
    expect(manager.guideVote(room, taras.playerId, false)).toEqual({ ok: true });
    expect(skipOf(manager, room, taras.identity)).toEqual({ votes: 0, of: 4, mine: false });
    expect(room.state.phase).toBe('guide');
  });

  it('the same vote twice is ok and emits nothing new', () => {
    const { manager, room, others } = guided();
    const events: RoomEvent[] = [];
    manager.onEvent((_room, event) => events.push(event));
    expect(manager.guideVote(room, others[0].playerId, true)).toEqual({ ok: true });
    const after = events.filter((e) => e.type === 'changed').length;
    expect(after).toBe(1);
    expect(manager.guideVote(room, others[0].playerId, true)).toEqual({ ok: true });
    expect(manager.guideVote(room, others[1].playerId, false)).toEqual({ ok: true });
    expect(events.filter((e) => e.type === 'changed').length).toBe(after);
  });

  it('majority skips to the first round with its splash', () => {
    // Заставка — та сама, що після «До гри» ведучого.
    const hosted = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const live = hosted.create(guideQuiz());
    hosted.connect(live, { role: 'host', playerId: null });
    const olena = hosted.join(live.code, 'Олена');
    if (!olena.ok) throw new Error(olena.error);
    hosted.connect(live, { role: 'player', playerId: olena.playerId });
    hosted.host(live, { type: 'start' });
    expect(hosted.host(live, { type: 'guide-skip' })).toEqual({ ok: true });

    const four = guided();
    expect(four.manager.guideVote(four.room, four.others[0].playerId, true)).toEqual({ ok: true });
    expect(four.room.state.phase).toBe('guide');
    // Голос, що дає більшість, — одна розсилка, і вже з intro: без проміжної guide з N голосами.
    const phases: string[] = [];
    four.manager.onEvent((r, event) => {
      if (event.type === 'changed') phases.push(r.state.phase);
    });
    expect(four.manager.guideVote(four.room, four.authorId, true)).toEqual({ ok: true });
    expect(phases).toEqual(['intro']);
    expect(four.room.state.phase).toBe('intro');
    expect(four.room.state.splash?.kind).toBe(live.state.splash?.kind);
    expect(four.room.guideVotes.size).toBe(0);

    const three = guided({ names: ['Тарас', 'Іра'] });
    expect(three.manager.guideVote(three.room, three.others[0].playerId, true)).toEqual({ ok: true });
    expect(three.room.state.phase).toBe('guide');
    expect(three.manager.guideVote(three.room, three.others[1].playerId, true)).toEqual({ ok: true });
    expect(three.room.state.phase).toBe('intro');

    const one = guided({ names: [] });
    expect(one.manager.guideVote(one.room, one.authorId, true)).toEqual({ ok: true });
    expect(one.room.state.phase).toBe('intro');
  });

  it('team game counts people, not teams', () => {
    const { manager, room, author } = guided({ teams: true });
    const members = room.state.teams!.members;
    expect(members.every((m) => m.teamId !== null)).toBe(true);
    const teamId = members[0].teamId;
    const mates = members.filter((m) => m.teamId === teamId).map((m) => m.id);
    expect(mates).toHaveLength(2);
    expect(manager.guideVote(room, mates[0], true)).toEqual({ ok: true });
    expect(skipOf(manager, room, author)?.of).toBe(4);
    expect(skipOf(manager, room, author)?.votes).toBe(1);
    expect(room.state.phase).toBe('guide');
    expect(manager.guideVote(room, mates[1], true)).toEqual({ ok: true });
    expect(room.state.phase).toBe('intro');
  });

  it('a disconnect can complete the majority', () => {
    const { manager, room, author, others } = guided({ names: ['Тарас', 'Іра'] });
    expect(manager.guideVote(room, others[0].playerId, true)).toEqual({ ok: true });
    expect(skipOf(manager, room, author)).toMatchObject({ votes: 1, of: 3 });
    expect(room.state.phase).toBe('guide');
    manager.disconnect(room, others[1].identity);
    expect(room.state.phase).toBe('intro');
    expect(room.guideVotes.size).toBe(0);
  });

  it('an offline voter does not count until back', () => {
    const { manager, room, author, others } = guided();
    const taras = others[0];
    expect(manager.guideVote(room, taras.playerId, true)).toEqual({ ok: true });
    manager.disconnect(room, taras.identity);
    expect(skipOf(manager, room, author)).toEqual({ votes: 0, of: 3, mine: false });
    expect(room.state.phase).toBe('guide');
    manager.connect(room, taras.identity);
    expect(skipOf(manager, room, taras.identity)).toEqual({ votes: 1, of: 4, mine: true });
  });

  it('leaving the guide any way clears votes', () => {
    // (а) автопілот сам доходить до кінця сторінок.
    const { scheduler, manager, room, others } = guided();
    expect(manager.guideVote(room, others[0].playerId, true)).toEqual({ ok: true });
    const pages = manager.view(room, others[0].identity)!.guide!.pages.length;
    for (let i = 0; i < pages + 1 && room.state.phase === 'guide'; i++) scheduler.advance(AUTOPILOT_MS.guide);
    expect(room.state.phase).toBe('intro');
    expect(room.guideVotes.size).toBe(0);
    expect(manager.guideVote(room, others[0].playerId, true)).toEqual({ ok: false, error: 'wrong_phase' });

    // (б) кімната бота: адмін тисне «До гри».
    const bots = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const created = bots.createBotRoom(guideQuiz(), 'q-bot');
    if (!created.ok) throw new Error(created.error);
    const bot = created.room;
    const ids = ['Оля', 'Петро', 'Ліна'].map((name) => {
      const joined = bots.join(bot.code, name, null);
      if (!joined.ok) throw new Error(joined.error);
      bots.connect(bot, { role: 'player', playerId: joined.playerId });
      return joined.playerId;
    });
    expect(bots.botAct(bot.code, 'start')).toEqual({ ok: true });
    expect(bot.state.phase).toBe('guide');
    expect(bots.guideVote(bot, ids[0], true)).toEqual({ ok: true });
    expect(bot.state.phase).toBe('guide');
    // Пульт адміна (вигляд host) рядка голосування не має, хоч голос уже є.
    const hostGuide = bots.view(bot, { role: 'host', playerId: null })?.guide;
    expect(hostGuide).toBeTruthy();
    expect(hostGuide).not.toHaveProperty('skip');
    expect(bots.adminHost(bot, { type: 'guide-skip' })).toEqual({ ok: true });
    expect(bot.state.phase).toBe('intro');
    expect(bot.guideVotes.size).toBe(0);
  });

  it('pause refuses votes and a ready majority fires on resume', () => {
    const { scheduler, manager, room, others, act } = guided();
    expect(manager.guideVote(room, others[0].playerId, true)).toEqual({ ok: true });
    expect(act({ type: 'pause' })).toEqual({ ok: true });
    expect(manager.guideVote(room, others[1].playerId, true)).toEqual({ ok: false, error: 'paused' });
    manager.disconnect(room, others[1].identity);
    manager.disconnect(room, others[2].identity);
    expect(room.state.phase).toBe('guide');
    scheduler.advance(1000);
    expect(act({ type: 'resume' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('intro');
    expect(room.guideVotes.size).toBe(0);
  });

  it('refusals', () => {
    const hosted = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const live = hosted.create(guideQuiz());
    hosted.connect(live, { role: 'host', playerId: null });
    const olena = hosted.join(live.code, 'Олена');
    if (!olena.ok) throw new Error(olena.error);
    const olenaId: Identity = { role: 'player', playerId: olena.playerId };
    hosted.connect(live, olenaId);
    hosted.host(live, { type: 'start' });
    expect(live.state.phase).toBe('guide');
    expect(hosted.guideVote(live, olena.playerId, true)).toEqual({ ok: false, error: 'not_allowed' });
    expect(hosted.view(live, olenaId)?.guide).not.toBeNull();
    expect(skipOf(hosted, live, olenaId)).toBeUndefined();
    expect(skipOf(hosted, live, STAGE)).toBeUndefined();
    expect(hosted.view(live, olenaId)?.guide).not.toHaveProperty('skip');

    // Автопілот у лобі.
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
    const created = manager.createAutopilot(guideQuiz(), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    manager.connect(created.room, { role: 'player', playerId: created.playerId });
    expect(manager.guideVote(created.room, created.playerId, true)).toEqual({ ok: false, error: 'wrong_phase' });

    const { manager: m, room, scheduler: s, authorId, author } = guided({ names: ['Тарас'] });
    expect(m.guideVote(room, 'nobody', true)).toEqual({ ok: false, error: 'not_found' });
    // Пульт ключа skip не отримує, навіть коли голоси є: у автопілоті пульта немає, тож лише перевірка на question.
    for (let i = 0; i < 100 && room.state.phase !== 'question'; i++) s.advance(1000);
    expect(room.state.phase).toBe('question');
    expect(m.guideVote(room, authorId, true)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(m.view(room, author)?.guide).toBeNull();
  });

  it('a room raised from a snapshot starts with no votes', () => {
    const { scheduler, manager, room, others, authorId, author } = guided({ names: ['Тарас', 'Іра'] });
    expect(manager.guideVote(room, others[0].playerId, true)).toEqual({ ok: true });
    const saved = JSON.parse(JSON.stringify(manager.snapshot(room)));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5, { pacing: false });
    const back = next.restore(saved) as Room;
    expect(back.state.phase).toBe('guide');
    expect(back.guideVotes).toBeInstanceOf(Set);
    expect(back.guideVotes.size).toBe(0);
    for (const identity of [author, ...others.map((o) => o.identity)]) next.connect(back, identity);
    // Піднята зі знімка кімната стоїть на паузі, доки автор не зніме її.
    expect(back.state.paused).toBe(true);
    expect(next.author(back, authorId, { type: 'resume' })).toEqual({ ok: true });
    expect(back.state.paused).toBe(false);
    expect(skipOf(next, back, others[0].identity)).toEqual({ votes: 0, of: 3, mine: false });
    expect(next.guideVote(back, others[0].playerId, true)).toEqual({ ok: true });
    expect(back.state.phase).toBe('guide');
    expect(next.guideVote(back, others[1].playerId, true)).toEqual({ ok: true });
    expect(back.state.phase).toBe('intro');
  });
});
