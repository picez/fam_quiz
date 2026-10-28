import { describe, expect, it } from 'vitest';
import { SPLASH_MS, type Quiz, type QuizSettings } from '@quiz/shared';
import { takeBuff, type BuffPlay } from './buffs';
import { chooserOf } from './board-turns';
import { adjustScore } from './adjust';
import { undoScore } from './undo';
import { buyDebuff, setDebuff } from './debuffs';
import { placeWager } from './final';
import { createAutopilotGame } from './autopilot';
import { awayEnd, awayStart, awayStep } from './away';
import { castAppealVote, openAppeal } from './appeal';
import {
  addPlayer,
  end,
  lock,
  next,
  pause,
  removePlayer,
  resume,
  setConnected,
  start,
  submitAnswer,
  tick,
  type AnswerRecord,
  type Appeal,
  type Attempt,
  type AwayEntry,
  type BlitzPlay,
  type BluffLie,
  type BluffOption,
  type BluffPick,
  type BluffPlay,
  type BoardPlay,
  type BoardState,
  type BuzzEntry,
  type ChainProgress,
  type DebuffState,
  type DiceState,
  type DuelQuestionPlay,
  type DuelState,
  type FinalPlay,
  type FinalState,
  type GameState,
  type LadderLifelines,
  type LadderOutcome,
  type LadderPlay,
  type LadderState,
  type Play,
  type PlayerState,
  type ScoreAdjustment,
  type SortProgress,
  type GhostAnswer,
  type SurveyPlay,
  type SurvivalPlay,
  type SurvivalTrial,
  type TeamMember,
  type TeamsState,
  type TrialAnswer,
  type AutopilotState,
  type WallProgress,
  type WipeoutPlay,
} from './game';
import { stamp } from './pacing';
import { GAME_STATE_VERSION, READABLE_STATE_VERSIONS, suspend } from './restore';
import { openClue } from './clues';
import { sortMarks, sortOf, sortWord } from './sort';
import type { Splash } from './splash';
import { writeLie } from './bluff';
import { T0, buffQuiz, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
import { toDuelQuestion } from './testing/duel';
import {
  blitzRound,
  bluff,
  classicRound,
  clues,
  finalRound,
  LADDER_RIGHT,
  ladderRound,
  makeQuiz,
  makeRoundsQuiz,
  pin,
  single,
  slider,
  sortQ,
  survey,
  surveyCloud,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  text,
  wall,
  wipeoutLadder,
  wipeoutRound,
  withAudio,
  withId,
  withReveal,
} from './testing/fixtures';
import { acceptAll, lobbyWith, lobbyWithSplash, must, openAt, sendBlitz } from './testing/helpers';
import { head, right, toSort, wrong } from './testing/sort';
import { hostView, playerView, stageView } from './views';
import { guessWall } from './wall';
import { pickDoor } from './survival';
import { decideWipeout, wipeoutChoiceOf, wipeoutPlayOf } from './wipeout';
import { decideLadder, pickContestant, useLifeline } from './ladder';
import { rollTeamDie, setCaptain, setTeamForm, startTeamDice } from './teams';
import { actAnswer, actBuzz } from './team-act';
import { teamGame, teamLobby, teamQuiz } from './testing/teams';

const HOUR = 3_600_000;
const kyiv = { type: 'single', optionId: 'b' } as const;
const roundTrip = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;

describe('suspend after a restart', () => {
  it('pauses a running question at the moment it was saved, so the downtime costs nobody time', () => {
    const answered = must(submitAnswer(toBuffQuestion(), 'p2', kyiv, T0 + 3000));
    const s = suspend(answered, T0 + 5000);
    expect(s.paused).toBe(true);
    expect(s.pausedAt).toBe(T0 + 5000);
    expect(s.remainingMs).toBe(15_000);
    expect(s.players.every((p) => !p.connected)).toBe(true);
    // відповідь Петра й бали ті самі
    expect(s.plays[0]).toEqual(answered.plays[0]);
    expect(s.players.map((p) => p.score)).toEqual(answered.players.map((p) => p.score));
    // година простою: після «Продовжити» лишається ті самі 15 с
    const resumed = must(resume(s, T0 + 5000 + HOUR));
    expect(resumed.endsAt).toBe(T0 + 5000 + HOUR + 15_000);
    expect(submitAnswer(resumed, 'p1', kyiv, T0 + HOUR + 19_000).ok).toBe(true);
  });

  it('a deadline that passed before the save is applied first', () => {
    const s = suspend(toBuffQuestion(), T0 + 20_001);
    expect(s.phase).toBe('locked');
    expect(s.paused).toBe(true);
  });

  it('a vote clock and extra time move with the pause', () => {
    // зал голосує серед тих, хто вже відповів: Петро
    const voted = must(submitAnswer(toOthersQuestion(), 'p2', kyiv, T0 + 1000));
    const asked = must(takeBuff(voted, 'p1', 'audience', T0 + 5000, () => 0));
    const resumed = must(resume(suspend(asked, T0 + 6000), T0 + 6000 + HOUR));
    expect(resumed.plays[0].buffs?.p1.vote?.endsAt).toBe(asked.plays[0].buffs!.p1.vote!.endsAt! + HOUR);
  });

  it('a splash that was playing finishes after the pause, and the timer starts after it', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')])]);
    const open = openAt(lobbyWithSplash(quiz, 'Анна', 'Богдан'), T0);
    expect(open.splash?.until).toBe(T0 + SPLASH_MS.question);
    // збереження посеред заставки: решта заставки й увесь час запитання ще попереду
    const resumed = must(resume(suspend(open, T0 + 500), T0 + 500 + HOUR));
    expect(resumed.splash?.until).toBe(T0 + SPLASH_MS.question + HOUR);
    expect(resumed.startedAt).toBe(T0 + SPLASH_MS.question + HOUR);
    expect(resumed.endsAt).toBe(T0 + SPLASH_MS.question + 20_000 + HOUR);
  });

  it('keeps a state that was already paused as it was, apart from the connections', () => {
    const paused = must(pause(toBuffQuestion(), T0 + 4000));
    const s = suspend(paused, T0 + 9000);
    expect(s.pausedAt).toBe(T0 + 4000);
    expect(s.remainingMs).toBe(16_000);
    expect({ ...s, players: paused.players, awaiting: paused.awaiting }).toEqual(paused);
    expect(s.players.every((p) => !p.connected)).toBe(true);
    // «Продовжити» через годину: ті самі 16 с
    expect(must(resume(s, T0 + 9000 + HOUR)).endsAt).toBe(T0 + 9000 + HOUR + 16_000);
  });

  it('leaves the lobby and the finished game unpaused', () => {
    const lobby = lobbyWith(makeQuiz([single]), 'Оля', 'Петро');
    const s = suspend(lobby, T0);
    expect(s.paused).toBe(false);
    expect(s.players.map((p) => p.connected)).toEqual([false, false]);
    const finished = suspend(must(end(toBuffQuestion(), T0 + 1000)), T0 + 2000);
    expect(finished.phase).toBe('finished');
    expect(finished.paused).toBe(false);
    expect(finished.players.every((p) => !p.connected)).toBe(true);
  });

  it('a bluff in the lies survives suspend: the lie deadline that passed before saving starts the choice', () => {
    let open = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [bluff])]), 'Оля', 'Петро'), T0, () => 0);
    open = must(writeLie(open, 'p1', 'Рим', T0 + 1000));
    const endsAt = open.endsAt!;
    const s = suspend(open, endsAt + 1);
    expect(s.phase).toBe('question');
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(s.paused).toBe(true);
    expect(s.remainingMs).toBe(30_000);
    expect(roundTrip(s)).toEqual(s);
    // година простою: вибір має повні 30 с від «Продовжити»
    expect(must(resume(s, endsAt + 1 + HOUR)).endsAt).toBe(endsAt + 1 + HOUR + 30_000);
  });

  it('pauses a board cell and a duel too', () => {
    expect(suspend(toBuffCell(), T0 + 1000).paused).toBe(true);
    const duel = suspend(toDuelQuestion(), T0 + 61_000);
    expect(duel.paused).toBe(true);
    expect(duel.remainingMs).toBe(19_000);
    // година простою: дуель продовжується з тими самими 19 с
    expect(must(resume(duel, T0 + 61_000 + HOUR)).endsAt).toBe(T0 + 61_000 + HOUR + 19_000);
  });

  it('a board turn does not skip the absent chooser: the 30 seconds start afresh after «Продовжити»', () => {
    // Оля відповідає на клітинку, розкриття — і знову вибір; Оля поза зв'язком після перезапуску
    const answered = must(submitAnswer(toBuffCell(), 'p1', kyiv, T0 + 1000));
    let board = must(lock(answered));
    while (board.phase !== 'board') board = must(next(board, T0 + 2000));
    const s = suspend(board, T0 + 3000);
    expect(s.paused).toBe(true);
    expect(s.board?.awaySince ?? null).toBeNull();
    const back = T0 + 3000 + HOUR;
    const resumed = must(resume(s, back));
    expect(resumed.phase).toBe('board');
    const chooser = chooserOf(resumed);
    // хто ще не повернувся — отримує повні 30 с від «Продовжити», а не від миті збереження
    expect(resumed.board?.awaySince).toBe(back);
    expect(chooserOf(tick(resumed, back + 29_000))).toBe(chooser);
    expect(chooserOf(tick(resumed, back + 30_000))).not.toBe(chooser);
    // повернувся — відлік знято
    expect(must(setConnected(resumed, chooser!, true, back)).board?.awaySince).toBeNull();
  });
});

describe('the players taken offline by a restart are still expected', () => {
  const back = T0 + 5000 + HOUR;
  /** q1: Петро відповів о T0 + 3000, кімнату збережено о T0 + 5000; після простою повернувся лише Петро. */
  const onlyPetroBack = () => {
    const answered = must(submitAnswer(toBuffQuestion(), 'p2', kyiv, T0 + 3000));
    return must(setConnected(suspend(answered, T0 + 5000), 'p2', true, back - 1000));
  };

  it('suspend marks exactly the players it takes offline as awaited', () => {
    const answered = must(submitAnswer(toBuffQuestion(), 'p2', kyiv, T0 + 3000));
    const iraGone = must(setConnected(answered, 'p3', false, T0 + 4000));
    expect(suspend(iraGone, T0 + 5000).awaiting).toEqual(['p1', 'p2']);
    expect(toBuffQuestion().awaiting).toEqual([]);
  });

  it('«Продовжити» with only an answered player back does not close the question', () => {
    const resumed = must(resume(onlyPetroBack(), back));
    expect(resumed.phase).toBe('question');
    expect(resumed.awaiting).toEqual(['p1', 'p3']);
    // Оля й Іра повертаються й відповідають — і лише тоді запитання закривається
    let s = must(setConnected(resumed, 'p1', true, back + 1000));
    s = must(submitAnswer(s, 'p1', kyiv, back + 2000));
    expect(s.phase).toBe('question');
    s = must(setConnected(s, 'p3', true, back + 3000));
    expect(s.awaiting).toEqual([]);
    expect(must(submitAnswer(s, 'p3', kyiv, back + 4000)).phase).toBe('locked');
  });

  it('the timer still closes the question for those who never came back', () => {
    const resumed = must(resume(onlyPetroBack(), back));
    expect(tick(resumed, back + 14_999).phase).toBe('question');
    expect(tick(resumed, back + 15_000).phase).toBe('locked');
  });

  it('a normal disconnect after coming back is not awaited any more', () => {
    let s = must(resume(onlyPetroBack(), back));
    s = must(setConnected(s, 'p1', true, back + 1000));
    s = must(setConnected(s, 'p1', false, back + 2000));
    s = must(setConnected(s, 'p3', true, back + 3000));
    // Оля пішла сама: як і без перезапуску, чекаємо лише підключених
    expect(must(submitAnswer(s, 'p3', kyiv, back + 4000)).phase).toBe('locked');
  });

  it('kicking an awaited player stops waiting for them', () => {
    let s = must(resume(onlyPetroBack(), back));
    s = must(removePlayer(s, 'p3'));
    expect(s.awaiting).toEqual(['p1']);
    s = must(removePlayer(s, 'p1'));
    expect(s.awaiting).toEqual([]);
    expect(s.phase).toBe('locked');
  });
});

/** Ключі типу T через кому, відсортовані; `exact` має тип true лише тоді, коли перелік містить рівно всі ключі T. */
const keysOf =
  <T>() =>
  <K extends keyof T & string>(list: readonly K[], exact: [Exclude<keyof T, K>] extends [never] ? true : false): string =>
    exact ? [...list].sort().join(',') : '';

/** Форма збереженого стану: кожен тип, що входить у GameState, з усіма його ключами (обов'язковими й необов'язковими). */
const STATE_SHAPE: Record<string, string> = {
  GameState: keysOf<GameState>()(
    [
      'quiz', 'phase', 'roundIndex', 'questionIndex', 'players', 'plays', 'presented', 'startedAt', 'endsAt', 'paused', 'remainingMs',
      'pausedAt', 'board', 'heldAt', 'final', 'adjustments', 'adjustmentSeq', 'buffSeq', 'debuffs', 'duel', 'duelsDeclared', 'duelUsed',
      'sparesUsed', 'transitions', 'splash', 'guidePage', 'awaiting', 'ladder', 'teams', 'stepAt', 'autopilot', 'appeals',
    ],
    true,
  ),
  Quiz: keysOf<Quiz>()(['title', 'description', 'settings', 'rounds', 'duels', 'spares'], true),
  QuizSettings: keysOf<QuizSettings>()(['leaderboard', 'debuffs', 'buffs', 'newcomers', 'debuffPrices', 'debuffShop', 'teams', 'awayPenalty'], true),
  PlayerState: keysOf<PlayerState>()(['id', 'nickname', 'connected', 'score', 'totalTimeMs', 'streak'], true),
  Play: keysOf<Play>()(['roundIndex', 'question', 'answers', 'blitz', 'extraMs', 'board', 'final', 'chain', 'sort', 'buffs', 'overtime', 'clues', 'wall', 'cloudHidden', 'survey', 'bluff', 'wipeout', 'survival', 'ladder', 'buzzers', 'clueOpens', 'away'], true),
  AnswerRecord: keysOf<AnswerRecord>()(
    ['answer', 'timeMs', 'accepted', 'accuracy', 'grade', 'basePoints', 'streakBonus', 'points', 'overridden', 'buff', 'spare'],
    true,
  ),
  BoardState: keysOf<BoardState>()(['circle', 'done', 'circleNo', 'dice', 'awaySince'], true),
  DiceState: keysOf<DiceState>()(['throws', 'tour', 'waiting', 'tourNo'], true),
  BoardPlay: keysOf<BoardPlay>()(['cellId', 'chooserId', 'price', 'multiplier', 'kind', 'answerMode', 'penalty', 'answer', 'named'], true),
  BlitzPlay: keysOf<BlitzPlay>()(['queue', 'attempts', 'buzzed', 'dropped'], true),
  BuzzEntry: keysOf<BuzzEntry>()(['playerId', 'at', 'timeMs', 'deadline', 'answer'], true),
  Attempt: keysOf<Attempt>()(['playerId', 'answer', 'timeMs', 'grade', 'points'], true),
  FinalState: keysOf<FinalState>()(['limits', 'wagers', 'allIn', 'order', 'shown', 'split'], true),
  FinalPlay: keysOf<FinalPlay>()(['wagers', 'allIn', 'graded'], true),
  SortProgress: keysOf<SortProgress>()(['queue', 'sorted', 'misses', 'lockedUntil', 'missed', 'wordMisses', 'missedInto'], true),
  WallProgress: keysOf<WallProgress>()(['found', 'mistakes', 'tried'], true),
  SurveyPlay: keysOf<SurveyPlay>()(['source', 'shown'], true),
  BluffPlay: keysOf<BluffPlay>()(['stage', 'seed', 'lies', 'options', 'picks', 'shown'], true),
  WipeoutPlay: keysOf<WipeoutPlay>()(['took', 'stay', 'end', 'auto'], true),
  SurvivalPlay: keysOf<SurvivalPlay>()(['ghosts', 'edge', 'trial', 'end'], true),
  GhostAnswer: keysOf<GhostAnswer>()(['answer', 'correct', 'timeMs'], true),
  SurvivalTrial: keysOf<SurvivalTrial>()(
    ['kind', 'fellBack', 'stage', 'questionId', 'presented', 'answers', 'traps', 'doors', 'fallback', 'out'],
    true,
  ),
  TrialAnswer: keysOf<TrialAnswer>()(['answer', 'correct', 'timeMs', 'overridden'], true),
  LadderState: keysOf<LadderState>()(['contestantId', 'drawn'], true),
  TeamsState: keysOf<TeamsState>()(['form', 'list', 'members', 'captains', 'dice', 'duelists'], true),
  TeamMember: keysOf<TeamMember>()(['id', 'nickname', 'connected', 'teamId'], true),
  LadderPlay: keysOf<LadderPlay>()(['contestantId', 'step', 'level', 'timed', 'lifelines', 'decision', 'outcome'], true),
  LadderLifelines: keysOf<LadderLifelines>()(['fifty', 'audience', 'hint'], true),
  LadderOutcome: keysOf<LadderOutcome>()(['kind', 'passed', 'points'], true),
  BluffLie: keysOf<BluffLie>()(['text', 'at'], true),
  BluffPick: keysOf<BluffPick>()(['optionId', 'timeMs'], true),
  BluffOption: keysOf<BluffOption>()(['id', 'text', 'kind', 'authors', 'removed'], true),
  ChainProgress: keysOf<ChainProgress>()(['solved', 'shown', 'hints'], true),
  BuffPlay: keysOf<BuffPlay>()(['kind', 'seq', 'at', 'removed', 'retry', 'first', 'vote', 'hint', 'spare'], true),
  DebuffState: keysOf<DebuffState>()(['kind', 'firedAt', 'since', 'by'], true),
  DuelState: keysOf<DuelState>()(['challengerId', 'opponentId', 'stage', 'returnPhase', 'categoryId', 'total', 'questions', 'winnerId'], true),
  DuelQuestionPlay: keysOf<DuelQuestionPlay>()(['questionId', 'tries', 'winnerId', 'answer', 'timeMs'], true),
  ScoreAdjustment: keysOf<ScoreAdjustment>()(['seq', 'playerId', 'points', 'roundIndex', 'afterQuestion', 'source', 'at', 'target', 'debuff', 'undoes', 'batch'], true),
  Splash: keysOf<Splash>()(['kind', 'at', 'until'], true),
  AwayEntry: keysOf<AwayEntry>()(['ms', 'count', 'since'], true),
  AutopilotState: keysOf<AutopilotState>()(['authorId', 'at', 'left', 'hold', 'starting', 'skips', 'skipPlays', 'retries'], true),
  Appeal: keysOf<Appeal>()(['id', 'by', 'questionIndex', 'reason', 'openedAt', 'endsAt', 'votes', 'outcome', 'adjustmentSeq'], true),
};

/** Записана форма кожної версії; запис старої версії не змінюють. */
const KEYS: Record<number, Record<string, string>> = {
  1: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,board,buffs,chain,extraMs,final,overtime,question,roundIndex,sort',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,playerId,points,roundIndex,seq,source',
    Splash: 'at,kind,until',
  },
  2: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,board,buffs,chain,extraMs,final,overtime,question,roundIndex,sort',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  3: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,board,buffs,chain,clues,extraMs,final,overtime,question,roundIndex,sort',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  4: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,wall',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    WallProgress: 'found,mistakes,tried',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  5: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,survey,wall',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  6: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,survey,wall',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  7: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,survey,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'end,stay,took',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  8: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  9: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,chain,cloudHidden,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  10: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  11: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,stepAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,misses,queue,sorted',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  12: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,stepAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,missedInto,misses,queue,sorted,wordMisses',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  13: {
    GameState: 'adjustmentSeq,adjustments,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,stepAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,missedInto,misses,queue,sorted,wordMisses',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'auto,end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
  },
  14: {
    GameState: 'adjustmentSeq,adjustments,autopilot,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,stepAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,missedInto,misses,queue,sorted,wordMisses',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'auto,end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,debuff,playerId,points,roundIndex,seq,source,target',
    Splash: 'at,kind,until',
    AutopilotState: 'at,authorId,hold,left,retries,skipPlays,skips,starting',
  },
  15: {
    GameState: 'adjustmentSeq,adjustments,autopilot,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,stepAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,missedInto,misses,queue,sorted,wordMisses',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'auto,end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,batch,debuff,playerId,points,roundIndex,seq,source,target,undoes',
    Splash: 'at,kind,until',
    AutopilotState: 'at,authorId,hold,left,retries,skipPlays,skips,starting',
  },
  16: {
    GameState: 'adjustmentSeq,adjustments,autopilot,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,stepAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clueOpens,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,missedInto,misses,queue,sorted,wordMisses',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'auto,end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,batch,debuff,playerId,points,roundIndex,seq,source,target,undoes',
    Splash: 'at,kind,until',
    AutopilotState: 'at,authorId,hold,left,retries,skipPlays,skips,starting',
  },
  17: {
    GameState: 'adjustmentSeq,adjustments,autopilot,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,stepAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'awayPenalty,buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,away,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clueOpens,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,missedInto,misses,queue,sorted,wordMisses',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'auto,end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,batch,debuff,playerId,points,roundIndex,seq,source,target,undoes',
    Splash: 'at,kind,until',
    AwayEntry: 'count,ms,since',
    AutopilotState: 'at,authorId,hold,left,retries,skipPlays,skips,starting',
  },
  18: {
    GameState: 'adjustmentSeq,adjustments,appeals,autopilot,awaiting,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,ladder,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,stepAt,teams,transitions',
    Quiz: 'description,duels,rounds,settings,spares,title',
    QuizSettings: 'awayPenalty,buffs,debuffPrices,debuffShop,debuffs,leaderboard,newcomers,teams',
    PlayerState: 'connected,id,nickname,score,streak,totalTimeMs',
    Play: 'answers,away,blitz,bluff,board,buffs,buzzers,chain,cloudHidden,clueOpens,clues,extraMs,final,ladder,overtime,question,roundIndex,sort,survey,survival,wall,wipeout',
    AnswerRecord: 'accepted,accuracy,answer,basePoints,buff,grade,overridden,points,spare,streakBonus,timeMs',
    BoardState: 'awaySince,circle,circleNo,dice,done',
    DiceState: 'throws,tour,tourNo,waiting',
    BoardPlay: 'answer,answerMode,cellId,chooserId,kind,multiplier,named,penalty,price',
    BlitzPlay: 'attempts,buzzed,dropped,queue',
    BuzzEntry: 'answer,at,deadline,playerId,timeMs',
    Attempt: 'answer,grade,playerId,points,timeMs',
    FinalState: 'allIn,limits,order,shown,split,wagers',
    FinalPlay: 'allIn,graded,wagers',
    SortProgress: 'lockedUntil,missed,missedInto,misses,queue,sorted,wordMisses',
    WallProgress: 'found,mistakes,tried',
    SurveyPlay: 'shown,source',
    BluffPlay: 'lies,options,picks,seed,shown,stage',
    WipeoutPlay: 'auto,end,stay,took',
    SurvivalPlay: 'edge,end,ghosts,trial',
    GhostAnswer: 'answer,correct,timeMs',
    SurvivalTrial: 'answers,doors,fallback,fellBack,kind,out,presented,questionId,stage,traps',
    TrialAnswer: 'answer,correct,overridden,timeMs',
    LadderState: 'contestantId,drawn',
    LadderPlay: 'contestantId,decision,level,lifelines,outcome,step,timed',
    LadderLifelines: 'audience,fifty,hint',
    LadderOutcome: 'kind,passed,points',
    TeamsState: 'captains,dice,duelists,form,list,members',
    TeamMember: 'connected,id,nickname,teamId',
    BluffLie: 'at,text',
    BluffPick: 'optionId,timeMs',
    BluffOption: 'authors,id,kind,removed,text',
    ChainProgress: 'hints,shown,solved',
    BuffPlay: 'at,first,hint,kind,removed,retry,seq,spare,vote',
    DebuffState: 'by,firedAt,kind,since',
    DuelState: 'categoryId,challengerId,opponentId,questions,returnPhase,stage,total,winnerId',
    DuelQuestionPlay: 'answer,questionId,timeMs,tries,winnerId',
    ScoreAdjustment: 'afterQuestion,at,batch,debuff,playerId,points,roundIndex,seq,source,target,undoes',
    Splash: 'at,kind,until',
    AwayEntry: 'count,ms,since',
    AutopilotState: 'at,authorId,hold,left,retries,skipPlays,skips,starting',
    Appeal: 'adjustmentSeq,by,endsAt,id,openedAt,outcome,questionIndex,reason,votes',
  },
};

/** 11g: автопілот (автор Оля p1, Петро p2) на розкритті класичного запитання. */
function pilotReveal(): GameState {
  let s = must(createAutopilotGame(makeRoundsQuiz([classicRound('r1', [single])]), { id: 'p1', nickname: 'Оля' }));
  s = must(addPlayer(s, { id: 'p2', nickname: 'Петро' }));
  s = must(next(must(start(s, T0)), T0, () => 0));
  s = must(next(must(lock(s)), T0 + 1000, () => 0));
  return s;
}

/** 11b: класика після «Почати гру» через stamp сервера — GameState.stepAt. */
function stamped(): GameState {
  const lobby = lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро');
  return stamp(lobby, must(start(lobby, T0)), T0);
}

/** 11e: «Ва-банк» на трьох — усі відповіли правильно, Оля «Далі», Петро «Забрати», Віра нічого; вікно закрив таймер. */
function wipeoutTimedOut(): GameState {
  let s = openAt(lobbyWith(makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder)]), 'Оля', 'Петро', 'Віра'), T0, () => 0);
  for (const id of ['p1', 'p2']) s = must(submitAnswer(s, id, kyiv, T0 + 1000));
  s = must(next(must(submitAnswer(s, 'p3', kyiv, T0 + 1000)), T0 + 2000, () => 0));
  s = must(decideWipeout(must(next(s, T0 + 2500, () => 0)), 'p1', false, T0 + 2600));
  s = must(decideWipeout(s, 'p2', true, T0 + 2700));
  return tick(s, s.endsAt ?? 0);
}

/** 12a: бали ведучого Олі на заставці першого раунду, потім скасовані ({ seq: 1 }). */
function undoneOnIntro(): GameState {
  const intro = must(start(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро')));
  return must(undoScore(must(adjustScore(intro, 'p1', 300, T0)), { seq: 1 }, T0 + 1000));
}

/**
 * 12f: класика t1 по 100, Оля й Петро «Одеська», Іра «Одеса»; Оля оскаржила, «так» Петра й Іри — закрита апеляція з adjustmentSeq;
 * Петро оскаржив, Іра проголосувала «ні» — відкрита апеляція з голосом.
 */
function appealed(): GameState {
  const t100 = { ...text, points: 100 };
  const odesa = { type: 'text', value: 'Одеса' } as const;
  const wrong = { type: 'text', value: 'Одеська' } as const;
  let s = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [t100], { speedBonus: false })]), 'Оля', 'Петро', 'Іра'), T0, () => 0);
  s = must(submitAnswer(must(submitAnswer(must(submitAnswer(s, 'p1', wrong, T0 + 1000)), 'p2', wrong, T0 + 1000)), 'p3', odesa, T0 + 1000));
  s = must(next(s, T0 + 2000, () => 0));
  s = must(castAppealVote(must(castAppealVote(must(openAppeal(s, 'p1', 'grade', T0 + 3000)), 'p2', 1, true, T0 + 4000)), 'p3', 1, true, T0 + 5000));
  return must(castAppealVote(must(openAppeal(s, 'p2', 'grade', T0 + 6000)), 'p3', 2, false, T0 + 7000));
}

/** Стани, де трапляються вкладені частини: класика з відповіддю, поле з «50/50», зал, дуель, заставка, дебаф, покупка дебафу, фінал, бліц (черга й спроба). */
function representative(): GameState[] {
  const fogged = must(setDebuff(must(start(lobbyWith(buffQuiz({ debuffs: ['fog'] }), 'Оля', 'Петро'))), 'p1', 'fog'));
  // покупка: коригування з ціллю й видом, дебаф з покупцем
  const bought = must(buyDebuff(must(adjustScore(must(start(lobbyWith(buffQuiz(), 'Оля', 'Петро'))), 'p1', 500, T0)), 'p1', 'p2', 'mud', T0));
  const finalQuiz = makeRoundsQuiz([finalRound('f', withId(single, 'f1'))]);
  let final = must(next(must(start(lobbyWith(finalQuiz, 'Оля', 'Петро'))), T0, () => 0));
  final = must(placeWager(final, 'p1', 0, T0 + 1000, () => 0));
  final = must(placeWager(final, 'p2', 0, T0 + 2000, () => 0));
  const buzzed = sendBlitz(openAt(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single])]), 'Оля', 'Петро'), T0), 'p1', kyiv, T0 + 1000);
  // 10b: повзунок з аудіо й картинка, що проявляється, — нові поля запитання й відповіді, ключі стану ті самі.
  const media = makeRoundsQuiz([classicRound('r1', [withAudio(slider), withReveal(text)])]);
  const slid = must(submitAnswer(openAt(lobbyWith(media, 'Оля', 'Петро'), T0), 'p1', { type: 'slider', value: 57 }, T0 + 1000));
  // 10c: «Хто я?» з відповіддю — Play.clues; точка — нові поля запитання й відповіді.
  const cluesQuiz = makeRoundsQuiz([classicRound('r1', [clues, pin])]);
  const clued = must(submitAnswer(tick(openAt(lobbyWith(cluesQuiz, 'Оля', 'Петро'), T0), T0 + 5000), 'p1', { type: 'clues', value: 'Шевченко' }, T0 + 6000));
  // 10d: стіна з поступом Олі (одна група й одна помилка) — Play.wall, WallProgress; сховане слово «хмари» — Play.cloudHidden.
  let walled = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [wall])]), 'Оля', 'Петро'), T0, () => 0);
  const tilesAt = (...ids: string[]) => ids.map((id) => walled.presented.indexOf(id));
  walled = must(guessWall(walled, 'p1', tilesAt('r1', 'r2', 'r3', 'r4'), T0 + 1000));
  walled = must(guessWall(walled, 'p1', tilesAt('m1', 'm2', 'm3', 'l1'), T0 + 2000));
  const hidden: GameState = { ...walled, plays: walled.plays.map((p) => ({ ...p, cloudHidden: ['лайка'] })) };
  // 10e: «100 до 1» з дошкою з хмари, два рядки відкрито — Play.survey, SurveyPlay; збудовані рядки — у question.rows.
  const surveyOpen = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [survey])]), 'Оля', 'Петро'), T0);
  const surveyed = must(submitAnswer(surveyOpen, 'p1', { type: 'survey', values: ['Яблуко'] }, T0 + 1000));
  const built = [
    { id: 'cloud-1', text: 'Каштани', popularity: 100, accepted: [] },
    { id: 'cloud-2', text: 'Дніпро', popularity: 50, accepted: [] },
  ];
  const fromCloud: GameState = {
    ...surveyed,
    plays: surveyed.plays.map((p) => ({ ...p, question: { ...surveyCloud, rows: built }, survey: { source: 'cloud' as const, shown: 2 } })),
  };
  // 10f: блеф у фазі вибору — вигадки, варіанти (один прибрано), вибір Олі — Play.bluff, BluffPlay, BluffLie, BluffOption, BluffPick.
  let bluffed = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [bluff])]), 'Оля', 'Петро'), T0, () => 0);
  bluffed = must(writeLie(bluffed, 'p1', 'Рим', T0 + 1000));
  bluffed = must(writeLie(bluffed, 'p2', 'Мілан', T0 + 2000));
  const chosen: GameState = {
    ...bluffed,
    plays: bluffed.plays.map((p) =>
      p.bluff === undefined
        ? p
        : {
            ...p,
            bluff: {
              ...p.bluff,
              options: p.bluff.options.map((o) => (o.text === 'Мілан' ? { ...o, removed: true } : o)),
              picks: { p1: { optionId: p.bluff.options.find((o) => o.kind === 'truth')!.id, timeMs: 1500 } },
            },
          },
    ),
  };
  // 10g: «Ва-банк» на розкритті другої сходинки — Play.wipeout (Петро забрав банк після першої, Оля пішла далі).
  let wiped = openAt(lobbyWith(makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder)]), 'Оля', 'Петро'), T0, () => 0);
  wiped = must(submitAnswer(wiped, 'p1', kyiv, T0 + 1000));
  wiped = must(next(must(submitAnswer(wiped, 'p2', kyiv, T0 + 1000)), T0 + 2000, () => 0));
  wiped = must(decideWipeout(must(next(wiped, T0 + 2500, () => 0)), 'p2', true, T0 + 2600));
  wiped = must(next(must(decideWipeout(wiped, 'p1', false, T0 + 2700)), T0 + 3000, () => 0));
  wiped = must(next(must(submitAnswer(wiped, 'p1', { type: 'boolean', value: true }, T0 + 4000)), T0 + 5000, () => 0));
  // 11e: вікно «Ва-банк» закрив таймер — Петро не вирішив і забрав за замовчуванням: WipeoutPlay.auto.
  const timedOut = wipeoutTimedOut();
  // 10h: «Вибування» на розкритті другого запитання — Play.survival: Віра вибула після першого й відповідає привидом.
  let survived = openAt(lobbyWith(makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials)]), 'Оля', 'Петро', 'Віра'), T0, () => 0);
  survived = must(submitAnswer(survived, 'p1', kyiv, T0 + 1000));
  survived = must(submitAnswer(survived, 'p2', kyiv, T0 + 1000));
  survived = must(next(must(lock(survived)), T0 + 2000, () => 0));
  survived = must(next(survived, T0 + 2500, () => 0));
  // закрите випробування після першого запитання (Віра не відповіла) — як його запише задача 3
  const out: SurvivalTrial = {
    kind: 'question',
    fellBack: false,
    stage: 'closed',
    questionId: 't1',
    presented: [],
    answers: { p3: { answer: { type: 'boolean', value: false }, correct: false, timeMs: 2000, overridden: false } },
    traps: {},
    doors: {},
    fallback: {},
    out: ['p3'],
  };
  survived = { ...survived, plays: survived.plays.map((p) => (p.survival === undefined ? p : { ...p, survival: { ...p.survival, trial: out } })) };
  survived = must(next(survived, T0 + 3000, () => 0));
  survived = must(submitAnswer(survived, 'p3', { type: 'boolean', value: true }, T0 + 3500));
  survived = must(submitAnswer(survived, 'p1', { type: 'boolean', value: true }, T0 + 4000));
  survived = must(next(must(submitAnswer(survived, 'p2', { type: 'boolean', value: false }, T0 + 4000)), T0 + 5000, () => 0));
  // 10h: відкрита «удача» — двоє на межі, один уже вибрав двері (справжній перебіг із детермінованим rng).
  let luck = openAt(lobbyWith(makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials, { trial: 'luck' })]), 'Оля', 'Петро', 'Віра'), T0, () => 0);
  luck = must(submitAnswer(luck, 'p1', kyiv, T0 + 1000));
  luck = must(next(must(lock(luck)), T0 + 2000, () => 0));
  luck = must(next(luck, T0 + 2500, () => 0.5));
  luck = must(pickDoor(luck, 'p2', 1, T0 + 3500));
  // 10i: «Мільйонер» на l2 — GameState.ladder, Play.ladder: Петро пройшов l1 і вибрав «Граю далі», Оля відповіла за себе на l2.
  let laddered = must(pickContestant(must(start(lobbyWith(makeRoundsQuiz([ladderRound('rl')]), 'Оля', 'Петро'))), 'p2'));
  laddered = must(next(laddered, T0, () => 0));
  laddered = must(next(must(submitAnswer(must(submitAnswer(laddered, 'p2', LADDER_RIGHT[0], T0 + 1000)), 'p1', LADDER_RIGHT[0], T0 + 1000)), T0 + 2000, () => 0));
  laddered = must(decideLadder(must(next(laddered, T0 + 2500, () => 0)), 'p2', false, T0 + 2600));
  laddered = must(submitAnswer(must(next(laddered, T0 + 3000, () => 0)), 'p1', LADDER_RIGHT[1], T0 + 4000));
  // 10i: драбина скінчилася — Петро забрав гроші після l2: LadderOutcome і коригування 'ladder'.
  let took = must(next(must(submitAnswer(laddered, 'p2', LADDER_RIGHT[1], T0 + 4500)), T0 + 5000, () => 0));
  took = must(decideLadder(must(next(took, T0 + 5500, () => 0)), 'p2', true, T0 + 6000));
  // 10i: усі три підказки на l1, голосування залу відкрите (Оля ще не відповіла) — LadderLifelines.fifty / audience / hint.
  let helped = must(next(must(pickContestant(must(start(lobbyWith(makeRoundsQuiz([ladderRound('rl')]), 'Оля', 'Петро'))), 'p2')), T0, () => 0));
  helped = must(useLifeline(helped, 'p2', 'fifty', T0 + 1000, () => 0));
  helped = must(useLifeline(helped, 'p2', 'audience', T0 + 1500, () => 0));
  helped = must(useLifeline(helped, 'p2', 'hint', T0 + 2000, () => 0));
  // 10j: лобі командної гри з кубиками посеред туру — GameState.teams, TeamsState, TeamMember, DiceState у teams.dice.
  let teamDice = must(setTeamForm(teamLobby(teamQuiz([classicRound('r1', [single])]), 'Оля', 'Петро', 'Віра'), 'dice'));
  teamDice = must(rollTeamDie(must(startTeamDice(teamDice)), 'm1', () => 0.5));
  // 10j: командний бліц із натиском Петра за Червоних — Play.buzzers; капітан Червоних — Петро.
  let teamBuzz = teamGame(teamQuiz([blitzRound('b1', [single], { check: 'manual' })]), [['Оля', 'Петро'], ['Віра']]);
  teamBuzz = must(actBuzz(must(next(teamBuzz, T0, () => 0)), 'm2', T0 + 1000));
  teamBuzz = must(setCaptain(must(actAnswer(teamBuzz, 'm2', kyiv, T0 + 1000)), 't1', 'm2'));
  // 11d: сортування — помилка Анни (wordMisses, missedInto) і правильний хід Богдана — SortProgress.
  let sorting = toSort();
  sorting = must(sortWord(sorting, 'p1', head(sorting, 'p1'), wrong(head(sorting, 'p1')), 2000));
  sorting = must(sortWord(sorting, 'p2', head(sorting, 'p2'), right(head(sorting, 'p2')), 2000));
  // 11g: автопілот на паузі автора — залишок, причина паузи, старт після кубиків, пропуски поля й повтори (кожен ключ AutopilotState).
  const piloted: GameState = { ...pilotReveal(), paused: true, pausedAt: T0 + 3000, autopilot: { authorId: 'p1', at: null, left: 2500, hold: 'author', starting: true, skips: 1, skipPlays: 2, retries: 3 } };
  // 12a: бали ведучого на заставці, потім їх скасовано — ScoreAdjustment.undoes і batch.
  const undone = undoneOnIntro();
  // 12c: «Хто я?» у власному темпі — Оля відкрила другу підказку: Play.clueOpens.
  // 12e: Оля виходила з гри (закритий інтервал), Петро поза грою зараз; штраф увімкнено — Play.away, AwayEntry, QuizSettings.awayPenalty.
  const awayQuiz = makeRoundsQuiz([classicRound('r1', [single])], { awayPenalty: true });
  const wandered = awayStart(awayEnd(awayStart(openAt(lobbyWith(awayQuiz, 'Оля', 'Петро'), T0), 'p1', T0 + 1000), 'p1', T0 + 4000), 'p2', T0 + 5000);
  const selfOpened = must(openClue(openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [{ ...clues, cluePace: 'self' }])]), 'Оля', 'Петро'), T0), 'p1', T0 + 1000));
  return [
    teamDice,
    teamBuzz,
    stamped(),
    sorting,
    laddered,
    took,
    helped,
    luck,
    survived,
    wiped,
    timedOut,
    // Вікно «Далі / Забрати» відкрите: на leaderboard є startedAt / endsAt.
    must(next(wiped, T0 + 6000, () => 0)),
    chosen,
    fromCloud,
    walled,
    hidden,
    clued,
    slid,
    must(submitAnswer(toBuffQuestion(), 'p2', kyiv, T0 + 3000)),
    must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, () => 0)),
    must(takeBuff(must(submitAnswer(toOthersQuestion(), 'p2', kyiv, T0 + 1000)), 'p1', 'audience', T0 + 5000, () => 0)),
    toDuelQuestion(),
    openAt(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро'), T0),
    must(next(fogged, T0, () => 0)),
    bought,
    final,
    buzzed,
    acceptAll(buzzed, T0 + 1000),
    piloted,
    undone,
    selfOpened,
    wandered,
    appealed(),
  ];
}

describe('the saved state', () => {
  it('survives JSON unchanged, and so do its views', () => {
    const states = [
      toBuffQuestion(),
      toBuffCell(),
      toOthersQuestion(),
      toDuelQuestion(),
      must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, () => 0)),
      must(takeBuff(must(submitAnswer(toOthersQuestion(), 'p2', kyiv, T0 + 1000)), 'p1', 'audience', T0 + 5000, () => 0)),
      suspend(must(submitAnswer(toBuffQuestion(), 'p2', kyiv, T0 + 3000)), T0 + 5000),
    ];
    for (const s of states) {
      expect(roundTrip(s)).toEqual(s);
      expect(hostView(roundTrip(s))).toEqual(hostView(s));
      expect(stageView(roundTrip(s))).toEqual(stageView(s));
      expect(playerView(roundTrip(s), 'p1')).toEqual(playerView(s, 'p1'));
    }
  });

  it('the step moment (stepAt, 11b) survives JSON and suspend', () => {
    const s = stamped();
    expect(s.stepAt).toBe(T0);
    expect(roundTrip(s)).toEqual(s);
    const suspended = suspend(s, T0 + 1000);
    expect(suspended.stepAt).toBe(T0);
    expect(roundTrip(suspended)).toEqual(suspended);
  });

  it('team states (lobby dice mid-tour, a team blitz with a buzzer) survive JSON and suspend', () => {
    const [teamDice, teamBuzz] = representative();
    for (const s of [teamDice, teamBuzz]) {
      expect(s.teams).toBeDefined();
      expect(roundTrip(s)).toEqual(s);
      const suspended = suspend(s, T0 + 2000);
      expect(roundTrip(suspended)).toEqual(suspended);
      expect(suspended.teams?.members.every((m) => !m.connected)).toBe(true);
      expect({ ...suspended.teams, members: [] }).toEqual({ ...s.teams, members: [] });
      expect(suspended.teams?.members.map(({ connected: _c, ...m }) => m)).toEqual(s.teams?.members.map(({ connected: _c, ...m }) => m));
    }
    expect(teamDice.teams?.dice).toMatchObject({ throws: { m1: [4] }, waiting: ['m2', 'm3'] });
    const suspendedBuzz = suspend(teamBuzz, T0 + 2000);
    expect(suspendedBuzz.plays[0].buzzers).toEqual({ t1: 'm2' });
    expect(suspendedBuzz.awaiting).toEqual(['t1', 't2', 'm1', 'm2', 'm3']);
  });

  it('a sort progress of version 11 (no wordMisses, no missedInto) restores and reveals late marks only', () => {
    const s = toSort();
    const [first, ...rest] = s.presented;
    const old: SortProgress = { queue: [...rest.slice(1), first], sorted: [rest[0]], misses: 1, lockedUntil: null, missed: null };
    const saved: GameState = { ...s, plays: s.plays.map((p, i) => (i === s.questionIndex ? { ...p, sort: { p1: old } } : p)) };
    const restored = roundTrip(suspend(roundTrip(saved), 3000));
    const progress = sortOf(restored, 'p1');
    expect(progress).toEqual(old);
    expect(sortMarks(sortQ, progress, false)).toEqual(
      sortQ.words.filter((w) => old.queue.includes(w.id)).map((w) => ({ wordId: w.id, misses: 0, late: true })),
    );
  });

  it('a wipeout play of version 12 (no auto) restores and shows every take as a plain take', () => {
    const s = wipeoutTimedOut();
    expect(s.phase).toBe('leaderboard');
    expect(s.plays[0].wipeout).toEqual({ took: ['p2', 'p3'], stay: ['p1'], end: false, auto: ['p3'] });
    const old = { took: ['p2', 'p3'], stay: ['p1'], end: false };
    const saved: GameState = { ...s, plays: s.plays.map((p, i) => (i === 0 ? { ...p, wipeout: old } : p)) };
    const restored = roundTrip(suspend(roundTrip(saved), T0 + 20_000));
    expect(restored.plays[0].wipeout).toEqual(old);
    const play = wipeoutPlayOf(restored);
    expect(play).not.toBeNull();
    expect(['p1', 'p2', 'p3'].map((id) => wipeoutChoiceOf(play!, id))).toEqual(['stay', 'took', 'took']);
  });

  it('an autopilot game that was running is suspended with hold nobody and the time left', () => {
    const running = pilotReveal();
    expect(running.phase).toBe('reveal');
    const s: GameState = { ...running, autopilot: { authorId: 'p1', at: T0 + 4000 } };
    const suspended = suspend(s, T0);
    expect(suspended.paused).toBe(true);
    expect(suspended.autopilot).toEqual({ authorId: 'p1', at: null, hold: 'nobody', left: 4000 });
    expect(suspended.players.every((p) => !p.connected)).toBe(true);
    expect(roundTrip(suspended)).toEqual(suspended);
  });

  it('a running autopilot game with nothing due suspends with hold nobody and no time left', () => {
    const suspended = suspend(pilotReveal(), T0 + 2000);
    expect(suspended.autopilot).toEqual({ authorId: 'p1', at: null, hold: 'nobody' });
    expect('left' in (suspended.autopilot ?? {})).toBe(false);
  });

  it('an autopilot step already due at the save leaves 0', () => {
    const s: GameState = { ...pilotReveal(), autopilot: { authorId: 'p1', at: T0 + 1500 } };
    expect(suspend(s, T0 + 2000).autopilot).toEqual({ authorId: 'p1', at: null, hold: 'nobody', left: 0 });
  });

  it('a team autopilot game suspends with hold nobody and every member offline', () => {
    let s = must(createAutopilotGame(teamQuiz([classicRound('r1', [single])]), { id: 'm1', nickname: 'Оля' }));
    s = must(addPlayer(s, { id: 'm2', nickname: 'Петро' }));
    s = must(next(must(start(s, T0)), T0, () => 0));
    expect(s.phase).toBe('question');
    const suspended = suspend({ ...s, autopilot: { authorId: 'm1', at: T0 + 3000 } }, T0 + 1000);
    expect(suspended.paused).toBe(true);
    expect(suspended.autopilot).toEqual({ authorId: 'm1', at: null, hold: 'nobody', left: 2000 });
    expect(suspended.teams?.members.every((m) => !m.connected)).toBe(true);
    expect(roundTrip(suspended)).toEqual(suspended);
  });

  it('an autopilot game paused by the author stays paused by the author', () => {
    const paused = must(pause(pilotReveal(), T0 + 2000));
    const s: GameState = { ...paused, autopilot: { authorId: 'p1', at: null, hold: 'author', left: 2500 } };
    const suspended = suspend(s, T0 + 9000);
    expect(suspended.autopilot).toEqual({ authorId: 'p1', at: null, hold: 'author', left: 2500 });
    expect(suspended.pausedAt).toBe(T0 + 2000);
  });

  it('an autopilot lobby drops its moment (planned again when someone returns), keeping starting; the finished game is left as it is', () => {
    const lobby = must(createAutopilotGame(makeRoundsQuiz([classicRound('r1', [single])]), { id: 'p1', nickname: 'Оля' }));
    const s: GameState = { ...lobby, autopilot: { authorId: 'p1', at: T0 + 5000, starting: true } };
    expect(suspend(s, T0).autopilot).toEqual({ authorId: 'p1', at: null, starting: true });
    expect(suspend(s, T0).paused).toBe(false);
    const finished: GameState = { ...must(end(pilotReveal(), T0 + 2000)), autopilot: { authorId: 'p1', at: null } };
    expect(suspend(finished, T0 + 3000).autopilot).toEqual({ authorId: 'p1', at: null });
  });

  it('a version 14 state (no undo) restores and an undo survives the round trip', () => {
    const intro = must(start(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро')));
    const old = must(adjustScore(intro, 'p1', 300, T0));
    const restored = roundTrip(suspend(roundTrip(old), T0 + 500));
    expect(restored.adjustments).toEqual(old.adjustments);
    expect(restored.adjustments.some((a) => 'undoes' in a || 'batch' in a)).toBe(false);
    const undone = undoneOnIntro();
    const back = roundTrip(suspend(undone, T0 + 2000));
    expect(back.adjustments[1]).toMatchObject({ source: 'undo', undoes: { seq: 1 }, batch: 2, points: -300 });
    expect(back.adjustments).toEqual(undone.adjustments);
    expect(back.players.find((p) => p.id === 'p1')?.score).toBe(0);
  });

  it('a state without clueOpens restores and keeps opening by the timer; a self-paced play keeps clueOpens across the round trip', () => {
    const timed = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [clues])]), 'Оля', 'Петро'), T0);
    const old = roundTrip(suspend(roundTrip(timed), T0 + 1000));
    expect('clueOpens' in old.plays[0]).toBe(false);
    // далі відкривається за таймером: 1 с до збереження, ще 4 с після «Продовжити»
    expect(tick(must(resume(old, T0 + 1000 + HOUR)), T0 + 5000 + HOUR).plays[0].clues).toBe(2);
    const selfQuiz = makeRoundsQuiz([classicRound('r1', [{ ...clues, cluePace: 'self' }])]);
    let self = openAt(lobbyWith(selfQuiz, 'Оля', 'Петро'), T0);
    self = must(openClue(must(openClue(self, 'p1', T0 + 500)), 'p1', T0 + 1000));
    const back = roundTrip(suspend(self, T0 + 2000));
    expect(back.plays[0].clueOpens).toEqual({ p1: 3 });
    // у власному темпі таймер і після «Продовжити» нічого не відкриває
    expect(tick(must(resume(back, T0 + 2000 + HOUR)), T0 + 8000 + HOUR).plays[0].clues).toBe(1);
    const answered = must(submitAnswer(must(resume(back, T0 + 2000 + HOUR)), 'p1', { type: 'clues', value: 'Шевченко' }, T0 + 3000 + HOUR));
    expect(answered.plays[0].answers.p1).toMatchObject({ points: 600, accepted: true });
  });

  it('a version 13 state (no autopilot) restores as a hosted game', () => {
    const hosted = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро'), T0);
    const restored = roundTrip(suspend(roundTrip(hosted), T0 + 1000));
    expect('autopilot' in restored).toBe(false);
    expect(restored.paused).toBe(true);
  });

  it('a version 16 state (no away) restores; an open leave closes at the save and the restored game goes on', () => {
    const plain = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро'), T0);
    const old = roundTrip(suspend(roundTrip(plain), T0 + 1000));
    expect('away' in old.plays[0]).toBe(false);
    expect('awayPenalty' in old.quiz.settings).toBe(false);
    expect(READABLE_STATE_VERSIONS).toContain(16);
    const left = awayStart(plain, 'p2', T0 + 2000);
    const suspended = roundTrip(suspend(left, T0 + 6000));
    expect(suspended.plays[0].away?.p2).toEqual({ ms: 4000, count: 1, since: null });
    // Петро повертається, гра продовжується: крок нічого не змінює, новий вихід додається
    const back = must(resume(must(setConnected(suspended, 'p2', true, T0 + HOUR)), T0 + HOUR));
    expect(awayStep(suspended, back, T0 + HOUR, new Set())).toBe(back);
    const again = awayEnd(awayStart(back, 'p2', T0 + HOUR + 1000), 'p2', T0 + HOUR + 2000);
    expect(again.plays[0].away?.p2).toEqual({ ms: 5000, count: 2, since: null });
  });

  it('a version 17 state (no appeals) restores', () => {
    const plain = openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро'), T0);
    const old = roundTrip(suspend(roundTrip(plain), T0 + 1000));
    expect('appeals' in old).toBe(false);
    expect(old.paused).toBe(true);
    expect(READABLE_STATE_VERSIONS).toContain(17);
  });

  it('an open appeal survives the round trip and suspend: paused, endsAt and the votes as they were', () => {
    const s = appealed();
    expect(s.appeals).toHaveLength(2);
    expect(s.appeals?.[0]).toMatchObject({ outcome: 'yes', adjustmentSeq: 1 });
    expect(s.appeals?.[1]).toMatchObject({ outcome: null, endsAt: T0 + 36_000, votes: { p3: false } });
    expect(roundTrip(s)).toEqual(s);
    const suspended = roundTrip(suspend(roundTrip(s), T0 + 8000));
    expect(suspended.paused).toBe(true);
    expect(suspended.pausedAt).toBe(T0 + 8000);
    expect(suspended.appeals).toEqual(s.appeals);
  });

  it('the state format is pinned to GAME_STATE_VERSION', () => {
    // Перелік ключів кожного типу стану: компілятор (pnpm typecheck) вимагає рівно всі ключі типу, тож нове поле
    // не пройде непоміченим, а тест порівнює перелік із KEYS поточної версії.
    // Якщо тест упав, бо змінився формат: підніміть GAME_STATE_VERSION і додайте новий запис у KEYS.
    expect(STATE_SHAPE).toEqual(KEYS[GAME_STATE_VERSION]);
  });

  it('older readable versions are a subset of the current format', () => {
    // Версію читають як поточну лише тоді, коли поточна тільки додала ключі (необов'язкові, з типовим значенням у рушії).
    expect(READABLE_STATE_VERSIONS).toContain(GAME_STATE_VERSION);
    expect(READABLE_STATE_VERSIONS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(READABLE_STATE_VERSIONS).not.toContain(1);
    for (const version of READABLE_STATE_VERSIONS) {
      for (const [name, keys] of Object.entries(KEYS[version])) {
        const current = new Set(KEYS[GAME_STATE_VERSION][name].split(','));
        for (const key of keys.split(',')) expect(current.has(key), `${version}: ${name}.${key}`).toBe(true);
      }
    }
  });

  it('representative states carry no keys beyond the pinned ones', () => {
    const seen: Record<string, object[]> = {};
    const add = (name: string, objects: (object | null | undefined)[]) =>
      (seen[name] ??= []).push(...objects.filter((o): o is object => o !== null && o !== undefined));
    for (const s of representative()) {
      add('GameState', [s]);
      add('Quiz', [s.quiz]);
      add('QuizSettings', [s.quiz.settings]);
      add('PlayerState', s.players);
      add('Play', s.plays);
      add('AnswerRecord', s.plays.flatMap((p) => Object.values(p.answers)));
      add('BoardState', [s.board]);
      add('DiceState', [s.board?.dice, s.teams?.dice]);
      add('TeamsState', [s.teams]);
      add('TeamMember', s.teams?.members ?? []);
      add('BoardPlay', s.plays.map((p) => p.board));
      add('BlitzPlay', s.plays.map((p) => p.blitz));
      add('BuzzEntry', s.plays.flatMap((p) => [...(p.blitz?.queue ?? []), ...(p.blitz?.dropped ?? [])]));
      add('Attempt', s.plays.flatMap((p) => p.blitz?.attempts ?? []));
      add('FinalState', [s.final]);
      add('FinalPlay', s.plays.map((p) => p.final));
      add('BuffPlay', s.plays.flatMap((p) => Object.values(p.buffs ?? {})));
      add('DebuffState', Object.values(s.debuffs));
      add('DuelState', [s.duel]);
      add('DuelQuestionPlay', s.duel?.questions ?? []);
      add('ScoreAdjustment', s.adjustments);
      add('Splash', [s.splash]);
      add('WallProgress', s.plays.flatMap((p) => Object.values(p.wall ?? {})));
      add('SurveyPlay', s.plays.map((p) => p.survey));
      add('BluffPlay', s.plays.map((p) => p.bluff));
      add('WipeoutPlay', s.plays.map((p) => p.wipeout));
      add('SurvivalPlay', s.plays.map((p) => p.survival));
      add('GhostAnswer', s.plays.flatMap((p) => Object.values(p.survival?.ghosts ?? {})));
      add('SurvivalTrial', s.plays.map((p) => p.survival?.trial));
      add('TrialAnswer', s.plays.flatMap((p) => Object.values(p.survival?.trial?.answers ?? {})));
      add('LadderState', [s.ladder]);
      add('LadderPlay', s.plays.map((p) => p.ladder));
      add('LadderLifelines', s.plays.map((p) => p.ladder?.lifelines));
      add('LadderOutcome', s.plays.map((p) => p.ladder?.outcome));
      add('BluffLie', s.plays.flatMap((p) => Object.values(p.bluff?.lies ?? {})));
      add('BluffPick', s.plays.flatMap((p) => Object.values(p.bluff?.picks ?? {})));
      add('BluffOption', s.plays.flatMap((p) => p.bluff?.options ?? []));
      add('SortProgress', s.plays.flatMap((p) => Object.values(p.sort ?? {})));
      add('AutopilotState', [s.autopilot]);
      add('AwayEntry', s.plays.flatMap((p) => Object.values(p.away ?? {})));
      add('Appeal', s.appeals ?? []);
      // стан без змін переживає JSON
      expect(roundTrip(s)).toEqual(s);
    }
    for (const [name, objects] of Object.entries(seen)) {
      const declared = new Set(STATE_SHAPE[name].split(','));
      for (const o of objects) for (const key of Object.keys(o)) expect(declared.has(key), `${name}.${key}`).toBe(true);
    }
    // кожен вкладений тип справді трапився (крім ланцюжка, що потребує окремого раунду; кубики — з лобі команд)
    const missing = Object.keys(STATE_SHAPE).filter((name) => (seen[name]?.length ?? 0) === 0);
    expect(missing.sort()).toEqual(['ChainProgress']);
  });
});
