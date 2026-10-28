import { describe, expect, it } from 'vitest';
import type { Answer, ResumeSetup } from '@quiz/shared';
import { authorTeamForm, autopilotStart, createAutopilotGame, planAutopilot, pilotStep } from './autopilot';
import { resumeError, resumeLobby } from './carry';
import { addPlayer, endRound, lock, next, start, submitAnswer, type GameState, type Rng } from './game';
import { stamp } from './pacing';
import { boardRound, classicRound, finalRound, ladderRound, makeRoundsQuiz, single, survivalQuestions, survivalRound, survivalTrials, wipeoutLadder, wipeoutRound, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithGuide, lobbyWithSplash, must } from './testing/helpers';
import { teamLobby, teamQuiz } from './testing/teams';
import { pickContestant } from './ladder';
import { assignTeam } from './teams';
import { undoPanel, undoScore } from './undo';
import { hostView, playerView } from './views';

const T0 = 1_000_000;
const rng: Rng = () => 0.3;
const R = { speedBonus: false };
const RIGHT: Answer = { type: 'single', optionId: 'b' };
const three = makeRoundsQuiz([
  classicRound('r1', [single], { ...R, title: 'Розминка' }),
  classicRound('r2', [withId(single, 'q2')], { ...R, title: 'Річки' }),
  classicRound('r3', [withId(single, 'q3')], { ...R, title: 'Гори' }),
]);
const ROUNDS = [
  { title: 'Розминка', type: 'classic' },
  { title: 'Річки', type: 'classic' },
  { title: 'Гори', type: 'classic' },
];
const carryRow = (seq: number, playerId: string, points: number, roundIndex: number, at = T0) => ({
  seq,
  playerId,
  points,
  roundIndex,
  afterQuestion: 0,
  source: 'carry',
  at,
});

/** Старт з раунду 3 (Гори): Оля 42 434, Петро −150, Іра 0. */
const resumed = (): GameState =>
  must(start(lobbyWith(three, 'Оля', 'Петро', 'Іра'), T0, { roundIndex: 2, points: { p1: 42_434, p2: -150, p3: 0 } }));

/** Те, що бачить сервер для автопілота: stamp, потім planAutopilot. */
const plan = (prev: GameState, nextState: GameState, now: number): GameState => planAutopilot(prev, stamp(prev, nextState, now), now);
const go = (state: GameState, r: Rng = rng): GameState => {
  const at = state.autopilot?.at;
  if (at === null || at === undefined) throw new Error('no autopilot step planned');
  return plan(state, pilotStep(state, at, r), at);
};

describe('resume a game (12r): the engine start', () => {
  it('a start without resume is unchanged', () => {
    const lobby = lobbyWith(three, 'Оля', 'Петро');
    const plain = must(start(lobby, T0));
    expect(must(start(lobby, T0, undefined))).toEqual(plain);
    expect(plain.adjustments).toEqual([]);
    expect(plain.roundIndex).toBe(0);
    // Не лише «як без аргументу»: звичайний старт — раунд 1, нулі, без рядків і запитань, adjustmentSeq не зрушено.
    expect(plain.phase).toBe('intro');
    expect(plain.players.map((p) => [p.id, p.score])).toEqual([
      ['p1', 0],
      ['p2', 0],
    ]);
    expect(plain.plays).toEqual([]);
    expect(plain.adjustmentSeq).toBe(lobby.adjustmentSeq);
    expect(hostView(plain).round?.index).toBe(0);
  });

  it('resume starts at the chosen round with one carry row per non-zero participant', () => {
    const lobby = lobbyWithSplash(three, 'Оля', 'Петро', 'Іра');
    let s = must(start(lobby, T0, { roundIndex: 2, points: { p1: 42_434, p2: -150, p3: 0 } }));
    expect(s.phase).toBe('intro');
    expect(s.roundIndex).toBe(2);
    expect(s.splash?.kind).toBe('round');
    expect(s.adjustments).toEqual([carryRow(1, 'p1', 42_434, 2), carryRow(2, 'p2', -150, 2)]);
    expect(s.players.map((p) => p.score)).toEqual([42_434, -150, 0]);
    expect(hostView(s).round?.index).toBe(2);
    s = must(next(s, s.splash!.until, rng));
    expect(s.phase).toBe('question');
    expect(s.plays.map((p) => p.question.id)).toEqual(['q3']);
    expect(s.plays.every((p) => p.roundIndex === 2)).toBe(true);
  });

  it('the guide keeps the resumed round', () => {
    let s = must(start(lobbyWithGuide(three, 'Оля', 'Петро'), T0, { roundIndex: 1, points: { p1: 300 } }));
    expect(s.phase).toBe('guide');
    expect(s.adjustments).toEqual([carryRow(1, 'p1', 300, 1)]);
    for (let i = 0; i < 20 && s.phase === 'guide'; i++) s = must(next(s, T0 + 1000, rng));
    expect(s.phase).toBe('intro');
    expect(s.roundIndex).toBe(1);
    expect(s.adjustments).toEqual([carryRow(1, 'p1', 300, 1)]);
    expect(s.players[0].score).toBe(300);
  });

  it('checks the round, the points and the participants', () => {
    const lobby = lobbyWith(three, 'Оля', 'Петро');
    const cases: [ResumeSetup, string][] = [
      [{ roundIndex: 3, points: {} }, 'resume_invalid'],
      [{ roundIndex: -1, points: {} }, 'resume_invalid'],
      [{ roundIndex: 0.5, points: {} }, 'resume_invalid'],
      [{ roundIndex: 0, points: { p1: 1.5 } }, 'resume_invalid'],
      [{ roundIndex: 0, points: { p1: 10_000_000 } }, 'resume_invalid'],
      [{ roundIndex: 0, points: { p1: -10_000_000 } }, 'resume_invalid'],
      [{ roundIndex: 0, points: { p9: 100 } }, 'not_found'],
    ];
    for (const [resume, error] of cases) {
      expect(resumeError(lobby, resume)).toBe(error);
      expect(start(lobby, T0, resume)).toEqual({ ok: false, error });
    }
    expect(resumeError(lobby, { roundIndex: 2, points: { p1: 9_999_999, p2: -9_999_999 } })).toBeNull();
    const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`x${i}`, 1]));
    expect(resumeError(lobby, { roundIndex: 0, points: many })).toBe('resume_invalid');
    const started = must(start(lobby, T0));
    expect(start(started, T0, { roundIndex: 1, points: {} })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('late joiners start from zero', () => {
    const resume = { roundIndex: 1, points: { p1: 500, p2: 200 } };
    const lobby = must(addPlayer(lobbyWith(three, 'Оля', 'Петро'), { id: 'p4', nickname: 'Тарас' }));
    const s = must(start(lobby, T0, resume));
    expect(s.players.find((p) => p.id === 'p4')?.score).toBe(0);
    expect(s.adjustments.map((a) => a.playerId)).toEqual(['p1', 'p2']);
  });

  it('teams carry per team; an empty team is skipped', () => {
    let s = teamLobby(teamQuiz([classicRound('r1', [single]), classicRound('r2', [withId(single, 'q2')])], 3), 'Оля', 'Петро', 'Віра');
    s = must(assignTeam(s, 'm1', 't1'));
    s = must(assignTeam(s, 'm2', 't1'));
    s = must(assignTeam(s, 'm3', 't2'));
    expect(resumeError(s, { roundIndex: 1, points: { m1: 100 } })).toBe('not_found');
    const started = must(start(s, T0, { roundIndex: 1, points: { t1: 100, t2: 200, t3: 300 } }));
    expect(started.roundIndex).toBe(1);
    expect(started.adjustments).toEqual([carryRow(1, 't1', 100, 1), carryRow(2, 't2', 200, 1)]);
    expect(started.players.map((p) => [p.id, p.score])).toEqual([
      ['t1', 100],
      ['t2', 200],
    ]);
  });

  it('carry rows are not undoable', () => {
    let s = must(next(resumed(), T0 + 1000, rng));
    s = must(submitAnswer(s, 'p1', RIGHT, T0 + 2000));
    const panel = undoPanel(s);
    const seqs = (panel?.rounds ?? []).flatMap((r) => [...r.loose, ...r.questions.flatMap((q) => q.rows)]).map((row) => row.target);
    expect(seqs).not.toContainEqual({ seq: 1 });
    expect(seqs).not.toContainEqual({ seq: 2 });
    expect(undoScore(s, { seq: 1 }, T0 + 3000)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('round totals leave carry out', () => {
    let s = must(next(resumed(), T0 + 1000, rng));
    s = must(submitAnswer(s, 'p1', RIGHT, T0 + 2000));
    s = must(next(must(lock(s)), T0 + 3000, rng));
    const view = hostView(s);
    const olya = view.standings.find((st) => st.participantId === 'p1')!;
    expect(olya.rounds).toEqual([0, 0, 1000]);
    expect(olya.score).toBe(43_434);
    expect(view.breakdowns.p1.parts[0]).toEqual({ source: 'carry', plus: 42_434, minus: 0 });
  });

  it.each([
    ['board', boardRound('g', [{ title: 'A', cells: [withId(single, 'c1')] }]), 'board'],
    ['ladder', ladderRound('l'), 'question'],
    ['survival', survivalRound('s', survivalQuestions, survivalTrials), 'question'],
    ['wipeout', wipeoutRound('w', wipeoutLadder), 'question'],
  ] as const)('starts at a %s round with the carried points', (_, round, phase) => {
    const quiz = makeRoundsQuiz([classicRound('r0', [single], R), round]);
    let s = must(start(lobbyWith(quiz, 'Оля', 'Петро'), T0, { roundIndex: 1, points: { p1: 500, p2: -20 } }));
    expect(s.phase).toBe('intro');
    expect(s.roundIndex).toBe(1);
    expect(s.adjustments).toEqual([carryRow(1, 'p1', 500, 1), carryRow(2, 'p2', -20, 1)]);
    // «Мільйонер»: спершу ведучий вибирає гравця.
    if (round.type === 'ladder') s = must(pickContestant(s, 'p2'));
    s = must(next(s, T0 + 1000, rng));
    expect(s.phase).toBe(phase);
    expect(s.roundIndex).toBe(1);
    expect(s.players.map((p) => p.score)).toEqual([500, -20]);
    const view = hostView(s);
    expect(view.firstRound).toBe(1);
    expect(view.standings.map((st) => st.rounds)).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('the table views name the first played round; a plain game says 0', () => {
    const s = must(next(resumed(), T0 + 1000, rng));
    expect(hostView(s).firstRound).toBe(2);
    expect(playerView(s, 'p2')!.table?.firstRound).toBe(2);
    // Лише рядки 'carry' зсувають колонки: продовжена гра з нулями показує й порожні раунди (прийнята ціна).
    const bare = must(start(lobbyWith(three, 'Оля', 'Петро'), T0, { roundIndex: 1, points: {} }));
    expect(bare.adjustments).toEqual([]);
    expect(hostView(bare).firstRound).toBe(0);
    expect(hostView(must(next(bare, T0 + 1000, rng))).firstRound).toBe(0);
    const plain = must(start(lobbyWith(three, 'Оля', 'Петро'), T0));
    expect(hostView(plain).firstRound).toBe(0);
    expect(playerView(plain, 'p1')!.table?.firstRound).toBe(0);
    expect(hostView(lobbyWith(three, 'Оля')).firstRound).toBe(0);
  });

  it('a plain game whose round 1 has no play keeps the Р1 column', () => {
    // Ведучий завершив раунд 1 ще на заставці: у раунді 0 немає жодного запитання.
    let s = must(start(lobbyWith(three, 'Оля', 'Петро'), T0));
    s = must(endRound(s, T0 + 500));
    for (let i = 0; i < 5 && s.phase !== 'question'; i++) s = must(next(s, T0 + 1000 + i, rng));
    expect(s.roundIndex).toBe(1);
    expect(s.plays.map((p) => p.roundIndex)).toEqual([1]);
    s = must(next(must(lock(must(submitAnswer(s, 'p1', RIGHT, T0 + 2000)))), T0 + 3000, rng));
    const view = hostView(s);
    expect(view.firstRound).toBe(0);
    expect(playerView(s, 'p2')!.table?.firstRound).toBe(0);
    expect(view.standings.find((st) => st.participantId === 'p1')?.rounds).toEqual([0, 1000]);
  });

  it('the final round wagers from the carried score', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single], R), finalRound('f', withId(single, 'f1'))]);
    let s = must(start(lobbyWith(quiz, 'Оля', 'Петро'), T0, { roundIndex: 1, points: { p1: 500 } }));
    s = must(next(s, T0 + 1000, rng));
    expect(s.phase).toBe('wager');
    expect(s.final?.limits).toEqual({ p1: 500, p2: 0 });
  });

  it('the lobby shows rounds and participants to the host and the author only', () => {
    const lobby = lobbyWith(three, 'Оля', 'Петро');
    expect(resumeLobby(lobby)).toEqual({
      rounds: ROUNDS,
      participants: [
        { id: 'p1', nickname: 'Оля' },
        { id: 'p2', nickname: 'Петро' },
      ],
    });
    expect(hostView(lobby).resume).toEqual(resumeLobby(lobby));
    expect(playerView(lobby, 'p1')!.author).toBeNull();
    const teams = teamLobby(teamQuiz([classicRound('r1', [single])], 3), 'Оля');
    expect(resumeLobby(teams)?.participants).toEqual([
      { id: 't1', nickname: 'Червоні' },
      { id: 't2', nickname: 'Сині' },
      { id: 't3', nickname: 'Зелені' },
    ]);
    const started = must(start(lobby, T0));
    expect(resumeLobby(started)).toBeNull();
    expect(hostView(started).resume).toBeNull();
    const pilot = must(addPlayer(must(createAutopilotGame(three, { id: 'a', nickname: 'Марта' })), { id: 'p2', nickname: 'Ігор' }));
    expect(playerView(pilot, 'a')!.author?.resume).toEqual({
      rounds: ROUNDS,
      participants: [
        { id: 'a', nickname: 'Марта' },
        { id: 'p2', nickname: 'Ігор' },
      ],
    });
    expect(playerView(pilot, 'p2')!.author).toBeNull();
  });

  it('the autopilot author starts with resume, also after a team dice tour', () => {
    // соло
    const solo = must(addPlayer(must(createAutopilotGame(three, { id: 'a', nickname: 'Марта' })), { id: 'p2', nickname: 'Ігор' }));
    const started = must(autopilotStart(solo, T0, rng, { roundIndex: 1, points: { a: 300 } }));
    expect(started.phase).toBe('intro');
    expect(started.roundIndex).toBe(1);
    expect(started.adjustments).toEqual([carryRow(1, 'a', 300, 1)]);
    expect(started.autopilot).toEqual({ authorId: 'a', at: null });
    // хибні дані — помилка ще до туру
    const quiz = teamQuiz([classicRound('r1', [single]), classicRound('r2', [withId(single, 'q2')])]);
    let lobby = must(createAutopilotGame(quiz, { id: 'a', nickname: 'Марта' }, { transitions: false }));
    lobby = must(addPlayer(lobby, { id: 'm2', nickname: 'Ігор' }));
    lobby = must(authorTeamForm(lobby, 'dice'));
    expect(autopilotStart(lobby, T0, rng, { roundIndex: 5, points: {} })).toEqual({ ok: false, error: 'resume_invalid' });
    expect(autopilotStart(lobby, T0, rng, { roundIndex: 1, points: { a: 1 } })).toEqual({ ok: false, error: 'not_found' });
    // тур кубиків: resume живе до кінця туру
    const resume = { roundIndex: 1, points: { t1: 700, t2: -20 } };
    let s = plan(lobby, must(autopilotStart(lobby, T0, rng, resume)), T0);
    expect(s.autopilot?.starting).toBe(true);
    expect(s.autopilot?.resume).toEqual(resume);
    // зміна способу скасовує і старт, і дані
    const changed = must(authorTeamForm(s, 'random'));
    expect(changed.autopilot?.starting).toBeUndefined();
    expect(changed.autopilot?.resume).toBeUndefined();
    let i = 0;
    s = go(s, () => [0, 0.9][i++ % 2]);
    expect(s.phase).toBe('lobby');
    expect(s.autopilot?.resume).toEqual(resume);
    // Автор тисне «Почати гру» сам, поки бот не стартував: збережені дані не губляться.
    const pressed = must(autopilotStart(s, T0 + 14_000, rng));
    expect(pressed.roundIndex).toBe(1);
    expect(pressed.adjustments.map((a) => [a.playerId, a.points])).toEqual([
      ['t1', 700],
      ['t2', -20],
    ]);
    s = go(s);
    expect(s.phase).toBe('intro');
    expect(s.roundIndex).toBe(1);
    expect(s.adjustments).toEqual([carryRow(1, 't1', 700, 1, T0 + 15_000), carryRow(2, 't2', -20, 1, T0 + 15_000)]);
    expect(s.autopilot?.starting).toBeUndefined();
    expect(s.autopilot?.resume).toBeUndefined();
  });
});
