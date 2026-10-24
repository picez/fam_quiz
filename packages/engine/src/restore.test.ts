import { describe, expect, it } from 'vitest';
import type { Quiz, QuizSettings } from '@quiz/shared';
import { takeBuff, type BuffPlay } from './buffs';
import { chooserOf } from './board-turns';
import { adjustScore } from './adjust';
import { buyDebuff, setDebuff } from './debuffs';
import { placeWager } from './final';
import {
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
  type Attempt,
  type BlitzPlay,
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
  type Play,
  type PlayerState,
  type ScoreAdjustment,
  type SortProgress,
} from './game';
import { GAME_STATE_VERSION, suspend } from './restore';
import type { Splash } from './splash';
import { T0, buffQuiz, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
import { toDuelQuestion } from './testing/duel';
import { blitzRound, classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { acceptAll, lobbyWith, lobbyWithSplash, must, openAt, sendBlitz } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

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
    expect(open.splash?.until).toBe(T0 + 1200);
    // збереження посеред заставки: 700 мс заставки й увесь час запитання ще попереду
    const resumed = must(resume(suspend(open, T0 + 500), T0 + 500 + HOUR));
    expect(resumed.splash?.until).toBe(T0 + 1200 + HOUR);
    expect(resumed.startedAt).toBe(T0 + 1200 + HOUR);
    expect(resumed.endsAt).toBe(T0 + 21_200 + HOUR);
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
      'sparesUsed', 'transitions', 'splash', 'guidePage', 'awaiting',
    ],
    true,
  ),
  Quiz: keysOf<Quiz>()(['title', 'description', 'settings', 'rounds', 'duels', 'spares'], true),
  QuizSettings: keysOf<QuizSettings>()(['leaderboard', 'debuffs', 'buffs', 'newcomers', 'debuffPrices', 'debuffShop'], true),
  PlayerState: keysOf<PlayerState>()(['id', 'nickname', 'connected', 'score', 'totalTimeMs', 'streak'], true),
  Play: keysOf<Play>()(['roundIndex', 'question', 'answers', 'blitz', 'extraMs', 'board', 'final', 'chain', 'sort', 'buffs', 'overtime'], true),
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
  SortProgress: keysOf<SortProgress>()(['queue', 'sorted', 'misses', 'lockedUntil', 'missed'], true),
  ChainProgress: keysOf<ChainProgress>()(['solved', 'shown', 'hints'], true),
  BuffPlay: keysOf<BuffPlay>()(['kind', 'seq', 'at', 'removed', 'retry', 'first', 'vote', 'hint', 'spare'], true),
  DebuffState: keysOf<DebuffState>()(['kind', 'firedAt', 'since', 'by'], true),
  DuelState: keysOf<DuelState>()(['challengerId', 'opponentId', 'stage', 'returnPhase', 'categoryId', 'total', 'questions', 'winnerId'], true),
  DuelQuestionPlay: keysOf<DuelQuestionPlay>()(['questionId', 'tries', 'winnerId', 'answer', 'timeMs'], true),
  ScoreAdjustment: keysOf<ScoreAdjustment>()(['seq', 'playerId', 'points', 'roundIndex', 'afterQuestion', 'source', 'at', 'target', 'debuff'], true),
  Splash: keysOf<Splash>()(['kind', 'at', 'until'], true),
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
};

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
  return [
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

  it('the state format is pinned to GAME_STATE_VERSION', () => {
    // Перелік ключів кожного типу стану: компілятор (pnpm typecheck) вимагає рівно всі ключі типу, тож нове поле
    // не пройде непоміченим, а тест порівнює перелік із KEYS поточної версії.
    // Якщо тест упав, бо змінився формат: підніміть GAME_STATE_VERSION і додайте новий запис у KEYS.
    expect(STATE_SHAPE).toEqual(KEYS[GAME_STATE_VERSION]);
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
      add('DiceState', [s.board?.dice]);
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
      // стан без змін переживає JSON
      expect(roundTrip(s)).toEqual(s);
    }
    for (const [name, objects] of Object.entries(seen)) {
      const declared = new Set(STATE_SHAPE[name].split(','));
      for (const o of objects) for (const key of Object.keys(o)) expect(declared.has(key), `${name}.${key}`).toBe(true);
    }
    // кожен вкладений тип справді трапився (крім тих, що потребують окремих раундів: сортування, ланцюжок, кубики)
    const missing = Object.keys(STATE_SHAPE).filter((name) => (seen[name]?.length ?? 0) === 0);
    expect(missing.sort()).toEqual(['ChainProgress', 'DiceState', 'SortProgress']);
  });
});
