import {
  DEFAULT_ANSWER_WINDOW,
  LIMITS,
  type Answer,
  type AnswerMode,
  type CellKind,
  type CellPenalty,
  type AdjustmentSource,
  type DebuffKind,
  type DuelStage,
  type ErrorCode,
  type Grade,
  type Phase,
  type Question,
  type Quiz,
  type BoardRound,
  type FinalRound,
  type Round,
  rulesOf,
} from '@quiz/shared';
// adjust.ts, debuffs.ts і duel.ts імпортують цей файл, а цей файл — їх; звертання лише під час виклику функцій.
import { adjustmentTotal } from './adjust';
import { applyVerdict, attemptsUsed, blitzDone, blitzRulesOf, isInstant, settleQueue, withPlay } from './blitz';
import { withCellPenalty } from './board-cells';
import { dicePending, dropFromDice } from './board-dice';
import { advanceTurn, BOARD_AWAY_MS, boardPoints, chooserOf, dropFromCircle, enterBoard, hasActiveCells, initBoard } from './board-turns';
import { chainDone, scoreChain } from './chain';
import { scoreSort, shiftSortLocks } from './sort';
import { fireDebuffs, spendDebuffs } from './debuffs';
import { advanceDuel, beginDuel, duelDue, tickDuel } from './duel';
import { checkAnswer } from './check';
import { clockOf, holdAt, pendingOf, releaseStaleHold, shiftQueue, thaw } from './hold';
import { normalizeText } from './normalize';
import { answerPoints, finalPoints, speedFactor, streakBonus } from './score';
import { splitBank, type BankOutcome } from './bank';
import { isTimed, limitMsOf, timeOver } from './timing';

export interface PlayerState {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
  totalTimeMs: number;
  /** Поточна серія правильних відповідей у поточному раунді. */
  streak: number;
}

export interface AnswerRecord {
  /** null — бліц, гравець натиснув, але не встиг відповісти. */
  answer: Answer | null;
  timeMs: number;
  accepted: boolean;
  accuracy: number;
  grade: Grade;
  /** Бали за відповідь без бонусу серії, зі штрафом. */
  basePoints: number;
  streakBonus: number;
  /** basePoints + streakBonus. */
  points: number;
  overridden: boolean;
}

/** Натискання «Відповісти» в бліці або відповідь у миттєвому бліці. */
export interface BuzzEntry {
  playerId: string;
  /** Час натискання. */
  at: number;
  /** Від відкриття запитання до натискання (бліц з кнопкою) або до відповіді (миттєвий), мс; паузи й утримання його не змінюють. */
  timeMs: number;
  /** Кінець вікна відповіді; null — до кінця таймера запитання. */
  deadline: number | null;
  answer: Answer | null;
}

/** Розглянута спроба в бліці. */
export interface Attempt {
  playerId: string;
  /** null — не встиг відповісти. */
  answer: Answer | null;
  /** Від відкриття запитання до натискання. */
  timeMs: number;
  grade: 'correct' | 'wrong';
  /** round(P × множник) за правильну, штраф або 0 за неправильну; без бонусу серії. */
  points: number;
}

/**
 * Одне зігране запитання; ключ answers є id гравця. У бліці answers містить підсумок усіх спроб
 * гравця, а blitz — чергу натискань і розглянуті спроби.
 */
export interface Play {
  roundIndex: number;
  question: Question;
  answers: Record<string, AnswerRecord>;
  blitz?: BlitzPlay;
  /** Сума змін часу ведучим («±15 с»), мс. */
  extraMs: number;
  /** Клітинка поля, з якої відкрито запитання. */
  board?: BoardPlay;
  /** Лише в запитанні раунду фіналу. */
  final?: FinalPlay;
  /** Лише в запитанні-ланцюжку; гравця тут немає, поки він не торкався ланцюжка. */
  chain?: Record<string, ChainProgress>;
  /** Лише в запитанні-сортуванні; гравця тут немає, поки він не зробив ходу. */
  sort?: Record<string, SortProgress>;
}

/** Поступ гравця в сортуванні. */
export interface SortProgress {
  /** Слова, що лишилися, у порядку черги гравця; голова — поточна картка. */
  queue: string[];
  /** Правильно відсортовані слова в порядку ходів. */
  sorted: string[];
  misses: number;
  /** До цієї миті (час сервера) гравець підвисає; null — ні. */
  lockedUntil: number | null;
  /** Слово останньої помилки; null після правильного ходу. */
  missed: string | null;
}

/** Поступ гравця в ланцюжку слів. */
export interface ChainProgress {
  /** Скільки прихованих слів уже вгадано. */
  solved: number;
  /** Скільки літер поточного слова відкрито; від 1 (перша літера). */
  shown: number;
  hints: number;
}

/** Фінал поточного раунду; null поза раундом фіналу. */
export interface FinalState {
  /** Межа ставки: max(0, рахунок) на вході в етап wager; бали від ведучого під час ставок її оновлюють. */
  limits: Record<string, number>;
  /** Ставки; гравця без ставки тут немає. */
  wagers: Record<string, number>;
  /** Хто натиснув «Ва-банк»: ставка йде за межею, поки триває етап ставок. */
  allIn: string[];
  /** Порядок розкриття; заповнюється на вході в reveal. */
  order: string[];
  /** Скільки гравців з order уже розкрито. */
  shown: number;
  /** Банк розподілено (крок після останнього розкриття); у класиці не використовується. */
  split: boolean;
}

/** Запитання фіналу в журналі. */
export interface FinalPlay {
  /** Ставка кожного гравця на мить відкриття запитання (без ставки — 0). */
  wagers: Record<string, number>;
  /** Хто на мить відкриття запитання поставив усю межу (> 0), у порядку гравців. */
  allIn: string[];
  /** Кого ведучий уже оцінив вручну (check 'manual'). */
  graded: string[];
}

/** Кидки кубиків на заставці раунду поля. */
export interface DiceState {
  /** Усі кидки гравця по черзі: перший тур, далі перекидання; немає ключа — ще не кидав. */
  throws: Record<string, number[]>;
  /** Учасники поточного туру в порядку приєднання; [] — порядок визначено. */
  tour: string[];
  /** Учасники туру, які ще не кинули в ньому. */
  waiting: string[];
  /** Номер туру: 1 — усі, далі — перекидання між тими, хто зрівнявся. */
  tourNo: number;
}

/** Стан ходів у раунді поля. */
export interface BoardState {
  /** Порядок поточного кола. */
  circle: string[];
  /** Скільки гравців поточного кола вже походили (вибрали клітинку або пропустили хід). */
  done: number;
  /** Номер поточного кола в раунді, від 1. */
  circleNo: number;
  /** null — кубики не кидають (порядок за приєднанням або ручний). */
  dice: DiceState | null;
  /** Відколи гравець, чий хід, відключений; null — на місці, пауза або не етап board. */
  awaySince: number | null;
}

/** Запитання, відкрите з клітинки поля. */
export interface BoardPlay {
  cellId: string;
  /** Хто вибрав клітинку; відповідає лише він. */
  chooserId: string;
  /** points запитання. */
  price: number;
  /** Множник клітинки: x2 → 2, x3 → 3, інакше 1. */
  multiplier: 1 | 2 | 3;
  /** Тип, спосіб відповіді й штраф клітинки, знімені з неї в мить відкриття. */
  kind: CellKind;
  answerMode: AnswerMode;
  /** Для kind 'blitz'. */
  penalty: CellPenalty;
  /** Відповідь з телефону, що чекає на рішення ведучого («Прийняти», оцінка або «Перевибрати»); інакше null. */
  answer: Answer | null;
  /** Варіант, який гравець назвав уголос, позначений ведучим (лише звичайна усна клітинка); лише для показу. */
  named?: Answer;
}

/** Бліц у межах одного запитання. */
export interface BlitzPlay {
  queue: BuzzEntry[];
  attempts: Attempt[];
  /** Хто натискав на цьому запитанні, без повторів; потрібне для серій, бо скинуті натискання зникають. */
  buzzed: string[];
  /** Відповіді, які не розглядали (після переможця або закриття), у порядку черги; лише для показу, без балів. */
  dropped: BuzzEntry[];
}

/** Коригування рахунку поза відповідями: бали від ведучого, пізніше — дуелі. */
export interface ScoreAdjustment {
  /** Зростаючий номер у межах гри, від 1. */
  seq: number;
  playerId: string;
  points: number;
  roundIndex: number;
  /** Скільки запитань журналу було закрито в мить коригування. */
  afterQuestion: number;
  source: AdjustmentSource;
  at: number;
}

/** Дебаф від ведучого на гравця. */
export interface DebuffState {
  kind: DebuffKind;
  /** Індекс у plays запитання, у якому дебаф спрацював; null — чекає. */
  firedAt: number | null;
  /** Мить спрацювання; null — чекає. */
  since: number | null;
}

/** Одне запитання дуелі. */
export interface DuelQuestionPlay {
  questionId: string;
  /** Неправильні спроби кожного дуелянта в порядку надсилання. */
  tries: Record<string, string[]>;
  /** Хто першим відповів правильно; null — ще ніхто або ніхто. */
  winnerId: string | null;
  /** Правильна відповідь переможця, як він її написав. */
  answer: string | null;
  /** Від відкриття запитання до правильної відповіді, мс. */
  timeMs: number | null;
}

/** Дуель між двома гравцями. */
export interface DuelState {
  challengerId: string;
  opponentId: string;
  stage: DuelStage;
  /** Етап гри, з якого почалася дуель; туди гра повертається. null, поки дуель лише оголошена. */
  returnPhase: Phase | null;
  categoryId: string | null;
  /** Скільки запитань зіграти: min(questionsPerDuel, залишок категорії) на мить вибору; до вибору 0. */
  total: number;
  /** Зіграні запитання й поточне (останнє); пропущені сюди не потрапляють. */
  questions: DuelQuestionPlay[];
  /** Переможець дуелі на етапі result; null — нічия або ще не result. */
  winnerId: string | null;
}

export interface GameState {
  quiz: Quiz;
  phase: Phase;
  /** -1 у лобі. */
  roundIndex: number;
  /** Індекс у plays: поточне або останнє зігране запитання; -1 до першого. */
  questionIndex: number;
  players: PlayerState[];
  /** Журнал запитань у порядку гри. */
  plays: Play[];
  /** Порядок варіантів або елементів поточного запитання, однаковий для всіх. */
  presented: string[];
  startedAt: number | null;
  endsAt: number | null;
  paused: boolean;
  /** Залишок часу запитання під час паузи. */
  remainingMs: number | null;
  /** Момент, коли гру поставили на паузу; null без паузи. */
  pausedAt: number | null;
  /** Ходи раунду поля; null поза раундом поля. */
  board: BoardState | null;
  /** Відколи годинник запитання стоїть, бо відповідь чекає на ведучого; null — іде. */
  heldAt: number | null;
  /** Фінал поточного раунду; null поза раундом фіналу. */
  final: FinalState | null;
  /** Журнал коригувань рахунку в порядку seq. */
  adjustments: ScoreAdjustment[];
  /** Останній виданий seq; після вилучення гравця номери не повторюються. */
  adjustmentSeq: number;
  /** Дебафи за id гравця: що чекають на наступне запитання або діють у поточному. */
  debuffs: Record<string, DebuffState>;
  /** Оголошена або поточна дуель; null — немає. */
  duel: DuelState | null;
  /** Хто вже оголошував дуель у цій грі. */
  duelsDeclared: string[];
  /** id запитань пулу, які вже з'являлися в дуелях цієї гри. */
  duelUsed: string[];
}

export type Result = { ok: true; state: GameState } | { ok: false; error: ErrorCode };

export const ok = (state: GameState): Result => ({ ok: true, state });
export const fail = (error: ErrorCode): Result => ({ ok: false, error });

export function createGame(quiz: Quiz): GameState {
  return {
    quiz,
    phase: 'lobby',
    roundIndex: -1,
    questionIndex: -1,
    players: [],
    plays: [],
    presented: [],
    startedAt: null,
    endsAt: null,
    paused: false,
    remainingMs: null,
    pausedAt: null,
    board: null,
    heldAt: null,
    final: null,
    adjustments: [],
    adjustmentSeq: 0,
    debuffs: {},
    duel: null,
    duelsDeclared: [],
    duelUsed: [],
  };
}

export function recordOf(state: GameState, playIndex: number, playerId: string): AnswerRecord | undefined {
  const byPlayer = state.plays[playIndex]?.answers;
  return byPlayer !== undefined && Object.hasOwn(byPlayer, playerId) ? byPlayer[playerId] : undefined;
}

export function currentRound(state: GameState): Round | null {
  return state.quiz.rounds[state.roundIndex] ?? null;
}

/** 0-базовий номер поточного запитання в раунді; -1, поки в раунді не було запитань. */
export function roundQuestionNumber(state: GameState): number {
  const upToCurrent = state.plays.slice(0, state.questionIndex + 1);
  return upToCurrent.filter((play) => play.roundIndex === state.roundIndex).length - 1;
}

/** Оцінка відповіді за точністю автоматичної перевірки. */
function gradeOf(accuracy: number): Grade {
  return accuracy >= 1 ? 'correct' : accuracy <= 0 ? 'wrong' : 'partial';
}

/** Записує відповідь гравця в поточне запитання. */
function withRecord(state: GameState, playerId: string, record: AnswerRecord): GameState {
  const plays = state.plays.map((play, index) =>
    index === state.questionIndex ? { ...play, answers: { ...play.answers, [playerId]: record } } : play,
  );
  return { ...state, plays };
}

export function addPlayer(state: GameState, player: { id: string; nickname: string }): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  const nickname = player.nickname.replace(/\s+/g, ' ').trim();
  if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) return fail('nickname_invalid');
  if (state.players.length >= LIMITS.maxPlayers) return fail('room_full');
  const key = normalizeText(nickname);
  if (state.players.some((p) => normalizeText(p.nickname) === key)) return fail('nickname_taken');
  const added: PlayerState = { id: player.id, nickname, connected: true, score: 0, totalTimeMs: 0, streak: 0 };
  return ok({ ...state, players: [...state.players, added] });
}

export function removePlayer(state: GameState, playerId: string): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const plays = state.plays.map((play): Play => {
    const { [playerId]: _removed, ...rest } = play.answers;
    const kept: Play = { ...play, answers: rest };
    if (play.chain !== undefined) {
      const { [playerId]: _progress, ...chain } = play.chain;
      kept.chain = chain;
    }
    if (play.sort !== undefined) {
      const { [playerId]: _progress, ...sort } = play.sort;
      kept.sort = sort;
    }
    if (play.final !== undefined) {
      const { [playerId]: _wager, ...wagers } = play.final.wagers;
      const without = (ids: string[]) => ids.filter((id) => id !== playerId);
      kept.final = { wagers, allIn: without(play.final.allIn), graded: without(play.final.graded) };
    }
    if (play.blitz === undefined) return kept;
    const blitz = {
      queue: play.blitz.queue.filter((e) => e.playerId !== playerId),
      attempts: play.blitz.attempts.filter((a) => a.playerId !== playerId),
      buzzed: play.blitz.buzzed.filter((id) => id !== playerId),
      dropped: play.blitz.dropped.filter((e) => e.playerId !== playerId),
    };
    return { ...kept, blitz };
  });
  // Гравець зникає з кола; відлік відсутності скидається, його заново ставить tick.
  // Вилучений гравець зникає й з кидків кубиків; тур, що через це скінчився, рахується.
  const ids = state.players.map((p) => p.id);
  const board = state.board === null ? null : { ...dropFromDice(dropFromCircle(state.board, playerId), playerId, ids), awaySince: null };
  const final = state.final === null ? null : dropFromFinal(state.final, playerId);
  // Запитання фіналу після вилучення саме не відкривається: ведучий тисне «Показати запитання».
  const adjustments = state.adjustments.filter((a) => a.playerId !== playerId);
  const { [playerId]: _debuff, ...debuffs } = state.debuffs;
  // Без вилученого банк фіналу менший: бали решти перераховуються.
  const kicked = withTotals({ ...state, players: state.players.filter((p) => p.id !== playerId), plays, board, final, adjustments, debuffs });
  // Наступний у черзі, який уже відповів, перевіряється одразу; на паузі — після продовження.
  return ok(autoLock(kicked.paused ? kicked : settleQueue(kicked, null)));
}

/** Гравець зникає з меж, ставок, ва-банку й порядку розкриття; якщо його вже розкрили, лічильник зменшується, щоб не перескочити сусіда. */
function dropFromFinal(final: FinalState, playerId: string): FinalState {
  const { [playerId]: _limit, ...limits } = final.limits;
  const { [playerId]: _wager, ...wagers } = final.wagers;
  const index = final.order.indexOf(playerId);
  const shown = index !== -1 && index < final.shown ? final.shown - 1 : final.shown;
  const without = (ids: string[]) => ids.filter((id) => id !== playerId);
  return { ...final, limits, wagers, allIn: without(final.allIn), order: without(final.order), shown };
}

export function setConnected(state: GameState, playerId: string, connected: boolean, now: number): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const players = state.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  const changed = { ...state, players };
  // Відлік 30 секунд іде лише для гравця, чий хід, і не на паузі.
  if (state.phase === 'board' && state.board !== null && !state.paused && chooserOf(state) === playerId) {
    return ok({ ...changed, board: { ...state.board, awaySince: connected ? null : (state.board.awaySince ?? now) } });
  }
  // На звичайній клітинці без таймера так само, але відлік не стартує, поки відповідь чекає на ведучого.
  const watched = state.phase === 'question' && !state.paused && awayWatched(state) === playerId;
  if (watched && state.board !== null && (connected || state.heldAt === null)) {
    return ok(autoLock({ ...changed, board: { ...state.board, awaySince: connected ? null : (state.board.awaySince ?? now) } }, now));
  }
  return ok(autoLock(changed, now));
}

/** Гравець, чия відсутність закриває запитання: той, хто вибрав звичайну клітинку без таймера; інакше null. */
function awayWatched(state: GameState): string | null {
  if (state.phase !== 'question') return null;
  const play = state.plays[state.questionIndex];
  const board = play?.board;
  if (board === undefined || board.kind !== 'normal' || isTimed(play.question)) return null;
  return state.players.some((p) => p.id === board.chooserId) ? board.chooserId : null;
}

/**
 * Ставить відлік відсутності (awaySince = now), якщо гравець, за яким стежать, відключений, а відліку ще немає.
 * Сервер викликає tick лише за дедлайном, тож відлік ставлять і самі дії, після яких він має піти.
 */
function watchAway(state: GameState, now: number): GameState {
  if (state.paused || state.heldAt !== null || state.board === null || state.board.awaySince !== null) return state;
  const watched = awayWatched(state);
  const away = watched !== null && state.players.some((p) => p.id === watched && !p.connected);
  return away ? { ...state, board: { ...state.board, awaySince: now } } : state;
}

export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function present(question: Question, shuffleOptions: boolean, rng: Rng): string[] {
  if (question.type === 'order') {
    const ids = question.items.map((item) => item.id);
    const mixed = shuffle(ids, rng);
    // Гравець не повинен отримати готову правильну відповідь.
    return mixed.every((id, index) => id === ids[index]) ? [...ids.slice(1), ids[0]] : mixed;
  }
  if (question.type === 'match') {
    // Правий стовпчик перемішується завжди; на одному рівні з лівим він видав би відповідь.
    const ids = question.pairs.map((pair) => pair.right.id);
    const mixed = shuffle(ids, rng);
    return mixed.every((id, index) => id === ids[index]) ? [...ids.slice(1), ids[0]] : mixed;
  }
  if (question.type === 'single' || question.type === 'multi') {
    const ids = question.options.map((option) => option.id);
    return shuffleOptions ? shuffle(ids, rng) : ids;
  }
  if (question.type === 'sort') {
    // Авторський порядок часто згрупований за категоріями: слова перемішуються завжди, однаково для всіх.
    return shuffle(question.words.map((word) => word.id), rng);
  }
  return [];
}

/** Наступне запитання поточного раунду: перше за порядком, якого ще немає в журналі цього раунду. */
function nextQuestion(state: GameState): Question | undefined {
  const round = currentRound(state);
  if (round === null || round.type === 'board') return undefined;
  const played = new Set(state.plays.filter((p) => p.roundIndex === state.roundIndex).map((p) => p.question.id));
  return round.questions.find((question) => !played.has(question.id));
}

export function openQuestion(state: GameState, question: Question, now: number, rng: Rng, board?: BoardPlay): GameState {
  const round = state.quiz.rounds[state.roundIndex];
  const play: Play = {
    roundIndex: state.roundIndex,
    question,
    answers: {},
    extraMs: 0,
    ...(board !== undefined ? { board } : {}),
    // Сортування в бліц-раунді без черги натискань: перемагає перший, хто відсортував усе.
    ...((round.type === 'blitz' && question.type !== 'sort') || board?.kind === 'blitz'
      ? { blitz: { queue: [], attempts: [], buzzed: [], dropped: [] } }
      : {}),
  };
  // Клітинку без таймера ведучий міг вибрати за відсутнього гравця: відлік іде з відкриття.
  // Дебафи, що чекають, спрацьовують для тих, хто відповідає на це запитання з телефона.
  const opened = watchAway(
    {
      ...state,
      phase: 'question',
      questionIndex: state.plays.length,
      plays: [...state.plays, play],
      presented: present(question, round.shuffleOptions, rng),
      startedAt: now,
      endsAt: isTimed(question) ? now + question.timeLimit * 1000 : null,
      remainingMs: null,
      heldAt: null,
    },
    now,
  );
  return fireDebuffs(opened, now);
}

/** Відкриває запитання фіналу; ставка кожного гравця знімається на цю мить, хто не поставив — грає з 0. */
export function openFinalQuestion(state: GameState, now: number, rng: Rng): GameState {
  const round = currentRound(state);
  if (round?.type !== 'final' || state.final === null) return state;
  const placed = state.final.wagers;
  const wagers: Record<string, number> = Object.fromEntries(state.players.map((p) => [p.id, Object.hasOwn(placed, p.id) ? placed[p.id] : 0]));
  const limits = state.final.limits;
  // «ВА-БАНК!» — кожен, чия ставка дорівнює межі й більша за 0, натиснув він кнопку чи ввів суму.
  const allIn = state.players.filter((p) => wagers[p.id] > 0 && Object.hasOwn(limits, p.id) && wagers[p.id] === limits[p.id]).map((p) => p.id);
  const opened = openQuestion(state, round.questions[0], now, rng);
  return withCurrentPlay(opened, { ...opened.plays[opened.questionIndex], final: { wagers, allIn, graded: [] } });
}

/** Замінює поточне запитання в журналі; експортовано для board.ts. */
export function withCurrentPlay(state: GameState, play: Play): GameState {
  return { ...state, plays: state.plays.map((p, index) => (index === state.questionIndex ? play : p)) };
}

/** Запитання фіналу поточного раунду, якщо його вже відкрито; інакше undefined. */
function finalPlayOf(state: GameState): (Play & { final: FinalPlay }) | undefined {
  const play = state.plays[state.questionIndex];
  if (state.final === null || play?.final === undefined || play.roundIndex !== state.roundIndex) return undefined;
  return { ...play, final: play.final };
}

/** Ставка гравця, знята на відкритті запитання фіналу. */
function wagerOf(final: FinalPlay, playerId: string): number {
  return Object.hasOwn(final.wagers, playerId) ? final.wagers[playerId] : 0;
}

/** Бали фіналу кожного гравця поточного запитання фіналу за типом ставок раунду; гравець без запису — програвший. */
export function finalOutcome(state: GameState): BankOutcome | null {
  const play = finalPlayOf(state);
  if (play === undefined) return null;
  const round = state.quiz.rounds[play.roundIndex];
  const entries = state.players.map((player) => ({
    playerId: player.id,
    wager: wagerOf(play.final, player.id),
    correct: recordOf(state, state.questionIndex, player.id)?.grade === 'correct',
  }));
  if (round.type === 'final' && round.wagerMode === 'bank') return splitBank(entries);
  const points = Object.fromEntries(entries.map((e) => [e.playerId, finalPoints(e.wager, e.correct)]));
  return { bank: 0, refund: false, points };
}

/**
 * Фінал скінчився: раунд закрито (round_end чи finished), а всіх гравців уже розкрито.
 * Тоді записи фіналу сталі — вилучення чи коригування після фіналу не змінюють уже показаних часток банку.
 */
function finalFrozen(state: GameState): boolean {
  if (state.phase !== 'round_end' && state.phase !== 'finished') return false;
  const final = state.final;
  return final !== null && final.order.length > 0 && final.shown >= final.order.length;
}

/** Перезаписує basePoints і points усіх записів поточного запитання фіналу за finalOutcome; поза ним — стан без змін. */
export function withFinalPoints(state: GameState): GameState {
  if (finalFrozen(state)) return state;
  const outcome = finalOutcome(state);
  if (outcome === null) return state;
  const play = state.plays[state.questionIndex];
  const answers = { ...play.answers };
  for (const [playerId, record] of Object.entries(answers)) {
    const points = Object.hasOwn(outcome.points, playerId) ? outcome.points[playerId] : record.points;
    answers[playerId] = { ...record, basePoints: points, streakBonus: 0, points };
  }
  return withCurrentPlay(state, { ...play, answers });
}

/** Раунд з банком, запитання відкрито, загальний банк > 0 і розподілу ще не було. */
export function needsSplit(state: GameState): boolean {
  const play = finalPlayOf(state);
  if (play === undefined || state.final === null || state.final.split) return false;
  const round = state.quiz.rounds[play.roundIndex];
  return round.type === 'final' && round.wagerMode === 'bank' && (finalOutcome(state)?.bank ?? 0) > 0;
}

/**
 * Бали фіналу гравця, які вже можна показати сцені й телефонам: поза фіналом — points запису;
 * до розкриття гравця — 0; у банку до розподілу — помилка −ставка, правильно 0; далі — points запису.
 */
export function finalVisiblePoints(state: GameState, playerId: string): number {
  const record = recordOf(state, state.questionIndex, playerId);
  const points = record?.points ?? 0;
  const play = finalPlayOf(state);
  if (play === undefined || state.final === null) return points;
  if (!finalShown(state, playerId)) return 0;
  const round = state.quiz.rounds[play.roundIndex];
  if (round.type !== 'final' || round.wagerMode !== 'bank' || state.final.split) return points;
  // Частки й повернення залежать від усіх; до розподілу видно лише власну ставку в банку.
  return record?.grade === 'correct' ? 0 : 0 - wagerOf(play.final, playerId);
}

/**
 * Чи розкрито результат гравця у фіналі поточного запитання (для зрізів).
 * Поза фіналом і без відкритого запитання фіналу — true; на question і locked — false;
 * на reveal — лише для гравців, яких уже розкрито (перші `shown` в order).
 */
export function finalShown(state: GameState, playerId: string): boolean {
  // Без відкритого запитання фіналу (зокрема, раунд завершено на ставках) розкривати нічого.
  if (state.final === null || finalPlayOf(state) === undefined) return true;
  if (state.phase === 'question' || state.phase === 'locked') return false;
  const index = state.final.order.indexOf(playerId);
  return index !== -1 && index < state.final.shown;
}

/** Кожен гравець без запису на запитання фіналу отримує «неправильно» без відповіді й −ставка. */
function settleFinal(state: GameState): GameState {
  const play = finalPlayOf(state);
  if (play === undefined) return state;
  let settled = state;
  for (const player of state.players) {
    if (recordOf(state, state.questionIndex, player.id) !== undefined) continue;
    const points = finalPoints(wagerOf(play.final, player.id), false);
    settled = withRecord(settled, player.id, {
      answer: null,
      timeMs: limitMsOf(play) ?? 0,
      accepted: false,
      accuracy: 0,
      grade: 'wrong',
      basePoints: points,
      streakBonus: 0,
      points,
      overridden: false,
    });
  }
  return settled;
}

/**
 * Мовчання оцінюється, рахунки перераховуються, а порядок розкриття фіксується (якщо його ще немає):
 * за зростанням рахунку до фіналу, за рівності в порядку приєднання.
 */
function settleFinalWithOrder(state: GameState): GameState {
  const totals = withTotals(settleFinal(state));
  if (totals.final === null || totals.final.order.length > 0) return totals;
  const before = (player: PlayerState) => player.score - (recordOf(totals, totals.questionIndex, player.id)?.points ?? 0);
  // Array.prototype.sort стабільний: рівні лишаються в порядку state.players.
  const order = [...totals.players].sort((a, b) => before(a) - before(b)).map((p) => p.id);
  return { ...totals, final: { ...totals.final, order } };
}

/** Після відкриття запитання фіналу дострокове завершення оцінює всіх, вважає всіх розкритими, а банк — розподіленим. */
function closeFinal(state: GameState): GameState {
  if (finalPlayOf(state) === undefined) return withTotals(state);
  const settled = settleFinalWithOrder(state);
  return settled.final === null ? settled : { ...settled, final: { ...settled.final, shown: settled.final.order.length, split: true } };
}

/** Скидає відлік відсутності гравця, чий хід. */
function clearAway(board: BoardState | null): BoardState | null {
  return board === null ? null : { ...board, awaySince: null };
}

/** Після останнього раунду гра закінчується, інакше показуються підсумки раунду. */
function finishRound(state: GameState): GameState {
  const isLastRound = state.roundIndex === state.quiz.rounds.length - 1;
  return { ...state, phase: isLastRound ? 'finished' : 'round_end', board: clearAway(state.board) };
}

/** Відкриває наступне запитання раунду, а коли їх не лишилося, завершує раунд. */
function advance(state: GameState, now: number, rng: Rng): GameState {
  const question = nextQuestion(state);
  return question !== undefined ? openQuestion(state, question, now, rng) : finishRound(state);
}

/**
 * Серія кожного гравця після перших upTo запитань журналу: поспіль правильні відповіді в раунді
 * останнього з них. Без відповіді серія перервана, але в бліці запитання, де гравець не натискав,
 * серію не обриває й не продовжує (натискання без правильної спроби обриває; так само сортування без ходів); на межі раундів вона скидається;
 * якщо правил серії в тому раунді немає, серій немає.
 */
export function streakCounts(state: GameState, upTo: number): Record<string, number> {
  const last = state.plays[upTo - 1];
  if (last === undefined) return {};
  const round = state.quiz.rounds[last.roundIndex];
  if (rulesOf(round).streak === null) return {};
  const counts: Record<string, number> = {};
  for (const player of state.players) {
    let count = 0;
    for (let i = upTo - 1; i >= 0 && state.plays[i].roundIndex === last.roundIndex; i -= 1) {
      const record = recordOf(state, i, player.id);
      const blitz = state.plays[i].blitz;
      if (record === undefined && blitz !== undefined && !blitz.buzzed.includes(player.id)) continue;
      // Сортування в бліц-раунді (без черги): хто не ходив, серію не обриває й не продовжує.
      if (record === undefined && blitz === undefined && round.type === 'blitz') continue;
      // На полі серію рахують лише власні ходи гравця.
      const board = state.plays[i].board;
      if (board !== undefined && board.chooserId !== player.id) continue;
      if (record === undefined || record.accuracy < 1) break;
      count += 1;
    }
    counts[player.id] = count;
  }
  return counts;
}

/** Від чого рахується бонус серії: у бліці від виграшної спроби, бо basePoints містить і штрафи. */
function streakBase(play: Play, playerId: string, record: AnswerRecord): number {
  if (play.blitz === undefined) return record.basePoints;
  return play.blitz.attempts.find((a) => a.playerId === playerId && a.grade === 'correct')?.points ?? 0;
}

/**
 * Перераховує рахунок, серії й сумарний час за всіма вже закритими запитаннями; до рахунку додаються коригування.
 * Внутрішня функція рушія: експортовано для adjust.ts, не для сервера.
 */
export function withTotals(input: GameState): GameState {
  // Бали фіналу залежать від усіх записів запитання (спільний банк), тож перераховуються першими.
  const state = withFinalPoints(input);
  // Відкрите запитання завжди останнє в журналі.
  const closedCount = state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
  const plays = state.plays.map((play, index) => {
    if (index >= closedCount) return play;
    const streak = rulesOf(state.quiz.rounds[play.roundIndex]).streak;
    if (streak === null) return play;
    // Серія враховує і саме це запитання.
    const counters = streakCounts(state, index + 1);
    const answers = { ...play.answers };
    for (const player of state.players) {
      const record = Object.hasOwn(answers, player.id) ? answers[player.id] : undefined;
      // Серія на полі лише за власні клітинки: на чужій бліц-клітинці бонусу немає.
      if (record === undefined || (play.board !== undefined && play.board.chooserId !== player.id)) continue;
      const bonus = (counters[player.id] ?? 0) >= streak.length ? streakBonus(streakBase(play, player.id, record), streak.bonus) : 0;
      answers[player.id] = { ...record, streakBonus: bonus, points: record.basePoints + bonus };
    }
    return { ...play, answers };
  });

  const counters = state.plays[closedCount - 1]?.roundIndex === state.roundIndex ? streakCounts(state, closedCount) : {};
  const players = state.players.map((player) => {
    let score = 0;
    let totalTimeMs = 0;
    for (const play of plays.slice(0, closedCount)) {
      const record = Object.hasOwn(play.answers, player.id) ? play.answers[player.id] : undefined;
      score += record ? record.points : 0;
      // Час для рівного рахунку йде лише за класичні раунди й лише за запитання з таймером.
      const limitMs = limitMsOf(play);
      if (state.quiz.rounds[play.roundIndex].type !== 'classic' || limitMs === null) continue;
      totalTimeMs += record ? record.timeMs : limitMs;
    }
    score += adjustmentTotal(state, player.id);
    return { ...player, score, totalTimeMs, streak: counters[player.id] ?? 0 };
  });
  return { ...state, plays, players };
}

/** Нерозглянуті натискання бліцу переходять у dropped: лише для показу, без балів і штрафу. */
function dropQueue(state: GameState): GameState {
  const play = state.plays[state.questionIndex];
  if (play?.blitz === undefined || play.blitz.queue.length === 0) return state;
  const { queue, dropped } = play.blitz;
  const closed: Play = { ...play, blitz: { ...play.blitz, queue: [], dropped: [...dropped, ...queue] } };
  return withPlay(state, closed);
}

/**
 * Закриває запитання; «Мінус для всіх» бліц-клітинки нараховується саме тут, рівно один раз.
 * Внутрішня функція рушія: експортовано для sort.ts, не для сервера.
 */
export function lockNow(state: GameState): GameState {
  // Бали за ланцюжок залежать від найшвидшого, тож рахуються лише тут, коли відомі часи всіх.
  // Незакінчене сортування отримує записи за відсортовані слова.
  const closed = spendDebuffs(withCellPenalty(dropQueue(scoreSort(scoreChain(state)))));
  return withTotals({ ...closed, phase: 'locked', startedAt: null, endsAt: null, remainingMs: null, heldAt: null, board: clearAway(closed.board) });
}

/**
 * Закриває запитання поля й одразу розкриває оцінку: так відповідь світиться зеленим або червоним.
 * Внутрішня функція рушія: експортовано для sort.ts, не для сервера.
 */
export function revealNow(state: GameState): GameState {
  return withTotals({ ...lockNow(state), phase: 'reveal' });
}

/**
 * Закриває запитання, якщо відповіли всі підключені гравці (у бліці: якщо запитання вже вирішене;
 * у ланцюжку: кожен підключений пройшов або, якщо відомо now, вичерпав свій час).
 * Внутрішня функція рушія: експортовано для chain.ts, не для сервера.
 */
export function autoLock(state: GameState, now: number | null = null): GameState {
  if (state.phase !== 'question' || state.paused) return state;
  if (state.plays[state.questionIndex]?.blitz !== undefined) return blitzDone(state, null) ? lockNow(state) : state;
  if (state.plays[state.questionIndex]?.question.type === 'chain') return chainDone(state, now) ? lockNow(state) : state;
  // На полі запитання закриває сама відповідь або оцінка ведучого.
  if (currentRound(state)?.type === 'board') return state;
  const connected = state.players.filter((p) => p.connected);
  if (connected.length === 0) return state;
  const everyoneAnswered = connected.every((p) => recordOf(state, state.questionIndex, p.id) !== undefined);
  return everyoneAnswered ? lockNow(state) : state;
}

/** Кожна гра починається із заставки першого раунду; перше запитання відкриває `next`. */
export function start(state: GameState): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  if (state.players.length === 0) return fail('no_players');
  return ok({ ...enterRound({ ...state, roundIndex: 0 }), phase: 'intro' });
}

export function submitAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const play = state.plays[state.questionIndex];
  // Ланцюжок проходять лише guessWord і takeHint: підсумок з телефона не приймається.
  if (answer.type === 'chain' || play.question.type === 'chain') return fail('type_mismatch');
  // Сортування — лише хід за ходом через sortWord.
  if (answer.type === 'sort' || play.question.type === 'sort') return fail('type_mismatch');
  const { question, roundIndex } = play;
  const round = state.quiz.rounds[roundIndex];
  if (play.blitz !== undefined) {
    // Усну відповідь голови черги оцінює ведучий, з телефона її не приймають.
    if (blitzRulesOf(state, play)?.check === 'voice') return fail('wrong_phase');
    return submitBlitzAnswer(state, playerId, answer, now);
  }
  if (round.type === 'board') return submitBoardAnswer(state, round, playerId, answer, now);
  if (round.type === 'final') return submitFinalAnswer(state, round, playerId, answer, now);
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  if (question.type !== answer.type) return fail('type_mismatch');

  const timeMs = Math.max(0, now - state.startedAt);
  const { accepted, accuracy } = checkAnswer(question, answer);
  const limit = limitMsOf(play);
  const speed = speedFactor(timeMs, limit ?? 0, round.type === 'classic' && round.speedBonus && limit !== null);
  const points = answerPoints({
    points: question.points,
    accuracy,
    speed,
    multiplier: rulesOf(round).multiplier,
    penalty: rulesOf(round).penalty,
  });
  const record: AnswerRecord = {
    answer,
    timeMs,
    accepted,
    accuracy,
    grade: gradeOf(accuracy),
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  return ok(autoLock(withRecord(state, playerId, record)));
}

/**
 * Відповідь у фіналі: лише «правильно» (+ставка) або «неправильно» (−ставка), без часткових балів.
 * За ручної перевірки запис тимчасовий («неправильно»), доки ведучий не оцінить.
 */
function submitFinalAnswer(state: GameState, round: FinalRound, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  const wager = play.final === undefined ? 0 : wagerOf(play.final, playerId);
  const correct = round.check === 'auto' && checkAnswer(play.question, answer).accuracy === 1;
  const points = finalPoints(wager, correct);
  const record: AnswerRecord = {
    answer,
    timeMs: Math.max(0, now - state.startedAt),
    accepted: correct,
    accuracy: correct ? 1 : 0,
    grade: correct ? 'correct' : 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  // У спільному банку бали залежать від інших записів: ведучий одразу бачить формулу раунду.
  return ok(autoLock(withFinalPoints(withRecord(state, playerId, record))));
}

/** Відповідь на запитання поля: лише від гравця, чий хід; годинник стоїть, поки ведучий не прийме відповідь або не дасть перевибрати. */
function submitBoardAnswer(state: GameState, round: BoardRound, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  const board = play.board;
  if (board === undefined || board.answerMode === 'voice') return fail('wrong_phase');
  if (playerId !== board.chooserId) return fail('not_your_turn');
  if (recordOf(state, state.questionIndex, playerId) !== undefined || board.answer !== null) return fail('already_answered');
  if (timeOver(state, play, now)) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  return ok(holdAt(withBoard(state, { ...board, answer }), now));
}

/** «Прийняти» за автоматичної перевірки. */
export function acceptAnswer(state: GameState, playerId: string, now: number): Result {
  const pending = pendingOf(state);
  if (pending === null) return fail('wrong_phase');
  // Ведучий називає відповідь: подвійний дотик не має прийняти наступну, яку він ще не бачив.
  if (pending.playerId !== playerId) return fail('not_found');
  if (state.paused) return fail('paused');
  const play = state.plays[state.questionIndex];
  const round = state.quiz.rounds[play.roundIndex];
  if (play.blitz !== undefined) {
    if (blitzRulesOf(state, play)?.check !== 'auto') return fail('wrong_phase');
    const correct = checkAnswer(play.question, pending.answer).accuracy === 1;
    return closeIfDone(applyVerdict(state, pending.playerId, correct, now), now);
  }
  if (round.type !== 'board' || play.board === undefined || round.check === 'manual') return fail('wrong_phase');

  const checked = checkAnswer(play.question, pending.answer);
  // Часткові бали лише за увімкненого правила; інакше неповна відповідь неправильна.
  const accuracy = checked.accuracy >= 1 ? 1 : checked.accuracy > 0 && rulesOf(round).partial !== null ? checked.accuracy : 0;
  const points = boardPoints(round, play.board, accuracy);
  const record: AnswerRecord = {
    answer: pending.answer,
    timeMs: Math.max(0, clockOf(state, now) - (state.startedAt ?? now)),
    accepted: accuracy >= 1,
    accuracy,
    grade: gradeOf(accuracy),
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  return ok(revealNow(withRecord(state, pending.playerId, record)));
}

/**
 * «Перевибрати»: відповідь знято, годинник (у бліці й вікно голови черги) іде з того самого залишку.
 * У миттєвому бліці голова лишається на місці й отримує нове вікно DEFAULT_ANSWER_WINDOW від цієї миті.
 */
export function repick(state: GameState, playerId: string, now: number): Result {
  const pending = pendingOf(state);
  if (pending === null) return fail('wrong_phase');
  if (pending.playerId !== playerId) return fail('not_found');
  if (state.paused) return fail('paused');
  const play = state.plays[state.questionIndex];
  if (play.blitz !== undefined) {
    const rules = blitzRulesOf(state, play);
    const deadline = rules !== null && isInstant(rules) ? { deadline: now + DEFAULT_ANSWER_WINDOW * 1000 } : {};
    const queue = play.blitz.queue.map((e, index) => (index === 0 ? { ...e, answer: null, ...deadline } : e));
    return ok(thaw(withPlay(state, { ...play, blitz: { ...play.blitz, queue } }), now));
  }
  const board = play.board;
  if (board === undefined) return fail('wrong_phase');
  // Гравець міг піти, поки відповідь чекала: тепер відлік відсутності рушає.
  return ok(watchAway(thaw(withBoard(state, { ...board, answer: null }), now), now));
}

/** Замінює клітинку в поточному запитанні поля. */
function withBoard(state: GameState, board: BoardPlay): GameState {
  const plays = state.plays.map((play, index) => (index === state.questionIndex ? { ...play, board } : play));
  return { ...state, plays };
}

/**
 * Відповідь у бліці записується в чергу. Коли гравець стане першим, вона чекає на ведучого,
 * а годинник запитання стоїть. Під час утримання вікно перевіряється за замороженим годинником.
 * У миттєвому бліці відповідь сама ставить гравця в кінець черги, один раз за запитання.
 */
function submitBlitzAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  const entry = play.blitz?.queue.find((e) => e.playerId === playerId);
  const rules = blitzRulesOf(state, play);
  if (play.blitz !== undefined && rules !== null && isInstant(rules)) {
    if ((entry !== undefined && entry.answer !== null) || attemptsUsed(play, playerId) > 0) return fail('already_answered');
    if (entry === undefined) return joinInstant(state, play, play.blitz, playerId, answer, now);
  }
  if (play.blitz === undefined || entry === undefined) return fail('not_in_queue');
  if (entry.answer !== null) return fail('already_answered');
  const clock = clockOf(state, now);
  const limit = entry.deadline ?? (isTimed(play.question) ? state.endsAt : Infinity);
  if (limit === null || clock > limit) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');

  const queue = play.blitz.queue.map((e) => (e === entry ? { ...e, answer } : e));
  const answered: Play = { ...play, blitz: { ...play.blitz, queue } };
  return ok(settleQueue(withPlay(state, answered), clock));
}

/** Перша відповідь у миттєвому бліці: новий запис у кінці черги з часом від відкриття. */
function joinInstant(state: GameState, play: Play, blitz: BlitzPlay, playerId: string, answer: Answer, now: number): Result {
  if (timeOver(state, play, now)) return fail('time_over');
  if (play.question.type !== answer.type) return fail('type_mismatch');
  const entry: BuzzEntry = { playerId, at: now, timeMs: Math.max(0, now - (state.startedAt ?? now)), deadline: null, answer };
  const buzzed = blitz.buzzed.includes(playerId) ? blitz.buzzed : [...blitz.buzzed, playerId];
  return ok(settleQueue(withPlay(state, { ...play, blitz: { ...blitz, queue: [...blitz.queue, entry], buzzed } }), now));
}

/** Після рішення щодо голови черги бліцу запитання закривається, якщо воно вже вирішене. */
function closeIfDone(result: Result, now: number): Result {
  if (!result.ok) return result;
  return ok(blitzDone(result.state, now) ? lockNow(result.state) : result.state);
}

/** Ведучий оцінює голову черги: відповідь з телефона за ручної перевірки або усну відповідь. */
export function judge(state: GameState, playerId: string, correct: boolean, now: number): Result {
  const play = state.plays[state.questionIndex];
  const check = play === undefined ? undefined : blitzRulesOf(state, play)?.check;
  if (check === undefined || check === 'auto') return fail('wrong_phase');
  return closeIfDone(applyVerdict(state, playerId, correct, now), now);
}

export function lock(state: GameState): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  return ok(lockNow(state));
}

/** Сервер викликає періодично; закриває запитання, коли сплив час. У бліці також згоряють вікна відповіді. */
export function tick(state: GameState, now: number): GameState {
  if (state.phase === 'duel') return state.paused ? state : tickDuel(state, now);
  if (state.phase === 'board' && state.board !== null) return state.paused ? state : tickBoard(state, state.board, now);
  if (state.phase !== 'question' || state.paused) return state;
  const running = watchAway(releaseStaleHold(state, now), now);
  // Поки відповідь чекає на ведучого, годинник стоїть (і відлік відсутності теж).
  if (running.heldAt !== null) return running;
  // Ланцюжок закривається, коли кожен пройшов або вичерпав свій час зі штрафом.
  if (running.plays[running.questionIndex]?.question.type === 'chain' && chainDone(running, now)) return lockNow(running);
  // Звичайна клітинка без таймера закривається, коли гравець, чий хід, відсутній 30 секунд.
  const since = running.board?.awaySince ?? null;
  if (since !== null && awayWatched(running) !== null && now >= since + BOARD_AWAY_MS) return lockNow(running);
  if (running.plays[running.questionIndex]?.blitz !== undefined) {
    const settled = settleQueue(running, now);
    return blitzDone(settled, now) ? lockNow(settled) : settled;
  }
  const expired = running.endsAt !== null && now >= running.endsAt;
  return expired ? lockNow(running) : running;
}

/** Етап вибору клітинки: стартує відлік для відключеного гравця й пропускає хід, коли 30 секунд сплило. */
function tickBoard(state: GameState, board: BoardState, now: number): GameState {
  const chooser = chooserOf(state);
  const away = chooser !== null && state.players.some((p) => p.id === chooser && !p.connected);
  if (board.awaySince === null) return away ? { ...state, board: { ...board, awaySince: now } } : state;
  if (now < board.awaySince + BOARD_AWAY_MS) return state;
  return enterBoard({ ...state, board: advanceTurn(board) }, now);
}

/** Під час розкриття гравець, чий хід, без оцінки отримує «неправильно» (зі штрафом, якщо він увімкнений); бліц-клітинку не зачіпає. */
function unansweredIsWrong(state: GameState): GameState {
  const round = currentRound(state);
  const play = state.plays[state.questionIndex];
  if (round?.type !== 'board' || play?.board === undefined || play.board.kind === 'blitz') return state;
  const { chooserId } = play.board;
  if (!state.players.some((p) => p.id === chooserId) || recordOf(state, state.questionIndex, chooserId) !== undefined) return state;
  const points = boardPoints(round, play.board, 0);
  return withRecord(state, chooserId, {
    answer: play.board.answer,
    timeMs: limitMsOf(play) ?? 0,
    accepted: false,
    accuracy: 0,
    grade: 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  });
}

/** Ходи раунду поля й ставки фіналу починаються з нуля. */
function enterRound(state: GameState): GameState {
  const type = state.quiz.rounds[state.roundIndex]?.type;
  return {
    ...state,
    board: type === 'board' ? initBoard(state) : null,
    final: type === 'final' ? { limits: {}, wagers: {}, allIn: [], order: [], shown: 0, split: false } : null,
  };
}

/** Заставка фіналу → таємні ставки; межа ставки max(0, рахунок), таймера немає. */
function enterWager(state: GameState, final: FinalState): GameState {
  const limits = Object.fromEntries(state.players.map((p) => [p.id, Math.max(0, p.score)]));
  return { ...state, phase: 'wager', startedAt: null, endsAt: null, remainingMs: null, final: { ...final, limits } };
}

export function next(state: GameState, now: number, rng: Rng = Math.random): Result {
  if (state.paused) return fail('paused');
  // Дуель вклинюється між кроками гри: оголошена стартує замість кроку, після підсумку гра йде далі.
  if (state.phase === 'duel') return advanceDuel(state, now, rng);
  if (duelDue(state)) return ok(beginDuel(state));
  switch (state.phase) {
    case 'intro':
      if (currentRound(state)?.type === 'board') return dicePending(state.board) ? fail('dice_pending') : ok(enterBoard(state, now));
      if (state.final !== null) return ok(enterWager(state, state.final));
      return ok(advance(state, now, rng));
    case 'wager':
      return ok(openFinalQuestion(state, now, rng));
    case 'locked':
      if (finalPlayOf(state) !== undefined) return ok(settleFinalWithOrder({ ...state, phase: 'reveal' }));
      return ok(currentRound(state)?.type === 'board' ? withTotals(unansweredIsWrong({ ...state, phase: 'reveal' })) : { ...state, phase: 'reveal' });
    case 'reveal':
      if (state.final !== null && finalPlayOf(state) !== undefined) {
        // Гравці розкриваються по одному; рейтингу між запитаннями після фіналу немає.
        if (state.final.shown < state.final.order.length) return ok({ ...state, final: { ...state.final, shown: state.final.shown + 1 } });
        // Після останнього гравця банк (якщо він не порожній) розподіляється окремим кроком.
        if (needsSplit(state)) return ok({ ...state, final: { ...state.final, split: true } });
        return ok(finishRound(state));
      }
      if (currentRound(state)?.type === 'board') {
        if (!hasActiveCells(state)) return ok(finishRound(state));
        return ok(state.quiz.settings.leaderboard === 'each' ? { ...state, phase: 'leaderboard' } : enterBoard(state, now));
      }
      if (nextQuestion(state) === undefined) return ok(finishRound(state));
      if (state.quiz.settings.leaderboard === 'each') return ok({ ...state, phase: 'leaderboard' });
      return ok(advance(state, now, rng));
    case 'leaderboard':
      if (currentRound(state)?.type === 'board') return ok(enterBoard(state, now));
      return ok(advance(state, now, rng));
    case 'round_end':
      // Нова серія в новому раунді починається з нуля.
      return ok(withTotals(enterRound({ ...state, phase: 'intro', roundIndex: state.roundIndex + 1 })));
    default:
      return fail('wrong_phase');
  }
}

const IN_ROUND: Phase[] = ['intro', 'wager', 'board', 'question', 'locked', 'reveal', 'leaderboard'];

/** Ведучий завершує раунд достроково; незіграні запитання раунду так і лишаються незіграними. */
export function endRound(state: GameState, now: number): Result {
  if (!IN_ROUND.includes(state.phase)) return fail('wrong_phase');
  // Відкрите запитання спершу закривається й оцінюється, як при lock.
  const closed = state.phase === 'question' ? lockNow(state) : state;
  // Після відкриття запитання фіналу мовчання оцінюється, а всіх вважають розкритими.
  const settled = finalPlayOf(closed) !== undefined ? closeFinal(closed) : closed;
  return ok(finishRound({ ...settled, paused: false, startedAt: null, endsAt: null, remainingMs: null }));
}

export function pause(state: GameState, now: number): Result {
  if (state.paused) return fail('paused');
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  // Під час утримання годинник уже стоїть: пауза його не чіпає.
  if (state.phase === 'question' && state.heldAt !== null) return ok({ ...state, paused: true, pausedAt: now });
  if (state.phase === 'question' && state.endsAt !== null) {
    const remainingMs = Math.max(0, state.endsAt - now);
    return ok({ ...state, paused: true, pausedAt: now, remainingMs, startedAt: null, endsAt: null });
  }
  return ok({ ...state, paused: true, pausedAt: now, board: clearAway(state.board) });
}

export function resume(state: GameState, now: number): Result {
  if (!state.paused) return fail('wrong_phase');
  // Годинник стоїть і далі, доки ведучий не вирішить; якщо гравця вилучили на паузі, він рушає зараз.
  if (state.phase === 'question' && state.heldAt !== null) {
    // Якщо утримання знялося, а відповідати вже нікому, запитання закривається одразу.
    return ok(autoLock(settleQueue(releaseStaleHold({ ...state, paused: false, pausedAt: null }, now), now), now));
  }
  if (state.phase === 'question' && state.remainingMs !== null) {
    const limitMs = limitMsOf(state.plays[state.questionIndex]) ?? 0;
    const endsAt = now + state.remainingMs;
    // startedAt зсувається так, щоб час відповіді не включав паузу.
    const shift = now - (state.pausedAt ?? now);
    // Підвисання в сортуванні зсувається разом із годинником.
    const resumed = shiftSortLocks({ ...state, paused: false, pausedAt: null, remainingMs: null, endsAt, startedAt: endsAt - limitMs }, shift);
    // Чергу, яку не розглядали на паузі (наприклад, після вилучення голови), розглядаємо зараз.
    return ok(autoLock(settleQueue(shiftQueue(resumed, shift), now), now));
  }
  if (state.phase === 'question' && !isTimed(state.plays[state.questionIndex].question)) {
    // Без таймера зсуваються лише startedAt і вікна черги: пауза не входить у час відповіді.
    const shift = now - (state.pausedAt ?? now);
    const resumed = {
      ...state,
      paused: false,
      pausedAt: null,
      startedAt: state.startedAt === null ? null : state.startedAt + shift,
    };
    // Відлік відсутності пауза скинула; гравець, якого досі немає, знову має повні 30 секунд.
    return ok(watchAway(autoLock(settleQueue(shiftQueue(resumed, shift), now), now), now));
  }
  const resumed = { ...state, paused: false, pausedAt: null };
  // Після паузи відсутній гравець знову має повні 30 секунд.
  return ok(resumed.phase === 'board' ? enterBoard(resumed, now) : resumed);
}

/** Оцінка ведучого на полі: у питанні (голос або ручна перевірка після відповіді), після закриття й на розкритті. */
function overrideBoard(state: GameState, round: BoardRound, playerId: string, grade: Grade, now: number | undefined): Result {
  const play = state.plays[state.questionIndex];
  const board = play?.board;
  const phase = state.phase;
  if (board === undefined || (phase !== 'question' && phase !== 'locked' && phase !== 'reveal')) return fail('wrong_phase');
  // Оцінка бліц-клітинки остаточна, як у бліц-раунді.
  if (board.kind === 'blitz') return fail('wrong_phase');
  if (phase === 'question' && board.answerMode !== 'voice' && board.answer === null) return fail('wrong_phase');
  if (playerId !== board.chooserId || !state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (grade === 'partial' && rulesOf(round).partial === null) return fail('partial_disabled');
  const accuracy = grade === 'correct' ? 1 : grade === 'partial' ? (rulesOf(round).partial ?? 0) / 100 : 0;
  const existing = recordOf(state, state.questionIndex, playerId);
  const limitMs = limitMsOf(play) ?? 0;
  const spentMs =
    phase === 'question' && now !== undefined && state.startedAt !== null ? Math.max(0, clockOf(state, now) - state.startedAt) : limitMs;
  const points = boardPoints(round, board, accuracy);
  const record: AnswerRecord = {
    answer: existing?.answer ?? board.answer,
    timeMs: existing?.timeMs ?? spentMs,
    accepted: grade === 'correct',
    accuracy,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: phase === 'reveal',
  };
  const graded = withRecord(state, playerId, record);
  if (phase !== 'question') return ok(withTotals(graded));
  // Оцінка відповіді з телефона одразу розкривається; усна відповідь лише закриває запитання.
  return ok(board.answer !== null ? revealNow(graded) : lockNow(graded));
}

/** Оцінка ведучого у фіналі: після закриття й на розкритті; лише для гравця з відповіддю, без «частково». */
function overrideFinal(state: GameState, playerId: string, grade: Grade): Result {
  const play = finalPlayOf(state);
  if (play === undefined || (state.phase !== 'locked' && state.phase !== 'reveal')) return fail('wrong_phase');
  const record = recordOf(state, state.questionIndex, playerId);
  if (!state.players.some((p) => p.id === playerId) || record === undefined || record.answer === null) return fail('not_found');
  if (grade === 'partial') return fail('partial_disabled');
  const correct = grade === 'correct';
  const points = finalPoints(wagerOf(play.final, playerId), correct);
  const updated: AnswerRecord = {
    ...record,
    accepted: correct,
    accuracy: correct ? 1 : 0,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: state.phase === 'reveal',
  };
  const graded = play.final.graded.includes(playerId) ? play.final.graded : [...play.final.graded, playerId];
  const recorded = withRecord(state, playerId, updated);
  return ok(withTotals(withCurrentPlay(recorded, { ...recorded.plays[recorded.questionIndex], final: { ...play.final, graded } })));
}

/** Ведучий вручну виставляє оцінку відповіді на поточне запитання. */
export function override(state: GameState, playerId: string, grade: Grade, now?: number): Result {
  // Ланцюжок перевіряється за літерами однозначно; зміна одного вердикту зсунула б бали інших.
  // Сортування так само однозначне: сервер перевіряв кожен хід.
  const type = state.plays[state.questionIndex]?.question.type;
  if (type === 'chain' || type === 'sort') return fail('wrong_phase');
  const current = currentRound(state);
  if (current?.type === 'board') return overrideBoard(state, current, playerId, grade, now);
  if (current?.type === 'final') return overrideFinal(state, playerId, grade);
  if (state.phase !== 'reveal') return fail('wrong_phase');
  const play = state.plays[state.questionIndex];
  const { question, roundIndex } = play;
  const round = state.quiz.rounds[roundIndex];
  // Оцінка в бліці остаточна, навіть для гравця без запису.
  if (round.type === 'blitz') return fail('wrong_phase');
  const record = recordOf(state, state.questionIndex, playerId);
  if (record === undefined) return fail('not_found');
  if (grade === 'partial' && rulesOf(round).partial === null) return fail('partial_disabled');
  const accuracy = grade === 'correct' ? 1 : grade === 'partial' ? (rulesOf(round).partial ?? 0) / 100 : 0;
  const limit = limitMsOf(play);
  const speed = speedFactor(record.timeMs, limit ?? 0, round.type === 'classic' && round.speedBonus && limit !== null);
  const points = answerPoints({
    points: question.points,
    accuracy,
    speed,
    multiplier: rulesOf(round).multiplier,
    penalty: rulesOf(round).penalty,
  });
  const updated: AnswerRecord = {
    ...record,
    accepted: grade === 'correct',
    accuracy,
    grade,
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: true,
  };
  return ok(withTotals(withRecord(state, playerId, updated)));
}

export function end(state: GameState): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  // Поза фіналом closeFinal лише перераховує підсумки; у фіналі ще оцінює мовчання й розкриває всіх.
  return ok(
    closeFinal({
      ...dropQueue(scoreSort(scoreChain(state))),
      phase: 'finished',
      board: clearAway(state.board),
      paused: false,
      startedAt: null,
      endsAt: null,
      remainingMs: null,
      heldAt: null,
    }),
  );
}
