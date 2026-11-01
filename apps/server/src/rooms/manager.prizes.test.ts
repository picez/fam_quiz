import { describe, expect, it } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { defaultTeams, type PlacedPrize, type PrizeContent } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { RoomManager, type Room } from './manager';
import { placeHolders, prizeOutcome, prizesView, titlesView } from './prizes';

const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

const cup: PrizeContent = { name: 'Головний приз', trophy: { kind: 'cup', material: 'gold' }, engraving: 'Найкращій', real: null, title: '👑 Король', diploma: true };
const pizza: PrizeContent = { name: 'Піца', trophy: null, engraving: null, real: { text: 'піца', photoUrl: null }, title: null, diploma: false };
const star: PrizeContent = { name: 'Зірка', trophy: { kind: 'star', material: 'bronze' }, engraving: null, real: null, title: null, diploma: false };
const FIRST: PlacedPrize = { place: 1, id: '11111111-1111-4111-8111-111111111111', content: cup };
const SECOND: PlacedPrize = { place: 2, id: '22222222-2222-4222-8222-222222222222', content: pizza };
const THIRD: PlacedPrize = { place: 3, id: '33333333-3333-4333-8333-333333333333', content: star };
const { name: _cupName, ...cupShown } = cup;
const { name: _pizzaName, ...pizzaShown } = pizza;

const USERS: Record<string, string> = { Оля: 'u2', Ірина: 'u3' };

/** Кімната ведучого u1 з гравцями (Оля — u2, Ірина — u3, решта — гості), у лобі. */
function lobby(names: string[], quiz = makeQuiz([single, withId(single, 'second')])) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(quiz, 'u1', null);
  const ids: Record<string, string> = {};
  for (const name of names) {
    const joined = manager.join(room.code, name, USERS[name] ?? null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    ids[name] = joined.playerId;
  }
  return { scheduler, manager, room, ids };
}

/** Гра до кінця: на кожному запитанні люди відповідають у порядку order (правильно — ті, що в good), з паузою між відповідями. */
function playToEnd(setup: ReturnType<typeof lobby>, order: string[], good: string[]) {
  const { manager, room, ids, scheduler } = setup;
  for (let guard = 0; guard < 40 && room.state.phase !== 'finished'; guard++) {
    if (room.state.phase === 'question') {
      for (const name of order) {
        scheduler.advance(300);
        manager.answer(room, ids[name]!, good.includes(name) ? right : wrong);
      }
      manager.host(room, { type: 'lock' });
    } else manager.host(room, { type: 'next' });
  }
  expect(room.state.phase).toBe('finished');
}

const player = (room: Room, id: string) => ({ role: 'player' as const, playerId: id });

describe('manager prizes (14a)', () => {
  it('places prizes in the lobby: places without a winner and without a name, mine null', () => {
    const setup = lobby(['Оля', 'Петро']);
    const { manager, room, ids } = setup;
    let changed = 0;
    manager.onEvent((_room, event) => {
      if (event.type === 'changed') changed++;
    });
    expect(manager.setPrizes(room, [FIRST, SECOND])).toEqual({ ok: true });
    expect(changed).toBeGreaterThan(0);
    const expected = {
      places: [
        { place: 1, content: cupShown, winner: null },
        { place: 2, content: pizzaShown, winner: null },
      ],
      mine: null,
    };
    expect(manager.view(room, { role: 'host', playerId: null })?.prizes).toEqual(expected);
    expect(manager.view(room, { role: 'stage', playerId: null })?.prizes).toEqual(expected);
    expect(manager.view(room, { role: 'player', playerId: ids['Оля']! })?.prizes).toEqual(expected);
    expect(JSON.stringify(manager.view(room, { role: 'stage', playerId: null }))).not.toContain('Головний приз');
  });

  it('has no prizes key without prizes', () => {
    const { manager, room } = lobby(['Оля']);
    const view = manager.view(room, { role: 'stage', playerId: null })!;
    expect('prizes' in view).toBe(false);
    expect('titles' in view).toBe(false);
  });

  it('refuses to place after the start (wrong_phase) and when frozen (restarting)', () => {
    const setup = lobby(['Оля']);
    setup.manager.host(setup.room, { type: 'start' });
    expect(setup.manager.setPrizes(setup.room, [FIRST])).toEqual({ ok: false, error: 'wrong_phase' });
    const other = lobby(['Оля']);
    other.manager.freeze();
    expect(other.manager.setPrizes(other.room, [FIRST])).toEqual({ ok: false, error: 'restarting' });
    expect(other.room.prizes).toEqual([]);
  });

  it('breaks a tie by the smaller total time', () => {
    const setup = lobby(['Оля', 'Ірина']);
    setup.manager.host(setup.room, { type: 'start' });
    playToEnd(setup, ['Ірина', 'Оля'], ['Ірина', 'Оля']);
    const holders = placeHolders(setup.room.state);
    expect(holders.map((h) => h.name)).toEqual(['Ірина', 'Оля']);
    expect(holders[0]).toEqual({ place: 1, participantId: setup.ids['Ірина'], name: 'Ірина', people: [{ id: setup.ids['Ірина'], nickname: 'Ірина' }] });
  });

  it('at the finish: outcomes with accounts only, winners in views, mine for each player', () => {
    const setup = lobby(['Оля', 'Петро', 'Ірина']);
    const { manager, room, ids } = setup;
    manager.setPrizes(room, [FIRST, SECOND]);
    manager.host(room, { type: 'start' });
    playToEnd(setup, ['Оля', 'Петро', 'Ірина'], ['Оля', 'Петро']);
    expect(placeHolders(room.state).map((h) => h.name)).toEqual(['Оля', 'Петро', 'Ірина']);
    expect(prizeOutcome(room)).toEqual([
      { place: 1, prizeId: FIRST.id, winners: [{ userId: 'u2', nickname: 'Оля' }] },
      { place: 2, prizeId: SECOND.id, winners: [] },
    ]);
    expect(manager.view(room, player(room, ids['Оля']!))?.prizes?.mine).toEqual({ place: 1, account: true });
    expect(manager.view(room, player(room, ids['Петро']!))?.prizes?.mine).toEqual({ place: 2, account: false });
    expect(manager.view(room, player(room, ids['Ірина']!))?.prizes?.mine).toBeNull();
    const stage = manager.view(room, { role: 'stage', playerId: null })!.prizes!;
    expect(stage.mine).toBeNull();
    expect(stage.places[0]!.winner).toEqual({ name: 'Оля', members: [] });
    expect(stage.places[1]!.winner).toEqual({ name: 'Петро', members: [] });
    expect(prizesView(room, { role: 'host' })?.places[0]?.winner).toEqual({ name: 'Оля', members: [] });
  });

  it('two players, a prize on the 3rd place: no winner, no accounts', () => {
    const setup = lobby(['Оля', 'Ірина']);
    setup.manager.setPrizes(setup.room, [THIRD]);
    setup.manager.host(setup.room, { type: 'start' });
    playToEnd(setup, ['Оля', 'Ірина'], ['Оля']);
    expect(setup.manager.view(setup.room, { role: 'stage', playerId: null })?.prizes?.places).toEqual([{ place: 3, content: expect.anything(), winner: null }]);
    expect(prizeOutcome(setup.room)).toEqual([{ place: 3, prizeId: THIRD.id, winners: [] }]);
  });

  it('a kicked player is not among the place holders', () => {
    const setup = lobby(['Оля', 'Петро', 'Ірина']);
    const { manager, room, ids } = setup;
    manager.host(room, { type: 'start' });
    expect(manager.host(room, { type: 'kick', playerId: ids['Оля']! })).toEqual({ ok: true });
    playToEnd(setup, ['Петро', 'Ірина'], ['Петро', 'Ірина']);
    expect(placeHolders(room.state).map((h) => h.name)).toEqual(['Петро', 'Ірина']);
  });

  it('a finish without a single played question gives no outcomes', () => {
    const setup = lobby(['Оля', 'Петро']);
    setup.manager.setPrizes(setup.room, [FIRST]);
    setup.manager.host(setup.room, { type: 'start' });
    expect(setup.manager.host(setup.room, { type: 'end' })).toEqual({ ok: true });
    expect(setup.room.state.phase).toBe('finished');
    expect(setup.room.state.plays).toHaveLength(0);
    expect(prizeOutcome(setup.room)).toEqual([]);
  });

  it('team game: members by nickname, accounts of every person, mine of a winning member', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const quiz = makeRoundsQuiz([classicRound('r1', [single])], { teams: defaultTeams(2) });
    const started = startTeamGame(manager, quiz, [['Оля', 'Петро', 'Ірина'], ['Віра']], { Оля: 'u2', Ірина: 'u3' }, 'u1');
    const { room, members, teams } = started;
    // startTeamGame уже почав гру: кладемо напряму в кімнату (як після setPrizes у лобі).
    room.prizes = [FIRST, SECOND];
    for (let guard = 0; guard < 40 && room.state.phase !== 'finished'; guard++) {
      if (room.state.phase === 'question') {
        manager.answer(room, members['Оля']!, right);
        manager.answer(room, members['Віра']!, wrong);
        manager.host(room, { type: 'lock' });
      } else manager.host(room, { type: 'next' });
    }
    expect(room.state.phase).toBe('finished');
    const holders = placeHolders(room.state);
    expect(holders[0]!.participantId).toBe(teams[0]);
    expect(holders[0]!.people.map((p) => p.nickname)).toEqual(['Оля', 'Петро', 'Ірина']);
    const view = manager.view(room, { role: 'stage', playerId: null })!.prizes!;
    expect(view.places[0]!.winner).toEqual({ name: holders[0]!.name, members: ['Оля', 'Петро', 'Ірина'] });
    expect(prizeOutcome(room)).toEqual([
      { place: 1, prizeId: FIRST.id, winners: [{ userId: 'u2', nickname: 'Оля' }, { userId: 'u3', nickname: 'Ірина' }] },
      { place: 2, prizeId: SECOND.id, winners: [] },
    ]);
    expect(manager.view(room, player(room, members['Петро']!))?.prizes?.mine).toEqual({ place: 1, account: false });
    expect(manager.view(room, player(room, members['Ірина']!))?.prizes?.mine).toEqual({ place: 1, account: true });
    expect(manager.view(room, player(room, members['Віра']!))?.prizes?.mine).toEqual({ place: 2, account: false });
  });

  it('unplacePrize in a game removes the place from views', () => {
    const setup = lobby(['Оля', 'Петро']);
    const { manager, room } = setup;
    manager.setPrizes(room, [FIRST, SECOND]);
    manager.host(room, { type: 'start' });
    let changed = 0;
    manager.onEvent((_room, event) => {
      if (event.type === 'changed') changed++;
    });
    manager.unplacePrize(room, FIRST.id);
    expect(changed).toBe(1);
    expect(manager.view(room, { role: 'stage', playerId: null })?.prizes?.places.map((p) => p.place)).toEqual([2]);
    manager.unplacePrize(room, FIRST.id);
    expect(changed).toBe(1);
    manager.unplacePrize(room, SECOND.id);
    expect('prizes' in manager.view(room, { role: 'stage', playerId: null })!).toBe(false);
  });

  it('titles by nickname: accounts with a title only; null removes', () => {
    const setup = lobby(['Оля', 'Петро', 'Ірина']);
    const { manager, room, ids } = setup;
    let changed = 0;
    manager.onEvent((_room, event) => {
      if (event.type === 'changed') changed++;
    });
    manager.setTitles(room, new Map([['u2', '👑 Король']]));
    expect(changed).toBe(1);
    expect(manager.view(room, { role: 'stage', playerId: null })?.titles).toEqual({ Оля: '👑 Король' });
    expect(manager.view(room, { role: 'host', playerId: null })?.titles).toEqual({ Оля: '👑 Король' });
    expect(manager.view(room, player(room, ids['Петро']!))?.titles).toEqual({ Оля: '👑 Король' });
    expect(titlesView(room)).toEqual({ Оля: '👑 Король' });
    manager.setTitles(room, new Map([['u2', '👑 Король']]));
    expect(changed).toBe(1);
    manager.setTitles(room, new Map([['u2', null]]));
    expect(changed).toBe(2);
    expect('titles' in manager.view(room, { role: 'stage', playerId: null })!).toBe(false);
    // Титул акаунта, якого в кімнаті немає, у зріз не йде.
    manager.setTitles(room, new Map([['u9', 'Чужий']]));
    expect(titlesView(room)).toBeUndefined();
  });

  it('titles in a team game: people of teams by nickname', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const quiz = makeRoundsQuiz([classicRound('r1', [single])], { teams: defaultTeams(2) });
    const { room } = startTeamGame(manager, quiz, [['Оля', 'Петро'], ['Ірина']], { Оля: 'u2', Ірина: 'u3' }, 'u1');
    manager.setTitles(room, new Map([['u3', 'Мудра']]));
    expect(titlesView(room)).toEqual({ Ірина: 'Мудра' });
  });

  it('prizes survive the room snapshot; a broken element is dropped; no prizes — no key', () => {
    const setup = lobby(['Оля']);
    const { manager, room } = setup;
    const bare = manager.snapshot(room);
    expect('prizes' in bare).toBe(false);
    manager.setPrizes(room, [FIRST, SECOND]);
    const saved = manager.snapshot(room);
    expect(saved.prizes).toEqual([FIRST, SECOND]);
    const other = new RoomManager(new FakeScheduler(), () => 0.5);
    const restored = other.restore(JSON.parse(JSON.stringify(saved)))!;
    expect(restored.prizes).toEqual([FIRST, SECOND]);
    expect(restored.titles).toEqual(new Map());
    const broken = JSON.parse(JSON.stringify({ ...saved, prizes: [{ ...FIRST, place: 7 }, SECOND, 'junk'] }));
    const third = new RoomManager(new FakeScheduler(), () => 0.5);
    expect(third.restore(broken)!.prizes).toEqual([SECOND]);
    const old = JSON.parse(JSON.stringify(bare));
    const fourth = new RoomManager(new FakeScheduler(), () => 0.5);
    expect(fourth.restore(old)!.prizes).toEqual([]);
  });
});
