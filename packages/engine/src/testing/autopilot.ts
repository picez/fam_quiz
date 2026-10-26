import { boardCells, type Answer, type Question } from '@quiz/shared';
import { planAutopilot, pilotStep } from '../autopilot';
import { nextDeadline, buzz } from '../blitz';
import { bluffPlayOf, pickBluff, writeLie } from '../bluff';
import { pickCell } from '../board';
import { rollDie } from '../board-dice';
import { cellPlayed, chooserOf } from '../board-turns';
import { guessWord, chainOf } from '../chain';
import { answerDuel, declareDuel, duelCategoriesLeft, duelQuestionOf, pickDuelCategory } from '../duel';
import { placeWager } from '../final';
import { currentRound, recordOf, submitAnswer, tick, type GameState, type Result, type Rng } from '../game';
import { contestantOf, decideLadder, decisionPending, ladderPlayOf } from '../ladder';
import { stamp } from '../pacing';
import { sortOf, sortWord } from '../sort';
import { answerTrial, pickDoor, trialOpen, trialQuestionOf } from '../survival';
import { pickTeam, rollTeamDie } from '../teams';
import { guessWall } from '../wall';
import { decideWipeout, decisionOpen } from '../wipeout';

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

/** Результат дії, якщо вона вдалася; інакше той самий стан. */
const tryAct = (state: GameState, result: Result): GameState => (result.ok ? result.state : state);

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
      return question.rows.length === 0 ? { type: 'survey', values: ['Весна'] } : { type: 'survey', values: [question.rows[0].text] };
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

/** Один гравець відповідає на поточне запитання: окремі ходи для ланцюжка, сортування, стіни й блефу, інакше submitAnswer. */
function answerQuestion(state: GameState, playerId: string, wrong: boolean, now: number): GameState {
  const play = state.plays[state.questionIndex];
  if (play === undefined || recordOf(state, state.questionIndex, playerId) !== undefined) return state;
  const question = play.question;
  switch (question.type) {
    case 'chain': {
      let s = state;
      for (let i = chainOf(s, playerId).solved + 1; i < question.words.length; i++) {
        const done = guessWord(s, playerId, question.words[i], now);
        if (!done.ok) break;
        s = done.state;
      }
      return s;
    }
    case 'sort': {
      let s = state;
      for (let guard = 0; guard < question.words.length && recordOf(s, s.questionIndex, playerId) === undefined; guard++) {
        const head = sortOf(s, playerId).queue[0];
        const word = question.words.find((w) => w.id === head);
        if (word === undefined) break;
        const done = sortWord(s, playerId, word.id, word.categoryId, now);
        if (!done.ok) break;
        s = done.state;
      }
      return s;
    }
    case 'wall': {
      let s = state;
      for (const group of question.groups) {
        const positions = group.tiles.map((t) => s.presented.indexOf(t.id));
        s = tryAct(s, guessWall(s, playerId, positions, now));
        if (recordOf(s, s.questionIndex, playerId) !== undefined) break;
      }
      return s;
    }
    case 'bluff': {
      const bluff = bluffPlayOf(state);
      if (bluff === null) return state;
      if (bluff.bluff.stage === 'lies') {
        if (Object.hasOwn(bluff.bluff.lies, playerId)) return state;
        return tryAct(state, writeLie(state, playerId, `Вигадка ${playerId}`, now));
      }
      const truth = bluff.bluff.options.find((o) => o.kind === 'truth' && !o.removed);
      return truth === undefined ? state : tryAct(state, pickBluff(state, playerId, truth.id, now));
    }
    default: {
      const answer = wrong ? wrongAnswer(question) : rightAnswer(question);
      if (answer === null) return state;
      // Бліц з кнопкою: спершу натискання (у миттєвому бліці й поза бліцом не вдасться — і не треба).
      const queued = play.blitz === undefined ? state : tryAct(state, buzz(state, playerId, now));
      return tryAct(queued, submitAnswer(queued, playerId, answer, now));
    }
  }
}

/** Перша незіграна клітинка поточного поля. */
function firstCell(state: GameState): string | null {
  const round = currentRound(state);
  if (round?.type !== 'board') return null;
  return boardCells(round).find(({ cell }) => !cellPlayed(state, cell.question.id))?.cell.question.id ?? null;
}

/** Що вміють люди, які відповідають: хто помиляється, чи вирішують «Далі», чи оголошують дуель. */
export interface Answering {
  /** Гравці, що відповідають неправильно (лише на звичайних запитаннях). */
  wrong?: string[];
  /** «Далі» на першому вікні «Ва-банку» й першому рішенні «Мільйонера» (типово так); false — ніколи не вирішують. */
  decide?: boolean;
  /** Оголосити одну дуель на першому reveal (типово так, якщо є пул дуелей); false — ні. */
  duel?: boolean;
  /** Лише оголосити дуель і більше нічого (для перевірки жеребу категорії). */
  onlyDuel?: boolean;
}

/** Люди, що відповідають, з налаштуваннями. */
export function answerAs(config: Answering = {}): People {
  const { wrong = [], decide = true, duel = true, onlyDuel = false } = config;
  return (state, now) => {
    let s = state;
    const ids = s.players.map((p) => p.id);
    // Дуель: перший гравець оголошує другому на першому reveal, вибирає першу категорію й відповідає правильно.
    if (duel && s.quiz.duels !== undefined && s.phase === 'reveal' && s.duelsDeclared.length === 0 && s.duel === null && ids.length >= 2) {
      s = tryAct(s, declareDuel(s, ids[0], ids[1]));
    }
    if (onlyDuel) return s;
    if (s.duel !== null && s.phase === 'duel') {
      if (s.duel.stage === 'category') {
        const category = duelCategoriesLeft(s).find((c) => c.left > 0);
        if (category !== undefined) for (const id of ids) s = tryAct(s, pickDuelCategory(s, id, category.id, now, () => 0));
      } else if (s.duel.stage === 'question') {
        const question = duelQuestionOf(s);
        if (question !== null) s = tryAct(s, answerDuel(s, s.duel.challengerId, question.accepted[0], now));
      }
      return s;
    }
    switch (s.phase) {
      case 'lobby': {
        const teams = s.teams;
        if (teams === undefined) return s;
        if (teams.dice !== null && teams.dice.waiting.length > 0) {
          for (const id of teams.dice.waiting) s = tryAct(s, rollTeamDie(s, id, () => 0.5));
        } else if (teams.form === 'pick') {
          teams.members.forEach((m, i) => {
            if (m.teamId === null) s = tryAct(s, pickTeam(s, m.id, teams.list[i % teams.list.length].id));
          });
        }
        return s;
      }
      case 'intro': {
        const waiting = s.board?.dice?.waiting ?? [];
        for (const id of waiting) s = tryAct(s, rollDie(s, id, () => 0.5));
        return s;
      }
      case 'board': {
        const chooser = chooserOf(s);
        const cell = firstCell(s);
        return chooser === null || cell === null ? s : tryAct(s, pickCell(s, chooser, cell, now, () => 0));
      }
      case 'wager':
        for (const id of ids) if (!Object.hasOwn(s.final?.wagers ?? {}, id)) s = tryAct(s, placeWager(s, id, 0, now, () => 0));
        return s;
      case 'question': {
        const contestant = contestantOf(s);
        for (const id of ids) if (contestant === null || contestant === id) s = answerQuestion(s, id, wrong.includes(id), now);
        return s;
      }
      case 'leaderboard': {
        // Перше вікно раунду: «Ва-банк» — після першого запитання раунду, «Мільйонер» — після першої сходинки.
        const firstOfRound = s.plays.findIndex((p) => p.roundIndex === s.roundIndex) === s.questionIndex;
        if (decisionOpen(s)) {
          if (decide && firstOfRound) for (const id of ids) s = tryAct(s, decideWipeout(s, id, false, now));
        } else if (decisionPending(s)) {
          const contestant = contestantOf(s);
          if (decide && contestant !== null && ladderPlayOf(s)?.ladder.step === 0) s = tryAct(s, decideLadder(s, contestant, false, now));
        } else if (trialOpen(s)) {
          const trial = trialQuestionOf(s);
          const answer = trial === null ? null : rightAnswer(trial);
          for (const id of ids) s = tryAct(s, answer === null ? pickDoor(s, id, 0, now) : answerTrial(s, id, answer, now));
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
