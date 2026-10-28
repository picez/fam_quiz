import { describe, expect, it } from 'vitest';
import { type Answer, type Question, type Quiz, type Round } from '@quiz/shared';
import { pickAnswerer, answererOf, nextAnswerer } from './answerer';
import { authorTeamForm, autopilotStart, createAutopilotGame, pilotStep, planAutopilot } from './autopilot';
import { pickCell } from './board';
import { openClue } from './clues';
import { declareDuel, pickDuelCategory } from './duel';
import { placeWager } from './final';
import { addPlayer, lock, next, recordOf, removePlayer, type GameState, type Result } from './game';
import { pickContestant } from './ladder';
import { stamp } from './pacing';
import { trialOpen } from './survival';
import { actAnswer, actBuzz, actorOf, type TeamAct } from './team-act';
import { captainOf, dropMember } from './teams';
import { decideWipeout, decisionOpen } from './wipeout';
import { duelQuiz, revealOf } from './testing/duel';
import {
  LADDER_RIGHT,
  blitzRound,
  boardRound,
  classicRound,
  cloud,
  clues,
  finalRound,
  ladderRound,
  poll,
  single,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  text,
  wipeoutLadder,
  wipeoutRound,
  withId,
} from './testing/fixtures';
import { must } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const T0 = 1_000_000;
const rng = () => 0;
/** m1 Оля, m2 Петро, m3 Іра — t1 (капітан Оля); m4 Марко, m5 Ната — t2 (капітан Марко). */
const LAYOUT = [
  ['Оля', 'Петро', 'Іра'],
  ['Марко', 'Ната'],
];
const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };
/** Раунд 1 — q1, q2, q3; раунд 2 — q4. */
const ROUNDS = [classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')]), classicRound('r2', [withId(single, 'q4')])];

const game = (rounds: Round[], mode?: 'chosen' | 'rotate', layout = LAYOUT): GameState => teamGame(teamQuiz(rounds, layout.length, mode), layout);
/** Етап intro першого раунду, режим «вибирає капітан». */
const intro = game(ROUNDS, 'chosen');
const current = (s: GameState) => s.plays[s.questionIndex];
const yes = (id: string) => ({ ok: true, id });
const no = (error: string) => ({ ok: false, error });

/** Дія людини за команду: actorOf(act), далі — функція рушія з id команди. */
function as(s: GameState, memberId: string, act: TeamAct, run: (id: string) => Result): Result {
  const actor = actorOf(s, memberId, act);
  return actor.ok ? run(actor.id) : actor;
}

/** «Далі», доки не настане потрібний етап. */
function until(s: GameState, done: (s: GameState) => boolean, now = T0): GameState {
  let state = must(next(s, now, rng));
  while (!done(state)) state = must(next(state, now, rng));
  return state;
}

/** До наступного відкритого запитання (з поточного запитання — через «Закрити»). */
const toQuestion = (s: GameState): GameState => until(s.phase === 'question' ? must(lock(s)) : s, (st) => st.phase === 'question');

describe('team answerer: who acts', () => {
  it('the picked teammate answers for the team and the captain gets not_answerer', () => {
    const s = must(next(must(pickAnswerer(intro, 'm1', 'm2', 'question')), T0, rng));
    expect(actAnswer(s, 'm1', RIGHT, T0 + 1000)).toEqual({ ok: false, error: 'not_answerer' });
    const answered = must(actAnswer(s, 'm2', RIGHT, T0 + 1000));
    expect(recordOf(answered, 0, 't1')).toMatchObject({ answer: RIGHT });
  });

  it('captain mode: answer, answerer and captain are the captain only, the others get not_captain; no turns are written', () => {
    const s = must(next(game(ROUNDS), T0, rng));
    for (const act of ['answer', 'answerer', 'captain'] as const) {
      expect(actorOf(s, 'm1', act)).toEqual(yes('t1'));
      expect(actorOf(s, 'm2', act)).toEqual(no('not_captain'));
      expect(actorOf(s, 'm3', act)).toEqual(no('not_captain'));
      expect(actorOf(s, 'm4', act)).toEqual(yes('t2'));
      expect(actorOf(s, 'm5', act)).toEqual(no('not_captain'));
    }
    expect(s.teams?.turns).toBeUndefined();
    expect(toQuestion(s).teams?.turns).toBeUndefined();
  });

  it('chosen mode with Петро picked: answer and answerer — Петро; captain — Оля; vote and self — each; duel — the duelist; buzz — the team', () => {
    const s = must(next(must(pickAnswerer(intro, 'm1', 'm2', 'question')), T0, rng));
    for (const act of ['answer', 'answerer'] as const) {
      expect(actorOf(s, 'm2', act)).toEqual(yes('t1'));
      expect(actorOf(s, 'm1', act)).toEqual(no('not_answerer'));
      expect(actorOf(s, 'm3', act)).toEqual(no('not_answerer'));
      // команда без вибору — капітан, а решта — not_answerer
      expect(actorOf(s, 'm4', act)).toEqual(yes('t2'));
      expect(actorOf(s, 'm5', act)).toEqual(no('not_answerer'));
    }
    expect(actorOf(s, 'm1', 'captain')).toEqual(yes('t1'));
    expect(actorOf(s, 'm2', 'captain')).toEqual(no('not_captain'));
    for (const id of ['m1', 'm2', 'm3']) {
      expect(actorOf(s, id, 'vote')).toEqual(yes(id));
      expect(actorOf(s, id, 'self')).toEqual(yes(id));
      expect(actorOf(s, id, 'buzz')).toEqual(yes('t1'));
    }
    expect(actorOf(s, 'm1', 'duel')).toEqual(yes('t1'));
    expect(actorOf(s, 'm2', 'duel')).toEqual(no('not_duelist'));
  });

  it('rotate mode: q1 — the captain, q2 — Петро, q3 — Іра; opening the question writes the turn by itself', () => {
    let s = must(next(game(ROUNDS, 'rotate'), T0, rng));
    expect(s.teams?.turns).toEqual({ t1: { questionIndex: 0, memberId: 'm1' }, t2: { questionIndex: 0, memberId: 'm4' } });
    expect(actorOf(s, 'm1', 'answer')).toEqual(yes('t1'));
    expect(actorOf(s, 'm2', 'answer')).toEqual(no('not_answerer'));
    s = toQuestion(s);
    expect(s.teams?.turns?.t1).toEqual({ questionIndex: 1, memberId: 'm2' });
    expect(actorOf(s, 'm2', 'answer')).toEqual(yes('t1'));
    expect(actorOf(s, 'm1', 'answer')).toEqual(no('not_answerer'));
    expect(actorOf(s, 'm3', 'answer')).toEqual(no('not_answerer'));
    expect(actorOf(s, 'm5', 'answer')).toEqual(yes('t2'));
    s = toQuestion(s);
    expect(actorOf(s, 'm3', 'answerer')).toEqual(yes('t1'));
    expect(actorOf(s, 'm1', 'captain')).toEqual(yes('t1'));
  });
});

describe('team answerer: blitz, polls and clouds keep their rules', () => {
  it('blitz with the button: anyone buzzes and the one who buzzed answers, not the picked one; the turn stays', () => {
    const rounds = [blitzRound('rb', [text, withId(text, 'q4b')], { check: 'manual', attempts: 1 })];
    let s = must(pickAnswerer(game(rounds, 'chosen'), 'm1', 'm2', 'round'));
    s = must(next(s, T0, rng));
    expect(answererOf(s, 't1')).toBe('m1');
    s = must(actBuzz(s, 'm3', T0 + 1000));
    expect(actorOf(s, 'm3', 'answer')).toEqual(yes('t1'));
    expect(actorOf(s, 'm2', 'answer')).toEqual(no('not_in_queue'));
    expect(actorOf(s, 'm1', 'answer')).toEqual(no('not_in_queue'));
    const turning = must(next(game(rounds, 'rotate'), T0, rng));
    expect(turning.teams?.turns).toBeUndefined();
  });

  it('blitz: the one who buzzed went offline — the captain answers as before 12g', () => {
    const rounds = [blitzRound('rb', [text, withId(text, 'q4b')], { check: 'manual', attempts: 1 })];
    let s = must(next(must(pickAnswerer(game(rounds, 'chosen'), 'm1', 'm2', 'round')), T0, rng));
    s = must(actBuzz(s, 'm3', T0 + 1000));
    s = must(removePlayer(s, 'm3'));
    expect(actorOf(s, 'm1', 'answer')).toEqual(yes('t1'));
    expect(actorOf(s, 'm2', 'answer')).toEqual(no('not_captain'));
  });

  it('instant blitz: any member answers for the team', () => {
    const s = must(next(must(pickAnswerer(game([blitzRound('rb', [text])], 'chosen'), 'm1', 'm2', 'round')), T0, rng));
    expect(actorOf(s, 'm3', 'answer')).toEqual(yes('t1'));
  });

  for (const mode of [undefined, 'chosen', 'rotate'] as const) {
    it(`polls and clouds: everyone votes alone (${mode ?? 'captain'})`, () => {
      let s = game([classicRound('r1', [poll, cloud])], mode);
      if (mode === 'chosen') s = must(pickAnswerer(s, 'm1', 'm2', 'round'));
      s = must(next(s, T0, rng));
      for (const id of ['m1', 'm2', 'm3', 'm4', 'm5']) expect(actorOf(s, id, 'answer')).toEqual(yes(id));
      s = toQuestion(s);
      for (const id of ['m1', 'm2', 'm3', 'm4', 'm5']) expect(actorOf(s, id, 'answer')).toEqual(yes(id));
      expect(s.teams?.turns).toBeUndefined();
    });
  }
});

describe('team answerer: formats', () => {
  it('«Who am I?» at own pace (12c): Петро opens the clues, Оля gets not_answerer; the opens are the team’s', () => {
    const selfClues = { ...clues, cluePace: 'self' } satisfies Question;
    let s = must(next(must(pickAnswerer(game([classicRound('r1', [selfClues])], 'chosen'), 'm1', 'm2', 'question')), T0, rng));
    expect(as(s, 'm1', 'answer', (id) => openClue(s, id, T0 + 1000))).toEqual(no('not_answerer'));
    s = must(as(s, 'm2', 'answer', (id) => openClue(s, id, T0 + 1000)));
    expect(current(s).clueOpens).toEqual({ t1: 2 });
  });

  it('the final: the wager is Оля’s, the final answer is Петро’s', () => {
    const rounds = [classicRound('r1', [single], { speedBonus: false }), finalRound('f', withId(single, 'f1'))];
    let s = must(next(game(rounds, 'chosen'), T0, rng));
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm4', RIGHT, T0 + 1000));
    s = until(s, (st) => st.phase === 'wager', T0 + 2000);
    s = must(pickAnswerer(s, 'm1', 'm2', 'question'));
    expect(as(s, 'm2', 'captain', (id) => placeWager(s, id, 100, T0 + 3000, rng))).toEqual(no('not_captain'));
    s = must(as(s, 'm1', 'captain', (id) => placeWager(s, id, 100, T0 + 3000, rng)));
    s = must(as(s, 'm4', 'captain', (id) => placeWager(s, id, 0, T0 + 3000, rng)));
    expect(s.phase).toBe('question');
    expect(actAnswer(s, 'm1', RIGHT, T0 + 4000)).toEqual(no('not_answerer'));
    s = must(actAnswer(s, 'm2', RIGHT, T0 + 4000));
    expect(recordOf(s, s.questionIndex, 't1')).toMatchObject({ answer: RIGHT });
  });

  it('wipeout: Петро answers, Оля decides', () => {
    let s = must(next(must(pickAnswerer(game([wipeoutRound('rw', wipeoutLadder)], 'chosen'), 'm1', 'm2', 'round')), T0, rng));
    expect(actAnswer(s, 'm1', RIGHT, T0 + 1000)).toEqual(no('not_answerer'));
    s = must(actAnswer(s, 'm2', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm4', WRONG, T0 + 1000));
    s = must(next(s, T0 + 1500, rng));
    s = must(next(s, T0 + 2000, rng));
    expect(decisionOpen(s)).toBe(true);
    expect(as(s, 'm2', 'captain', (id) => decideWipeout(s, id, true, T0 + 3000))).toEqual(no('not_captain'));
    expect(as(s, 'm1', 'captain', (id) => decideWipeout(s, id, true, T0 + 3000)).ok).toBe(true);
  });

  it('the ladder: Петро answers and takes the lifelines, Оля decides; the hall team answers by its captain', () => {
    let s = must(pickContestant(game([ladderRound('rl')], 'chosen'), 't1'));
    s = must(next(must(pickAnswerer(s, 'm1', 'm2', 'round')), T0, rng));
    expect(actorOf(s, 'm2', 'answerer')).toEqual(yes('t1'));
    expect(actorOf(s, 'm1', 'answerer')).toEqual(no('not_answerer'));
    expect(actorOf(s, 'm1', 'captain')).toEqual(yes('t1'));
    expect(actorOf(s, 'm2', 'captain')).toEqual(no('not_captain'));
    expect(actorOf(s, 'm4', 'answer')).toEqual(yes('t2'));
    expect(actAnswer(s, 'm1', LADDER_RIGHT[0], T0 + 1000)).toEqual(no('not_answerer'));
    s = must(actAnswer(s, 'm2', LADDER_RIGHT[0], T0 + 1000));
    expect(recordOf(s, s.questionIndex, 't1')).toMatchObject({ answer: LADDER_RIGHT[0] });
  });

  it('the ladder in rotate mode: only the contestant moves the turn', () => {
    const s = must(next(must(pickContestant(game([ladderRound('rl')], 'rotate'), 't2')), T0, rng));
    expect(s.teams?.turns).toEqual({ t2: { questionIndex: 0, memberId: 'm4' } });
  });

  it('the board: Оля picks the cell, Петро answers; in rotate mode only the chooser moves the turn', () => {
    const rounds = [boardRound('g1', [{ title: 'Міста', cells: [withId(single, 'c11'), withId(single, 'c12')] }])];
    let s = must(next(game(rounds, 'chosen'), T0, rng));
    expect(s.phase).toBe('board');
    s = must(pickAnswerer(s, 'm1', 'm2', 'question'));
    expect(as(s, 'm2', 'captain', (id) => pickCell(s, id, 'c11', T0, rng))).toEqual(no('not_captain'));
    s = must(as(s, 'm1', 'captain', (id) => pickCell(s, id, 'c11', T0, rng)));
    expect(actAnswer(s, 'm1', RIGHT, T0 + 1000)).toEqual(no('not_answerer'));
    s = must(actAnswer(s, 'm2', RIGHT, T0 + 1000));
    expect(current(s).board?.answer).toEqual(RIGHT);
    let r = must(next(game(rounds, 'rotate'), T0, rng));
    r = must(as(r, 'm1', 'captain', (id) => pickCell(r, id, 'c11', T0, rng)));
    expect(r.teams?.turns).toEqual({ t1: { questionIndex: 0, memberId: 'm1' } });
  });

  it('survival: on the open trial the answerer of the round record acts; a pick made on that board works from the next question', () => {
    const rounds = [survivalRound('rs', survivalQuestions, survivalTrials)];
    let s = must(next(must(pickAnswerer(game(rounds, 'chosen'), 'm1', 'm2', 'question')), T0, rng));
    s = must(actAnswer(s, 'm2', WRONG, T0 + 1000));
    s = must(actAnswer(s, 'm4', RIGHT, T0 + 1000));
    s = until(s, (st) => trialOpen(st), T0 + 2000);
    expect(s.phase).toBe('leaderboard');
    expect(actorOf(s, 'm2', 'answerer')).toEqual(yes('t1'));
    expect(actorOf(s, 'm1', 'answerer')).toEqual(no('not_answerer'));
    s = must(pickAnswerer(s, 'm1', 'm3', 'question'));
    expect(actorOf(s, 'm2', 'answerer')).toEqual(yes('t1'));
    expect(actorOf(s, 'm3', 'answerer')).toEqual(no('not_answerer'));
    expect(nextAnswerer(s, 't1')).toBe('m3');
  });

  it('the duel: the duelist answers, not the picked one', () => {
    const quiz: Quiz = { ...duelQuiz(), settings: { ...duelQuiz().settings, teams: teamQuiz([], 2, 'chosen').settings.teams } };
    const layout = [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ];
    let s = revealOf(must(next(teamGame(quiz, layout), T0, rng)), T0 + 1000);
    s = must(next(s, T0 + 2000, rng));
    s = revealOf(s, T0 + 3000);
    s = must(pickAnswerer(s, 'm1', 'm2', 'round'));
    s = must(declareDuel(s, 't1', 't2'));
    s = must(pickDuelCategory(must(next(s, T0 + 4000, rng)), 't1', 'dc1', T0 + 60_000, rng));
    expect(actorOf(s, 'm1', 'duel')).toEqual(yes('t1'));
    expect(actorOf(s, 'm2', 'duel')).toEqual(no('not_duelist'));
  });
});

describe('team answerer: removing people', () => {
  it('Петро picked and removed: the pick is gone and the captain answers', () => {
    let s = must(pickAnswerer(intro, 'm1', 'm2', 'round'));
    s = must(dropMember(s, 'm2'));
    expect(s.teams?.answerers?.t1).toBeUndefined();
    s = must(next(s, T0, rng));
    expect(answererOf(s, 't1')).toBe('m1');
    expect(actorOf(s, 'm1', 'answer')).toEqual(yes('t1'));
  });

  it('a removed member that is not picked keeps the pick', () => {
    let s = must(pickAnswerer(intro, 'm1', 'm2', 'round'));
    s = must(dropMember(s, 'm3'));
    expect(s.teams?.answerers?.t1).toMatchObject({ memberId: 'm2' });
  });

  it('a removed team takes its pick and its turn along', () => {
    const layout = [['Оля', 'Петро'], ['Марко', 'Ната'], ['Гліб', 'Дана']];
    let s = must(next(game(ROUNDS, 'rotate', layout), T0, rng));
    s = must(lock(s));
    s = must(pickAnswerer(s, 'm3', 'm4', 'round'));
    expect(s.teams?.turns?.t2).toBeDefined();
    expect(s.teams?.answerers?.t2).toBeDefined();
    s = must(removePlayer(s, 't2'));
    expect(s.teams?.answerers?.t2).toBeUndefined();
    expect(s.teams?.turns?.t2).toBeUndefined();
    expect(s.teams?.turns?.t1).toBeDefined();
  });

  it('an old state without answerers or turns keeps them undefined after a removal', () => {
    let s = must(next(game(ROUNDS), T0, rng));
    s = must(dropMember(s, 'm2'));
    expect(s.teams?.answerers).toBeUndefined();
    s = must(removePlayer(s, 't2'));
    expect(s.teams?.answerers).toBeUndefined();
    expect(s.teams?.turns).toBeUndefined();
  });
});

describe('team answerer: the autopilot waits for nothing new', () => {
  const plan = (prev: GameState, nextState: GameState, now: number): GameState => planAutopilot(prev, stamp(prev, nextState, now), now);
  const step = (state: GameState, now: number): GameState => plan(state, pilotStep(state, now, rng), now);

  /** Автопілот з командною вікториною: автор a і m2, m3, m4; роздача випадкова; етап — перше запитання. */
  function pilotQuestion(mode: 'captain' | 'chosen', pick: boolean): GameState {
    let s = must(createAutopilotGame(teamQuiz([classicRound('r1', [single, withId(single, 'q2')])], 2, mode), { id: 'a', nickname: 'Марта' }, { transitions: false }));
    for (const [id, nickname] of [['m2', 'Ігор'], ['m3', 'Олена'], ['m4', 'Тарас']]) s = must(addPlayer(s, { id, nickname }));
    s = must(authorTeamForm(s, 'random'));
    s = plan(s, must(autopilotStart(s, T0, rng)), T0);
    s = step(s, T0);
    expect(s.phase).toBe('intro');
    if (pick) {
      const captain = captainOf(s, 't1') ?? '';
      const other = s.teams?.members.find((m) => m.teamId === 't1' && m.id !== captain)?.id ?? '';
      s = plan(s, must(pickAnswerer(s, captain, other, 'question')), T0);
    }
    const at = s.autopilot?.at ?? 0;
    s = step(s, at);
    expect(s.phase).toBe('question');
    return s;
  }

  it('chosen mode without a pick goes as captain mode: the captain answers, the autopilot plans the same', () => {
    const captain = pilotQuestion('captain', false);
    const chosen = pilotQuestion('chosen', false);
    expect(chosen.autopilot?.at).toBe(captain.autopilot?.at);
    expect(answererOf(chosen, 't1')).toBe(captainOf(chosen, 't1'));
    expect(actAnswer(chosen, captainOf(chosen, 't1') ?? '', RIGHT, (chosen.startedAt ?? 0) + 1000).ok).toBe(true);
  });

  it('with a pick the picked one answers and the plan does not change', () => {
    const plain = pilotQuestion('chosen', false);
    const s = pilotQuestion('chosen', true);
    expect(s.autopilot?.at).toBe(plain.autopilot?.at);
    const picked = s.teams?.answerers?.t1?.memberId ?? '';
    expect(answererOf(s, 't1')).toBe(picked);
    expect(actAnswer(s, captainOf(s, 't1') ?? '', RIGHT, (s.startedAt ?? 0) + 1000)).toEqual(no('not_answerer'));
    const answered = must(actAnswer(s, picked, RIGHT, (s.startedAt ?? 0) + 1000));
    expect(recordOf(answered, answered.questionIndex, 't1')).toMatchObject({ answer: RIGHT });
  });
});
