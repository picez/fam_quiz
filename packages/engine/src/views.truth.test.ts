import { describe, expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { seededRng } from './bluff';
import { endRound, lock, next, removePlayer, start, submitAnswer, type GameState } from './game';
import { hideTruth, submitTruth } from './truth';
import { assignTeam } from './teams';
import { actAnswer } from './team-act';
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

  it('the question counter of a truth round is the deck', () => {
    const s = opened();
    expect(s.truth?.deck?.length).toBe(3);
    expect(stageView(s).total).toBe(3);
    expect(playerView(s, 'p4')?.total).toBe(3);
    // До роздачі колоди немає — число фактів, а не запитання вікторини.
    expect(stageView(must(start(lobby()))).total).toBe(3);
  });

  it('a skipped last round says so on the finished game, an early end before the deal does not', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), truthRound('r2')]);
    const s0 = must(start(lobbyWith(quiz, 'Олена', 'Тарас')));
    // Класика: відкрити, закрити, розкрити, далі — round_end першого раунду, потім intro раунду truth.
    let s = must(next(s0, t0, rng0));
    s = must(lock(s, t0 + 1000));
    s = must(next(s, t0 + 2000, rng0));
    s = must(next(s, t0 + 3000, rng0));
    while (s.phase !== 'intro') s = must(next(s, t0 + 4000, rng0));
    expect(stageView(s).truth?.skipped).toBe(false);
    const done = must(next(s, t0 + 5000, rng0));
    expect(done.phase).toBe('finished');
    expect(stageView(done).truth?.skipped).toBe(true);
    expect(playerView(done, 'p1')?.truth?.skipped).toBe(true);
    // Ведучий завершив гру на заставці раунду truth — колоди немає, це не пропуск.
    expect(stageView({ ...s, phase: 'finished' }).truth?.skipped).toBe(false);
  });

  it('the round intro has the round timer and the fact count, not «0 questions · no timer»', () => {
    const intro = must(start(lobby()));
    expect(intro.phase).toBe('intro');
    expect(stageView(intro).round?.times).toEqual({ min: 30, max: 30 });
    expect(stageView(intro).total).toBe(3);
    expect(hostView(intro).total).toBe(3);
    expect(playerView(intro, 'p4')?.total).toBe(3);
    // сховане до роздачі не рахується
    expect(stageView(must(hideTruth(intro, 'p2', true))).total).toBe(2);
  });

  it('a deck entry that will not be played is not counted: «Fact k of n» ends at n', () => {
    let s = opened();
    const later = s.truth?.deck?.slice(1) ?? [];
    expect(later).toHaveLength(2);
    // ведучий ховає один з ще не зіграних фактів, другого автора вилучено
    s = must(hideTruth(s, later[0], true));
    expect(stageView(s).truth?.count).toBe(2);
    expect(stageView(s).total).toBe(2);
    s = must(removePlayer(s, later[1]));
    expect(stageView(s).truth?.count).toBe(1);
    expect(stageView(s).total).toBe(1);
    // відкрите запитання рахується, навіть коли автора вилучено
    s = must(removePlayer(s, authorOf(s)));
    expect(stageView(s).truth?.count).toBe(1);
  });

  it('after the deal a fact outside the deck cannot be shown, and the host panel knows it', () => {
    const hidden = must(hideTruth(lobby(), 'p3', true));
    const s = opened(hidden);
    expect(s.truth?.deck).not.toContain('p3');
    expect(hideTruth(s, 'p3', false)).toEqual({ ok: false, error: 'truth_closed' });
    const facts = hostView(s).truth?.facts ?? [];
    expect(facts.find((f) => f.id === 'p3')?.inDeck).toBe(false);
    expect(facts.find((f) => f.id === 'p1')?.inDeck).toBe(true);
    // до роздачі — у колоді все
    expect(hostView(hidden).truth?.facts.every((f) => f.inDeck)).toBe(true);
  });

  it('a round ended at the intro with facts is not skipped; an empty deal is', () => {
    const intro = must(start(lobby()));
    const ended = must(endRound(intro, t0));
    expect(stageView(ended).truth?.skipped).toBe(false);
    const empty = must(next(must(start(lobby({}))), t0, rng0));
    expect(stageView(empty).truth?.skipped).toBe(true);
    // раунд із зіграним запитанням, завершений достроково, — не пропуск
    const s = must(next(must(start(lobby({ p1: FACTS.p1 }))), t0, rng0));
    expect(s.phase).toBe('question');
    expect(stageView(must(endRound(s, t0 + 1000))).truth?.skipped).toBe(false);
  });

  it('the host still sees the nickname of an author removed on the open question', () => {
    let s = opened();
    const author = authorOf(s);
    const nickname = s.players.find((p) => p.id === author)?.nickname;
    s = must(removePlayer(s, author));
    expect(hostView(s).truth?.author).toEqual({ id: author, nickname });
  });

  it("the reveal stats do not count the author's share as an answer", () => {
    let s = opened(lobby({ p1: FACTS.p1 }));
    s = must(submitAnswer(s, 'p2', pick('p4'), t0 + 1000));
    s = must(lock(s));
    s = must(next(s, t0 + 3000, rng0));
    expect(s.phase).toBe('reveal');
    // автор (p1) обдурив Тараса: його частка > 0, але це не відповідь
    expect(s.plays[s.questionIndex].answers.p1?.points).toBeGreaterThan(0);
    expect(stageView(s).stats).toMatchObject({ answered: 1, accepted: 0, counts: { p4: 1 } });
  });

  it('teams with a rotating answerer: before the truth round the captain is shown, as on its questions', () => {
    const quiz = teamQuiz([classicRound('r1', [single]), truthRound('r2'), classicRound('r3', [single])], 2, 'rotate');
    let s = teamLobby(quiz, 'Оля', 'Петро', 'Марко', 'Ната');
    for (const [m, t] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']]) s = must(assignTeam(s, m, t));
    s = must(submitTruth(s, 'm1', 'Я виростила лимон', 0));
    s = must(start(s));
    s = must(next(s, t0, rng0));
    s = must(lock(s, t0 + 1000));
    const captains = ['m1', 'm3'];
    const shown = (state: GameState) => stageView(state).teams?.teams.map((t) => t.answererId);
    let guard = 0;
    while (!(s.phase === 'intro' && s.roundIndex === 1) && guard++ < 20) {
      s = must(next(s, t0 + 2000, rng0));
      if (s.phase === 'round_end') expect(shown(s)).toEqual(captains);
    }
    expect(s.phase).toBe('intro');
    expect(shown(s)).toEqual(captains);
    s = must(next(s, t0 + 3000, rng0));
    expect(s.phase).toBe('question');
    expect(shown(s)).toEqual(captains);
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

describe('the truth round holds every author until its recap', () => {
  /** Усі, крім автора, вгадують правильно — бали є в кожного; розкриття. */
  const answered = (s: GameState, at: number) => {
    const author = authorOf(s);
    for (const id of IDS.filter((id) => id !== author)) s = must(submitAnswer(s, id, pick(author), at));
    // відповіли всі — запитання закрилося саме
    return must(next(s.phase === 'question' ? must(lock(s)) : s, at + 500, rng0));
  };

  it('a mid-round reveal reaches the stage and the phones as a sealed lock without a verdict or points', () => {
    const s = answered(opened(), t0 + 1000);
    const author = authorOf(s);
    expect(s.phase).toBe('reveal');
    expect(s.players.some((p) => p.score > 0)).toBe(true);
    const stage = stageView(s);
    expect(stage.phase).toBe('locked');
    expect(stage.truth).toMatchObject({ held: true, sealed: true, reveal: null, index: 0, count: 3 });
    expect(stage.truth?.recap).toBeUndefined();
    expect(stage.reveal).toBeNull();
    expect(stage.stats).toBeNull();
    expect(json(stage)).not.toContain('correctId');
    for (const id of IDS) {
      const phone = playerView(s, id);
      expect(phone?.phase).toBe('locked');
      expect(phone?.reveal).toBeNull();
      expect(phone?.me.result).toBeNull();
      expect(phone?.me.score).toBe(0);
      expect(phone?.truth?.reveal).toBeNull();
      expect(json(phone)).not.toContain('correctId');
    }
    // автор і далі знає лише свій факт; пульт бачить усе
    expect(playerView(s, author)?.me.truth?.own).toBe(true);
    const host = hostView(s);
    expect(host.phase).toBe('reveal');
    expect(host.truth).toMatchObject({ held: true, sealed: true, reveal: { author: { id: author } } });
  });

  it('between truth questions the table keeps the scores from before the round, without per-question gains or streaks', () => {
    let s = answered(opened(), t0 + 1000);
    s = must(next(s, t0 + 2000, rng0));
    expect(s.phase).toBe('leaderboard');
    const stage = stageView(s);
    expect(stage.truth?.held).toBe(true);
    expect(stage.truth?.sealed).toBeUndefined();
    expect(stage.reveal).toBeNull();
    expect(stage.standings?.every((row) => row.score === 0 && row.question === undefined)).toBe(true);
    expect(stage.players.every((p) => p.streak === 0)).toBe(true);
    expect(playerView(s, 'p2')?.standings?.every((row) => row.score === 0)).toBe(true);
    expect(playerView(s, 'p2')?.myBreakdown?.plus ?? 0).toBe(0);
    // пульт — справжні бали
    expect(hostView(s).standings?.some((row) => row.score > 0)).toBe(true);
    // наступне запитання: бали першого так само сховані
    s = must(next(s, t0 + 3000, rng0));
    expect(s.phase).toBe('question');
    expect(playerView(s, 'p2')?.me.score).toBe(0);
    expect(stageView(s).truth?.held).toBe(true);
  });

  it('the last reveal is the recap: every fact with its author, points and picks, in play order', () => {
    let s = opened();
    const authors: string[] = [];
    for (let k = 0; k < 3; k++) {
      authors.push(authorOf(s));
      s = answered(s, t0 + 10_000 * (k + 1));
      if (k < 2) {
        expect(stageView(s).truth?.sealed).toBe(true);
        s = must(next(must(next(s, t0 + 10_000 * (k + 1) + 2000, rng0)), t0 + 10_000 * (k + 1) + 3000, rng0));
      }
    }
    expect(s.phase).toBe('reveal');
    const stage = stageView(s);
    expect(stage.phase).toBe('reveal');
    expect(stage.truth?.held).toBeUndefined();
    expect(stage.truth?.reveal?.author.id).toBe(authors[2]);
    const recap = stage.truth?.recap;
    expect(recap?.early).toBe(false);
    expect(recap?.facts.map((f) => f.author.id)).toEqual(authors);
    expect(recap?.facts.map((f) => f.text)).toEqual(authors.map((id) => FACTS[id]));
    expect(recap?.facts.every((f) => f.picks.length === 3 && f.picks.every((p) => p.correct))).toBe(true);
    // бали раунду — тепер видно всім
    expect(playerView(s, 'p4')?.me.score).toBe(s.players.find((p) => p.id === 'p4')?.score);
    expect(playerView(s, 'p4')?.me.score).toBeGreaterThan(0);
    expect(hostView(s).truth?.recap?.facts).toHaveLength(3);
    // і на кінці раунду
    s = must(next(s, t0 + 50_000, rng0));
    expect(s.phase).toBe('round_end');
    expect(stageView(s).truth?.recap).toMatchObject({ early: false });
    expect(playerView(s, 'p1')?.truth?.recap?.facts).toHaveLength(3);
    // наступний раунд — без підсумку
    s = must(next(s, t0 + 60_000, rng0));
    expect(stageView(s).truth?.recap).toBeUndefined();
  });

  it('a round ended early shows the recap of the facts played, marked early', () => {
    let s = answered(opened(), t0 + 1000);
    const first = authorOf(s);
    s = must(endRound(s, t0 + 2000));
    expect(s.phase).toBe('round_end');
    const recap = stageView(s).truth?.recap;
    expect(recap).toMatchObject({ early: true });
    expect(recap?.facts.map((f) => f.author.id)).toEqual([first]);
    expect(stageView(s).truth?.held).toBeUndefined();
    expect(playerView(s, first === 'p2' ? 'p3' : 'p2')?.me.score).toBeGreaterThan(0);
  });

  it('removing the author of the remaining fact unseals the reveal: one fact played, its own reveal is the whole story', () => {
    let s = answered(opened(lobby({ p1: FACTS.p1, p2: FACTS.p2 })), t0 + 1000);
    expect(stageView(s).truth?.sealed).toBe(true);
    const other = s.truth?.deck?.find((id) => id !== authorOf(s)) ?? '';
    s = must(removePlayer(s, other));
    expect(stageView(s).truth?.sealed).toBeUndefined();
    expect(stageView(s).truth?.reveal?.author.id).toBe(authorOf(s));
    expect(stageView(s).truth?.recap).toBeUndefined();
    expect(must(endRound(s, t0 + 5000)).phase).toBe('round_end');
    expect(stageView(must(endRound(s, t0 + 5000))).truth?.recap?.facts).toHaveLength(1);
  });

  it('team phones are held the same way', () => {
    const quiz = teamQuiz([truthRound('r1'), classicRound('r2', [single])], 2);
    let s = teamLobby(quiz, 'Оля', 'Петро', 'Марко', 'Ната');
    for (const [m, t] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']]) s = must(assignTeam(s, m, t));
    for (const m of ['m1', 'm2', 'm3']) s = must(submitTruth(s, m, `Факт ${m}`, 0));
    s = must(next(must(start(s)), t0, deal()));
    const play = s.plays[s.questionIndex];
    const member = play.truth?.actorId === 't1' ? 'm3' : 'm1';
    s = must(actAnswer(s, member, pick(play.truth?.authorId ?? ''), t0 + 1000));
    s = must(next(s.phase === 'question' ? must(lock(s)) : s, t0 + 2000, rng0));
    expect(s.phase).toBe('reveal');
    expect(s.players.some((p) => p.score > 0)).toBe(true);
    const phone = playerView(s, member);
    expect(phone?.phase).toBe('locked');
    expect(phone?.me.result).toBeNull();
    expect(phone?.me.score).toBe(0);
    expect(phone?.truth?.sealed).toBe(true);
  });
});
