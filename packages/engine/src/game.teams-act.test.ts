import { describe, expect, it } from 'vitest';
import { defaultTeams, type Answer, type Quiz } from '@quiz/shared';
import { buffBlock, castVote, takeBuff } from './buffs';
import { answerDuel, declareDuel, pickDuelCategory } from './duel';
import { judge, next, recordOf, removePlayer, setConnected, type GameState } from './game';
import { surveyBoard } from './survey';
import { actAnswer, actBuzz, actorOf, canMemberVote, pickDuelist, voterList, type TeamAct } from './team-act';
import { cloudTally, hideCloudWord } from './votes';
import { T0, T1, duelQuiz, revealOf } from './testing/duel';
import { blitzRound, classicRound, cloud, makeQuiz, makeRoundsQuiz, poll, single, single4, surveyCloud, text, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const rng = () => 0;
/** m1 Оля, m2 Петро — t1 (капітан Оля); m3 Віра, m4 Ігор — t2 (капітан Віра). */
const LAYOUT = [
  ['Оля', 'Петро'],
  ['Віра', 'Ігор'],
];
const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };
const ODESA: Answer = { type: 'text', value: 'Одеса' };
const LVIV: Answer = { type: 'text', value: 'Львів' };

const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const current = (s: GameState) => s.plays[s.questionIndex];

/** Перше запитання командної гри відкрито о T0. */
const opened = (quiz: Quiz) => must(next(teamGame(quiz, LAYOUT), T0, rng));

/** «Далі», доки не відкриється наступне запитання. */
function toQuestion(s: GameState, now: number): GameState {
  let state = must(next(s, now, rng));
  while (state.phase !== 'question') state = must(next(state, now, rng));
  return state;
}

describe('team act: solo game', () => {
  it('actorOf is the identity for every act', () => {
    const solo = startRound(lobbyWith(makeQuiz([single]), 'Оля', 'Петро'), T0, rng);
    const acts: TeamAct[] = ['captain', 'answer', 'buzz', 'vote', 'duel', 'self'];
    for (const act of acts) expect(actorOf(solo, 'p1', act)).toEqual({ ok: true, id: 'p1' });
  });

  it('actAnswer and actBuzz act as the player', () => {
    const solo = startRound(lobbyWith(makeQuiz([single]), 'Оля', 'Петро'), T0, rng);
    const s = must(actAnswer(solo, 'p1', RIGHT, T0 + 1000));
    expect(recordOf(s, s.questionIndex, 'p1')?.grade).toBe('correct');
    expect(voterList(solo)).toEqual([
      { id: 'p1', nickname: 'Оля' },
      { id: 'p2', nickname: 'Петро' },
    ]);
  });
});

describe('team act: the captain', () => {
  const quiz = teamQuiz([classicRound('r1', [single, withId(single, 'q2')])]);

  it('the captain acts for the team, the others get not_captain', () => {
    const s = opened(quiz);
    expect(actorOf(s, 'm1', 'captain')).toEqual({ ok: true, id: 't1' });
    expect(actorOf(s, 'm2', 'captain')).toEqual({ ok: false, error: 'not_captain' });
    expect(actorOf(s, 'm3', 'captain')).toEqual({ ok: true, id: 't2' });
    expect(actorOf(s, 'nobody', 'captain')).toEqual({ ok: false, error: 'not_found' });
    // кнопку бліцу й власні дії може будь-хто
    expect(actorOf(s, 'm2', 'buzz')).toEqual({ ok: true, id: 't1' });
    expect(actorOf(s, 'm2', 'self')).toEqual({ ok: true, id: 'm2' });
    expect(actorOf(s, 'm2', 'vote')).toEqual({ ok: true, id: 'm2' });
  });

  it('the captain offline — the next connected member is the captain', () => {
    const s = must(setConnected(opened(quiz), 'm1', false, T0));
    expect(actorOf(s, 'm2', 'captain')).toEqual({ ok: true, id: 't1' });
    expect(actorOf(s, 'm1', 'captain')).toEqual({ ok: false, error: 'not_captain' });
  });

  it('classic: only the captain answers; the record and the points go to the team', () => {
    let s = opened(quiz);
    expect(actAnswer(s, 'm2', RIGHT, T0 + 1000)).toEqual({ ok: false, error: 'not_captain' });
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    expect(recordOf(s, s.questionIndex, 't1')?.grade).toBe('correct');
    expect(recordOf(s, s.questionIndex, 'm1')).toBeUndefined();
    s = must(actAnswer(s, 'm3', WRONG, T0 + 1000));
    expect(s.phase).toBe('locked');
    s = must(next(s, T0 + 2000, rng));
    expect(score(s, 't1')).toBeGreaterThan(0);
    expect(score(s, 't2')).toBe(0);
  });
});

describe('team act: blitz with the button', () => {
  const quiz = teamQuiz([blitzRound('rb', [text, withId(text, 'q4b')], { check: 'manual', attempts: 1 })]);

  it('anyone buzzes; the one who buzzed answers', () => {
    let s = must(actBuzz(opened(quiz), 'm2', T0 + 1000));
    expect(current(s).blitz?.queue.map((e) => e.playerId)).toEqual(['t1']);
    expect(current(s).buzzers).toEqual({ t1: 'm2' });
    expect(actorOf(s, 'm1', 'answer')).toEqual({ ok: false, error: 'not_in_queue' });
    expect(actAnswer(s, 'm1', ODESA, T0 + 1500)).toEqual({ ok: false, error: 'not_in_queue' });
    // команда, що не натискала
    expect(actAnswer(s, 'm3', ODESA, T0 + 1500)).toEqual({ ok: false, error: 'not_in_queue' });
    s = must(actAnswer(s, 'm2', ODESA, T0 + 1500));
    expect(current(s).blitz?.queue[0]).toMatchObject({ playerId: 't1', answer: ODESA });
  });

  it('the attempts are the team’s: another member cannot buzz again', () => {
    let s = must(actBuzz(opened(quiz), 'm2', T0 + 1000));
    expect(actBuzz(s, 'm1', T0 + 1100)).toEqual({ ok: false, error: 'already_queued' });
    s = must(actAnswer(s, 'm2', LVIV, T0 + 1500));
    s = must(judge(s, 't1', false, T0 + 2000));
    expect(actBuzz(s, 'm1', T0 + 2500)).toEqual({ ok: false, error: 'no_attempts' });
  });

  it('the one who buzzed went offline — the captain answers', () => {
    let s = must(actBuzz(opened(quiz), 'm2', T0 + 1000));
    s = must(setConnected(s, 'm2', false, T0 + 1200));
    expect(actorOf(s, 'm1', 'answer')).toEqual({ ok: true, id: 't1' });
    s = must(actAnswer(s, 'm1', ODESA, T0 + 1500));
    expect(current(s).blitz?.queue[0]).toMatchObject({ playerId: 't1', answer: ODESA });
  });
});

describe('team act: instant blitz', () => {
  it('any member answers once for the team and becomes its buzzer', () => {
    const quiz = teamQuiz([blitzRound('rb', [text, withId(text, 'q4b')])]);
    let s = must(actAnswer(opened(quiz), 'm2', LVIV, T0 + 1000));
    expect(current(s).blitz?.queue.map((e) => e.playerId)).toEqual(['t1']);
    expect(current(s).buzzers).toEqual({ t1: 'm2' });
    expect(actAnswer(s, 'm1', ODESA, T0 + 1500)).toEqual({ ok: false, error: 'already_answered' });
    s = must(actAnswer(s, 'm4', ODESA, T0 + 1500));
    expect(current(s).buzzers).toEqual({ t1: 'm2', t2: 'm4' });
  });
});

describe('team act: polls and word clouds', () => {
  const quiz = teamQuiz([classicRound('r1', [poll, cloud, surveyCloud])]);
  const WORDS: Record<string, string[]> = { m1: ['Каштани', 'Дніпро'], m2: ['Каштани'], m3: ['Лавра'], m4: ['каштани'] };

  it('every member votes in a poll; votes go under the people; scores stay; the fourth vote closes', () => {
    let s = opened(quiz);
    for (const id of ['m1', 'm2', 'm3']) s = must(actAnswer(s, id, { type: 'poll', optionId: 'a' }, T0 + 1000));
    expect(s.phase).toBe('question');
    // голос людини — один
    expect(actAnswer(s, 'm1', { type: 'poll', optionId: 'b' }, T0 + 1100)).toEqual({ ok: false, error: 'already_answered' });
    s = must(actAnswer(s, 'm4', { type: 'poll', optionId: 'b' }, T0 + 1200));
    expect(Object.keys(current(s).answers).sort()).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(s.phase).toBe('locked');
    s = must(next(s, T0 + 2000, rng));
    expect(s.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('the team id does not vote', () => {
    const s = opened(quiz);
    expect(actorOf(s, 'm2', 'answer')).toEqual({ ok: true, id: 'm2' });
  });

  it('an absent member is not waited for', () => {
    let s = must(setConnected(opened(quiz), 'm4', false, T0));
    for (const id of ['m1', 'm2', 'm3']) s = must(actAnswer(s, id, { type: 'poll', optionId: 'a' }, T0 + 1000));
    expect(s.phase).toBe('locked');
  });

  it('the cloud counts people; «100 to 1» from it — popularity of four people; hiding finds a member’s word', () => {
    let s = toQuestion(teamCloudVotes(opened(quiz)), T0 + 2000);
    // поточне — хмара
    expect(current(s).question.id).toBe(cloud.id);
    for (const [id, words] of Object.entries(WORDS)) s = must(actAnswer(s, id, { type: 'wordcloud', words }, T0 + 3000));
    expect(s.phase).toBe('locked');
    const tally = cloudTally(current(s), voterList(s));
    expect(tally.find((e) => e.key === 'каштани')).toMatchObject({ count: 3, playerIds: ['m1', 'm2', 'm4'] });
    expect(tally.map((e) => e.count).reduce((a, b) => a + b, 0)).toBe(5);
    expect(s.players.map((p) => p.score)).toEqual([0, 0]);
    s = must(hideCloudWord(s, 'Лавра', true));
    expect(current(s).cloudHidden).toEqual(['лавра']);
    s = must(hideCloudWord(s, 'Лавра', false));
    const board = surveyBoard(s, surveyCloud);
    expect(board?.rows.map((r) => [r.text, r.popularity])).toEqual([
      ['Каштани', 75],
      ['Дніпро', 25],
      ['Лавра', 25],
    ]);
  });

  /** Опитування: усі четверо голосують о T0 + 1000. */
  function teamCloudVotes(s: GameState): GameState {
    return ['m1', 'm2', 'm3', 'm4'].reduce((acc, id) => must(actAnswer(acc, id, { type: 'poll', optionId: 'a' }, T0 + 1000)), s);
  }
});

describe('team act: ask the hall', () => {
  const quiz = makeRoundsQuiz([classicRound('r1', [single4, withId(single4, 'q2')], { speedBonus: false })], {
    teams: defaultTeams(2),
    buffs: ['audience'],
  });

  it('members of other teams that answered vote; the own team and teams yet to answer do not', () => {
    let s = opened(quiz);
    // ніхто з інших команд ще не відповів
    expect(canMemberVote(s, 'm3', 't1')).toBe(false);
    expect(buffBlock(s, 't1', 'audience', T0 + 500)).toBe('no_voters');
    s = must(actAnswer(s, 'm3', RIGHT, T0 + 1000));
    expect(canMemberVote(s, 'm3', 't1')).toBe(true);
    expect(canMemberVote(s, 'm4', 't1')).toBe(true);
    expect(canMemberVote(s, 'm2', 't1')).toBe(false);
    s = must(takeBuff(s, 't1', 'audience', T0 + 1500, rng));
    s = must(castVote(s, 'm3', 't1', RIGHT, T0 + 2000));
    expect(current(s).buffs?.t1.vote?.ballots).toEqual({ m3: RIGHT });
    expect(castVote(s, 'm2', 't1', RIGHT, T0 + 2000)).toEqual({ ok: false, error: 'vote_denied' });
    expect(castVote(s, 't2', 't1', RIGHT, T0 + 2000)).toEqual({ ok: false, error: 'not_found' });
  });

  it('no_voters when the other team is offline', () => {
    let s = must(actAnswer(opened(quiz), 'm3', RIGHT, T0 + 1000));
    s = must(setConnected(s, 'm3', false, T0 + 1100));
    s = must(setConnected(s, 'm4', false, T0 + 1100));
    expect(buffBlock(s, 't1', 'audience', T0 + 1500)).toBe('no_voters');
  });
});

describe('team act: the duelist', () => {
  const quiz: Quiz = { ...duelQuiz(), settings: { ...duelQuiz().settings, teams: defaultTeams(2) } };

  /** q1, q2 зіграно, t1 оголосила дуель t2 на reveal q2. */
  function declared(): GameState {
    let s = revealOf(must(next(teamGame(quiz, LAYOUT), T0, rng)), T0 + 1000);
    s = must(next(s, T0 + 2000, rng));
    s = revealOf(s, T0 + 3000);
    return must(declareDuel(s, 't1', 't2'));
  }

  it('the captain picks the duelist while the duel is declared or choosing the category', () => {
    let s = must(pickDuelist(declared(), 'm1', 'm2'));
    expect(s.teams?.duelists).toEqual({ t1: 'm2' });
    expect(pickDuelist(s, 'm2', 'm1')).toEqual({ ok: false, error: 'not_captain' });
    expect(pickDuelist(s, 'm1', 'm3')).toEqual({ ok: false, error: 'not_found' });
    s = must(next(s, T0 + 4000, rng));
    expect(s.duel?.stage).toBe('category');
    s = must(pickDuelist(s, 'm3', 'm4'));
    expect(s.teams?.duelists).toEqual({ t1: 'm2', t2: 'm4' });
    s = must(pickDuelCategory(s, 't1', 'dc1', T1, rng));
    expect(pickDuelist(s, 'm1', 'm1')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('only the duelist answers; offline — the captain; after the result the duelists are cleared', () => {
    let s = must(pickDuelist(declared(), 'm1', 'm2'));
    s = must(pickDuelCategory(must(next(s, T0 + 4000, rng)), 't1', 'dc1', T1, rng));
    expect(actorOf(s, 'm1', 'duel')).toEqual({ ok: false, error: 'not_duelist' });
    expect(actorOf(s, 'm2', 'duel')).toEqual({ ok: true, id: 't1' });
    // у суперника дуелянт — капітан
    expect(actorOf(s, 'm3', 'duel')).toEqual({ ok: true, id: 't2' });
    expect(actorOf(s, 'm4', 'duel')).toEqual({ ok: false, error: 'not_duelist' });
    const away = must(setConnected(s, 'm2', false, T1));
    expect(actorOf(away, 'm1', 'duel')).toEqual({ ok: true, id: 't1' });
    s = must(answerDuel(s, 't1', 'Париж', T1 + 1000));
    s = must(next(s, T1 + 2000, rng));
    s = must(answerDuel(s, 't1', 'Рим', T1 + 3000));
    s = must(next(s, T1 + 4000, rng));
    expect(s.duel?.stage).toBe('result');
    s = must(next(s, T1 + 5000, rng));
    expect(s.duel).toBeNull();
    expect(s.teams?.duelists).toEqual({});
  });

  it('cancelling the duel clears the duelists too', () => {
    const s = must(pickDuelist(declared(), 'm1', 'm2'));
    const dropped = must(removePlayer(s, 't2'));
    expect(dropped.duel).toBeNull();
    expect(dropped.teams?.duelists).toEqual({});
  });
});

describe('team act: removing people', () => {
  it('a removed member’s cloud vote is gone', () => {
    let s = opened(teamQuiz([classicRound('r1', [cloud])]));
    s = must(actAnswer(s, 'm2', { type: 'wordcloud', words: ['Каштани'] }, T0 + 1000));
    s = must(removePlayer(s, 'm2'));
    expect(Object.keys(current(s).answers)).toEqual([]);
  });

  it('a removed member’s hall ballot is gone', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single4])], { teams: defaultTeams(2), buffs: ['audience'] });
    let s = must(actAnswer(opened(quiz), 'm3', RIGHT, T0 + 1000));
    s = must(takeBuff(s, 't1', 'audience', T0 + 1500, rng));
    s = must(castVote(s, 'm3', 't1', RIGHT, T0 + 2000));
    s = must(removePlayer(s, 'm3'));
    expect(current(s).buffs?.t1.vote?.ballots).toEqual({});
  });

  it('a removed buzzer is gone from buzzers', () => {
    const quiz = teamQuiz([blitzRound('rb', [text], { check: 'manual' })]);
    let s = must(actBuzz(opened(quiz), 'm2', T0 + 1000));
    s = must(removePlayer(s, 'm2'));
    expect(current(s).buzzers).toEqual({});
    // команда лишається в черзі: відповідає капітан
    expect(actorOf(s, 'm1', 'answer')).toEqual({ ok: true, id: 't1' });
  });
});
