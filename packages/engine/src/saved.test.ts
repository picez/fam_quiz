import { describe, expect, it } from 'vitest';
import { LIMITS, type Answer, type Quiz } from '@quiz/shared';
import { openAppeal } from './appeal';
import { authorResume, autopilotStart, createAutopilotGame, planAutopilot } from './autopilot';
import { declareDuel } from './duel';
import { addPlayer, lock, next, resume, start, submitAnswer, tick, type GameState } from './game';
import { addLatePlayer, continueFrom, REST_PHASES, restPoint, slotsOf } from './saved';
import { trialOpen } from './survival';
import { decisionOpen } from './wipeout';
import { assignTeam } from './teams';
import { boardRound, classicRound, finalRound, makeRoundsQuiz, single, survivalQuestions, survivalRound, survivalTrials, text, wipeoutLadder, wipeoutRound, withId } from './testing/fixtures';
import { toDeclarable, toDuelQuestion } from './testing/duel';
import { lobbyWith, lobbyWithGuide, lobbyWithSplash, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const T0 = 1_000_000;
const rng = () => 0;
const KYIV: Answer = { type: 'single', optionId: 'b' };
const LVIV: Answer = { type: 'single', optionId: 'a' };

/** Два класичні раунди по два запитання; таблиця після кожного. */
const twoRounds: Quiz = makeRoundsQuiz(
  [classicRound('r1', [single, withId(single, 'q2')]), classicRound('r2', [withId(single, 'q3'), withId(single, 'q4')])],
  { leaderboard: 'each' },
);

/** Оля p1 правильно, Петро p2 неправильно; закрито; розкрито о at. */
function revealed(s: GameState, at: number): GameState {
  let state = must(submitAnswer(s, 'p1', KYIV, at));
  state = must(submitAnswer(state, 'p2', LVIV, at));
  if (state.phase === 'question') state = must(lock(state));
  return must(next(state, at + 500, rng));
}

const intro = () => must(start(lobbyWith(twoRounds, 'Оля', 'Петро')));
const question = () => startRound(lobbyWith(twoRounds, 'Оля', 'Петро'), T0, rng);
const reveal = () => revealed(question(), T0 + 1000);
const leaderboard = () => must(next(reveal(), T0 + 2000, rng));

/** Від таблиці до кінця раунду 1: друге запитання, розкриття, «Далі», доки не round_end. */
function roundEnd(): GameState {
  let s = must(next(leaderboard(), T0 + 3000, rng));
  s = revealed(s, T0 + 4000);
  while (s.phase !== 'round_end') s = must(next(s, T0 + 5000, rng));
  return s;
}

describe('restPoint', () => {
  it('the rest phases are intro, reveal, board, leaderboard and round end', () => {
    expect(REST_PHASES).toEqual(['intro', 'reveal', 'board', 'leaderboard', 'round_end']);
  });

  it('intro after start, reveal, leaderboard, round end and the board are rest points', () => {
    expect(intro().phase).toBe('intro');
    expect(restPoint(intro())).toBe(true);
    expect(reveal().phase).toBe('reveal');
    expect(restPoint(reveal())).toBe(true);
    expect(leaderboard().phase).toBe('leaderboard');
    expect(restPoint(leaderboard())).toBe(true);
    expect(roundEnd().phase).toBe('round_end');
    expect(restPoint(roundEnd())).toBe(true);
    const boardQuiz = makeRoundsQuiz([boardRound('g1', [{ title: 'Ріки', cells: [withId(single, 'b1'), withId(single, 'b2')] }])]);
    const board = must(next(must(start(lobbyWith(boardQuiz, 'Оля', 'Петро'))), T0, rng));
    expect(board.phase).toBe('board');
    expect(restPoint(board)).toBe(true);
  });

  it('lobby, question, locked, wager, guide and finished are not', () => {
    const lobby = lobbyWith(twoRounds, 'Оля', 'Петро');
    expect(restPoint(lobby)).toBe(false);
    expect(restPoint(question())).toBe(false);
    const locked = must(lock(question()));
    expect(locked.phase).toBe('locked');
    expect(restPoint(locked)).toBe(false);
    const finalQuiz = makeRoundsQuiz([finalRound('f1', withId(single, 'fq'))]);
    const wager = must(next(must(start(lobbyWith(finalQuiz, 'Оля', 'Петро'))), T0, rng));
    expect(wager.phase).toBe('wager');
    expect(restPoint(wager)).toBe(false);
    const guide = must(start(lobbyWithGuide(twoRounds, 'Оля', 'Петро'), T0));
    expect(guide.phase).toBe('guide');
    expect(restPoint(guide)).toBe(false);
    let finished = leaderboard();
    while (finished.phase !== 'finished') {
      finished = must(next(finished, T0 + 9000, rng));
      if (finished.phase === 'question') finished = revealed(finished, T0 + 9000);
    }
    expect(restPoint(finished)).toBe(false);
  });

  it('the duel phase is not a rest point', () => {
    const duel = toDuelQuestion();
    expect(duel.phase).toBe('duel');
    expect(restPoint(duel)).toBe(false);
  });

  it('a reveal with an open appeal is not a rest point', () => {
    const appealQuiz = makeRoundsQuiz([classicRound('r1', [text, withId(text, 't2')], { speedBonus: false })]);
    let s = startRound(lobbyWith(appealQuiz, 'Оля', 'Петро', 'Іра'), T0, rng);
    s = must(submitAnswer(s, 'p1', { type: 'text', value: 'Одеська' }, T0 + 1000));
    s = must(submitAnswer(s, 'p2', { type: 'text', value: 'Одеса' }, T0 + 1000));
    s = must(submitAnswer(s, 'p3', { type: 'text', value: 'Одеса' }, T0 + 1000));
    if (s.phase === 'question') s = must(lock(s));
    s = must(next(s, T0 + 1500, rng));
    expect(s.phase).toBe('reveal');
    expect(restPoint(s)).toBe(true);
    const appealed = must(openAppeal(s, 'p1', 'grade', T0 + 2000));
    expect(appealed.appeals?.some((a) => a.outcome === null)).toBe(true);
    expect(restPoint(appealed)).toBe(false);
  });

  it('a reveal with a declared duel is not a rest point', () => {
    const declarable = toDeclarable();
    expect(declarable.phase).toBe('reveal');
    expect(restPoint(declarable)).toBe(true);
    const declared = must(declareDuel(declarable, 'p1', 'p2'));
    expect(declared.duel).not.toBeNull();
    expect(restPoint(declared)).toBe(false);
  });

  it('a leaderboard with an open survival trial is not a rest point', () => {
    const quiz = makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials), classicRound('r2', [single])]);
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра', 'Гліб'), 0, rng);
    s = must(submitAnswer(s, 'p1', KYIV, 2000));
    s = must(submitAnswer(s, 'p2', LVIV, 2000));
    s = must(submitAnswer(s, 'p3', LVIV, 2000));
    s = must(submitAnswer(s, 'p4', KYIV, 2000));
    s = must(next(s, 2500, rng));
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(trialOpen(s)).toBe(true);
    expect(restPoint(s)).toBe(false);
  });
});

describe('restPoint: «Ва-банк»', () => {
  it('a leaderboard with an open stay/take window is not a rest point; after the window closes it is', () => {
    const quiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder)]);
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро'), T0, rng);
    s = must(submitAnswer(s, 'p1', KYIV, T0 + 1000));
    s = must(submitAnswer(s, 'p2', KYIV, T0 + 1000));
    if (s.phase === 'question') s = must(lock(s));
    while (!decisionOpen(s)) s = must(next(s, T0 + 2000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(restPoint(s)).toBe(false);
    const closed = tick(s, s.endsAt ?? T0 + 999_999);
    expect(decisionOpen(closed)).toBe(false);
    expect(closed.phase).toBe('leaderboard');
    expect(restPoint(closed)).toBe(true);
  });
});

describe('continueFrom', () => {
  it('at the checkpoint moment: the round splash still playing at the checkpoint plays out after a resume a day later', () => {
    const cp = must(start(lobbyWithSplash(twoRounds, 'Оля', 'Петро'), T0));
    expect(cp.phase).toBe('intro');
    const until = cp.splash?.until ?? 0;
    expect(until).toBeGreaterThan(T0);
    const later = T0 + 86_400_000;
    // Мить контрольної точки: заставка зсувається на всю паузу й дограє з того самого залишку.
    const back = must(resume(continueFrom(cp, T0), later));
    expect(back.splash?.until).toBe(later + (until - T0));
    // «Зараз» замість миті точки — заставка вже минула б.
    const wrong = must(resume(continueFrom(cp, later), later + 1000));
    expect(wrong.splash?.until).toBe(until);
  });


  it('pauses at the checkpoint with everyone offline and nobody awaited; phase, plays and scores stay', () => {
    const cp = leaderboard();
    expect(cp.players.every((p) => p.connected)).toBe(true);
    const s = continueFrom(cp, T0 + 10_000);
    expect(s.paused).toBe(true);
    expect(s.players.every((p) => !p.connected)).toBe(true);
    expect(s.awaiting).toEqual([]);
    expect(s.phase).toBe(cp.phase);
    expect(s.questionIndex).toBe(cp.questionIndex);
    expect(s.plays.length).toBe(cp.plays.length);
    expect(s.players.map((p) => p.score)).toEqual(cp.players.map((p) => p.score));
    const back = resume(s, T0 + 70_000);
    expect(back.ok).toBe(true);
    expect(back.ok && back.state.paused).toBe(false);
  });

  it('an autopilot continuation waits for the author: hold author, no step planned; the author resumes', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')])]);
    const lobby = must(addPlayer(must(createAutopilotGame(quiz, { id: 'a', nickname: 'Марта' }, { transitions: false })), { id: 'p2', nickname: 'Ігор' }));
    const started = planAutopilot(lobby, must(autopilotStart(lobby, T0, rng)), T0);
    expect(started.phase).toBe('intro');
    expect(started.autopilot?.at).not.toBeNull();
    const s = continueFrom(started, T0 + 1000);
    expect(s.paused).toBe(true);
    expect(s.autopilot?.hold).toBe('author');
    expect(s.autopilot?.at).toBeNull();
    const back = authorResume(s, T0 + 2000);
    expect(back.ok).toBe(true);
    expect(back.ok && back.state.paused).toBe(false);
    expect(back.ok && back.state.autopilot?.hold).toBeUndefined();
  });
});

describe('addLatePlayer', () => {
  it('a solo newcomer on the leaderboard joins with 0 points; the others keep theirs', () => {
    const cp = leaderboard();
    const s = must(addLatePlayer(cp, { id: 'p9', nickname: '  Іра ' }));
    expect(s.players.at(-1)).toMatchObject({ id: 'p9', nickname: 'Іра', score: 0 });
    expect(s.players.slice(0, 2).map((p) => p.score)).toEqual(cp.players.map((p) => p.score));
    expect(s.phase).toBe('leaderboard');
  });

  it('a nickname already taken by an offline player is refused', () => {
    const cp = continueFrom(leaderboard(), T0 + 10_000);
    expect(addLatePlayer(cp, { id: 'p9', nickname: '  оля ' })).toEqual({ ok: false, error: 'nickname_taken' });
  });

  it('an invalid nickname is refused', () => {
    expect(addLatePlayer(leaderboard(), { id: 'p9', nickname: '   ' })).toEqual({ ok: false, error: 'nickname_invalid' });
  });

  it('during a question the newcomer is refused with wrong_phase', () => {
    expect(addLatePlayer(question(), { id: 'p9', nickname: 'Іра' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a full room is refused', () => {
    let lobby = lobbyWith(twoRounds);
    for (let i = 0; i < LIMITS.maxPlayers; i++) lobby = must(addPlayer(lobby, { id: `x${i}`, nickname: `Гравець ${i}` }));
    const full = must(start(lobby));
    expect(addLatePlayer(full, { id: 'p9', nickname: 'Іра' })).toEqual({ ok: false, error: 'room_full' });
  });

  it('a team newcomer joins the smallest team, without a captaincy', () => {
    const quiz = teamQuiz([classicRound('r1', [single])], 2);
    const s = teamGame(quiz, [['Оля', 'Петро'], ['Іра']]);
    const added = must(addLatePlayer(s, { id: 'n1', nickname: 'Гліб' }));
    expect(added.teams?.members.at(-1)).toMatchObject({ id: 'n1', nickname: 'Гліб', teamId: 't2' });
    expect(added.teams?.captains).toEqual(s.teams?.captains);
    expect(added.players).toEqual(s.players);
  });

  it('equal teams: the newcomer joins the first team of the list', () => {
    const quiz = teamQuiz([classicRound('r1', [single])], 2);
    const s = teamGame(quiz, [['Оля'], ['Іра']]);
    const added = must(addLatePlayer(s, { id: 'n1', nickname: 'Гліб' }));
    expect(added.teams?.members.at(-1)).toMatchObject({ id: 'n1', teamId: 't1' });
    expect(addLatePlayer(s, { id: 'n2', nickname: 'іра' })).toEqual({ ok: false, error: 'nickname_taken' });
  });
});

describe('addLatePlayer on the board', () => {
  it('a solo newcomer during a board round joins the turn circle', () => {
    const boardQuiz = makeRoundsQuiz([boardRound('g1', [{ title: 'Ріки', cells: [withId(single, 'b1'), withId(single, 'b2')] }])]);
    const board = must(next(must(start(lobbyWith(boardQuiz, 'Оля', 'Петро'))), T0, rng));
    expect(board.board?.circle).toEqual(['p1', 'p2']);
    const added = must(addLatePlayer(board, { id: 'p9', nickname: 'Іра' }));
    expect(added.board?.circle).toEqual(['p1', 'p2', 'p9']);
    expect(added.board?.done).toBe(board.board?.done);
    // Поза раундом поля кола немає.
    expect(must(addLatePlayer(leaderboard(), { id: 'p9', nickname: 'Іра' })).board).toBeNull();
  });
});

describe('slotsOf', () => {
  it('solo: the players in state order, with no team', () => {
    expect(slotsOf(leaderboard())).toEqual([
      { id: 'p1', nickname: 'Оля', team: null },
      { id: 'p2', nickname: 'Петро', team: null },
    ]);
  });

  it('team game: only the people with a team, team = the team name', () => {
    const quiz = teamQuiz([classicRound('r1', [single])], 2);
    let lobby = must(addPlayer(lobbyWith(quiz), { id: 'm1', nickname: 'Оля' }));
    lobby = must(addPlayer(lobby, { id: 'm2', nickname: 'Петро' }));
    lobby = must(addPlayer(lobby, { id: 'm3', nickname: 'Іра' }));
    lobby = must(assignTeam(lobby, 'm1', 't2'));
    lobby = must(assignTeam(lobby, 'm3', 't1'));
    // У лобі Петро ще без команди: він не слот.
    expect(slotsOf(lobby).map((slot) => slot.id)).toEqual(['m1', 'm3']);
    const started = must(start(must(assignTeam(lobby, 'm2', 't1'))));
    const names = Object.fromEntries((started.teams?.list ?? []).map((t) => [t.id, t.name]));
    expect(names).toEqual({ t1: 'Червоні', t2: 'Сині' });
    expect(slotsOf(started)).toEqual([
      { id: 'm1', nickname: 'Оля', team: 'Сині' },
      { id: 'm2', nickname: 'Петро', team: 'Червоні' },
      { id: 'm3', nickname: 'Іра', team: 'Червоні' },
    ]);
  });
});
