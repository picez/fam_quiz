import { describe, expect, it } from 'vitest';
import { defaultTeams, type Answer, type Quiz } from '@quiz/shared';
import { takeBuff } from './buffs';
import { declareDuel, pickDuelCategory } from './duel';
import { judge, lock, next, setConnected, type GameState } from './game';
import { pickCell } from './board';
import { sortWord } from './sort';
import { actAnswer, actBuzz, actorOf, pickDuelist } from './team-act';
import { pickTeam, rollTeamDie, setTeamForm, startTeamDice } from './teams';
import { hostView, playerView, stageView } from './views';
import { T0, T1, duelQuiz, revealOf } from './testing/duel';
import { blitzRound, boardRound, classicRound, cloud, makeQuiz, makeRoundsQuiz, poll, single, single4, sortQ, text, withId } from './testing/fixtures';
import { head, right } from './testing/sort';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamLobby, teamQuiz } from './testing/teams';

const rng = () => 0;
/** m1 Оля, m2 Петро — t1 (капітан Оля); m3 Віра, m4 Ігор — t2 (капітан Віра). */
const LAYOUT = [
  ['Оля', 'Петро'],
  ['Віра', 'Ігор'],
];
const RIGHT: Answer = { type: 'single', optionId: 'b' };

/** Перше запитання командної гри відкрито о T0. */
const opened = (quiz: Quiz) => must(next(teamGame(quiz, LAYOUT), T0, rng));
const team = (s: GameState, id: string) => playerView(s, id)?.team;

describe('team views: solo game', () => {
  it('teams and team are null', () => {
    const s = startRound(lobbyWith(makeQuiz([single]), 'Оля', 'Петро'), T0, rng);
    expect(stageView(s).teams).toBeNull();
    expect(hostView(s).teams).toBeNull();
    expect(playerView(s, 'p1')?.teams).toBeNull();
    expect(playerView(s, 'p1')?.team).toBeNull();
    expect(playerView(s, 'p1')?.playerCount).toBe(2);
  });
});

describe('team views: the lobby', () => {
  const quiz = teamQuiz([classicRound('r1', [single])]);

  it('picking: both teams empty, the members unassigned; a member may pick and sees themselves', () => {
    const s = teamLobby(quiz, 'Оля', 'Петро');
    const teams = stageView(s).teams;
    expect(teams?.form).toBe('pick');
    expect(teams?.teams).toEqual([
      { id: 't1', name: 'Червоні', color: 0, captainId: null, members: [] },
      { id: 't2', name: 'Сині', color: 1, captainId: null, members: [] },
    ]);
    expect(teams?.unassigned.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(teams?.dice).toBeNull();
    expect(stageView(s).players).toEqual([]);
    expect(hostView(s).players).toEqual([]);
    const view = playerView(s, 'm1');
    expect(view?.me).toMatchObject({ id: 'm1', nickname: 'Оля', score: 0, rank: null, answer: null, vote: null });
    expect(view?.team).toMatchObject({ memberId: 'm1', nickname: 'Оля', teamId: null, captainId: null, captain: false, canPick: true, canRoll: false, draft: null });
    expect(playerView(s, 'nobody')).toBeNull();
  });

  it('after picking a team the member is its captain', () => {
    const s = must(pickTeam(teamLobby(quiz, 'Оля', 'Петро'), 'm1', 't1'));
    expect(team(s, 'm1')).toMatchObject({ teamId: 't1', captainId: 'm1', captain: true });
    expect(stageView(s).teams?.teams[0].members).toEqual([{ id: 'm1', nickname: 'Оля', connected: true }]);
    expect(stageView(s).teams?.unassigned.map((m) => m.id)).toEqual(['m2']);
  });

  it('the dice: rows are people with their throws; the one still waiting may roll', () => {
    let s = must(setTeamForm(teamLobby(quiz, 'Оля', 'Петро'), 'dice'));
    s = must(startTeamDice(s));
    s = must(rollTeamDie(s, 'm1', rng));
    expect(stageView(s).teams?.dice).toEqual({
      rows: [
        { playerId: 'm1', nickname: 'Оля', throws: [1], waiting: false },
        { playerId: 'm2', nickname: 'Петро', throws: [], waiting: true },
      ],
      tieBreak: false,
      done: false,
    });
    expect(team(s, 'm2')).toMatchObject({ canRoll: true, canPick: false });
    expect(team(s, 'm1')?.canRoll).toBe(false);
  });
});

describe('team views: after the start', () => {
  const quiz = teamQuiz([classicRound('r1', [single, withId(single, 'q2')])]);

  it('a member sees the team as me; only the captain may act; the stage shows teams with their members', () => {
    let s = opened(quiz);
    s = must(actAnswer(s, 'm1', RIGHT, T0 + 1000));
    s = must(actAnswer(s, 'm3', { type: 'single', optionId: 'a' }, T0 + 1000));
    s = must(next(s, T0 + 2000, rng));
    expect(s.phase).toBe('reveal');
    const view = playerView(s, 'm2');
    const score = s.players.find((p) => p.id === 't1')?.score;
    expect(score).toBeGreaterThan(0);
    expect(view?.me).toMatchObject({ id: 't1', nickname: 'Червоні', score, answer: RIGHT });
    expect(view?.team).toMatchObject({ memberId: 'm2', nickname: 'Петро', teamId: 't1', captainId: 'm1', captain: false, canAct: false, canPick: false, canRoll: false });
    expect(team(s, 'm1')).toMatchObject({ captain: true, canAct: true });
    expect(stageView(s).players.map((p) => p.id)).toEqual(['t1', 't2']);
    expect(stageView(s).teams?.teams[0]).toMatchObject({ id: 't1', name: 'Червоні', captainId: 'm1' });
    expect(stageView(s).teams?.teams[0].members.map((m) => m.nickname)).toEqual(['Оля', 'Петро']);
    expect(stageView(s).teams?.unassigned).toEqual([]);
    expect(hostView(s).teams?.teams.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('the captain offline — the next member is the captain', () => {
    const s = must(setConnected(opened(quiz), 'm1', false, T0));
    expect(team(s, 'm2')).toMatchObject({ captain: true, captainId: 'm2', canAct: true });
    expect(stageView(s).teams?.teams[0].members[0]).toEqual({ id: 'm1', nickname: 'Оля', connected: false });
  });

  it('nothing of another team leaks before the reveal', () => {
    const textQuiz = teamQuiz([classicRound('r1', [text])]);
    const s = must(actAnswer(opened(textQuiz), 'm1', { type: 'text', value: 'Кременчук' }, T0 + 1000));
    expect(JSON.stringify(playerView(s, 'm2'))).toContain('Кременчук');
    expect(JSON.stringify(playerView(s, 'm3'))).not.toContain('Кременчук');
    expect(JSON.stringify(playerView(s, 'm4'))).not.toContain('Кременчук');
    expect(JSON.stringify(stageView(s))).not.toContain('Кременчук');
  });
});

describe('team views: blitz', () => {
  const quiz = teamQuiz([blitzRound('rb', [text, withId(text, 'q4b')], { check: 'manual', attempts: 1 })]);

  it('anyone may buzz; after a buzz the one who buzzed acts', () => {
    let s = opened(quiz);
    expect(team(s, 'm1')).toMatchObject({ canAct: true, buzzerId: null });
    expect(team(s, 'm2')?.canAct).toBe(true);
    s = must(actBuzz(s, 'm2', T0 + 1000));
    expect(team(s, 'm2')).toMatchObject({ canAct: true, buzzerId: 'm2' });
    expect(team(s, 'm1')).toMatchObject({ canAct: false, buzzerId: 'm2' });
    // інша команда не бачить чужого натиску як свого
    expect(team(s, 'm3')).toMatchObject({ canAct: true, buzzerId: null });
  });

  it('after a wrong attempt the buzzer is gone and nobody acts once the attempts are used up', () => {
    let s = must(actBuzz(opened(quiz), 'm2', T0 + 1000));
    s = must(actAnswer(s, 'm2', { type: 'text', value: 'Львів' }, T0 + 1500));
    s = must(judge(s, 't1', false, T0 + 2000));
    expect(team(s, 'm2')).toMatchObject({ canAct: false, buzzerId: null });
    expect(team(s, 'm1')).toMatchObject({ canAct: false, buzzerId: null });
    expect(team(s, 'm3')?.canAct).toBe(true);
  });

  it('instant blitz: once the team has answered nobody acts', () => {
    let s = opened(teamQuiz([blitzRound('rb', [text, withId(text, 'q4b')])]));
    expect(team(s, 'm1')?.canAct).toBe(true);
    s = must(actAnswer(s, 'm2', { type: 'text', value: 'Львів' }, T0 + 1000));
    expect(team(s, 'm1')?.canAct).toBe(false);
    expect(team(s, 'm2')?.canAct).toBe(false);
    expect(team(s, 'm3')?.canAct).toBe(true);
  });
});

describe('team views: the duelist', () => {
  const quiz: Quiz = { ...duelQuiz(), settings: { ...duelQuiz().settings, teams: defaultTeams(2) } };

  /** q1, q2 зіграно, t1 оголосила дуель t2 на reveal q2. */
  function declared(): GameState {
    let s = revealOf(must(next(teamGame(quiz, LAYOUT), T0, rng)), T0 + 1000);
    s = must(next(s, T0 + 2000, rng));
    s = revealOf(s, T0 + 3000);
    return must(declareDuel(s, 't1', 't2'));
  }

  it('the captains of the duelling teams may pick the duelist; the duelist acts in the question', () => {
    let s = declared();
    expect(team(s, 'm1')).toMatchObject({ canPickDuelist: true, duelistId: 'm1' });
    expect(team(s, 'm2')).toMatchObject({ canPickDuelist: false, duelistId: 'm1' });
    expect(team(s, 'm3')).toMatchObject({ canPickDuelist: true, duelistId: 'm3' });
    s = must(pickDuelist(s, 'm1', 'm2'));
    s = must(pickDuelCategory(must(next(s, T0 + 4000, rng)), 't1', 'dc1', T1, rng));
    expect(s.duel?.stage).toBe('question');
    expect(team(s, 'm2')).toMatchObject({ duelistId: 'm2', canAct: true, canPickDuelist: false });
    expect(team(s, 'm1')).toMatchObject({ duelistId: 'm2', canAct: false });
    expect(team(s, 'm3')).toMatchObject({ duelistId: 'm3', canAct: true });
  });

  it('no duel — no duelist', () => {
    expect(team(opened(quiz), 'm1')).toMatchObject({ duelistId: null, canPickDuelist: false });
  });
});

describe('team views: polls and word clouds', () => {
  it('each member sees their own cloud vote; the count is of people', () => {
    let s = opened(teamQuiz([classicRound('r1', [cloud, withId(cloud, 'q16b')])]));
    s = must(actAnswer(s, 'm1', { type: 'wordcloud', words: ['Каштани'] }, T0 + 1000));
    s = must(actAnswer(s, 'm2', { type: 'wordcloud', words: ['Дніпро'] }, T0 + 1000));
    s = must(actAnswer(s, 'm3', { type: 'wordcloud', words: ['Лавра'] }, T0 + 1000));
    expect(playerView(s, 'm2')?.me.answer).toEqual({ type: 'wordcloud', words: ['Дніпро'] });
    expect(playerView(s, 'm1')?.me.answer).toEqual({ type: 'wordcloud', words: ['Каштани'] });
    expect(playerView(s, 'm4')?.me.answer).toBeNull();
    for (const view of [stageView(s), hostView(s), playerView(s, 'm4')]) {
      expect(view?.playerCount).toBe(4);
      expect(view?.answeredCount).toBe(3);
    }
  });

  it('the host sees the people’s poll votes', () => {
    let s = opened(teamQuiz([classicRound('r1', [poll, withId(poll, 'q15b')])]));
    s = must(actAnswer(s, 'm2', { type: 'poll', optionId: 'a' }, T0 + 1000));
    expect(hostView(s).responses.map((r) => [r.playerId, r.nickname])).toEqual([['m2', 'Петро']]);
    // на опитуванні діє кожен; після закриття — знову лише капітан
    expect(team(s, 'm4')?.canAct).toBe(true);
    for (const id of ['m1', 'm3', 'm4']) s = must(actAnswer(s, id, { type: 'poll', optionId: 'b' }, T0 + 1000));
    expect(s.phase).toBe('locked');
    expect(team(s, 'm2')?.canAct).toBe(false);
    expect(team(s, 'm1')?.canAct).toBe(true);
  });

  it('after a poll the leaderboard and the finish count teams, not people', () => {
    const quiz = teamQuiz([classicRound('r1', [poll, single])]);
    let s = opened({ ...quiz, settings: { ...quiz.settings, leaderboard: 'each' } });
    for (const id of ['m1', 'm2', 'm3', 'm4']) s = must(actAnswer(s, id, { type: 'poll', optionId: 'a' }, T0 + 1000));
    expect(s.phase).toBe('locked');
    expect(stageView(s).playerCount).toBe(4);
    s = must(next(s, T0 + 2000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).playerCount).toBe(4);
    // Далі (таблиця, кінець раунду, фініш) — знову команди.
    const phases: string[] = [];
    for (let at = T0 + 3000; s.phase !== 'finished'; at += 1000) {
      s = must(s.phase === 'question' ? lock(s, at) : next(s, at, rng));
      phases.push(s.phase);
      for (const view of [stageView(s), hostView(s), playerView(s, 'm2')]) expect(view?.playerCount).toBe(2);
    }
    expect(phases).toContain('leaderboard');
  });

  it('a scored question counts teams', () => {
    const s = opened(teamQuiz([classicRound('r1', [single])]));
    expect(stageView(s).playerCount).toBe(2);
  });
});

describe('team views: ask the hall', () => {
  const quiz = makeRoundsQuiz([classicRound('r1', [single4, withId(single4, 'q2')], { speedBonus: false })], {
    teams: defaultTeams(2),
    buffs: ['audience'],
  });

  it('members of the other team get the prompt; the own team does not', () => {
    let s = must(actAnswer(opened(quiz), 'm3', RIGHT, T0 + 1000));
    s = must(takeBuff(s, 't1', 'audience', T0 + 1500, rng));
    expect(playerView(s, 'm3')?.me.vote?.asker).toEqual({ playerId: 't1', nickname: 'Червоні' });
    expect(playerView(s, 'm4')?.me.vote?.asker.playerId).toBe('t1');
    expect(playerView(s, 'm2')?.me.vote).toBeNull();
    expect(playerView(s, 'm1')?.me.vote).toBeNull();
  });
});

describe('team act: errors', () => {
  it('actAnswer outside a question is wrong_phase before not_captain', () => {
    const s = teamGame(teamQuiz([classicRound('r1', [single])]), LAYOUT);
    expect(s.phase).not.toBe('question');
    expect(actAnswer(s, 'm2', RIGHT, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('team views: live sorting (11d)', () => {
  const layout = [
    ['Оля', 'Петро'],
    ['Іра', 'Марко'],
  ];
  const wordOf = (id: string) => ({ id, text: sortQ.words.find((w) => w.id === id)?.text ?? '' });

  it('a captain sorts: the own team sees the live card and columns, the other team and the stage see nothing (11d)', () => {
    let s = teamGame(teamQuiz([classicRound('r1', [sortQ])]), layout);
    while (s.phase !== 'question') s = must(next(s, T0, rng));
    const actor = actorOf(s, 'm1', 'captain');
    expect(actor).toEqual({ ok: true, id: 't1' });
    const w = head(s, 't1');
    s = must(sortWord(s, 't1', w, right(w), T0 + 1000));
    const own = playerView(s, 'm2')?.me.sort?.live;
    expect(own).toMatchObject({ sorterId: 't1', sorted: 1, card: wordOf(head(s, 't1')) });
    expect(own?.columns.find((c) => c.id === right(w))?.words).toEqual([wordOf(w)]);
    expect(playerView(s, 'm1')?.me.sort?.live).toEqual(own);
    expect(playerView(s, 'm1')?.me.sort?.watched).toBe(true);
    const other = playerView(s, 'm4')?.me.sort?.live;
    expect(other).toMatchObject({ sorterId: 't2', sorted: 0 });
    expect(other?.columns.every((c) => c.words.length === 0)).toBe(true);
    expect(stageView(s).sort?.live).toBeNull();
    expect(hostView(s).sort?.live).toBeNull();
  });

  it("a team's normal board cell: the stage and the other team see the live view, the choosing team only its own (11d)", () => {
    const quiz = teamQuiz([boardRound('g1', [{ title: 'Сортування', cells: [{ answerMode: 'phone', question: sortQ }] }])]);
    let s = must(next(teamGame(quiz, layout), T0, rng));
    s = must(pickCell(s, 't1', 'q9', T0, rng));
    const w = head(s, 't1');
    s = must(sortWord(s, 't1', w, right(w), T0 + 1000));
    expect(stageView(s).sort?.live?.sorterId).toBe('t1');
    expect(playerView(s, 'm3')?.sort?.live?.sorterId).toBe('t1');
    expect(playerView(s, 'm2')?.sort?.live).toBeNull();
    expect(playerView(s, 'm2')?.me.sort?.live).toMatchObject({ sorterId: 't1', sorted: 1 });
  });
});
