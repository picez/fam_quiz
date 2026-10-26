import { boardCells, type Answer, type Question } from '@quiz/shared';
import { planAutopilot, pilotStep } from '../autopilot';
import { attemptsUsed, blitzRulesOf, buzz, isInstant, nextDeadline } from '../blitz';
import { bluffPlayOf, pickBluff, writeLie } from '../bluff';
import { pickCell } from '../board';
import { rollDie } from '../board-dice';
import { cellPlayed, chooserOf } from '../board-turns';
import { guessWord, chainOf } from '../chain';
import { answerDuel, declareDuel, duelCategoriesLeft, duelQuestionOf, duelWindowOpen, pickDuelCategory } from '../duel';
import { placeWager } from '../final';
import { currentRound, recordOf, submitAnswer, tick, type GameState, type Result, type Rng } from '../game';
import { contestantOf, decideLadder, decisionPending, ladderPlayOf } from '../ladder';
import { stamp } from '../pacing';
import { sortOf, sortWord } from '../sort';
import { notStarted } from '../splash';
import { answerTrial, isGhost, pickDoor, survivalPlayOf, trialOpen, trialQuestionOf } from '../survival';
import { pickTeam, rollTeamDie } from '../teams';
import { guessWall } from '../wall';
import { decideWipeout, decisionOpen, wipeoutIn } from '../wipeout';

// Наскрізні ігри без ведучого (11g, задача 5): драйвер, що імітує сервер, і «люди» з телефонами.

/** Що роблять люди на кожному кроці драйвера: дії гравців через публічні функції рушія (submitAnswer, rollDie, pickCell, placeWager, …); повертає новий стан чи той самий. */
export type People = (state: GameState, now: number) => GameState;

/** Те, що робить сервер після кожної зміни (manager.commit): мітка кроку 11b, потім план автопілота. */
export function commit(prev: GameState, next: GameState, now: number): GameState {
  if (next === prev) return prev;
  return planAutopilot(prev, stamp(prev, next, now), now);
}

/** Драйвер зупинився: подій немає, а гра не finished. state і now — де саме. */
export class Stalled extends Error {
  constructor(
    readonly state: GameState,
    readonly now: number,
  ) {
    super(`autopilot game stalled at ${state.phase} (round ${state.roundIndex}, question ${state.questionIndex}, paused ${state.paused})`);
  }
}

export interface DriveOptions {
  now: number;
  rng: Rng;
  people: People;
  maxSteps?: number;
  /** Кожна зміна стану (prev → next о now); для перевірок проміжків. */
  watch?: (prev: GameState, next: GameState, now: number) => void;
}

/**
 * Імітує сервер (manager.commit/reschedule): наступна подія — найменша з nextDeadline(state, tickedTo) і autopilot.at;
 * у цю мить tick → pilotStep → stamp → planAutopilot; після кожної зміни — people (і знову, доки люди щось змінюють). Ведучого немає: функції пульта драйвер не викликає.
 * Ще одна подія — мить startedAt запитання (після заставки): телефони людей стають активними, стан рушія вона не змінює.
 * Кидає Stalled, якщо подій немає, а гра не finished (зупинка), чи помилку після maxSteps (цикл).
 */
export function drive(start: GameState, options: DriveOptions): { state: GameState; now: number; steps: number } {
  const { rng, people, maxSteps = 5000, watch } = options;
  let now = options.now;
  let tickedTo = now;
  let state = start;
  const apply = (next: GameState): void => {
    const committed = commit(state, next, now);
    if (committed !== state) watch?.(state, committed, now);
    state = committed;
  };
  // Люди відповідають на кожну зміну, і на ту, що зробили самі (усі написали вигадки → вибір), доки нічого не змінюється.
  const react = (): void => {
    for (let round = 0; round < 20; round++) {
      const before = state;
      apply(people(state, now));
      if (state === before) return;
    }
  };
  react();
  for (let steps = 0; steps < maxSteps; steps++) {
    if (state.phase === 'finished') return { state, now, steps };
    const deadline = nextDeadline(state, tickedTo);
    const pilot = state.autopilot?.at ?? null;
    const wake = state.startedAt !== null && state.startedAt > now ? state.startedAt : null;
    const times = [deadline, pilot, wake].filter((t): t is number => t !== null);
    if (times.length === 0) throw new Stalled(state, now);
    const at = Math.min(...times);
    now = Math.max(now, at);
    if (deadline !== null && deadline === at) {
      tickedTo = Math.max(tickedTo, deadline);
      apply(tick(state, tickedTo));
    } else if (pilot !== null && pilot === at) {
      apply(pilotStep(state, now, rng));
    }
    react();
  }
  throw new Error(`autopilot game did not finish in ${maxSteps} steps (${state.phase}, question ${state.questionIndex})`);
}

/** Люди на зв'язку, що нічого не роблять. */
export const silent: People = (state) => state;

/** Правильна відповідь з телефона на запитання (null — типу, що йде окремими ходами). */
export function rightAnswer(question: Question): Answer | null {
  switch (question.type) {
    case 'single':
      return { type: 'single', optionId: question.correctId };
    case 'multi':
      return { type: 'multi', optionIds: [...question.correctIds] };
    case 'boolean':
      return { type: 'boolean', value: question.correct };
    case 'text':
      return { type: 'text', value: question.accepted[0] };
    case 'numeric':
      return { type: 'numeric', value: question.correct };
    case 'slider':
      return { type: 'slider', value: question.correct };
    case 'clues':
      return { type: 'clues', value: question.accepted[0] };
    case 'pin':
      return { type: 'pin', x: question.target.x, y: question.target.y };
    case 'poll':
      return { type: 'poll', optionId: question.options[0].id };
    case 'wordcloud':
      return { type: 'wordcloud', words: ['Весна'] };
    case 'survey':
      return question.rows.length === 0 ? { type: 'survey', values: ['Весна'] } : { type: 'survey', values: question.rows.slice(0, question.answers).map((row) => row.text) };
    case 'order':
      return { type: 'order', itemIds: question.items.map((item) => item.id) };
    case 'match':
      return { type: 'match', links: question.pairs.map((pair) => ({ left: pair.left.id, right: pair.right.id })) };
    default:
      return null;
  }
}

/** Неправильна відповідь (для тих, кого answerAs просить помилятися); null — такого типу немає в тестах. */
export function wrongAnswer(question: Question): Answer | null {
  switch (question.type) {
    case 'single':
      return { type: 'single', optionId: question.options.find((o) => o.id !== question.correctId)?.id ?? question.correctId };
    case 'boolean':
      return { type: 'boolean', value: !question.correct };
    case 'text':
      return { type: 'text', value: 'Мимо' };
    case 'clues':
      return { type: 'clues', value: 'Мимо' };
    case 'numeric':
      return { type: 'numeric', value: question.correct + 1_000_000 };
    default:
      return null;
  }
}

/** Дія людини: вдалася — новий стан; не вдалася — помилка (strict, люди, що відповідають) чи той самий стан. */
type Act = (state: GameState, result: Result, what: string) => GameState;

const strictAct: Act = (state, result, what) => {
  if (!result.ok) throw new Error(`${what} failed: ${result.error} (${state.phase}, question ${state.questionIndex})`);
  return result.state;
};

const looseAct: Act = (state, result) => (result.ok ? result.state : state);

/** Один гравець відповідає на поточне запитання: окремі ходи для ланцюжка, сортування, стіни й блефу, інакше submitAnswer. */
function answerQuestion(state: GameState, playerId: string, wrong: boolean, now: number, act: Act): GameState {
  const play = state.plays[state.questionIndex];
  if (state.phase !== 'question' || play === undefined || notStarted(state, now)) return state;
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return state;
  const round = currentRound(state);
  if (round?.type === 'survival' && isGhost(state, playerId)) return state;
  if (round?.type === 'wipeout' && !wipeoutIn(state).includes(playerId)) return state;
  if (play.board !== undefined && play.blitz === undefined && (play.board.chooserId !== playerId || play.board.answer !== null)) return state;
  const question = play.question;
  const what = `${playerId} on ${question.id}`;
  switch (question.type) {
    case 'chain': {
      let s = state;
      for (let i = chainOf(s, playerId).solved + 1; i < question.words.length; i++) s = act(s, guessWord(s, playerId, question.words[i], now), what);
      return s;
    }
    case 'sort': {
      let s = state;
      while (s.phase === 'question' && recordOf(s, s.questionIndex, playerId) === undefined) {
        const word = question.words.find((w) => w.id === sortOf(s, playerId).queue[0]);
        if (word === undefined) break;
        s = act(s, sortWord(s, playerId, word.id, word.categoryId, now), what);
      }
      return s;
    }
    case 'wall': {
      let s = state;
      for (const group of question.groups) {
        if (s.phase !== 'question' || recordOf(s, s.questionIndex, playerId) !== undefined) break;
        const current = s;
        s = act(s, guessWall(s, playerId, group.tiles.map((t) => current.presented.indexOf(t.id)), now), what);
      }
      return s;
    }
    case 'bluff': {
      const bluff = bluffPlayOf(state);
      if (bluff === null) return state;
      if (bluff.bluff.stage === 'lies') {
        return Object.hasOwn(bluff.bluff.lies, playerId) ? state : act(state, writeLie(state, playerId, `Вигадка ${playerId}`, now), what);
      }
      if (Object.hasOwn(bluff.bluff.picks, playerId)) return state;
      const truth = bluff.bluff.options.find((o) => o.kind === 'truth' && !o.removed);
      return truth === undefined ? state : act(state, pickBluff(state, playerId, truth.id, now), what);
    }
    default: {
      const answer = wrong ? wrongAnswer(question) : rightAnswer(question);
      if (answer === null) return state;
      if (play.blitz === undefined) return act(state, submitAnswer(state, playerId, answer, now), what);
      // Бліц: одна спроба на гравця; з кнопкою — спершу натискання.
      if (attemptsUsed(play, playerId) > 0 || play.blitz.queue.some((e) => e.playerId === playerId)) return state;
      const rules = blitzRulesOf(state, play);
      const queued = rules !== null && isInstant(rules) ? state : act(state, buzz(state, playerId, now), what);
      return act(queued, submitAnswer(queued, playerId, answer, now), what);
    }
  }
}

/** Кубик i-го в черзі: різні грані (2, 4, 6, …), щоб тур не повторювався без кінця. */
const face = (i: number): Rng => () => (((i + 1) * 0.29) % 1);

/** Перша незіграна клітинка поточного поля. */
function firstCell(state: GameState): string | null {
  const round = currentRound(state);
  if (round?.type !== 'board') return null;
  return boardCells(round).find(({ cell }) => !cellPlayed(state, cell.question.id))?.cell.question.id ?? null;
}

/** Що вміють люди, які відповідають: хто помиляється, чи вирішують «Далі», чи оголошують дуель. */
export interface Answering {
  /** Гравці, що відповідають неправильно (на звичайних запитаннях і питаннях на виживання). */
  wrong?: string[];
  /** Гравці, що мовчать (нічого не роблять). */
  idle?: string[];
  /** «Далі» на першому вікні «Ва-банку» й першому рішенні «Мільйонера» (типово так); false — ніколи не вирішують. */
  decide?: boolean;
  /** Оголосити одну дуель, щойно це можна (типово так, якщо є пул дуелей); false — ні. */
  duel?: boolean;
  /** Лише оголосити дуель і більше нічого (для перевірки жеребу категорії). */
  onlyDuel?: boolean;
  /** Дія, що не вдалася, — помилка тесту (типово так). */
  strict?: boolean;
}

/** Люди, що відповідають, з налаштуваннями. */
export function answerAs(config: Answering = {}): People {
  const { wrong = [], idle = [], decide = true, duel = true, onlyDuel = false, strict = true } = config;
  const act: Act = strict ? strictAct : looseAct;
  return (state, now) => {
    let s = state;
    const ids = s.players.map((p) => p.id).filter((id) => !idle.includes(id));
    // Дуель: перший гравець оголошує другому, щойно вікно дуелей відкрите, вибирає першу категорію й відповідає правильно.
    if (duel && s.quiz.duels !== undefined && s.duelsDeclared.length === 0 && s.duel === null && s.players.length >= 2 && duelWindowOpen(s)) {
      s = act(s, declareDuel(s, s.players[0].id, s.players[1].id), 'declare a duel');
    }
    if (onlyDuel) return s;
    if (s.duel !== null && s.phase === 'duel') {
      if (s.duel.stage === 'category') {
        const category = duelCategoriesLeft(s).find((c) => c.left > 0);
        if (category !== undefined) s = act(s, pickDuelCategory(s, s.duel.challengerId, category.id, now, () => 0), 'pick a duel category');
      } else if (s.duel.stage === 'question' && !notStarted(s, now)) {
        const question = duelQuestionOf(s);
        const current = s.duel.questions[s.duel.questions.length - 1];
        if (question !== null && current?.winnerId === null) s = act(s, answerDuel(s, s.duel.challengerId, question.accepted[0], now), 'answer the duel');
      }
      return s;
    }
    switch (s.phase) {
      case 'lobby': {
        const teams = s.teams;
        if (teams === undefined) return s;
        if (teams.dice !== null && teams.dice.waiting.length > 0) {
          teams.dice.waiting.forEach((id, i) => {
            s = act(s, rollTeamDie(s, id, face(i)), `${id} rolls for a team`);
          });
        } else if (teams.form === 'pick') {
          teams.members.forEach((m, i) => {
            if (m.teamId === null) s = act(s, pickTeam(s, m.id, teams.list[i % teams.list.length].id), `${m.id} picks a team`);
          });
        }
        return s;
      }
      case 'intro': {
        (s.board?.dice?.waiting ?? []).forEach((id, i) => {
          if (ids.includes(id)) s = act(s, rollDie(s, id, face(i)), `${id} rolls for the board`);
        });
        return s;
      }
      case 'board': {
        const chooser = chooserOf(s);
        const cell = firstCell(s);
        return chooser === null || cell === null || !ids.includes(chooser) ? s : act(s, pickCell(s, chooser, cell, now, () => 0), `${chooser} picks a cell`);
      }
      case 'wager':
        for (const id of ids) if (!Object.hasOwn(s.final?.wagers ?? {}, id)) s = act(s, placeWager(s, id, 0, now, () => 0), `${id} bets`);
        return s;
      case 'question': {
        const contestant = contestantOf(s);
        for (const id of ids) if (contestant === null || contestant === id) s = answerQuestion(s, id, wrong.includes(id), now, act);
        return s;
      }
      case 'leaderboard': {
        // Перше вікно раунду: «Ва-банк» — після першого запитання раунду, «Мільйонер» — після першої сходинки.
        const firstOfRound = s.plays.findIndex((p) => p.roundIndex === s.roundIndex) === s.questionIndex;
        if (decisionOpen(s)) {
          const play = s.plays[s.questionIndex];
          const decided = [...(play.wipeout?.took ?? []), ...(play.wipeout?.stay ?? [])];
          const open = wipeoutIn(s).filter((id) => ids.includes(id) && !decided.includes(id));
          if (decide && firstOfRound) for (const id of open) if (decisionOpen(s)) s = act(s, decideWipeout(s, id, false, now), `${id} decides`);
        } else if (decisionPending(s)) {
          const contestant = contestantOf(s);
          if (decide && contestant !== null && ids.includes(contestant) && ladderPlayOf(s)?.ladder.step === 0) s = act(s, decideLadder(s, contestant, false, now), 'the contestant decides');
        } else if (trialOpen(s) && !notStarted(s, now)) {
          const question = trialQuestionOf(s);
          for (const id of survivalPlayOf(s)?.survival.edge ?? []) {
            const trial = survivalPlayOf(s)?.survival.trial ?? null;
            if (!ids.includes(id) || trial === null || !trialOpen(s) || Object.hasOwn(trial.answers, id) || Object.hasOwn(trial.doors, id)) continue;
            const answer = question === null ? null : wrong.includes(id) ? wrongAnswer(question) : rightAnswer(question);
            s = act(s, answer === null ? pickDoor(s, id, 0, now) : answerTrial(s, id, answer, now), `${id} on the trial`);
          }
        }
        return s;
      }
      default:
        return s;
    }
  };
}

/** Люди, що відповідають: перший прийнятний варіант / написання, кидають кубики, вибирають першу клітинку, ставлять 0, вирішують «Далі» на першому вікні. */
export const answering: People = answerAs();
