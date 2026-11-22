import { describe, expect, it } from 'vitest';
import { BOT_PLAYER_ID, type Answer } from '@quiz/shared';
import { alikeJoin, alikeSplit } from './alike';
import { authorTeamForm, autopilotStart, createBotGame } from './autopilot';
import { addPlayer, lock, next, submitAnswer, type GameState, type Rng } from './game';
import { assignTeam } from './teams';
import { setTruthFake, submitTruth } from './truth';
import { undoPanel, undoScore } from './undo';
import { alikeQuiz, classicRound, makeRoundsQuiz, single, truthRound, withId } from './testing/fixtures';
import { must } from './testing/helpers';
import { teamQuiz } from './testing/teams';
import { hostView } from './views';

// 68: пульт адміна в кімнаті бота — дії ведучого, яких автопілот сам не дозволяє (byAdmin), і старт зі складом адміна (hostTeams).

const T = 1_000_000;
const rng: Rng = () => 0.3;
const right: Answer = { type: 'single', optionId: single.correctId };
const wrong: Answer = { type: 'single', optionId: 'a' };

/** Гра бота з гравцями u1, u2, … у порядку нікнеймів. */
function botLobby(game: GameState, ...nicknames: string[]): GameState {
  return nicknames.reduce((s, nickname, i) => must(addPlayer(s, { id: `u${i + 1}`, nickname })), game);
}

/** Гра бота на таблиці після першого запитання: Оля u1 права, Петро u2 ні. */
function afterFirst(): GameState {
  const lobby = botLobby(createBotGame(makeRoundsQuiz([classicRound('r1', [{ ...single, timeLimit: 25 }, withId({ ...single, timeLimit: 25 }, 'q2')])])), 'Оля', 'Петро');
  let s = must(next(must(autopilotStart(lobby, T, rng)), T, rng));
  s = must(submitAnswer(s, 'u1', right, T + 1000));
  s = must(submitAnswer(s, 'u2', wrong, T + 1000));
  if (s.phase === 'question') s = must(lock(s, T + 1100));
  s = must(next(s, T + 1200, rng));
  expect(s.phase).toBe('reveal');
  return must(next(s, T + 2000, rng));
}

const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.score;

describe('the admin host of a bot game (68)', () => {
  it('undo is refused to the bot game and allowed to its admin host', () => {
    const s = afterFirst();
    expect(s.phase).toBe('leaderboard');
    expect(score(s, 'u1')).toBeGreaterThan(0);
    expect(undoScore(s, { question: 0, playerId: 'u1' }, T + 3000)).toEqual({ ok: false, error: 'not_allowed' });
    const undone = must(undoScore(s, { question: 0, playerId: 'u1' }, T + 3000, true));
    expect(score(undone, 'u1')).toBe(0);
    expect(undone.adjustments.some((a) => a.source === 'undo' && a.playerId === 'u1')).toBe(true);
  });

  it('the undo panel is shown only to the admin host', () => {
    const s = afterFirst();
    expect(undoPanel(s)).toBeNull();
    expect(hostView(s).undo).toBeNull();
    const panel = undoPanel(s, true);
    expect(panel).not.toBeNull();
    expect(panel!.rounds[0].questions[0].rows.map((r) => r.playerId)).toContain('u1');
    expect(hostView(s, { byAdmin: true }).undo).toEqual(panel);
  });

  it('think-alike groups are edited by the admin host only', () => {
    const lobby = botLobby(createBotGame(alikeQuiz()), 'Оля', 'Тарас', 'Петро');
    let s = must(next(must(autopilotStart(lobby, T, rng)), T, rng));
    for (const [id, word] of Object.entries({ u1: 'яблуко', u2: 'яблуко', u3: 'груша' })) s = must(submitAnswer(s, id, { type: 'thinkalike', value: word }, T + 1000));
    if (s.phase === 'question') s = must(lock(s, T + 29_000));
    s = must(next(s, T + 29_000, rng));
    expect(s.phase).toBe('reveal');
    expect(s.autopilot?.authorId).toBe(BOT_PLAYER_ID);
    expect(score(s, 'u3')).toBe(0);
    expect(alikeJoin(s, 'u3', 'u1')).toEqual({ ok: false, error: 'not_allowed' });
    expect(alikeSplit(s, 'u1')).toEqual({ ok: false, error: 'not_allowed' });
    expect(hostView(s).alike?.editable).toBe(false);
    expect(hostView(s, { byAdmin: true }).alike?.editable).toBe(true);
    const joined = must(alikeJoin(s, 'u3', 'u1', true));
    expect(score(joined, 'u3')).toBeGreaterThan(0);
    const split = must(alikeSplit(s, 'u1', true));
    expect(score(split, 'u1')).toBe(0);
  });

  it('the admin host adds a truth fake in the lobby of a bot game', () => {
    let s = botLobby(createBotGame(makeRoundsQuiz([truthRound('t1')])), 'Оля', 'Петро');
    s = must(submitTruth(s, 'u1', 'Я стрибала з парашутом', 0));
    expect(setTruthFake(s, null, 'Я вмію жонглювати')).toEqual({ ok: false, error: 'not_allowed' });
    const faked = must(setTruthFake(s, null, 'Я вмію жонглювати', true));
    expect(faked.truth?.fakes?.map((f) => f.text)).toContain('Я вмію жонглювати');
  });

  it("start from the admin host keeps the admin's own teams; the rest go to the smaller team", () => {
    let lobby = botLobby(createBotGame(teamQuiz([classicRound('r1', [{ ...single, timeLimit: 25 }])])), 'Оля', 'Петро', 'Тарас');
    lobby = must(authorTeamForm(lobby, 'host'));
    lobby = must(assignTeam(lobby, 'u1', 't1'));
    lobby = must(assignTeam(lobby, 'u2', 't1'));
    let calls = 0;
    const counted: Rng = () => {
      calls += 1;
      return 0.3;
    };
    const started = must(autopilotStart(lobby, T, counted, undefined, { hostTeams: true }));
    expect(started.phase).not.toBe('lobby');
    const teamOf = (s: GameState, id: string) => s.teams!.members.find((m) => m.id === id)!.teamId;
    expect(teamOf(started, 'u1')).toBe('t1');
    expect(teamOf(started, 'u2')).toBe('t1');
    expect(teamOf(started, 'u3')).toBe('t2');
    expect(started.teams!.form).toBe('host');
    expect(calls).toBe(0);
    // Без прапорця — жереб, як досі.
    const dealt = must(autopilotStart(lobby, T, counted));
    expect(calls).toBeGreaterThan(0);
    expect(dealt.teams!.members.every((m) => m.teamId !== null)).toBe(true);
  });
});
