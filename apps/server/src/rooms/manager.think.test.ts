import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, think, thinkRound } from '@quiz/engine/testing';
import { answererOf, memberOf, teamMembers, thinkPlaces } from '@quiz/engine';
import { defaultTeams, type PlayerThink, type Quiz, type ThinkInfo, type ThinkWord } from '@quiz/shared';
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

// «Думай інакше» (51): «не на тему» — позначка ведучого на reveal, анонімне голосування в автопілоті, капітани за команди.

const sceneThink = (manager: RoomManager, room: Room): ThinkInfo | undefined => (manager.view(room, STAGE) as { think?: ThinkInfo } | null)?.think;
const phoneThink = (manager: RoomManager, room: Room, who: Identity): PlayerThink | undefined => {
  const view = manager.view(room, who);
  return view?.role === 'player' ? view.me.think : undefined;
};
const say = (value: string) => ({ type: 'think', value }) as const;

describe('think off-topic by the host (51)', () => {
  it('the host marks an answer off-topic and takes it back', () => {
    const { manager, room, people } = hosted();
    const [olena, taras] = people;
    expect(manager.host(room, { type: 'think-words', words: [red] })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'think-off', playerId: olena.playerId, off: true })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.answer(room, olena.playerId, say('зелений'))).toEqual({ ok: true });
    expect(manager.answer(room, taras.playerId, say('синій'))).toEqual({ ok: true });
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
    const rowOf = () => sceneThink(manager, room)?.rows.find((r) => r.id === olena.playerId);
    expect(rowOf()).toMatchObject({ lives: 2, lost: false, off: null });
    expect(manager.host(room, { type: 'think-off', playerId: olena.playerId, off: true })).toEqual({ ok: true });
    expect(rowOf()).toMatchObject({ lives: 1, lost: true, off: 'host' });
    expect(phoneThink(manager, room, olena.identity)).toMatchObject({ lives: 1, off: 'host' });
    expect(phoneThink(manager, room, taras.identity)).toMatchObject({ lives: 2, off: null });
    expect(manager.host(room, { type: 'think-off', playerId: olena.playerId, off: false })).toEqual({ ok: true });
    expect(rowOf()).toMatchObject({ lives: 2, lost: false, off: null });
    expect(phoneThink(manager, room, olena.identity)).toMatchObject({ lives: 2, off: null });
  });
});

/** Кімната-автопілот: автор Марта дивиться, names грають; сцена на зв'язку. */
function piloted(names: string[], quiz: Quiz = thinkQuiz([red])) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
  const created = manager.createAutopilot(quiz, 'u1', 'q1', 'Марта');
  if (!created.ok) throw new Error(created.error);
  const { room } = created;
  manager.connect(room, { role: 'player', playerId: created.playerId });
  manager.connect(room, STAGE);
  const people = names.map((name) => enter(manager, room, name));
  return { scheduler, manager, room, people, authorId: created.playerId };
}

describe('the autopilot off-topic vote (51)', () => {
  it('runs the vote anonymously: three votes for a banana make it off-topic', () => {
    const { scheduler, manager, room, people } = piloted(['Тарас', 'Віра', 'Іра', 'Олег']);
    const [taras, vira, ira, oleh] = people;
    expect(manager.author(room, room.state.autopilot!.authorId, { type: 'start' })).toEqual({ ok: true });
    for (let i = 0; i < 100 && room.state.phase !== 'question'; i++) scheduler.advance(500);
    expect(room.state.phase).toBe('question');
    expect(manager.answer(room, taras.playerId, say('банан'))).toEqual({ ok: true });
    expect(manager.answer(room, vira.playerId, say('зелений'))).toEqual({ ok: true });
    expect(manager.answer(room, ira.playerId, say('синій'))).toEqual({ ok: true });
    // Олег мовчить: після таймера починається голосування.
    for (let i = 0; i < 200 && room.state.plays[room.state.questionIndex].think?.vote === undefined; i++) scheduler.advance(1000);
    expect(room.state.plays[room.state.questionIndex].think?.vote).toBeDefined();
    expect(manager.answer(room, oleh.playerId, say('яблуко'))).toEqual({ ok: false, error: 'time_over' });

    const scene = sceneThink(manager, room);
    expect(scene?.vote?.entries.map((e) => e.text)).toEqual(['банан', 'зелений', 'синій']);
    expect(scene?.rows.every((r) => r.answer === null)).toBe(true);
    const frames = [JSON.stringify(manager.view(room, STAGE)), ...people.map((p) => JSON.stringify(manager.view(room, p.identity)))];
    for (const json of frames) {
      // Нік автора ніде не стоїть поруч з текстом: у бюлетені лише { key, text }.
      expect(json).not.toMatch(/"(nickname|playerId|authors?)":"[^"]*","(text|key)"/);
      expect(json).toContain('банан');
    }
    const veraPhone = phoneThink(manager, room, vira.identity);
    expect(veraPhone?.vote).toMatchObject({ canVote: true, done: false });
    expect(veraPhone?.vote?.entries.map((e) => e.text)).toEqual(['банан', 'синій']);

    // Голос за власну відповідь чи за відсутній ключ — not_found; частота — 4 за секунду.
    expect(manager.thinkVote(room, taras.playerId, ['банан'])).toEqual({ ok: false, error: 'not_found' });
    expect(manager.thinkVote(room, taras.playerId, ['немає'])).toEqual({ ok: false, error: 'not_found' });
    expect(manager.thinkVote(room, taras.playerId, ['немає'])).toEqual({ ok: false, error: 'not_found' });
    expect(manager.thinkVote(room, taras.playerId, ['немає'])).toEqual({ ok: false, error: 'not_found' });
    expect(manager.thinkVote(room, taras.playerId, ['немає'])).toEqual({ ok: false, error: 'too_soon' });
    expect(manager.thinkVote(room, taras.playerId, ['немає'])).toEqual({ ok: false, error: 'too_soon' });
    // Автор-глядач не голосує.
    expect(manager.thinkVote(room, room.state.autopilot!.authorId, [])).toEqual({ ok: false, error: 'think_spectator' });

    expect(manager.thinkVote(room, vira.playerId, ['банан'])).toEqual({ ok: true });
    expect(manager.thinkVote(room, ira.playerId, ['банан'])).toEqual({ ok: true });
    expect(manager.thinkVote(room, oleh.playerId, ['банан'])).toEqual({ ok: true });
    // Тарас теж має «Готово» (порожній голос): усі проголосували — одразу locked.
    scheduler.advance(1000);
    expect(manager.thinkVote(room, taras.playerId, [])).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
    for (let i = 0; i < 40 && room.state.phase !== 'reveal'; i++) scheduler.advance(500);
    expect(room.state.phase).toBe('reveal');
    const rows = sceneThink(manager, room)?.rows;
    expect(rows?.find((r) => r.id === taras.playerId)).toMatchObject({ off: 'vote', lost: true });
    expect(rows?.find((r) => r.id === vira.playerId)).toMatchObject({ off: null });
    expect(phoneThink(manager, room, taras.identity)).toMatchObject({ off: 'vote' });
  });
});

describe('captains vote for teams (51)', () => {
  it('only the answerer of the team votes; the view canVote follows the same member', () => {
    const quiz = makeRoundsQuiz([thinkRound('r1', [think('t1', [red]), think('t2', [red]), think('t3', [red])], { lives: 2, points: 1000 }), classicRound('r2', [single])], { teams: defaultTeams(3) });
    const { scheduler, manager, room, people, authorId } = piloted(['Тарас', 'Іра', 'Оля', 'Олег', 'Віра', 'Ігор'], quiz);
    expect(manager.author(room, authorId, { type: 'team-form', form: 'random' })).toEqual({ ok: true });
    expect(manager.author(room, authorId, { type: 'start' })).toEqual({ ok: true });
    for (let i = 0; i < 100 && room.state.phase !== 'question'; i++) scheduler.advance(500);
    expect(room.state.phase).toBe('question');
    const everyone = [authorId, ...people.map((p) => p.playerId)];
    const teamIds = [...new Set(everyone.map((id) => memberOf(room.state, id)?.teamId))].filter((id): id is string => id != null);
    expect(teamIds).toHaveLength(3);
    // Кожна команда відповідає через свого відповідача, різні тексти.
    const words = ['банан', 'зелений', 'синій'];
    teamIds.forEach((teamId, i) => {
      const who = answererOf(room.state, teamId);
      if (who === null) return;
      expect(manager.answer(room, who, say(words[i]))).toEqual({ ok: true });
    });
    for (let i = 0; i < 200 && room.state.plays[room.state.questionIndex].think?.vote === undefined; i++) scheduler.advance(1000);
    expect(room.state.plays[room.state.questionIndex].think?.vote).toBeDefined();
    const identityOf = (id: string): Identity => ({ role: 'player', playerId: id });
    const answerers: string[] = [];
    // Спершу всі відмови й canVote (голос останнього закриє етап), потім голоси відповідачів.
    for (const teamId of teamIds) {
      const answerer = answererOf(room.state, teamId);
      expect(answerer).not.toBeNull();
      answerers.push(answerer as string);
      for (const member of teamMembers(room.state, teamId)) {
        const voter = member.id === answerer;
        expect(phoneThink(manager, room, identityOf(member.id))?.vote?.canVote).toBe(voter);
        if (voter) continue;
        const refused = manager.thinkVote(room, member.id, []);
        expect(refused.ok).toBe(false);
        // Та сама відмова, що й у «Шпигуна» (act 'answerer').
        expect(refused).toEqual(manager.spyVote(room, member.id, 'nobody'));
      }
    }
    for (const id of answerers) expect(manager.thinkVote(room, id, [])).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
  });
});
