import type { Answer } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { takeBuff } from './buffs';
import { placeWager } from './final';
import {
  acceptAnswer,
  lock,
  next,
  override,
  setConnected,
  start,
  submitAnswer,
  tick,
  withCurrentPlay,
  withTotals,
  type GameState,
  type SurvivalTrial,
} from './game';
import { pickContestant } from './ladder';
import { hostLive } from './live';
import { survivalPlayOf } from './survival';
import { actAnswer } from './team-act';
import { setCaptain } from './teams';
import { T0, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
import {
  boardRound,
  classicRound,
  clues,
  cloud,
  finalRound,
  ladderRound,
  LADDER_RIGHT,
  makeQuiz,
  makeRoundsQuiz,
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
import { lobbyWith, must, openAt } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { decisionOpen, wipeoutPlayOf } from './wipeout';
import { hostView, playerView, stageView } from './views';

const rng = () => 0;
const odesa: Answer = { type: 'text', value: 'Одеса' };
const lviv: Answer = { type: 'text', value: 'Львів' };
const kyiv: Answer = { type: 'single', optionId: 'b' };

/** Заморожує об'єкт з усіма вкладеними: будь-яка зміна кине помилку в суворому режимі. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

const live = (s: GameState) => {
  const view = hostLive(s);
  if (view === null) throw new Error('no live answers');
  return view;
};
const row = (s: GameState, id: string) => {
  const found = live(s).rows.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no live row ${id}`);
  return found;
};

/** Оля p1, Петро p2, Іра p3; відкрито text («Одеса») о T0, далі single. */
const classic = () => openAt(lobbyWith(makeQuiz([text, single]), 'Оля', 'Петро', 'Іра'), T0, rng);

describe('live answers: when there are none', () => {
  it('the lobby, the intro, the reveal and the leaderboard have no live answers', () => {
    const lobby = lobbyWith(makeQuiz([text, single], { leaderboard: 'each' }), 'Оля', 'Петро');
    expect(hostLive(lobby)).toBeNull();
    const intro = must(start(lobby));
    expect(intro.phase).toBe('intro');
    expect(hostLive(intro)).toBeNull();
    const reveal = must(next(must(lock(must(next(intro, T0, rng)))), T0 + 1000, rng));
    expect(reveal.phase).toBe('reveal');
    expect(hostLive(reveal)).toBeNull();
    const board = must(next(reveal, T0 + 2000, rng));
    expect(board.phase).toBe('leaderboard');
    expect(hostLive(board)).toBeNull();
  });
});

describe('live answers: the classic round', () => {
  it('everyone who should answer in player order, with the answer, time and auto-check verdict', () => {
    let s = classic();
    expect(live(s)).toMatchObject({ kind: 'answers', answered: 0, total: 3, aside: null });
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Оля', 'Петро', 'Іра']);
    for (const r of live(s).rows) {
      expect(r).toMatchObject({ answered: false, verdict: null, answer: null, draft: null, actor: null, connected: true, progress: null });
    }
    s = must(submitAnswer(s, 'p1', odesa, T0 + 4200));
    expect(row(s, 'p1')).toMatchObject({ answered: true, answer: odesa, timeMs: 4200, verdict: 'correct', awaiting: false });
    expect(live(s).answered).toBe(1);
    s = must(submitAnswer(s, 'p2', lviv, T0 + 5000));
    expect(row(s, 'p2')).toMatchObject({ answered: true, answer: lviv, verdict: 'wrong' });
    s = must(setConnected(s, 'p3', false, T0 + 6000));
    expect(row(s, 'p3')).toMatchObject({ connected: false, answered: false });
    expect(s.phase).toBe('locked');
    expect(live(s)).toMatchObject({ answered: 2, total: 3 });
    expect(live(s).rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
    const reveal = must(next(s, T0 + 7000, rng));
    expect(reveal.phase).toBe('reveal');
    expect(hostLive(reveal)).toBeNull();
    expect(hostView(reveal).live).toBeNull();
    expect(hostView(s).live).toEqual(hostLive(s));
  });

  it('a buff shows while the player still thinks; a swap shows the spare before the answer', () => {
    const fifty = must(takeBuff(toBuffQuestion(), 'p1', 'fifty', T0 + 1000, rng));
    expect(row(fifty, 'p1')).toMatchObject({ buff: 'fifty', answered: false });
    const swap = must(takeBuff(toOthersQuestion(), 'p1', 'swap', T0 + 1000, rng));
    expect(row(swap, 'p1')).toMatchObject({ buff: 'swap', answered: false });
    expect(row(swap, 'p1').spare?.id).toBe('s1');
    expect(row(swap, 'p2').spare).toBeNull();
  });

  it('a held first try counts as answered with its own verdict', () => {
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'retry', T0, rng));
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'a' }, T0 + 1000));
    expect(s.plays[0].answers).not.toHaveProperty('p1');
    expect(row(s, 'p1')).toMatchObject({ answered: true, answer: { type: 'single', optionId: 'a' }, verdict: 'wrong', buff: 'retry', timeMs: 1000 });
    expect(live(s).answered).toBe(1);
  });

  it('«Who am I?»: the clue the answer came on', () => {
    let s = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [clues])]), 'Оля', 'Петро'), 0, rng);
    s = must(submitAnswer(s, 'p1', { type: 'clues', value: 'Тарас Шевченко' }, 6000));
    expect(row(s, 'p1').clue).toBe(2);
    expect(row(s, 'p2').clue).toBeNull();
  });
});

describe('live answers: the final', () => {
  /** Класика (single, 1000 без бонусу): Оля й Петро правильно; фінал f1 (text «Одеса»), ставки Оля 500, Петро 1000 (ва-банк), Іра 0; запитання відкрито о T0. */
  function toFinal(check: 'auto' | 'manual' = 'auto'): GameState {
    const quiz = makeRoundsQuiz(
      [classicRound('r1', [single], { speedBonus: false }), finalRound('f', withId(text, 'f1'), { check })],
      { leaderboard: 'end' },
    );
    let s = openAt(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), 0, rng);
    s = must(submitAnswer(s, 'p1', kyiv, 1000));
    s = must(submitAnswer(s, 'p2', kyiv, 1000));
    s = must(lock(s));
    while (s.phase !== 'wager') s = must(next(s, 2000, rng));
    s = must(placeWager(s, 'p1', 500, T0 - 2000, rng));
    s = must(placeWager(s, 'p2', 0, T0 - 1000, rng, true));
    s = must(placeWager(s, 'p3', 0, T0, rng));
    expect(s.phase).toBe('question');
    return s;
  }

  it('the wager phase has no live answers; the question shows wagers and verdicts', () => {
    let s = toFinal();
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Оля', 'Петро', 'Іра']);
    s = must(submitAnswer(s, 'p1', odesa, T0 + 1000));
    expect(row(s, 'p1')).toMatchObject({ answered: true, verdict: 'correct', awaiting: false, progress: { kind: 'wager', wager: 500, allIn: false } });
    expect(row(s, 'p2')).toMatchObject({ answered: false, verdict: null, progress: { kind: 'wager', wager: 1000, allIn: true } });
    expect(row(s, 'p1').clue).toBeNull();
  });

  it('a manual final: an auto-check preview awaiting the host, then the host grade', () => {
    let s = toFinal('manual');
    s = must(submitAnswer(s, 'p1', odesa, T0 + 1000));
    expect(row(s, 'p1')).toMatchObject({ answered: true, verdict: 'correct', awaiting: true });
    s = must(lock(s));
    expect(row(s, 'p1')).toMatchObject({ verdict: 'correct', awaiting: true });
    s = must(override(s, 'p1', 'wrong'));
    expect(s.phase).toBe('locked');
    expect(row(s, 'p1')).toMatchObject({ verdict: 'wrong', awaiting: false });
  });
});

describe('live answers: the board', () => {
  it('only the chooser; the answer awaits «Accept» with a preview verdict', () => {
    let s = toBuffCell();
    expect(live(s)).toMatchObject({ kind: 'answers', answered: 0, total: 1 });
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Оля']);
    s = must(submitAnswer(s, 'p1', kyiv, T0 + 1000));
    expect(row(s, 'p1')).toMatchObject({ answered: true, answer: kyiv, verdict: 'correct', awaiting: true });
    expect(live(s).answered).toBe(1);
    // «Прийняти» на полі одразу розкриває: відповідей наживо вже немає.
    const accepted = must(acceptAnswer(s, 'p1', T0 + 2000));
    expect(accepted.phase).toBe('reveal');
    expect(hostLive(accepted)).toBeNull();
  });

  it('a wrong answer before «Accept» previews as wrong', () => {
    const s = must(submitAnswer(toBuffCell(), 'p1', { type: 'single', optionId: 'a' }, T0 + 1000));
    expect(row(s, 'p1')).toMatchObject({ verdict: 'wrong', awaiting: true });
  });

  it('a voice cell: no answer, no verdict, the host decides', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [withId(single, 'c11')] }], { answerMode: 'voice' });
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Оля', 'Петро')));
    const s = must(pickCell(must(next(intro, 0)), null, 'c11', 0, rng));
    expect(live(s).rows.map((r) => r.id)).toEqual(['p1']);
    expect(row(s, 'p1')).toMatchObject({ answer: null, verdict: null, awaiting: true, answered: false });
    // Оцінка ведучого лише закриває усну клітинку: вердикт із запису, рішення вже є.
    const graded = must(override(s, 'p1', 'correct', 1000));
    expect(graded.phase).toBe('locked');
    expect(row(graded, 'p1')).toMatchObject({ answered: true, answer: null, verdict: 'correct', awaiting: false });
  });
});

describe('live answers: wipeout, survival and the ladder', () => {
  it('wipeout: a burned player is not in the rows', () => {
    const quiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder)]);
    let s = openAt(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), 0, rng);
    expect(live(s).total).toBe(3);
    s = must(submitAnswer(s, 'p1', kyiv, 1000));
    s = must(submitAnswer(s, 'p2', { type: 'single', optionId: 'a' }, 1000));
    s = must(submitAnswer(s, 'p3', kyiv, 1000));
    s = must(next(s, 2000, rng));
    const play = wipeoutPlayOf(s);
    if (play === null) throw new Error('no wipeout play');
    s = withCurrentPlay(s, { ...play, wipeout: { ...play.wipeout, stay: ['p1', 'p3'] } });
    while (s.phase !== 'question') s = decisionOpen(s) ? tick(s, s.endsAt ?? 3000) : must(next(s, 3000, rng));
    expect(s.plays[s.questionIndex].question.id).toBe('w2');
    expect(live(s)).toMatchObject({ total: 2, answered: 0, aside: null });
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Оля', 'Іра']);
  });

  it('survival: a ghost answers for herself in the folded list', () => {
    const quiz = makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials), classicRound('r2', [single])], { leaderboard: 'each' });
    let s = openAt(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), 0, rng);
    s = must(submitAnswer(s, 'p1', kyiv, 1000));
    s = must(submitAnswer(s, 'p2', kyiv, 1000));
    s = must(submitAnswer(s, 'p3', { type: 'single', optionId: 'a' }, 1000));
    s = must(next(s, 1500, rng));
    s = must(next(s, 2000, rng));
    const current = survivalPlayOf(s);
    if (current === null) throw new Error('no survival play');
    const trial: SurvivalTrial = {
      kind: 'question',
      fellBack: false,
      stage: 'closed',
      questionId: 't1',
      presented: [],
      answers: {},
      traps: {},
      doors: {},
      fallback: {},
      out: ['p3'],
    };
    s = must(next(withTotals(withCurrentPlay(s, { ...current, survival: { ...current.survival, trial } })), 3000, rng));
    expect(s.plays[s.questionIndex].question.id).toBe('s2');
    expect(live(s).aside).toMatchObject({ kind: 'ghosts', answered: 0, total: 1 });
    s = must(submitAnswer(s, 'p3', { type: 'boolean', value: true }, 4000));
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Оля', 'Петро']);
    expect(live(s)).toMatchObject({ answered: 0, total: 2 });
    expect(live(s).aside).toMatchObject({ kind: 'ghosts', answered: 1, total: 1 });
    expect(live(s).aside?.rows[0]).toMatchObject({ id: 'p3', nickname: 'Іра', answered: true, verdict: 'correct', answer: { type: 'boolean', value: true } });
  });

  it('the ladder: the contestant in the rows, the hall folded aside', () => {
    const quiz = makeRoundsQuiz([ladderRound('rl')]);
    let s = must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра')));
    s = must(next(must(pickContestant(s, 'p1')), T0, rng));
    expect(s.phase).toBe('question');
    expect(live(s)).toMatchObject({ total: 1, answered: 0 });
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Оля']);
    s = must(submitAnswer(s, 'p2', LADDER_RIGHT[0], T0 + 1000));
    expect(live(s).aside).toMatchObject({ kind: 'hall', answered: 1, total: 2 });
    expect(live(s).aside?.rows.find((r) => r.id === 'p2')).toMatchObject({ answered: true, verdict: 'correct' });
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'a' }, T0 + 2000));
    expect(row(s, 'p1')).toMatchObject({ answered: true, verdict: 'wrong' });
    expect(live(s).answered).toBe(1);
  });
});

describe('live answers: votes', () => {
  it('a poll and a word cloud vote has no verdict', () => {
    let p = openAt(lobbyWith(makeQuiz([poll]), 'Оля', 'Петро'), T0, rng);
    p = must(submitAnswer(p, 'p1', { type: 'poll', optionId: 'a' }, T0 + 1000));
    expect(row(p, 'p1')).toMatchObject({ answered: true, verdict: null, awaiting: false });
    let c = openAt(lobbyWith(makeQuiz([cloud]), 'Оля', 'Петро'), T0, rng);
    c = must(submitAnswer(c, 'p1', { type: 'wordcloud', words: ['Дніпро'] }, T0 + 1000));
    expect(row(c, 'p1')).toMatchObject({ answered: true, verdict: null });
  });
});

describe('live answers: teams', () => {
  const layout = [['Оля', 'Петро'], ['Іра', 'Марко']];

  it('a row per team with who acts; the captain answer is the team answer', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [text])]), layout), T0, rng));
    expect(live(s).rows.map((r) => r.nickname)).toEqual(s.players.map((p) => p.nickname));
    expect(live(s).rows.map((r) => r.actor)).toEqual(['Оля', 'Іра']);
    s = must(actAnswer(s, 'm1', odesa, T0 + 1000));
    expect(row(s, 't1')).toMatchObject({ answered: true, verdict: 'correct', draft: null });
    s = must(setCaptain(s, 't1', 'm2'));
    expect(row(s, 't1').actor).toBe('Петро');
  });

  it('a poll in a team game: a row per person, no actor', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [poll])]), layout), T0, rng));
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Оля', 'Петро', 'Іра', 'Марко']);
    expect(live(s).rows.map((r) => r.actor)).toEqual([null, null, null, null]);
    s = must(actAnswer(s, 'm3', { type: 'poll', optionId: 'b' }, T0 + 1000));
    expect(row(s, 'm3')).toMatchObject({ answered: true, verdict: null });
    expect(live(s)).toMatchObject({ answered: 1, total: 4 });
  });
});

describe('live answers: only the host', () => {
  it('the stage and the phones have no live key and no other answers', () => {
    const solo = must(submitAnswer(classic(), 'p1', odesa, T0 + 1000));
    const quiz = makeRoundsQuiz([finalRound('f', withId(text, 'f1'))]);
    let final = must(next(must(start(lobbyWith(quiz, 'Оля', 'Петро'))), 0, rng));
    final = must(placeWager(final, 'p1', 0, T0 - 1000, rng));
    final = must(placeWager(final, 'p2', 0, T0, rng));
    final = must(submitAnswer(final, 'p1', odesa, T0 + 1000));
    let team = must(next(teamGame(teamQuiz([classicRound('r1', [text])]), [['Оля', 'Петро'], ['Іра', 'Марко']]), T0, rng));
    team = must(actAnswer(team, 'm1', odesa, T0 + 1000));
    for (const [s, other] of [
      [solo, 'p2'],
      [final, 'p2'],
      [team, 'm3'],
    ] as const) {
      expect(s.phase).toBe('question');
      expect(hostView(s).live).not.toBeNull();
      expect('live' in stageView(s)).toBe(false);
      expect('live' in (playerView(s, other) ?? {})).toBe(false);
      expect(playerView(s, other)).not.toBeNull();
      expect(JSON.stringify(playerView(s, other))).not.toContain('Одеса');
    }
  });

  it('a frozen state gives the same live answers', () => {
    const s = must(submitAnswer(classic(), 'p1', odesa, T0 + 1000));
    const frozen = deepFreeze(JSON.parse(JSON.stringify(s)) as GameState);
    expect(hostLive(frozen)).toEqual(hostLive(s));
  });
});
