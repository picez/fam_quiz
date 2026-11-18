import { describe, expect, it } from 'vitest';
import { defaultTeams } from '@quiz/shared';
import { classicRound, makeRoundsQuiz, wordle, wordleQuiz } from '@quiz/engine/testing';
import { RoomManager, type Identity, type Room } from './manager';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { nounsOf } from '../wordladder/nouns';

// «Вгадай слово» (48) через менеджер: спроби звіряються зі словником кімнати, право ходу — як у драбини.

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const NOUNS = ['сосна', 'посол', 'молот', 'колос'];

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  manager.connect(room, { role: 'player', playerId: joined.playerId });
  return joined.playerId;
}

/** Три гравці, перше запитання (колос, 120 с) відкрите. */
function opened() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { nouns: nounsOf(NOUNS) });
  const room = manager.create(wordleQuiz());
  manager.connect(room, HOST);
  manager.connect(room, STAGE);
  const [olena, taras, petro] = ['Олена', 'Тарас', 'Петро'].map((name) => enter(manager, room, name)) as [string, string, string];
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  const mine = (id: string) => {
    const view = manager.view(room, { role: 'player', playerId: id });
    return view?.role === 'player' ? view.me.wordle : undefined;
  };
  return { scheduler, manager, room, olena, taras, petro, mine };
}

describe('wordle (48) in the room manager', () => {
  it('guesses are checked with the room dictionary', () => {
    const { manager, room, olena, mine } = opened();
    expect(manager.wordleGuess(room, olena, 'лампо')).toEqual({ ok: false, error: 'wordle_unknown' });
    expect(mine(olena)?.rows).toHaveLength(0);
    expect(manager.wordleGuess(room, olena, 'сосна')).toEqual({ ok: true });
    expect(mine(olena)?.rows).toHaveLength(1);
    const scene = manager.view(room, STAGE);
    const rows = scene?.role === 'stage' ? scene.wordle?.rows : undefined;
    expect(rows?.find((row) => row.playerId === olena)?.marks).toHaveLength(1);
    expect(JSON.stringify(scene)).not.toContain('сосна');
    expect(manager.wordleGuess(room, olena, 'колос')).toEqual({ ok: true });
    expect(room.state.plays[0].answers[olena]).toMatchObject({ points: 833, answer: { type: 'wordle', guesses: ['сосна', 'колос'], tries: 2, solved: true } });
    expect(manager.wordleGuess(room, olena, 'посол')).toEqual({ ok: false, error: 'already_answered' });
  });

  it('no guesses after the timer ends or the question locks', () => {
    const { scheduler, manager, room, olena, taras } = opened();
    expect(manager.wordleGuess(room, olena, 'сосна')).toEqual({ ok: true });
    scheduler.advance(121_000);
    expect(room.state.phase).not.toBe('question');
    expect(manager.wordleGuess(room, taras, 'сосна')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(room.state.plays[0].answers[olena]).toMatchObject({ points: 0, answer: { type: 'wordle', solved: false } });
  });

  it('a guess past the time limit is time_over while the question is still open', () => {
    // Таймер закриття спрацьовує на 5 с пізніше (як повільний цикл подій): запитання ще відкрите, а час уже вийшов.
    const scheduler = new FakeScheduler(-5_000);
    const manager = new RoomManager(scheduler, () => 0.5, { nouns: nounsOf(NOUNS) });
    const room = manager.create(wordleQuiz());
    manager.connect(room, HOST);
    const id = enter(manager, room, 'Олена');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    // Таймер закриття ще не спрацював, але час запитання вже вийшов.
    scheduler.advance(119_999);
    expect(manager.wordleGuess(room, id, 'сосна')).toEqual({ ok: true });
    scheduler.advance(2);
    expect(room.state.phase).toBe('question');
    expect(manager.wordleGuess(room, id, 'посол')).toEqual({ ok: false, error: 'time_over' });
    // Пізній таймер усе ж закриває запитання.
    scheduler.advance(5_000);
    expect(room.state.phase).not.toBe('question');
  });

  it('bad bodies and bad actors are refused', () => {
    const { manager, room, olena } = opened();
    expect(manager.wordleGuess(room, 'nobody', 'сосна')).toEqual({ ok: false, error: 'not_found' });
    for (const word of ['', 'abcde', 'сос', 'сосна1']) expect(manager.wordleGuess(room, olena, word).ok).toBe(false);
    expect(manager.wordleGuess(room, olena, 'сосна')).toEqual({ ok: true });
    expect(manager.wordleGuess(room, olena, 'сосна')).toEqual({ ok: false, error: 'wordle_repeat' });
  });

  it('a restart keeps the guesses', () => {
    const { scheduler, manager, room, olena, mine } = opened();
    expect(manager.wordleGuess(room, olena, 'сосна')).toEqual({ ok: true });
    expect(manager.wordleGuess(room, olena, 'посол')).toEqual({ ok: true });
    const before = mine(olena);
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5, { nouns: nounsOf(NOUNS) });
    const back = next.restore(saved);
    if (back === null) throw new Error('not restored');
    const view = next.view(back, { role: 'player', playerId: olena });
    expect(before?.rows).toHaveLength(2);
    expect(view?.role === 'player' ? view.me.wordle?.rows : undefined).toEqual(before?.rows);
  });
});

describe('wordle (48) in a team game', () => {
  it('the captain guesses; a teammate gets not_captain and sees the team grid', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5, { nouns: nounsOf(NOUNS) });
    const quiz = makeRoundsQuiz([classicRound('r1', [wordle])], { teams: defaultTeams(2) });
    const { room, members, teams } = startTeamGame(manager, quiz, [['Оля', 'Петро'], ['Марко', 'Ната']]);
    manager.connect(room, HOST);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    expect(manager.wordleGuess(room, members['Петро'], 'сосна')).toEqual({ ok: false, error: 'not_captain' });
    expect(manager.wordleGuess(room, members['Оля'], 'сосна')).toEqual({ ok: true });
    expect(room.state.plays[0].wordle?.[teams[0]]?.guesses).toEqual(['сосна']);
    const view = manager.view(room, { role: 'player', playerId: members['Петро'] });
    expect(view?.role === 'player' ? view.me.wordle?.rows : undefined).toHaveLength(1);
  });
});
