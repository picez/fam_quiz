import { describe, expect, it } from 'vitest';
import { makeRoundsQuiz, puzzlesQuiz, puzzlesRound, sudoku } from '@quiz/engine/testing';
import { defaultTeams, PUZZLE_BATCHES_PER_SECOND } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room } from './manager';

// «Головоломки» (28d): пакети клітинок і «Готово» через менеджер — команда, частота, знімок.

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Порожні клітинки судоку фікстури (у порядку читання). */
const empties = [...sudoku.givens].flatMap((ch, i) => (ch === '0' ? [i] : []));
const right = (i: number) => sudoku.solution[i];
const wrong = (i: number) => String((Number(sudoku.solution[i]) % 6) + 1);

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Ведучий, Олена й Тарас; відкрите судоку. */
function soloRoom() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(puzzlesQuiz());
  manager.connect(room, HOST);
  const olena = enter(manager, room, 'Олена');
  const taras = enter(manager, room, 'Тарас');
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('question');
  return { scheduler, manager, room, olena, taras };
}

const mine = (manager: RoomManager, room: Room, identity: Identity) => {
  const view = manager.view(room, identity);
  return view?.role === 'player' ? view.me.puzzle : undefined;
};

describe('puzzles (28d) in the room manager', () => {
  it('fills a grid: the phone sees its values, the stage only a mask; an unchanged batch sends nothing', () => {
    const { manager, room, olena } = soloRoom();
    const changes: string[] = [];
    manager.onEvent((_room, event) => changes.push(event.type));
    const [a, b] = empties;
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: a, v: right(a) }, { i: b, v: wrong(b) }])).toEqual({ ok: true });
    expect(changes).toEqual(['changed']);
    const board = mine(manager, room, olena.identity);
    expect(board?.cells[a]).toBe(right(a));
    expect(board?.cells[b]).toBe(wrong(b));
    expect(board?.seq).toBe(1);
    const stage = manager.view(room, STAGE);
    expect(stage?.puzzle?.boards.find((x) => x.playerId === olena.playerId)).toMatchObject({ filled: 2, cells: null });
    expect(stage?.puzzle?.boards[0]?.mask[a]).toBe('1');
    // Той самий пакет — жодної зміни, жодної розсилки.
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: a, v: right(a) }])).toEqual({ ok: true });
    expect(changes).toEqual(['changed']);
    // Застаріле запитання й задана клітинка — відмова рушія.
    expect(manager.puzzleFill(room, olena.playerId, 1, [{ i: a, v: '1' }])).toEqual({ ok: false, error: 'puzzle_stale' });
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: sudoku.givens.search(/[1-6]/), v: '1' }])).toEqual({ ok: false, error: 'puzzle_given' });
    expect(manager.puzzleFill(room, 'nobody', 0, [{ i: a, v: '1' }])).toMatchObject({ ok: false });
  });

  it('a fill ack tells nothing about correctness', () => {
    const { manager, room, olena, taras } = soloRoom();
    const [a] = empties;
    const good = JSON.stringify(manager.puzzleFill(room, olena.playerId, 0, [{ i: a, v: right(a) }]));
    const bad = JSON.stringify(manager.puzzleFill(room, taras.playerId, 0, [{ i: a, v: wrong(a) }]));
    expect(good).toBe('{"ok":true}');
    expect(bad).toBe(good);
    // «Готово» з правильною й хибною сіткою — теж однаковий ack.
    const rest = empties.slice(1).map((i) => ({ i, v: right(i) }));
    for (let k = 0; k < rest.length; k += 12) expect(manager.puzzleFill(room, olena.playerId, 0, rest.slice(k, k + 12))).toEqual({ ok: true });
    const solved = JSON.stringify(manager.puzzleDone(room, olena.playerId, 0));
    const unsolved = JSON.stringify(manager.puzzleDone(room, taras.playerId, 0));
    expect(solved).toBe(good);
    expect(unsolved).toBe(good);
    expect(room.state.plays[0].answers[olena.playerId]).toMatchObject({ grade: 'correct', points: 300 });
    expect(room.state.plays[0].answers[taras.playerId]).toMatchObject({ grade: 'wrong', points: 0 });
  });

  it('puzzle batches are rate limited', () => {
    const { scheduler, manager, room, olena, taras } = soloRoom();
    const [a, b] = empties;
    for (let k = 0; k < PUZZLE_BATCHES_PER_SECOND; k++) {
      expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: a, v: String(k + 1) }])).toEqual({ ok: true });
    }
    const before = room.state;
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: b, v: '1' }])).toEqual({ ok: false, error: 'too_soon' });
    expect(room.state).toBe(before);
    expect(mine(manager, room, olena.identity)?.cells[b]).toBe('');
    expect(mine(manager, room, olena.identity)?.seq).toBe(PUZZLE_BATCHES_PER_SECOND);
    // Вікно — на людину.
    expect(manager.puzzleFill(room, taras.playerId, 0, [{ i: b, v: '1' }])).toEqual({ ok: true });
    scheduler.advance(1000);
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: b, v: '1' }])).toEqual({ ok: true });
    // «Готово» — одна подія на запитання, вікна пакетів не рахує: і на повному вікні воно доходить.
    for (let k = 0; k < PUZZLE_BATCHES_PER_SECOND; k++) {
      expect(manager.puzzleFill(room, taras.playerId, 0, [{ i: a, v: String(k + 1) }])).toEqual({ ok: true });
    }
    expect(manager.puzzleFill(room, taras.playerId, 0, [{ i: a, v: '1' }])).toEqual({ ok: false, error: 'too_soon' });
    expect(manager.puzzleDone(room, taras.playerId, 0)).toEqual({ ok: true });
  });

  it('any teammate fills for the team', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeRoundsQuiz([puzzlesRound('pz', [sudoku])], { teams: defaultTeams(2) }));
    manager.connect(room, HOST);
    const [olena, taras, ira, marko] = ['Олена', 'Тарас', 'Іра', 'Марко'].map((name) => enter(manager, room, name));
    const [red, blue] = room.state.teams!.list.map((t) => t.id);
    for (const [who, team] of [[olena, red], [taras, red], [ira, blue], [marko, blue]] as const) {
      expect(manager.host(room, { type: 'team-assign', memberId: who.playerId, teamId: team })).toEqual({ ok: true });
    }
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    const [a, b] = empties;
    // Тарас — не капітан, а вписує однаково; останній запис виграє.
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: a, v: wrong(a) }, { i: b, v: right(b) }])).toEqual({ ok: true });
    expect(manager.puzzleFill(room, taras.playerId, 0, [{ i: a, v: right(a) }])).toEqual({ ok: true });
    const board = room.state.plays[0].puzzle?.boards[red];
    expect(board?.cells[a]).toBe(right(a));
    expect(board?.by?.[a]).toBe(taras.playerId);
    expect(board?.by?.[b]).toBe(olena.playerId);
    expect(room.state.plays[0].puzzle?.boards[blue]).toBeUndefined();
    // Товариш бачить значення, суперник — ні.
    expect(mine(manager, room, olena.identity)?.cells[a]).toBe(right(a));
    expect(mine(manager, room, ira.identity)?.cells[a]).toBe('');
    expect(JSON.stringify(manager.view(room, ira.identity)?.puzzle)).not.toContain(`"${right(b)}"`);
    // «Готово» одного — за команду: другий уже не вписує.
    expect(manager.puzzleDone(room, taras.playerId, 0)).toEqual({ ok: true });
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: b, v: '' }])).toEqual({ ok: false, error: 'puzzle_done' });
    expect(manager.puzzleDone(room, olena.playerId, 0)).toEqual({ ok: false, error: 'puzzle_done' });
    expect(room.state.plays[0].answers[red]).toMatchObject({ grade: 'wrong' });
    expect(room.state.phase).toBe('question');
  });

  it('a restored room keeps the grids', () => {
    const { scheduler, manager, room, olena, taras } = soloRoom();
    const [a, b] = empties;
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: a, v: right(a) }])).toEqual({ ok: true });
    expect(manager.puzzleFill(room, olena.playerId, 0, [{ i: b, v: wrong(b) }])).toEqual({ ok: true });
    expect(manager.puzzleFill(room, taras.playerId, 0, [{ i: a, v: wrong(a) }])).toEqual({ ok: true });
    expect(manager.puzzleDone(room, taras.playerId, 0)).toEqual({ ok: true });
    const before = room.state.plays[0].puzzle;
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();

    scheduler.advance(60_000);
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.plays[0].puzzle).toEqual(before);
    expect(back.state.plays[0].puzzle?.boards[olena.playerId]).toMatchObject({ seq: 2, done: false });
    expect(back.state.plays[0].puzzle?.boards[taras.playerId]).toMatchObject({ seq: 1, done: true });
    next.connect(back, HOST);
    next.connect(back, olena.identity);
    const phone = mine(next, back, olena.identity);
    expect(phone?.cells[a]).toBe(right(a));
    expect(phone?.cells[b]).toBe(wrong(b));
    expect(phone?.seq).toBe(2);
    // Після паузи відновлення — можна вписувати далі.
    expect(next.puzzleFill(back, olena.playerId, 0, [{ i: b, v: right(b) }])).toEqual({ ok: false, error: 'paused' });
    expect(next.host(back, { type: 'resume' })).toEqual({ ok: true });
    expect(next.puzzleFill(back, olena.playerId, 0, [{ i: b, v: right(b) }])).toEqual({ ok: true });
    expect(next.puzzleFill(back, taras.playerId, 0, [{ i: b, v: right(b) }])).toEqual({ ok: false, error: 'puzzle_done' });
  });
});
