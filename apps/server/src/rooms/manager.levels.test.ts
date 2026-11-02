import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { defaultTeams, STICKERS, type NickLevel, type Question, type Quiz, type QuizSettings, type ReactionItem, type StickerSeries } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import type { SavedGameData } from './continuation';
import { levelsView, perkGrants } from './levels';
import { RoomManager, type Identity, type Room, type RoomEvent } from './manager';

const STAGE: Identity = { role: 'stage', playerId: null };
const HOST: Identity = { role: 'host', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hinted: Question = { ...single, hint: 'Місто Лева', timeLimit: 20 };

function levelQuiz(settings: Partial<QuizSettings> = {}): Quiz {
  return makeRoundsQuiz([classicRound('r1', [hinted, withId(single, 'q2'), withId(single, 'q3')])], { leaderboard: 'end', ...settings });
}

const lv = (level: number, color: NickLevel['color'] = null, frame: NickLevel['frame'] = null): NickLevel => ({ level, color, frame });
const sticker = (series: StickerSeries): ReactionItem => ({ kind: 'sticker', value: STICKERS.find((s) => s.series === series)!.id });

function world(quiz: Quiz = levelQuiz()) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const events: { room: Room; event: RoomEvent }[] = [];
  manager.onEvent((room, event) => events.push({ room, event }));
  const room = manager.create(quiz, 'host-user', null);
  manager.connect(room, HOST);
  const enter = (nickname: string, userId: string | null, into: Room = room) => {
    const joined = manager.join(into.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(into, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const toQuestion = (into: Room = room) => {
    while (into.state.phase !== 'question') expect(manager.host(into, { type: 'next' })).toEqual({ ok: true });
  };
  return { scheduler, manager, events, room, enter, toQuestion };
}

describe('levels in the room (15a)', () => {
  it('the level and looks go next to the nickname in every view; guests have none; no perks before the start', () => {
    const w = world();
    const olya = w.enter('Оля', 'u1');
    const guest = w.enter('Гість', null);
    w.manager.setLevels(w.room, new Map([['u1', lv(12, 'sky', 'bronze')]]));
    const expected = { Оля: { level: 12, color: 'sky', frame: 'bronze' } };
    expect(w.manager.view(w.room, STAGE)?.levels).toEqual(expected);
    expect(w.manager.view(w.room, HOST)?.levels).toEqual(expected);
    expect(w.manager.view(w.room, { role: 'player', playerId: guest })?.levels).toEqual(expected);
    expect(levelsView(w.room)).toEqual(expected);
    expect(w.room.state.perks).toBeUndefined();
    expect(perkGrants(w.room)).toEqual({ [olya]: { kinds: ['time', 'hint'], timeMs: 5000 } });
  });

  it('no levels — no key in the view', () => {
    const w = world();
    w.enter('Оля', 'u1');
    expect('levels' in w.manager.view(w.room, STAGE)!).toBe(false);
    expect(levelsView(w.room)).toBeUndefined();
  });

  it('setLevels emits changed only when something changed', () => {
    const w = world();
    w.enter('Оля', 'u1');
    w.manager.setLevels(w.room, new Map([['u1', lv(3)]]));
    const count = w.events.length;
    w.manager.setLevels(w.room, new Map([['u1', lv(3)]]));
    expect(w.events.length).toBe(count);
    w.manager.setLevels(w.room, new Map([['u1', lv(3, 'sky')]]));
    expect(w.events.length).toBe(count + 1);
  });

  it('the start grants the level perks of account players; the guest gets none', () => {
    const w = world();
    const olya = w.enter('Оля', 'u1');
    const guest = w.enter('Гість', null);
    w.manager.setLevels(w.room, new Map([['u1', lv(12)]]));
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    expect(w.room.state.perks?.[olya]).toEqual({ kinds: ['time', 'hint'], timeMs: 5000, used: {} });
    expect(w.room.state.perks?.[guest]).toBeUndefined();
    expect(Object.keys(w.room.state.perks ?? {})).toEqual([olya]);
  });

  it('a level that arrives after the start grants then, once', () => {
    const w = world();
    const petro = w.enter('Петро', 'u2');
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    expect(w.room.state.perks).toBeUndefined();
    w.manager.setLevels(w.room, new Map([['u2', lv(15)]]));
    expect(w.room.state.perks?.[petro]).toEqual({ kinds: ['time', 'hint', 'ward'], timeMs: 5000, used: {} });
    w.manager.setLevels(w.room, new Map([['u2', lv(20)]]));
    expect(w.room.state.perks?.[petro]?.timeMs).toBe(5000);
    expect(w.manager.view(w.room, STAGE)?.levels).toEqual({ Петро: lv(20) });
  });

  it('a late account player of a continued game gets the perks once the level arrives', () => {
    const w = world(levelQuiz({ leaderboard: 'each' }));
    const olena = w.enter('Олена', 'u2');
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    w.toQuestion();
    w.manager.answer(w.room, olena, { type: 'single', optionId: 'b' });
    while (w.room.state.phase !== 'leaderboard') expect(w.manager.host(w.room, { type: 'next' })).toEqual({ ok: true });
    w.scheduler.advance(60_000);
    expect(w.manager.host(w.room, { type: 'save' })).toEqual({ ok: true });
    const last = w.events.at(-1)?.event;
    if (last?.type !== 'closed' || last.saved === undefined) throw new Error('not saved');
    const saved: SavedGameData = viaJson(last.saved);
    const result = w.manager.continueSaved(w.room.id, 'host-user', saved);
    if (!result.ok) throw new Error(result.error);
    const next = result.room;
    const late = w.enter('Ірина', 'u3', next);
    expect(next.state.perks?.[late]).toBeUndefined();
    w.manager.setLevels(next, new Map([['u3', lv(10)]]));
    expect(next.state.perks?.[late]).toEqual({ kinds: ['time', 'hint'], timeMs: 5000, used: {} });
  });

  it('a released continuation slot keeps no perks: the next occupant (a guest) has no ward and no perks', () => {
    const w = world(levelQuiz({ leaderboard: 'each' }));
    const olena = w.enter('Олена', 'u2');
    const taras = w.enter('Тарас', null);
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    w.toQuestion();
    w.manager.answer(w.room, olena, { type: 'single', optionId: 'b' });
    w.manager.answer(w.room, taras, { type: 'single', optionId: 'b' });
    while (w.room.state.phase !== 'leaderboard') expect(w.manager.host(w.room, { type: 'next' })).toEqual({ ok: true });
    w.scheduler.advance(60_000);
    expect(w.manager.host(w.room, { type: 'save' })).toEqual({ ok: true });
    const last = w.events.at(-1)?.event;
    if (last?.type !== 'closed' || last.saved === undefined) throw new Error('not saved');
    const result = w.manager.continueSaved(w.room.id, 'host-user', viaJson(last.saved));
    if (!result.ok) throw new Error(result.error);
    const next = result.room;
    w.manager.connect(next, HOST);
    // Гостьове місце Тараса займає акаунт з рівнем 15 — бонуси й оберіг.
    expect(w.manager.claim(next.code, taras, 'u3').ok).toBe(true);
    w.manager.setLevels(next, new Map([['u3', lv(15)]]));
    expect(next.state.perks?.[taras]?.kinds).toEqual(['time', 'hint', 'ward']);
    expect(w.manager.view(next, HOST)?.wards).toEqual({ [taras]: 'ready' });
    // Ведучий звільняє місце, його займає гість.
    expect(w.manager.host(next, { type: 'release', playerId: taras })).toEqual({ ok: true });
    expect(w.manager.claim(next.code, taras, null).ok).toBe(true);
    w.manager.connect(next, { role: 'player', playerId: taras });
    expect(next.state.perks?.[taras]).toEqual({ kinds: [], timeMs: 0, used: {} });
    expect(w.manager.view(next, HOST)).not.toHaveProperty('wards');
    const phone = w.manager.view(next, { role: 'player', playerId: taras });
    expect(phone).not.toHaveProperty('wards');
    if (phone === null || !('me' in phone)) throw new Error('no phone view');
    expect(phone.me?.perks).toBeNull();
    // Рівні, що прийдуть пізніше, місце знову не обдаровують.
    w.manager.setLevels(next, new Map([['u3', lv(16)]]));
    expect(next.state.perks?.[taras]).toEqual({ kinds: [], timeMs: 0, used: {} });
  });

  it('levelBonuses: false — no perks at the start nor after setLevels', () => {
    const w = world(levelQuiz({ levelBonuses: false }));
    w.enter('Оля', 'u1');
    w.manager.setLevels(w.room, new Map([['u1', lv(25)]]));
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    expect(w.room.state.perks).toBeUndefined();
    w.manager.setLevels(w.room, new Map([['u1', lv(30)]]));
    expect(w.room.state.perks).toBeUndefined();
    expect(w.manager.view(w.room, STAGE)?.levels).toEqual({ Оля: lv(30) });
  });

  it('usePerk: +5 s on the question, then perk_used', () => {
    const w = world();
    const olya = w.enter('Оля', 'u1');
    w.manager.setLevels(w.room, new Map([['u1', lv(12)]]));
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    w.toQuestion();
    expect(w.manager.usePerk(w.room, olya, 'time')).toEqual({ ok: true });
    expect(w.room.state.perks?.[olya]?.used.time).toBe(w.room.state.questionIndex);
    expect(w.manager.usePerk(w.room, olya, 'time')).toEqual({ ok: false, error: 'perk_used' });
    expect(w.manager.usePerk(w.room, olya, 'hint')).toEqual({ ok: true });
  });

  it('a guest cannot use a level perk', () => {
    const w = world();
    w.enter('Оля', 'u1');
    const guest = w.enter('Гість', null);
    w.manager.setLevels(w.room, new Map([['u1', lv(30)]]));
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    w.toQuestion();
    expect(w.room.state.perks?.[guest]).toBeUndefined();
    expect(w.manager.usePerk(w.room, guest, 'time')).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('stickers above the level are refused; guests have the starter set; the host has all', () => {
    const w = world();
    const three = w.enter('Оля', 'u1');
    const six = w.enter('Петро', 'u2');
    const guest = w.enter('Гість', null);
    w.manager.setLevels(w.room, new Map([['u1', lv(3)], ['u2', lv(6)]]));
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    w.toQuestion();
    for (const id of [three, six, guest]) w.manager.answer(w.room, id, { type: 'single', optionId: 'b' });
    if (w.room.state.phase === 'question') expect(w.manager.host(w.room, { type: 'lock' })).toEqual({ ok: true });
    while (w.room.state.phase !== 'reveal') expect(w.manager.host(w.room, { type: 'next' })).toEqual({ ok: true });
    const reactions = () => w.events.filter((e) => e.event.type === 'reaction').length;
    const before = reactions();
    expect(w.manager.react(w.room, three, sticker('nyas'))).toEqual({ ok: false, error: 'sticker_locked' });
    // Відмова не займає вікно частоти: дозволена реакція одразу після неї проходить.
    expect(w.manager.react(w.room, three, sticker('nyaa'))).toEqual({ ok: true });
    expect(w.manager.react(w.room, six, sticker('nyas'))).toEqual({ ok: true });
    expect(w.manager.react(w.room, guest, sticker('nyaa'))).toEqual({ ok: false, error: 'sticker_locked' });
    expect(w.manager.react(w.room, guest, sticker('nya'))).toEqual({ ok: true });
    expect(w.manager.react(w.room, 'host', sticker('other'))).toEqual({ ok: true });
    expect(reactions()).toBe(before + 4);
    // Швидкі емодзі — усім.
    w.scheduler.advance(10_000);
    expect(w.manager.react(w.room, guest, { kind: 'emoji', value: '🔥' })).toEqual({ ok: true });
  });

  it('a team room: levels by people nicknames, no perks for anyone', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const quiz = makeRoundsQuiz([classicRound('r1', [hinted, withId(single, 'q2')])], { teams: defaultTeams(2) });
    const { room, members } = startTeamGame(manager, quiz, [['Оля'], ['Петро']], { Оля: 'u1', Петро: 'u2' });
    manager.setLevels(room, new Map([['u1', lv(30, 'gold', 'neon')], ['u2', lv(5)]]));
    expect(manager.view(room, STAGE)?.levels).toEqual({ Оля: lv(30, 'gold', 'neon'), Петро: lv(5) });
    expect(room.state.perks).toBeUndefined();
    expect(perkGrants(room)).toEqual({});
    // Людина команди не є гравцем рушія: бонусу немає кому дати.
    expect(manager.usePerk(room, members['Оля']!, 'time')).toEqual({ ok: false, error: 'not_found' });
    // Замок стікерів діє й для людей команди.
    const phase = () => room.state.phase;
    while (phase() !== 'question') expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    while (phase() !== 'reveal') expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.react(room, members['Петро']!, sticker('other'))).toEqual({ ok: false, error: 'sticker_locked' });
    expect(manager.react(room, members['Оля']!, sticker('other'))).toEqual({ ok: true });
  });
});
