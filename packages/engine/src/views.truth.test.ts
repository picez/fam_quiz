import { describe, expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { seededRng } from './bluff';
import { lock, next, removePlayer, start, submitAnswer, type GameState } from './game';
import { hideTruth, submitTruth } from './truth';
import { assignTeam } from './teams';
import { hostView, playerView, stageView } from './views';
import { auctionRound, betsRound, classicRound, makeRoundsQuiz, single, truthRound } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamLobby, teamQuiz } from './testing/teams';

// «Правда про гравця» (28b): зрізи лобі, запитання й розкриття; автора до розкриття знають лише ведучий і він сам.

const t0 = 1_000_000;
const rng0 = () => 0;
const deal = () => seededRng(7);
const pick = (optionId: string): Answer => ({ type: 'single', optionId });
const FACTS: Record<string, string> = { p1: 'Я стрибала з парашутом', p2: 'Я знаю шість мов', p3: 'Я бачила північне сяйво' };

/** Лобі: Олена p1, Тарас p2, Віра p3, Хосе p4; факти в трьох перших. */
function lobby(facts: Record<string, string> = FACTS): GameState {
  const quiz = makeRoundsQuiz([truthRound('r1'), classicRound('r2', [single])]);
  let s = lobbyWith(quiz, 'Олена', 'Тарас', 'Віра', 'Хосе');
  for (const [id, text] of Object.entries(facts)) s = must(submitTruth(s, id, text, 0));
  return s;
}

/** Перше запитання. */
const opened = (s: GameState = lobby()) => must(next(must(start(s)), t0, deal()));
const authorOf = (s: GameState) => s.plays[s.questionIndex].truth?.authorId ?? '';
const json = (value: unknown) => JSON.stringify(value);
const IDS = ['p1', 'p2', 'p3', 'p4'];

describe('player truth views (28b)', () => {
  it('the lobby shows only the count', () => {
    const s = lobby();
    expect(stageView(s).truth).toEqual({ open: true, count: 3, index: null, reveal: null, skipped: false });
    expect(playerView(s, 'p1')?.me.truth).toEqual({ fact: 'Я стрибала з парашутом', hidden: false, canWrite: true, own: false });
    expect(playerView(s, 'p4')?.me.truth).toEqual({ fact: '', hidden: false, canWrite: true, own: false });
    for (const text of Object.values(FACTS)) {
      expect(json(stageView(s))).not.toContain(text);
      expect(json(playerView(s, 'p4'))).not.toContain(text);
    }
    // навіть сусід бачить лише свій
    expect(json(playerView(s, 'p2'))).not.toContain(FACTS.p1);
    const host = hostView(s).truth;
    expect(host?.facts.map((f) => ({ id: f.id, nickname: f.nickname, text: f.text, hidden: f.hidden, played: f.played }))).toEqual([
      { id: 'p1', nickname: 'Олена', text: FACTS.p1, hidden: false, played: false },
      { id: 'p2', nickname: 'Тарас', text: FACTS.p2, hidden: false, played: false },
      { id: 'p3', nickname: 'Віра', text: FACTS.p3, hidden: false, played: false },
    ]);
    expect(host?.author).toBeNull();
    // сховане не входить у count
    const hidden = must(hideTruth(s, 'p2', true));
    expect(stageView(hidden).truth?.count).toBe(2);
    expect(hostView(hidden).truth?.facts.find((f) => f.id === 'p2')?.hidden).toBe(true);
  });

  it('the hidden author sees the host mark', () => {
    const s = must(hideTruth(lobby(), 'p2', true));
    expect(playerView(s, 'p2')?.me.truth?.hidden).toBe(true);
    expect(playerView(s, 'p1')?.me.truth?.hidden).toBe(false);
  });

  it('the host sees a new text mark after a fact is rewritten', () => {
    let s = lobby();
    expect(hostView(s).truth?.facts.find((f) => f.id === 'p2')?.revised).toBe(false);
    s = must(hideTruth(s, 'p2', true));
    s = must(submitTruth(s, 'p2', 'Я вмію грати на арфі', t0));
    expect(hostView(s).truth?.facts.find((f) => f.id === 'p2')).toMatchObject({ text: 'Я вмію грати на арфі', hidden: false, revised: true });
    // ведучий відреагував — позначка зникає
    s = must(hideTruth(s, 'p2', true));
    expect(hostView(s).truth?.facts.find((f) => f.id === 'p2')?.revised).toBe(false);
    // той самий текст — не новий
    expect(hostView(must(submitTruth(s, 'p2', 'Я вмію грати на арфі', t0))).truth?.facts.find((f) => f.id === 'p2')?.revised).toBe(false);
  });

  it('facts close after the deal', () => {
    const s = opened();
    expect(stageView(s).truth).toMatchObject({ open: false, count: 3, index: 0, reveal: null, skipped: false });
    expect(playerView(s, 'p4')?.me.truth?.canWrite).toBe(false);
    expect(playerView(s, 'p1')?.me.truth?.canWrite).toBe(false);
  });

  it('the host does not see the facts of people who left after the deal', () => {
    let s = opened();
    const gone = s.truth?.deck?.find((id) => id !== authorOf(s)) ?? '';
    s = must(removePlayer(s, gone));
    expect(hostView(s).truth?.facts.some((f) => f.id === gone)).toBe(false);
    expect(s.truth?.facts[gone]).toBeDefined();
    expect(hostView(s).truth?.facts).toHaveLength(2);
  });

  it('nobody but the host and the author knows whose fact it is', () => {
    const s = opened();
    const author = authorOf(s);
    expect(s.plays[s.questionIndex].question.id).toBe('truth-0');
    const locked = must(lock(s));
    const others = IDS.filter((id) => id !== author);
    for (const state of [s, locked]) {
      for (const view of [json(stageView(state)), ...others.map((id) => json(playerView(state, id)))]) {
        expect(view).not.toContain('correctId');
        expect(view).not.toContain('authorId');
        expect(view).not.toContain('actorId');
        expect(view).not.toContain('"own":true');
      }
      for (const view of [stageView(state).truth, ...others.map((id) => playerView(state, id)?.me.truth)]) {
        expect(json(view)).not.toContain(author);
      }
      expect(playerView(state, author)?.me.truth?.own).toBe(true);
      expect(hostView(state).truth?.author?.id).toBe(author);
    }
    // «відповіли N з M» не видає автора: його запис на закритті не рахується
    expect(stageView(locked).playerCount).toBe(3);
    expect(stageView(locked).answeredCount).toBe(0);
    // усі вгадувачі відповіли: 3 з 3, а не 4 (запис автора на закритті не рахується)
    let all = s;
    for (const id of others) all = must(submitAnswer(all, id, pick('p4'), t0 + 1000));
    expect(all.phase).toBe('locked');
    expect(stageView(all).answeredCount).toBe(3);
    expect(stageView(all).playerCount).toBe(3);
  });

  it('the stage does not single out the silent author', () => {
    const quiz = teamQuiz([truthRound('r1'), classicRound('r2', [single])], 2, 'chosen');
    let s = teamLobby(quiz, 'Оля', 'Петро', 'Марко', 'Ната');
    for (const [m, t] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']]) s = must(assignTeam(s, m, t));
    s = must(submitTruth(s, 'm1', 'Я виростила лимон', 0));
    s = must(next(must(start(s)), t0, rng0));
    expect(s.phase).toBe('question');
    const stage = stageView(s);
    expect(stage.teams?.teams.every((t) => t.answererId !== null)).toBe(true);
    // вгадує лише друга команда
    expect(stage.playerCount).toBe(1);
    // уся команда автора знає, що це її факт; інші — ні
    expect(playerView(s, 'm1')?.me.truth?.own).toBe(true);
    expect(playerView(s, 'm2')?.me.truth?.own).toBe(true);
    expect(playerView(s, 'm3')?.me.truth?.own).toBe(false);
    expect(json(playerView(s, 'm3'))).not.toContain('"own":true');
    expect(json(stage)).not.toContain('"own":true');
  });

  it('reveal names the author and every pick', () => {
    let s = opened(lobby({ p1: FACTS.p1 }));
    expect(authorOf(s)).toBe('p1');
    s = must(submitAnswer(s, 'p2', pick('p1'), t0 + 1000));
    s = must(submitAnswer(s, 'p3', pick('p4'), t0 + 2000));
    s = must(lock(s));
    expect(stageView(s).truth?.reveal).toBeNull();
    s = must(next(s, t0 + 3000, rng0));
    expect(s.phase).toBe('reveal');
    const reveal = stageView(s).truth?.reveal;
    expect(reveal).toMatchObject({
      author: { id: 'p1', nickname: 'Олена' },
      points: 200,
      picks: [
        { nickname: 'Тарас', picked: 'Олена', pickedId: 'p1', correct: true },
        { nickname: 'Віра', picked: 'Хосе', pickedId: 'p4', correct: false },
        { nickname: 'Хосе', picked: null, pickedId: null, correct: false },
      ],
    });
    expect(reveal?.picks.map((p) => p.id)).toEqual(['p2', 'p3', 'p4']);
    expect(stageView(s).reveal).toMatchObject({ type: 'single', correctId: 'p1' });
    expect(playerView(s, 'p1')?.me.truth?.own).toBe(false);
    expect(hostView(s).truth?.reveal?.author.id).toBe('p1');
  });

  it('a skipped round says so', () => {
    const s = must(next(must(start(lobby({}))), t0, rng0));
    expect(s.phase).toBe('round_end');
    expect(stageView(s).truth).toMatchObject({ skipped: true, open: false, count: 0 });
    expect(stageView(opened()).truth?.skipped).toBe(false);
  });

  it('other quizzes have no truth key', () => {
    const quizzes = [
      makeRoundsQuiz([classicRound('r1', [single])]),
      makeRoundsQuiz([betsRound('r1', [single]), classicRound('r2', [single])]),
      makeRoundsQuiz([auctionRound('r1', [single]), classicRound('r2', [single])]),
    ];
    for (const quiz of quizzes) {
      const s = must(start(lobbyWith(quiz, 'Олена', 'Тарас')));
      expect('truth' in stageView(s)).toBe(false);
      expect('truth' in (hostView(s) as object)).toBe(false);
      expect('truth' in (playerView(s, 'p1')?.me ?? {})).toBe(false);
    }
  });
});
