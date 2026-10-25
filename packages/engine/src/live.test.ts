import type { Answer, Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { buzz } from './blitz';
import { pickBluff, writeLie } from './bluff';
import { pickCell } from './board';
import { takeBuff } from './buffs';
import { guessWord, takeHint } from './chain';
import { answerDuel, declareDuel } from './duel';
import { placeWager } from './final';
import {
  acceptAnswer,
  judge,
  lock,
  next,
  override,
  recordOf,
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
import { sortOf, sortWord } from './sort';
import { answerTrial, pickDoor, survivalPlayOf, trialOpen } from './survival';
import { actAnswer, actBuzz } from './team-act';
import { setCaptain } from './teams';
import { T0, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
import { T0 as DUEL_T0, T1 as DUEL_T1, toDeclarable, toDuelQuestion } from './testing/duel';
import {
  blitzRound,
  bluff,
  boardRound,
  chain,
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
  sortQ,
  survey,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  text,
  wall,
  wipeoutLadder,
  wipeoutRound,
  withId,
} from './testing/fixtures';
import { lobbyWith, must, openAt, sendBlitz, startRound } from './testing/helpers';
import { head as sortHead, right as rightCategory, sortAll, toSort, wrong as wrongCategory } from './testing/sort';
import { teamGame, teamQuiz } from './testing/teams';
import { guessWall } from './wall';
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
  function toFinal(check: 'auto' | 'manual' = 'auto', question: Question = withId(text, 'f1')): GameState {
    const quiz = makeRoundsQuiz(
      [classicRound('r1', [single], { speedBonus: false }), finalRound('f', question, { check })],
      { leaderboard: 'end' },
    );
    let s = openAt(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'), 0, rng);
    s = must(submitAnswer(s, 'p1', kyiv, 1000));
    s = must(submitAnswer(s, 'p2', kyiv, 1000));
    s = must(lock(s));
    while (s.phase !== 'wager') s = must(next(s, 2000, rng));
    s = must(placeWager(s, 'p1', 500, T0 - 2000, rng));
    s = must(placeWager(s, 'p2', 0, T0 - 1000, rng, true));
    // Етап ставок: панель ставок уже показує, хто поставив; відповідей наживо немає.
    expect(s.phase).toBe('wager');
    expect(hostLive(s)).toBeNull();
    s = must(placeWager(s, 'p3', 0, T0, rng));
    expect(s.phase).toBe('question');
    return s;
  }

  it('the wager phase has no live answers; the question shows wagers and verdicts', () => {
    let s = toFinal();
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Оля', 'Петро', 'Іра']);
    s = must(submitAnswer(s, 'p1', odesa, T0 + 1000));
    expect(row(s, 'p1')).toMatchObject({ answered: true, verdict: 'correct', awaiting: false, progress: null, wager: { wager: 500, allIn: false } });
    expect(row(s, 'p2')).toMatchObject({ answered: false, verdict: null, progress: null, wager: { wager: 1000, allIn: true } });
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

  it('a manual final the host cannot grade (a chain) never awaits', () => {
    let s = toFinal('manual', withId(chain, 'f1'));
    for (const [k, word] of ['Риба', 'Океан', 'Корабель'].entries()) s = must(guessWord(s, 'p1', word, T0 + 1000 + k));
    expect(row(s, 'p1')).toMatchObject({ answered: true, verdict: null, awaiting: false, progress: { kind: 'chain', solved: 3, word: null } });
  });

  it('a final chain keeps the wager next to the progress', () => {
    let s = toFinal('auto', withId(chain, 'f1'));
    s = must(guessWord(s, 'p1', 'Риба', T0 + 1000));
    expect(row(s, 'p1')).toMatchObject({ progress: { kind: 'chain', solved: 1 }, wager: { wager: 500, allIn: false } });
    expect(row(s, 'p2').wager).toEqual({ wager: 1000, allIn: true });
  });

  it('a final sort: one moved card counts as answered, as the host counter does', () => {
    let s = toFinal('auto', withId(sortQ, 'f1'));
    const first = sortHead(s, 'p1');
    s = must(sortWord(s, 'p1', first, rightCategory(first), T0 + 1000));
    expect(row(s, 'p1')).toMatchObject({ answered: true, answer: null, verdict: null, progress: { kind: 'sort', sorted: 1 } });
    expect(row(s, 'p2').answered).toBe(false);
    expect(live(s).answered).toBe(hostView(s).answeredCount);
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

describe('live answers: chain, sort and wall progress', () => {
  it('chain: words solved, the current word and hints; answered once through', () => {
    let s = openAt(lobbyWith(makeQuiz([chain, single]), 'Оля', 'Петро', 'Іра'), T0, rng);
    s = must(guessWord(s, 'p1', 'Риба', T0 + 1000));
    s = must(takeHint(s, 'p1', T0 + 2000));
    expect(row(s, 'p1')).toMatchObject({
      answered: false,
      answer: null,
      verdict: null,
      progress: { kind: 'chain', solved: 1, total: 3, word: 'Океан', hints: 1 },
    });
    expect(row(s, 'p2').progress).toEqual({ kind: 'chain', solved: 0, total: 3, word: 'Риба', hints: 0 });
    s = must(guessWord(s, 'p1', 'Океан', T0 + 3000));
    s = must(guessWord(s, 'p1', 'Корабель', T0 + 4000));
    expect(s.phase).toBe('question');
    expect(row(s, 'p1')).toMatchObject({ answered: true, answer: null, verdict: null, progress: { kind: 'chain', solved: 3, word: null } });
    expect(live(s).answered).toBe(1);
  });

  it('sort: the current card, sorted and misses; answered once all sorted', () => {
    let s = toSort();
    const first = sortHead(s, 'p1');
    s = must(sortWord(s, 'p1', first, rightCategory(first), 2000));
    const card = sortQ.words.find((w) => w.id === sortOf(s, 'p1').queue[0])?.text;
    expect(row(s, 'p1')).toMatchObject({ answered: false, answer: null, verdict: null });
    expect(row(s, 'p1').progress).toEqual({ kind: 'sort', card, cardId: sortHead(s, 'p1'), seq: 1, sorted: 1, total: 4, misses: 0 });
    const second = sortHead(s, 'p1');
    s = must(sortWord(s, 'p1', second, wrongCategory(second), 3000));
    expect(row(s, 'p1').progress).toMatchObject({ kind: 'sort', cardId: sortHead(s, 'p1'), seq: 2, sorted: 1, misses: 1 });
    s = sortAll(s, 'p1', 10_000);
    expect(row(s, 'p1')).toMatchObject({ answered: true, answer: null, verdict: null, progress: { kind: 'sort', card: null, cardId: null, sorted: 4 } });
  });

  it('wall: found groups and mistakes, the same numbers as the host wall rows', () => {
    let s = openAt(lobbyWith(makeQuiz([wall], { leaderboard: 'end' }), 'Оля', 'Петро'), 0, rng);
    const at = (...ids: string[]) => ids.map((id) => s.presented.indexOf(id));
    s = must(guessWall(s, 'p1', at('r1', 'r2', 'r3', 'r4'), 1000));
    s = must(guessWall(s, 'p1', at('m1', 'm2', 'm3', 'l1'), 2000));
    expect(row(s, 'p1')).toMatchObject({ answered: false, answer: null, verdict: null });
    expect(row(s, 'p1').progress).toEqual({ kind: 'wall', found: 1, groups: 4, mistakes: 1, locked: false, solved: false });
    const host = hostView(s).wall?.rows.find((r) => r.playerId === 'p1');
    expect(host).toMatchObject({ found: 1, mistakes: 1, locked: false, solved: false });
    expect(row(s, 'p2').progress).toEqual({ kind: 'wall', found: 0, groups: 4, mistakes: 0, locked: false, solved: false });
  });
});

describe('live answers: bluff and survey', () => {
  it('bluff: the lie in the lies stage, then the pick with a verdict', () => {
    let s = openAt(lobbyWith(makeQuiz([bluff, single], { buffs: [] }), 'Оля', 'Петро', 'Іра'), T0, rng);
    s = must(writeLie(s, 'p1', 'Лондон-2', T0 + 1000));
    expect(row(s, 'p1')).toMatchObject({
      answered: true,
      answer: null,
      verdict: null,
      progress: { kind: 'bluff', stage: 'lies', lie: 'Лондон-2', pick: null },
    });
    expect(row(s, 'p2')).toMatchObject({ answered: false, progress: { kind: 'bluff', stage: 'lies', lie: null, pick: null } });
    s = must(writeLie(s, 'p2', 'Рим', T0 + 2000));
    s = must(writeLie(s, 'p3', 'Мілан', T0 + 3000));
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(row(s, 'p1')).toMatchObject({ answered: false, verdict: null, progress: { kind: 'bluff', stage: 'choice', lie: 'Лондон-2', pick: null } });
    const idOf = (text: string) => s.plays[0].bluff?.options.find((o) => o.text === text)?.id ?? '';
    const startedAt = s.startedAt ?? 0;
    s = must(pickBluff(s, 'p1', idOf('Барселона'), startedAt + 4000));
    expect(row(s, 'p1')).toMatchObject({
      answered: true,
      answer: null,
      verdict: 'correct',
      timeMs: 4000,
      progress: { kind: 'bluff', stage: 'choice', lie: 'Лондон-2', pick: 'Барселона' },
    });
    s = must(pickBluff(s, 'p2', idOf('Лондон-2'), startedAt + 5000));
    expect(row(s, 'p2')).toMatchObject({ answered: true, verdict: 'wrong', progress: { kind: 'bluff', pick: 'Лондон-2' } });
    expect(live(s)).toMatchObject({ answered: 2, total: 3 });
  });

  it('survey: the board rank each answer hit, the verdict from the record', () => {
    let s = openAt(lobbyWith(makeQuiz([survey, single], { buffs: [] }), 'Оля', 'Петро'), 0, rng);
    s = must(submitAnswer(s, 'p1', { type: 'survey', values: ['Яблуко', 'кавун', 'ананас'] }, 1000));
    const r = row(s, 'p1');
    expect(r.answer?.type).toBe('survey');
    expect(r.progress).toEqual({ kind: 'survey', ranks: [1, 4, null] });
    expect(r.verdict).toBe(recordOf(s, 0, 'p1')?.grade);
    expect(row(s, 'p2').progress).toBeNull();
  });

  it('survey on the board: the answer held before «Accept» gets its ranks', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [withId(survey, 'c11')] }]);
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Оля', 'Петро')));
    let s = must(pickCell(must(next(intro, 0)), null, 'c11', 0, rng));
    s = must(submitAnswer(s, 'p1', { type: 'survey', values: ['Яблуко', 'ананас'] }, 1000));
    expect(row(s, 'p1')).toMatchObject({ answered: true, awaiting: true, progress: { kind: 'survey', ranks: [1, null] } });
  });
});

describe('live answers: blitz', () => {
  const right: Answer = { type: 'single', optionId: 'b' };
  const wrong: Answer = { type: 'single', optionId: 'a' };
  const blitzGame = (check: 'auto' | 'manual') =>
    startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single, text], { check })]), 'Оля', 'Петро', 'Іра'), 0, rng);

  it('with the button: the head answer previews and awaits, a buzz without an answer is in, the rest are not', () => {
    let s = sendBlitz(blitzGame('manual'), 'p2', right, 1000);
    // Петро чекає рішення: годинник утримано, тож натискання Олі о 1500 рахується за замороженим часом (1000).
    s = must(buzz(s, 'p1', 1500));
    expect(live(s)).toMatchObject({ kind: 'blitz', answered: 2, total: 3, aside: null });
    expect(live(s).rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
    expect(row(s, 'p2')).toMatchObject({ answered: true, answer: right, verdict: 'correct', awaiting: true, timeMs: 1000 });
    expect(row(s, 'p1')).toMatchObject({ answered: true, answer: null, verdict: null, awaiting: false, timeMs: 1000 });
    expect(row(s, 'p3')).toMatchObject({ answered: false });
    s = must(judge(s, 'p2', false, 2000));
    expect(row(s, 'p2')).toMatchObject({ answered: true, answer: right, verdict: 'wrong', awaiting: false });
  });

  it('a voice blitz cell: the head awaits the host without an answer', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [{ question: withId(single, 'c11'), kind: 'blitz', answerMode: 'voice' }] }]);
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Оля', 'Петро', 'Іра')));
    let s = must(pickCell(must(next(intro, 0)), null, 'c11', 0, rng));
    expect(live(s)).toMatchObject({ kind: 'blitz', answered: 0, total: 3 });
    s = must(buzz(s, 'p3', 1000));
    expect(row(s, 'p3')).toMatchObject({ answered: true, answer: null, verdict: null, awaiting: true });
  });

  it('instant blitz: verdicts as the blitz rows grade them, the unchecked one awaits', () => {
    let s = must(submitAnswer(blitzGame('auto'), 'p1', wrong, 1000));
    s = must(submitAnswer(s, 'p2', right, 1600));
    s = must(acceptAnswer(s, 'p1', 2000));
    expect(s.phase).toBe('question');
    expect(live(s)).toMatchObject({ kind: 'blitz', answered: 2, total: 3 });
    expect(row(s, 'p1')).toMatchObject({ answered: true, answer: wrong, verdict: 'wrong', awaiting: false });
    expect(row(s, 'p2')).toMatchObject({ answered: true, answer: right, verdict: null, awaiting: true });
    expect(row(s, 'p3')).toMatchObject({ answered: false, verdict: null });
    const rows = hostView(s).blitz?.rows ?? [];
    expect(rows.map((r) => [r.playerId, r.grade])).toEqual([
      ['p1', 'wrong'],
      ['p2', null],
    ]);
  });

  it('teams: who buzzed acts for the team, otherwise the captain', () => {
    const quiz = teamQuiz([blitzRound('rb', [text], { check: 'manual', attempts: 1 })]);
    let s = must(next(teamGame(quiz, [['Оля', 'Петро'], ['Іра', 'Марко']]), T0, rng));
    s = must(actBuzz(s, 'm2', T0 + 1000));
    expect(row(s, 't1')).toMatchObject({ answered: true, actor: 'Петро' });
    expect(row(s, 't2')).toMatchObject({ answered: false, actor: 'Іра' });
  });
});

describe('live answers: the survival trial', () => {
  const YES: Answer = { type: 'boolean', value: true };
  const NO: Answer = { type: 'boolean', value: false };

  /** Оля p1, Петро p2, Віра p3, Гліб p4; s1: Петро й Віра помилилися, «Далі» о 3000 — випробування. */
  function toTrial(trial: 'question' | 'luck' = 'question'): GameState {
    const quiz = makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials, { trial }), classicRound('r2', [single])]);
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра', 'Гліб'), 0, rng);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      s = must(submitAnswer(s, id, { type: 'single', optionId: id === 'p2' || id === 'p3' ? 'a' : 'b' }, 2000));
    }
    s = must(next(s, 2500, rng));
    s = must(next(s, 3000, rng));
    expect(trialOpen(s)).toBe(true);
    return s;
  }

  it('the rows are those on the edge; an answer shows with its verdict; closed — none', () => {
    let s = toTrial();
    expect(s.phase).toBe('leaderboard');
    expect(live(s)).toMatchObject({ kind: 'trial', answered: 0, total: 2, aside: null });
    expect(live(s).rows.map((r) => r.nickname)).toEqual(['Петро', 'Віра']);
    s = must(answerTrial(s, 'p2', YES, 4000));
    expect(row(s, 'p2')).toMatchObject({ answered: true, answer: YES, verdict: 'correct', timeMs: 1000, awaiting: false });
    expect(row(s, 'p3')).toMatchObject({ answered: false, answer: null });
    s = must(answerTrial(s, 'p3', NO, 5000));
    expect(trialOpen(s)).toBe(false);
    expect(hostLive(s)).toBeNull();
  });

  it('luck: the picked door without the traps', () => {
    let s = toTrial('luck');
    expect(row(s, 'p2')).toMatchObject({ answered: false, progress: { kind: 'door', picked: null } });
    s = must(pickDoor(s, 'p2', 2, 4000));
    expect(row(s, 'p2')).toMatchObject({ answered: true, answer: null, verdict: null, progress: { kind: 'door', picked: 2 } });
    expect(JSON.stringify(hostLive(s))).not.toContain('traps');
    expect(JSON.stringify(hostLive(s))).not.toContain('fallback');
  });
});

describe('live answers: the duel', () => {
  it('both duellists with their tries; the winner with the winning answer; none while picking a category', () => {
    const picking = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), DUEL_T0 + 4000, rng));
    expect(picking.duel?.stage).toBe('category');
    expect(hostLive(picking)).toBeNull();
    let s = toDuelQuestion();
    s = must(answerDuel(s, 'p1', 'Варшава', DUEL_T1 + 1000));
    expect(live(s)).toMatchObject({ kind: 'duel', answered: 0, total: 2, aside: null });
    expect(live(s).rows.map((r) => r.id)).toEqual(['p1', 'p2']);
    expect(row(s, 'p1')).toMatchObject({ answered: false, answer: null, progress: { kind: 'duel', tries: ['Варшава'], won: null } });
    s = must(answerDuel(s, 'p2', 'Париж', DUEL_T1 + 2000));
    expect(s.duel?.stage).toBe('answer');
    expect(row(s, 'p2')).toMatchObject({ answered: true, verdict: 'correct', timeMs: 2000, progress: { kind: 'duel', tries: [], won: 'Париж' } });
    expect(row(s, 'p1').progress).toEqual({ kind: 'duel', tries: ['Варшава'], won: null });
    expect(live(s).answered).toBe(1);
  });
});

describe('live answers: only the host, with progress', () => {
  it('bluff lies, the trial and the duel stay off the stage and the phones', () => {
    let lies = openAt(lobbyWith(makeQuiz([bluff, single], { buffs: [] }), 'Оля', 'Петро', 'Іра'), T0, rng);
    lies = must(writeLie(lies, 'p1', 'Лондон-2', T0 + 1000));
    expect(hostLive(lies)).not.toBeNull();
    expect('live' in stageView(lies)).toBe(false);
    expect(JSON.stringify(stageView(lies))).not.toContain('Лондон-2');
    expect(JSON.stringify(playerView(lies, 'p2'))).not.toContain('Лондон-2');

    const quiz = makeRoundsQuiz([survivalRound('rs', survivalQuestions, [{ ...text, id: 't1', timeLimit: 15 }]), classicRound('r2', [single])]);
    let trial = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра', 'Гліб'), 0, rng);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      trial = must(submitAnswer(trial, id, { type: 'single', optionId: id === 'p2' || id === 'p3' ? 'a' : 'b' }, 2000));
    }
    trial = must(next(must(next(trial, 2500, rng)), 3000, rng));
    trial = must(answerTrial(trial, 'p2', { type: 'text', value: 'Тернопіль' }, 4000));
    expect(row(trial, 'p2').answer).toEqual({ type: 'text', value: 'Тернопіль' });
    expect('live' in stageView(trial)).toBe(false);
    expect(JSON.stringify(stageView(trial))).not.toContain('Тернопіль');
    for (const other of ['p3', 'p4']) {
      expect('live' in (playerView(trial, other) ?? {})).toBe(false);
      expect(JSON.stringify(playerView(trial, other))).not.toContain('Тернопіль');
    }

    const duel = must(answerDuel(toDuelQuestion(), 'p1', 'Варшава', DUEL_T1 + 1000));
    expect(hostLive(duel)).not.toBeNull();
    expect('live' in stageView(duel)).toBe(false);
    expect(JSON.stringify(stageView(duel))).not.toContain('Варшава');
    expect(JSON.stringify(playerView(duel, 'p3'))).not.toContain('Варшава');
  });
});
