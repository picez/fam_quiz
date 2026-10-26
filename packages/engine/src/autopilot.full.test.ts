import { describe, expect, it } from 'vitest';
import { guidePages, isUnscored, type Question, type Quiz, type Round, type TeamForm } from '@quiz/shared';
import { authorTeamForm, autopilotStart, createAutopilotGame } from './autopilot';
import { addPlayer, setConnected, type GameState, type Rng } from './game';
import { answerAs, answering, commit, drive, silent, Stalled, type People } from './testing/autopilot';
import { duelQuiz } from './testing/duel';
import {
  blitzRound,
  bluff,
  bool,
  boardRound,
  chain,
  classicRound,
  clues,
  cloud,
  finalRound,
  ladderRound,
  makeRoundsQuiz,
  match,
  multi,
  numeric,
  order,
  pin,
  poll,
  single,
  slider,
  sortQ,
  survey,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  text,
  wall3,
  wipeoutLadder,
  wipeoutRound,
  withId,
  withPoints,
  withVideo,
} from './testing/fixtures';
import { must } from './testing/helpers';
import { teamQuiz } from './testing/teams';

const T = 1_000_000;

/** Детермінований жереб: 0.1, 0.4, 0.7, 0.2, … по колу. */
function cycleRng(): Rng {
  const values = [0.1, 0.4, 0.7, 0.2, 0.9, 0.5, 0.3, 0.8, 0.6];
  let i = 0;
  return () => values[i++ % values.length];
}

/** Зміна стану, яку бачив драйвер. */
interface Change {
  prev: GameState;
  next: GameState;
  now: number;
}

/** Автопілот з автором a (Марта), гравцями p2, p3 (у командній грі — учасниками), із заставками; prepare — дії автора в лобі. */
function lobbyOf(quiz: Quiz, others = ['Ігор', 'Олена'], prepare: (lobby: GameState) => GameState = (s) => s): GameState {
  const created = must(createAutopilotGame(quiz, { id: 'a', nickname: 'Марта' }, { transitions: true }));
  return prepare(others.reduce((s, nickname, i) => must(addPlayer(s, { id: `p${i + 2}`, nickname })), created));
}

/** Автор тисне «Почати гру» о T, далі гра йде сама до кінця. */
function play(quiz: Quiz, people: People, others?: string[], prepare?: (lobby: GameState) => GameState) {
  const rng = cycleRng();
  const lobby = lobbyOf(quiz, others, prepare);
  const started = commit(lobby, must(autopilotStart(lobby, T, rng)), T);
  const changes: Change[] = [];
  const result = drive(started, { now: T, rng, people, watch: (prev, next, now) => changes.push({ prev, next, now }) });
  return { ...result, changes };
}

/** Груба верхня межа тривалості гри: таймери запитань плюс щедрі межі таблиці на кожне запитання, раунд і сторінку «Як грати». */
function bound(quiz: Quiz): number {
  const questions = quiz.rounds.flatMap((round): Question[] => {
    if (round.type === 'board') return round.categories.flatMap((c) => c.cells.map((cell) => cell.question));
    if (round.type === 'survival') return [...round.questions, ...round.trials];
    return round.questions;
  });
  const timers = questions.reduce((sum, q) => sum + q.timeLimit * 1000 + ('choiceTime' in q ? q.choiceTime * 1000 : 0), 0);
  // Поле: на кожну клітинку ще й хід (30 с); на кожне запитання — розкриття, рядки, таблиця, рішення, ставки, випробування.
  const boardTurns = questions.length * 30_000;
  const duels = quiz.duels === undefined ? 0 : 60_000 + quiz.duels.questionsPerDuel * quiz.duels.timeLimit * 1000;
  return timers + boardTurns + questions.length * 90_000 + quiz.rounds.length * 60_000 + guidePages(quiz).length * 8000 + duels + 30_000;
}

/** Тривалості суцільних проміжків, коли inside(стан) правдиве: від входу до виходу. */
function spans(changes: Change[], inside: (state: GameState) => boolean): number[] {
  const out: number[] = [];
  let since: number | null = null;
  for (const { prev, next, now } of changes) {
    if (!inside(prev) && inside(next)) since = now;
    if (inside(prev) && !inside(next) && since !== null) {
      out.push(now - since);
      since = null;
    }
  }
  return out;
}

/** Запис відповіді гравця на запитання з цим id. */
function recordFor(state: GameState, questionId: string, playerId: string) {
  return state.plays.find((p) => p.question.id === questionId)?.answers[playerId];
}

// ——— Вікторини ———

const classicQuiz: Quiz = makeRoundsQuiz(
  [
    classicRound('r1', [single, multi, bool, text, numeric, order, match, chain, sortQ, slider, clues, pin, wall3]),
    classicRound('r2', [poll, cloud, survey, bluff, withVideo(withId(single, 'qv'))], { title: 'Друге коло' }),
  ],
  { leaderboard: 'each', newcomers: true },
);

const blitzQuiz: Quiz = makeRoundsQuiz([blitzRound('b1', [single, text, bool], { check: 'manual' })], { leaderboard: 'end' });

const boardQuiz: Quiz = makeRoundsQuiz(
  [
    boardRound(
      'g1',
      [
        { title: 'Міста', cells: [withPoints(withId(single, 'g11'), 100), withPoints(withId(text, 'g12'), 200), { mark: 'x2', question: withPoints(withId(text, 'g13'), 300) }] },
        { title: 'Природа', cells: [withPoints(withId(bool, 'g21'), 100), { kind: 'blitz', question: withPoints(withId(single, 'g22'), 200) }, withPoints(withId(numeric, 'g23'), 300)] },
        { title: 'Люди', cells: [withPoints(withId(single, 'g31'), 100), withPoints(withId(text, 'g32'), 200), { answerMode: 'voice', question: withPoints(withId(clues, 'g33'), 300) }] },
      ],
      { answerMode: 'voice', check: 'manual' },
    ),
  ],
  { leaderboard: 'end' },
);

const finalQuiz = (wagerMode: 'classic' | 'bank'): Quiz =>
  makeRoundsQuiz([classicRound('r1', [single, bool]), finalRound('f1', withId(text, 'qf'), { check: 'manual', wagerMode })], { leaderboard: 'end' });

const wipeoutQuiz: Quiz = makeRoundsQuiz([wipeoutRound('w1', wipeoutLadder)], { leaderboard: 'end' });

const survivalQuiz = (trial: 'question' | 'luck'): Quiz =>
  makeRoundsQuiz([survivalRound('s1', survivalQuestions, survivalTrials, { trial })], { leaderboard: 'end' });

const ladderQuiz: Quiz = makeRoundsQuiz([classicRound('r1', [single]), ladderRound('l1')], { leaderboard: 'end' });

const teamsQuiz: Quiz = teamQuiz([classicRound('r1', [single, text, bool]), finalRound('f1', withId(single, 'qf'))]);

const teamBoardQuiz: Quiz = teamQuiz([
  boardRound('g1', [
    { title: 'Міста', cells: [withId(single, 'g11'), withId(text, 'g12')] },
    { title: 'Природа', cells: [withId(bool, 'g21'), { answerMode: 'voice', question: withId(clues, 'g22') }] },
  ], { answerMode: 'voice', check: 'manual' }),
]);

const QUIZZES: [string, Quiz, ((lobby: GameState) => GameState)?][] = [
  ['classic with every question type and the guide', classicQuiz],
  ['manual blitz', blitzQuiz],
  ['voice manual board with blitz, voice clues and ×2 cells', boardQuiz],
  ['manual classic final', finalQuiz('classic')],
  ['manual bank final', finalQuiz('bank')],
  ['wipeout', wipeoutQuiz],
  ['survival with a trial question', survivalQuiz('question')],
  ['survival with luck', survivalQuiz('luck')],
  ['host-picked untimed ladder with every lifeline', ladderQuiz],
  ['duels', duelQuiz()],
  ['a voice board in a team game', teamBoardQuiz, (s) => must(authorTeamForm(s, 'random'))],
  ...(['host', 'pick', 'random', 'dice'] as TeamForm[]).map(
    (form): [string, Quiz, (lobby: GameState) => GameState] => [`teams «${form}»`, teamsQuiz, (s) => must(authorTeamForm(s, form))],
  ),
];

describe('autopilot: every format from the lobby to the podium with no host', () => {
  for (const [name, quiz, prepare] of QUIZZES) {
    for (const [who, people] of [
      ['answering', answering],
      ['silent', silent],
    ] as const) {
      it(`${name} — ${who} players`, () => {
        const { state, now } = play(quiz, people, undefined, prepare);
        expect(state.phase).toBe('finished');
        expect(now - T).toBeLessThan(bound(quiz));
        expect(state.autopilot?.at).toBeNull();
        if (who === 'answering') {
          // Кожне запитання з балами має правильну відповідь з телефона (у бліці — переможця, на полі й у «Мільйонері» — того, хто відповідав).
          for (const p of state.plays.filter((x) => !isUnscored(x.question))) {
            expect([p.question.id, Object.values(p.answers).some((r) => r.grade === 'correct')]).toEqual([p.question.id, true]);
          }
          expect(state.plays.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

describe('autopilot: scores and defaults', () => {
  it('a voice board answered from the phone scores the cell price at once (×2 doubled), with no override', () => {
    const { state } = play(boardQuiz, answering);
    const played = state.plays.filter((p) => p.board !== undefined);
    expect(played).toHaveLength(9);
    for (const id of ['g12', 'g33']) {
      const p = state.plays.find((x) => x.question.id === id)!;
      const record = p.answers[p.board!.chooserId];
      expect(record).toMatchObject({ grade: 'correct', overridden: false, points: p.board!.price });
    }
    const doubled = state.plays.find((x) => x.question.id === 'g13')!;
    expect(doubled.answers[doubled.board!.chooserId]).toMatchObject({ grade: 'correct', overridden: false, points: 600 });
  });

  it('a manual blitz keeps its buzzer and is judged by the key at once: wrong is «no», the next one right wins', () => {
    const { state } = play(blitzQuiz, answerAs({ wrong: ['a'] }));
    expect(state.quiz.rounds[0].type === 'blitz' && state.quiz.rounds[0].check).toBe('manual');
    for (const id of ['q1', 'q4', 'q3']) {
      const attempts = state.plays.find((p) => p.question.id === id)?.blitz?.attempts ?? [];
      expect(attempts.map((x) => [x.playerId, x.grade])).toEqual([
        ['a', 'wrong'],
        ['p2', 'correct'],
      ]);
    }
    expect(recordFor(state, 'q1', 'p2')).toMatchObject({ grade: 'correct', overridden: false });
    expect(state.players.find((p) => p.id === 'p2')!.score).toBeGreaterThan(0);
  });

  it('classic: every scored question type is answered right from the phone', () => {
    const { state } = play(classicQuiz, answering);
    const scored = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q14', 'q17', 'q19', 'qv'];
    for (const id of scored) expect([id, recordFor(state, id, 'p2')?.grade]).toEqual([id, 'correct']);
  });

  it('teams «pick»: every member picked a team themselves', () => {
    const { state } = play(teamsQuiz, answering, undefined, (s) => must(authorTeamForm(s, 'pick')));
    const list = state.teams!.list.map((t) => t.id);
    expect(state.teams!.members.map((m) => m.teamId)).toEqual(state.teams!.members.map((_m, i) => list[i % list.length]));
  });

  /** Кидки кубиків команд, коли тур закрився (останній стан лобі з кубиками). */
  const lobbyThrows = (changes: Change[]) => changes.filter((c) => c.prev.phase === 'lobby' && c.prev.teams?.dice != null).at(-1)?.next;

  it('teams «dice»: every member rolled in the lobby tour', () => {
    const { changes } = play(teamsQuiz, answering, undefined, (s) => must(authorTeamForm(s, 'dice')));
    const closed = changes.find((c) => (c.prev.teams?.dice?.tour.length ?? 0) > 0 && c.next.teams?.dice?.tour.length === 0);
    expect(closed).toBeDefined();
    expect(closed!.now).toBe(T);
    for (const m of closed!.next.teams!.members) expect(closed!.next.teams!.dice!.throws[m.id]?.length ?? 0).toBeGreaterThan(0);
    expect(lobbyThrows(changes)).toBeDefined();
  });

  it('teams «dice», silent: the autopilot rolls for everyone after 15 s', () => {
    const { changes } = play(teamsQuiz, silent, undefined, (s) => must(authorTeamForm(s, 'dice')));
    const closed = changes.find((c) => (c.prev.teams?.dice?.tour.length ?? 0) > 0 && c.next.teams?.dice?.tour.length === 0);
    expect(closed).toBeDefined();
    expect(closed!.now).toBe(T + 15_000);
    for (const m of closed!.next.teams!.members) expect(closed!.next.teams!.dice!.throws[m.id]?.length ?? 0).toBeGreaterThan(0);
  });

  it('wipeout: everyone goes on after the first question, then the banks are taken by default and carried to the scores', () => {
    const { state } = play(wipeoutQuiz, answering);
    const [first, second] = state.plays;
    expect(first.wipeout?.stay).toEqual(['a', 'p2', 'p3']);
    expect(second.wipeout?.auto).toEqual(['a', 'p2', 'p3']);
    // Банк після двох сходинок: 100 + 200.
    for (const p of state.players) expect(p.score).toBe(300);
  });

  it('survival with a trial question: the wrong one is on the edge, fails the trial and is out', () => {
    const { state } = play(survivalQuiz('question'), answerAs({ wrong: ['p3'] }));
    const trials = state.plays.flatMap((p) => (p.survival?.trial ? [p.survival.trial] : []));
    expect(trials).toHaveLength(1);
    expect(trials[0]).toMatchObject({ kind: 'question', out: ['p3'] });
  });

  it('survival with luck: the wrong one is on the edge and is out only if the door was the trap', () => {
    const { state } = play(survivalQuiz('luck'), answerAs({ wrong: ['p3'] }));
    const trial = state.plays.flatMap((p) => (p.survival?.trial ? [p.survival.trial] : []))[0];
    expect(trial).toMatchObject({ kind: 'luck', doors: { p3: 0 } });
    expect(trial.out).toEqual(trial.traps.p3 === 0 ? ['p3'] : []);
  });

  it('ladder: the contestant goes on after the first step and takes the money after the second (30 s)', () => {
    const { state } = play(ladderQuiz, answering);
    const steps = state.plays.filter((p) => p.ladder !== undefined);
    expect(steps.map((p) => p.ladder?.decision)).toEqual(['go', 'take']);
    expect(steps[1].ladder?.outcome).toMatchObject({ passed: 2, points: 300 });
  });

  it('a board with an active and a silent player: the active one picks every cell, the silent one is only skipped', () => {
    const quiz = boardQuiz;
    const { state, changes } = play(quiz, answerAs({ idle: ['p2'] }), ['Ігор']);
    const cells = state.plays.filter((p) => p.board !== undefined);
    expect(cells).toHaveLength(9);
    expect(cells.every((p) => p.board?.chooserId === 'a')).toBe(true);
    const skips = changes.filter((c) => c.prev.phase === 'board' && c.next.phase === 'board' && c.next.board!.circleNo * 10 + c.next.board!.done !== c.prev.board!.circleNo * 10 + c.prev.board!.done);
    expect(skips.length).toBeGreaterThan(0);
    expect(skips.every((c) => c.prev.board!.circle[c.prev.board!.done] === 'p2')).toBe(true);
  });

  it('a silent team board: two skips in a row (both teams), then the cell is drawn by lot', () => {
    const { state, changes } = play(teamBoardQuiz, silent, undefined, (s) => must(authorTeamForm(s, 'random')));
    const cells = state.plays.filter((p) => p.board !== undefined);
    expect(cells).toHaveLength(4);
    const turnEnds = changes.filter((c) => c.prev.phase === 'board' && !c.prev.paused && (c.next.phase !== 'board' || c.next.board!.done !== c.prev.board!.done || c.next.board!.circleNo !== c.prev.board!.circleNo));
    expect(turnEnds).toHaveLength(4 * (2 + 1));
  });

  it('duels: the first player declares, picks the first category and wins by answering right', () => {
    const { state } = play(duelQuiz(), answering);
    expect(state.duelsDeclared).toEqual(['a']);
    expect(state.adjustments.filter((x) => x.source === 'duel').map((x) => [x.playerId, x.points])).toEqual([
      ['a', 300],
      ['p2', -300],
    ]);
  });

  it('a team game: every team answers right through its captain', () => {
    const { state } = play(teamsQuiz, answering, undefined, (s) => must(authorTeamForm(s, 'random')));
    expect(state.players).toHaveLength(2);
    for (const team of state.players) expect(recordFor(state, 'q4', team.id)).toMatchObject({ grade: 'correct' });
  });

  for (const mode of ['classic', 'bank'] as const) {
    it(`a manual ${mode} final judges by the key at once`, () => {
      const { state } = play(finalQuiz(mode), answerAs({ wrong: ['p2'] }));
      expect(recordFor(state, 'qf', 'a')).toMatchObject({ grade: 'correct', accepted: true, overridden: false });
      expect(recordFor(state, 'qf', 'p3')).toMatchObject({ grade: 'correct', accepted: true, overridden: false });
      expect(recordFor(state, 'qf', 'p2')).toMatchObject({ grade: 'wrong', accepted: false, overridden: false });
    });
  }

  it('silent: every board turn ends after 30 s — skipped, and after a whole circle of skips in a row the cell is drawn by lot', () => {
    const { state, changes } = play(boardQuiz, silent);
    const turn = (s: GameState) => (s.phase === 'board' && !s.paused ? `${s.board!.circleNo}:${s.board!.done}` : null);
    const turns: number[] = [];
    let since: number | null = null;
    for (const { prev, next, now } of changes) {
      if (turn(prev) === turn(next)) continue;
      if (turn(prev) !== null && since !== null) turns.push(now - since);
      since = turn(next) === null ? null : now;
    }
    // Кожна клітинка: три пропуски поспіль (ціле коло з 3 гравців), тоді клітинка жеребом; 9 клітинок.
    expect(turns).toHaveLength(9 * (3 + 1));
    for (const ms of turns) expect(ms).toBe(30_000);
    expect(state.plays.filter((p) => p.board !== undefined)).toHaveLength(9);
  });

  it('silent: final wagers close after 30 s', () => {
    const { changes } = play(finalQuiz('classic'), silent);
    expect(spans(changes, (s) => s.phase === 'wager')).toEqual([30_000]);
  });

  it('a ladder contestant who does not decide takes the money after 30 s', () => {
    const { state, changes } = play(ladderQuiz, answerAs({ decide: false }));
    expect(spans(changes, (s) => s.phase === 'leaderboard' && s.plays[s.questionIndex]?.ladder?.decision === null && s.plays[s.questionIndex]?.ladder?.outcome === null && s.ladder !== undefined)).toEqual([30_000]);
    const decided = state.plays.filter((p) => p.ladder?.decision !== null && p.ladder !== undefined);
    expect(decided.map((p) => p.ladder?.decision)).toEqual(['take']);
  });

  it('a declared duel whose players stay silent gets its category by lot 15 s after the «Duel!» splash', () => {
    const { state, changes } = play(duelQuiz(), answerAs({ onlyDuel: true }));
    const picked = changes.find((c) => c.prev.duel?.stage === 'category' && c.next.duel?.stage !== 'category');
    expect(picked).toBeDefined();
    const splashEnd = picked!.prev.splash?.kind === 'duel' ? picked!.prev.splash.until : null;
    expect(splashEnd).not.toBeNull();
    expect(picked!.now).toBe(splashEnd! + 15_000);
    expect(state.duelsDeclared).toEqual(['a']);
  });
});

describe('autopilot: pause when everyone drops', () => {
  it('pauses with nobody online, and goes on 3 s after one player returns, to the podium', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, text, bool, numeric])], { leaderboard: 'each' });
    const rng = cycleRng();
    const lobby = lobbyOf(quiz);
    const started = commit(lobby, must(autopilotStart(lobby, T, rng)), T);
    let calls = 0;
    const dropping: People = (state, now) => {
      calls++;
      if (calls !== 10) return answering(state, now);
      return state.players.reduce((s, p) => must(setConnected(s, p.id, false, now)), state);
    };
    let stalled: Stalled | null = null;
    try {
      drive(started, { now: T, rng, people: dropping });
    } catch (error) {
      if (!(error instanceof Stalled)) throw error;
      stalled = error;
    }
    expect(stalled).not.toBeNull();
    const paused = stalled!.state;
    expect(paused.phase).not.toBe('finished');
    expect(paused.paused).toBe(true);
    expect(paused.autopilot).toMatchObject({ hold: 'nobody', at: null });

    const back = stalled!.now + 60_000;
    const returned = commit(paused, must(setConnected(paused, 'p2', true, back)), back);
    expect(returned.autopilot?.at).toBe(back + 3000);
    const changes: Change[] = [];
    const { state } = drive(returned, { now: back, rng, people: answering, watch: (prev, next, now) => changes.push({ prev, next, now }) });
    expect(changes[0]).toMatchObject({ now: back + 3000 });
    expect(changes[0].next.paused).toBe(false);
    expect(state.phase).toBe('finished');
  });
});
