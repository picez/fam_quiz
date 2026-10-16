import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, removePlayer, setConnected } from './game';
import { makeQuiz } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const quiz = makeQuiz();

describe('lobby', () => {
  it('starts empty in the lobby phase', () => {
    const state = createGame(quiz);
    expect(state.phase).toBe('lobby');
    expect(state.roundIndex).toBe(-1);
    expect(state.questionIndex).toBe(-1);
    expect(state.players).toEqual([]);
    expect(state.plays).toEqual([]);
  });

  it('adds a connected player with a zero score', () => {
    const state = must(addPlayer(createGame(quiz), { id: 'p1', nickname: 'Олена' }));
    expect(state.players).toEqual([
      { id: 'p1', nickname: 'Олена', connected: true, score: 0, totalTimeMs: 0, streak: 0 },
    ]);
  });

  it('does not mutate the previous state', () => {
    const before = createGame(quiz);
    must(addPlayer(before, { id: 'p1', nickname: 'Олена' }));
    expect(before.players).toEqual([]);
  });

  it('cleans up spaces in a nickname', () => {
    const state = must(addPlayer(createGame(quiz), { id: 'p1', nickname: '  Олена   К ' }));
    expect(state.players[0].nickname).toBe('Олена К');
  });

  it('rejects a nickname shorter than 2 or longer than 20 characters', () => {
    expect(addPlayer(createGame(quiz), { id: 'p1', nickname: ' О ' })).toEqual({ ok: false, error: 'nickname_invalid' });
    expect(addPlayer(createGame(quiz), { id: 'p1', nickname: 'О'.repeat(21) })).toEqual({
      ok: false,
      error: 'nickname_invalid',
    });
  });

  it('rejects a nickname that differs only by case or spacing', () => {
    const state = lobbyWith(quiz, 'Олена');
    expect(addPlayer(state, { id: 'p2', nickname: ' олена ' })).toEqual({ ok: false, error: 'nickname_taken' });
  });

  it('rejects the 51st player', () => {
    const names = Array.from({ length: 50 }, (_, i) => `Гравець ${i + 1}`);
    const state = lobbyWith(quiz, ...names);
    expect(addPlayer(state, { id: 'extra', nickname: 'Зайвий' })).toEqual({ ok: false, error: 'room_full' });
  });

  it('removes a player', () => {
    const state = must(removePlayer(lobbyWith(quiz, 'Олена', 'Тарас'), 'p1'));
    expect(state.players.map((p) => p.id)).toEqual(['p2']);
  });

  it('reports an unknown player on remove and on connection change', () => {
    const state = lobbyWith(quiz, 'Олена');
    expect(removePlayer(state, 'nobody')).toEqual({ ok: false, error: 'not_found' });
    expect(setConnected(state, 'nobody', false)).toEqual({ ok: false, error: 'not_found' });
  });

  it('marks a player as disconnected and connected again', () => {
    const offline = must(setConnected(lobbyWith(quiz, 'Олена'), 'p1', false));
    expect(offline.players[0].connected).toBe(false);
    expect(must(setConnected(offline, 'p1', true)).players[0].connected).toBe(true);
  });
});
