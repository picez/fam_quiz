import { describe, expect, it } from 'vitest';
import { authorTeamForm, autopilotStart, createBotGame, isAuthor } from './autopilot';
import { addPlayer, next, type GameState, type Rng } from './game';
import { spyCast, writeSpyWord } from './spy';
import { submitThinkAnswer, thinkWatches } from './think';
import { submitTruth } from './truth';
import { classicRound, makeRoundsQuiz, single, spy, think, thinkRound, truthRound } from './testing/fixtures';
import { must } from './testing/helpers';
import { teamQuiz } from './testing/teams';

const T = 1_000_000;
const rng: Rng = () => 0.3;

/** Гра бота з гравцями u1, u2, … у порядку нікнеймів. */
function botLobby(game: GameState, ...nicknames: string[]): GameState {
  return nicknames.reduce((s, nickname, i) => must(addPlayer(s, { id: `u${i + 1}`, nickname })), game);
}

/** «Почати гру» від бота о T, далі «Почати раунд» — відкрито перше запитання. */
function toFirstQuestion(lobby: GameState): GameState {
  const started = must(autopilotStart(lobby, T, rng));
  return must(next(started, T, rng));
}

describe('a bot game (54)', () => {
  it('a bot game has the bot as author and nobody seated', () => {
    const state = createBotGame(makeRoundsQuiz([classicRound('r1', [{ ...single, timeLimit: 25 }])]));
    expect(state.players).toEqual([]);
    expect(state.autopilot).toEqual({ authorId: 'quiz-bot', at: null });
    expect(state.phase).toBe('lobby');
    expect(isAuthor(state, 'quiz-bot')).toBe(true);
    expect(autopilotStart(state, T, rng)).toEqual({ ok: false, error: 'no_players' });
  });

  it('every player is in the spy cast and nobody watches', () => {
    const lobby = botLobby(createBotGame(makeRoundsQuiz([classicRound('r1', [spy])])), 'Оля', 'Петро', 'Тарас');
    const state = toFirstQuestion(lobby);
    expect(state.phase).toBe('question');
    expect(state.plays[state.questionIndex].question.type).toBe('spy');
    expect(spyCast(state).map((p) => p.nickname)).toEqual(['Оля', 'Петро', 'Тарас']);
    // Шпигун не має загального слова, тож «море» підходить будь-кому з трьох.
    expect(writeSpyWord(state, 'u1', 'море', state.startedAt! + 1000).ok).toBe(true);
  });

  it('every player writes in think different', () => {
    const lobby = botLobby(createBotGame(makeRoundsQuiz([thinkRound('k1', [think('k1q', [{ word: 'кава', synonyms: [] }])])])), 'Оля', 'Петро');
    const state = toFirstQuestion(lobby);
    expect(state.phase).toBe('question');
    for (const id of ['u1', 'u2']) expect(thinkWatches(state, id)).toBe(false);
    const at = state.startedAt! + 1000;
    const first = submitThinkAnswer(state, 'u1', { type: 'think', value: 'синій' }, at);
    expect(first.ok).toBe(true);
    const second = submitThinkAnswer(must(first), 'u2', { type: 'think', value: 'зелений' }, at);
    expect(second.ok).toBe(true);
  });

  it('every player can submit a truth fact', () => {
    let state = botLobby(createBotGame(makeRoundsQuiz([truthRound('t1')])), 'Оля', 'Петро');
    for (const id of ['u1', 'u2']) {
      const submitted = submitTruth(state, id, 'Я пірнав біля Тарханкута', T);
      expect(submitted.ok).toBe(true);
      state = must(submitted);
    }
    expect(Object.keys(state.truth?.facts ?? {}).sort()).toEqual(['u1', 'u2']);
  });

  it('teams are dealt by lot without the author', () => {
    let lobby = botLobby(createBotGame(teamQuiz([classicRound('r1', [{ ...single, timeLimit: 25 }])])), 'Оля', 'Петро', 'Тарас', 'Ганна');
    lobby = must(authorTeamForm(lobby, 'host'));
    const state = must(autopilotStart(lobby, T, rng));
    const members = state.teams!.members;
    expect(members.map((m) => m.id).sort()).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(members.every((m) => m.teamId !== null)).toBe(true);
    expect(members.some((m) => m.id === 'quiz-bot')).toBe(false);
    expect(state.teams!.form).toBe('host');
  });
});
