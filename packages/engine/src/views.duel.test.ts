import { describe, expect, it } from 'vitest';
import { defaultTeams, type Duels, type Quiz } from '@quiz/shared';
import { answerDuel, betDuel, declareDuel, duelQuestionOf, pickDuelCategory } from './duel';
import { lock, next, pause, type GameState } from './game';
import { answerAll, duelQuiz, revealOf, T0, T1, toDeclarable, toDeclarableWith, toDuelQuestion } from './testing/duel';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const rng0 = () => 0;
const olya = { playerId: 'p1', nickname: 'Оля' };
const petro = { playerId: 'p2', nickname: 'Петро' };
const ira = { playerId: 'p3', nickname: 'Іра' };

/** Дуелянт id відповідає правильно на поточне запитання дуелі. */
function win(s: GameState, id: string, now: number): GameState {
  return must(answerDuel(s, id, duelQuestionOf(s)?.accepted[0] ?? '', now));
}

function withoutDuels(quiz: Quiz): Quiz {
  const { duels: _duels, ...rest } = quiz;
  return rest;
}

const duelOf = (s: GameState, id: string) => playerView(s, id)?.me.duel;

describe('duel views', () => {
  it('no answer of a duel question reaches the stage or phones before it closes', () => {
    let s = toDuelQuestion();
    s = must(answerDuel(s, 'p2', 'Львів', T1 + 1000));
    for (const json of [JSON.stringify(stageView(s)), JSON.stringify(playerView(s, 'p1')), JSON.stringify(playerView(s, 'p3'))]) {
      expect(json).toContain('Столиця Франції?');
      expect(json).not.toContain('Париж');
      for (const other of ['Столиця Італії?', 'Столиця Польщі?', 'Символ Fe — це…', 'Рим', 'Залізо']) expect(json).not.toContain(other);
    }
    expect(JSON.stringify(playerView(s, 'p2'))).not.toContain('Париж');
    expect(stageView(s).duel).toMatchObject({ accepted: null, questionWinner: null, winningAnswer: null });

    s = win(s, 'p1', T1 + 2000);
    expect(stageView(s).duel).toMatchObject({ stage: 'answer', accepted: ['Париж'], winningAnswer: 'Париж', questionWinner: olya });
    expect(playerView(s, 'p3')?.duel?.accepted).toEqual(['Париж']);
  });

  it('the host sees the accepted answers and every try', () => {
    let s = toDuelQuestion();
    expect(hostView(s).duel).toMatchObject({ accepted: ['Париж'], tryTexts: { challenger: [], opponent: [] } });
    s = must(answerDuel(s, 'p2', 'Львів', T1 + 1000));
    expect(hostView(s).duel).toMatchObject({ accepted: ['Париж'], tryTexts: { challenger: [], opponent: ['Львів'] } });
    expect(stageView(s).duel).not.toHaveProperty('tryTexts');
  });

  it('the duelist sees own tries, the others only counts', () => {
    let s = toDuelQuestion();
    s = must(answerDuel(s, 'p2', 'Львів', T1 + 1000));
    expect(duelOf(s, 'p2')).toMatchObject({ tries: ['Львів'], canAnswer: true, canPick: false });
    expect(duelOf(s, 'p1')).toMatchObject({ tries: [], canAnswer: true });
    expect(duelOf(s, 'p3')).toMatchObject({ tries: [], canAnswer: false });
    expect(JSON.stringify(playerView(s, 'p3'))).not.toContain('Львів');
    expect(JSON.stringify(playerView(s, 'p1'))).not.toContain('Львів');
    expect(JSON.stringify(stageView(s))).not.toContain('Львів');
    expect(stageView(s).duel?.tries).toEqual({ challenger: 0, opponent: 1 });

    const paused = must(pause(s, T1 + 2000));
    expect(duelOf(paused, 'p2')?.canAnswer).toBe(false);

    const won = win(s, 'p1', T1 + 3000);
    expect(duelOf(won, 'p2')).toMatchObject({ tries: ['Львів'], canAnswer: false });
  });

  it('the duel button: hidden before a third and after the own duel, disabled while another is declared', () => {
    const early = must(next(answerAll(startRound(lobbyWith(duelQuiz(), 'Оля', 'Петро', 'Іра'), T0, rng0), T0 + 1000), T0 + 1000));
    expect(early.phase).toBe('reveal');
    expect(duelOf(early, 'p1')).toMatchObject({ rights: null, tries: [], canAnswer: false, canPick: false });

    const open = toDeclarable();
    expect(duelOf(open, 'p1')?.rights).toEqual({ canDeclare: true, opponents: [petro, ira] });
    expect(duelOf(open, 'p3')?.rights).toEqual({ canDeclare: true, opponents: [olya, petro] });
    expect(stageView(open).duel).toBeNull();

    const declared = must(declareDuel(open, 'p1', 'p2'));
    expect(duelOf(declared, 'p1')?.rights).toBeNull();
    expect(duelOf(declared, 'p3')?.rights?.canDeclare).toBe(false);
    expect(stageView(declared).duel).toMatchObject({
      stage: 'declared',
      challenger: olya,
      opponent: petro,
      number: 0,
      total: 2,
      category: null,
      question: null,
      accepted: null,
    });
    expect(duelOf(must(pause(open, T0 + 3500)), 'p1')?.rights?.canDeclare).toBe(false);

    const plain = startRound(lobbyWith(withoutDuels(duelQuiz()), 'Оля', 'Петро'), T0, rng0);
    expect(duelOf(plain, 'p1')).toBeNull();
    expect(stageView(plain).duel).toBeNull();
    expect(hostView(plain).duel).toBeNull();

    let s = open;
    for (let guard = 0; guard < 30 && !(s.phase === 'intro' && s.roundIndex === 2); guard++) {
      s = s.phase === 'question' ? must(lock(s)) : must(next(s, T0 + 5000, rng0));
    }
    expect(s).toMatchObject({ phase: 'intro', roundIndex: 2 });
    expect(duelOf(s, 'p1')?.rights).toBeNull();
  });

  it('the duel clock lives in the base view', () => {
    const s = toDuelQuestion();
    expect(stageView(s)).toMatchObject({ phase: 'duel', endsAt: T1 + 20_000, limitMs: 20_000, question: null, board: null, blitz: null, spotlight: null });
    expect(playerView(s, 'p1')).toMatchObject({ endsAt: T1 + 20_000, limitMs: 20_000, question: null });

    const paused = must(pause(s, T1 + 5000));
    expect(stageView(paused)).toMatchObject({ remainingMs: 15_000, limitMs: 20_000 });

    const answered = win(s, 'p1', T1 + 1000);
    expect(stageView(answered)).toMatchObject({ limitMs: null, endsAt: null });
  });

  it('the challenger picks; categories count what is left', () => {
    const category = must(next(must(declareDuel(toDeclarable(), 'p1', 'p2')), T0 + 4000, rng0));
    expect(category.duel?.stage).toBe('category');
    expect(duelOf(category, 'p1')?.canPick).toBe(true);
    expect(duelOf(category, 'p2')?.canPick).toBe(false);
    expect(duelOf(category, 'p3')?.canPick).toBe(false);
    // Сервер на паузі відмовляє у виборі: телефон не пропонує кнопок категорій.
    expect(duelOf(must(pause(category, T0 + 4500)), 'p1')?.canPick).toBe(false);
    expect(stageView(category).duel?.categories).toEqual([
      { id: 'dc1', title: 'Столиці', left: 3 },
      { id: 'dc2', title: 'Хімія', left: 3 },
    ]);

    let s = toDuelQuestion();
    expect(stageView(s).duel).toMatchObject({ category: 'Столиці', number: 1, total: 2, question: 'Столиця Франції?' });
    s = must(next(win(s, 'p1', T1 + 1000), T1 + 2000, rng0));
    expect(stageView(s).duel).toMatchObject({ number: 2, question: 'Столиця Італії?' });
    s = must(next(win(s, 'p1', T1 + 3000), T1 + 4000, rng0));
    expect(stageView(s).duel?.categories).toEqual([
      { id: 'dc1', title: 'Столиці', left: 1 },
      { id: 'dc2', title: 'Хімія', left: 3 },
    ]);
  });

  it('the result shows the winner, the stake and the ending flag', () => {
    let s = toDuelQuestion();
    s = win(s, 'p1', T1 + 1000);
    expect(stageView(s).duel?.ending).toBe(false);
    s = win(must(next(s, T1 + 2000, rng0)), 'p1', T1 + 3000);
    expect(stageView(s).duel).toMatchObject({ ending: true, wins: { challenger: 2, opponent: 0 } });
    s = must(next(s, T1 + 4000, rng0));
    expect(stageView(s).duel).toMatchObject({
      stage: 'result',
      winner: olya,
      wins: { challenger: 2, opponent: 0 },
      stake: 300,
      number: 2,
      question: null,
      accepted: null,
      ending: false,
    });

    let tie = toDuelQuestion();
    tie = must(next(win(tie, 'p1', T1 + 1000), T1 + 2000, rng0));
    tie = must(next(win(tie, 'p2', T1 + 3000), T1 + 4000, rng0));
    expect(stageView(tie).duel).toMatchObject({ stage: 'result', winner: null, wins: { challenger: 1, opponent: 1 } });
  });
});

describe('duel bet views (39)', () => {
  const taras = { playerId: 'p4', nickname: 'Тарас' };

  /** Оля p1, Петро p2, Іра p3, Тарас p4; Оля оголосила дуель Петрові; Іра — на Олю, Тарас — на Петра. */
  function betted(patch: Partial<Duels> = {}): GameState {
    let s = must(declareDuel(toDeclarableWith(['Оля', 'Петро', 'Іра', 'Тарас'], patch), 'p1', 'p2'));
    if (patch.betStake === 0) return s;
    s = must(betDuel(s, 'p3', 'challenger'));
    return must(betDuel(s, 'p4', 'opponent'));
  }
  const roles = (s: GameState) => [stageView(s).duel?.bets, hostView(s).duel?.bets, playerView(s, 'p1')?.duel?.bets, playerView(s, 'p3')?.duel?.bets];

  it('everyone sees who bet on whom', () => {
    const open = { stake: 100, open: true, challenger: [ira], opponent: [taras] };
    let s = betted();
    expect(roles(s)).toEqual([open, open, open, open]);
    s = must(next(s, T0 + 4000, rng0));
    expect(s.duel?.stage).toBe('category');
    expect(roles(s)).toEqual([open, open, open, open]);
    s = must(pickDuelCategory(s, 'p1', 'dc1', T1, rng0));
    const closed = { ...open, open: false };
    expect(roles(s)).toEqual([closed, closed, closed, closed]);
    for (let t = T1 + 1000; s.duel?.stage !== 'result'; t += 2000) s = must(next(win(s, 'p1', t), t + 1000, rng0));
    expect(s.duel?.stage).toBe('result');
    expect(roles(s)).toEqual([closed, closed, closed, closed]);
  });

  it('the phone knows its own bet', () => {
    const s = betted();
    expect(duelOf(s, 'p3')?.bet).toEqual({ side: 'challenger', can: true });
    expect(duelOf(s, 'p4')?.bet).toEqual({ side: 'opponent', can: true });
    expect(duelOf(must(pause(s, T0 + 3500)), 'p3')?.bet).toEqual({ side: 'challenger', can: false });
    const question = must(pickDuelCategory(must(next(s, T0 + 4000, rng0)), 'p1', 'dc1', T1, rng0));
    expect(duelOf(question, 'p3')?.bet).toEqual({ side: 'challenger', can: false });
    expect(duelOf(s, 'p1')?.bet).toBeNull();
    expect(duelOf(s, 'p2')?.bet).toBeNull();

    const off = betted({ betStake: 0 });
    expect(roles(off)).toEqual([null, null, null, null]);
    expect(['p1', 'p2', 'p3', 'p4'].map((id) => duelOf(off, id)?.bet)).toEqual([null, null, null, null]);
    expect(duelOf(toDeclarableWith(['Оля', 'Петро', 'Іра', 'Тарас']), 'p3')?.bet).toBeNull();
  });

  it('teams: the captain of another team bets, its members see the team bet, the duelling teams do not bet', () => {
    const teamsQuiz = (count: number): Quiz => ({ ...duelQuiz(), settings: { ...duelQuiz().settings, teams: defaultTeams(count) } });
    const teamDeclared = (count: number, layout: string[][]) => {
      let s = revealOf(must(next(teamGame(teamsQuiz(count), layout), T0, rng0)), T0 + 1000);
      s = must(next(s, T0 + 2000, rng0));
      s = revealOf(s, T0 + 3000);
      return must(declareDuel(s, 't1', 't2'));
    };
    // t1: Оля m1, Петро m2; t2: Іра m3; t3: Тарас m4 (капітан), Ганна m5.
    const s = teamDeclared(3, [['Оля', 'Петро'], ['Іра'], ['Тарас', 'Ганна']]);
    expect(duelOf(s, 'm4')?.bet).toEqual({ side: null, can: true });
    expect(duelOf(s, 'm5')?.bet).toEqual({ side: null, can: false });
    const bet = must(betDuel(s, 't3', 'opponent'));
    expect(duelOf(bet, 'm4')?.bet).toEqual({ side: 'opponent', can: true });
    expect(duelOf(bet, 'm5')?.bet).toEqual({ side: 'opponent', can: false });
    expect(['m1', 'm2', 'm3'].map((id) => duelOf(bet, id)?.bet)).toEqual([null, null, null]);
    expect(stageView(bet).duel?.bets).toMatchObject({ stake: 100, open: true, challenger: [], opponent: [{ playerId: 't3' }] });
    // Новенький у команді 3 бачить ставку команди без кнопок.
    const teams = bet.teams!;
    const joined: GameState = { ...bet, teams: { ...teams, members: [...teams.members, { id: 'm6', nickname: 'Марко', connected: true, teamId: 't3' }] } };
    expect(duelOf(joined, 'm6')?.bet).toEqual({ side: 'opponent', can: false });

    const two = teamDeclared(2, [['Оля'], ['Петро']]);
    expect(stageView(two).duel?.bets).toBeNull();
    expect(['m1', 'm2'].map((id) => duelOf(two, id)?.bet)).toEqual([null, null]);
  });
});
