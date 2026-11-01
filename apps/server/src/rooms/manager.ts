import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  audioOf,
  phoneAudioOf,
  acceptAnswer,
  anyonePresent,
  authorPause,
  authorRemoveBluff,
  authorResume,
  authorTeamForm,
  autopilotStart,
  createAutopilotGame,
  isAuthor,
  pilotKey,
  pilotTry,
  planAutopilot,
  actAnswer,
  actBuzz,
  actorOf,
  addPlayer,
  addLatePlayer,
  continueFrom,
  resumeParticipants,
  assignTeam,
  adjustScore,
  undoScore,
  adjustTime,
  answerDuel,
  buyDebuff,
  cancelDebuff,
  cancelDuel,
  castAppealVote,
  castVote,
  createGame,
  dealTeams,
  declareDuel,
  end,
  endRound,
  giveHint,
  guessWord,
  hostLive,
  hostView,
  judge,
  lock,
  nameAnswer,
  next,
  nextDeadline,
  override,
  pause,
  pickDuelCategory,
  pickAnswerer,
  pickDuelist,
  pickTeam,
  pickCell,
  placeWager,
  playerView,
  removePlayer,
  repick,
  resume,
  rollDie,
  rollForRest,
  rollTeamDie,
  rollTeamRest,
  setCaptain,
  setConnected,
  setTeamForm,
  setDebuff,
  setOrder,
  skipDuelQuestion,
  skipTurn,
  sortWord,
  sortAudience,
  sortOf,
  sortSeq,
  tiltRefusal,
  guessWall,
  hideCloudWord,
  revealSurveyAll,
  revealBluffAll,
  removeBluffOption,
  pickBluff,
  decideWipeout,
  decideLadder,
  pickContestant,
  useLifeline,
  answerTrial,
  pickDoor,
  writeLie,
  takeBuff,
  chooseRetry,
  nextClue,
  skipGuide,
  startDice,
  startTeamDice,
  gameFacts,
  stageView,
  start,
  restPoint,
  slotsOf,
  suspend,
  takeHint,
  teamsOn,
  memberOf,
  teamOf,
  chainOf,
  wallOf,
  recordOf,
  tick,
  trialOpen,
  trialQuestionOf,
  questionFor,
  GAME_STATE_VERSION,
  READABLE_STATE_VERSIONS,
  stamp,
  awayClock,
  awayEnd,
  awayParticipant,
  awayStart,
  awayStep,
  tooSoon,
  openClue,
  openAppeal,
  type GameState,
  type PacedAction,
  type Result,
  type TeamAct,
} from '@quiz/engine';
import { ANSWERER_PICKS_PER_SECOND, REACTION_GAP_MS, reactionAllowed, type Reaction, type ReactionItem, APPEAL_VOTES_PER_SECOND, AWAY_EVENTS_PER_SECOND, awayGapMs, draftQuestionType, DRAFTS_PER_SECOND, isAnswerDraft, isUnscored, SORT_TILT_GAP_MS, type AckResult, type Answer, type AnswererScope, type AppealReason, type BuffKind, type DebuffKind, type DraftValue, type ErrorCode, type GameView, type Grade, type HostDrafts, type HostUndoTarget, type LifelineKind, type Phase, type PlayerView, type Question, type Quiz, type ResumeSetup, RESUME_POINTS_MAX, type ContinuedView, type PlacedPrize, placedPrizeSchema, type SlotsResponse, type Role, type SortTilt, type SubmittedAnswer, type TeamForm } from '@quiz/shared';
import { SAVED_GAME_VERSION, type ContinueResult, type RestartInput, type SavedGameData } from './continuation';
import { prizesView, titlesView } from './prizes';
import type { Scheduler } from './scheduler';

export const HOST_ABSENCE_MS = 10 * 60_000;
export const LOBBY_TTL_MS = 2 * 60 * 60_000;
export const FINISHED_TTL_MS = 30 * 60_000;
/** Кімната-автопілот без жодного гравця на зв'язку стільки часу (у грі) → «Завершити гру» (11g). */
export const AUTOPILOT_EMPTY_MS = 30 * 60_000;

export interface Identity {
  role: Role;
  playerId: string | null;
}

export interface Room {
  id: string;
  code: string;
  hostToken: string;
  stageToken: string;
  /** Акаунт ведучого; null для гри, створеної без входу. */
  hostUserId: string | null;
  /** Збережена вікторина, з якої створено гру; null для гри без акаунта. */
  quizId: string | null;
  /** Гравці, які увійшли в акаунт: id гравця → id акаунта. */
  playerUsers: Map<string, string>;
  state: GameState;
  /** Токен гравця → id гравця. */
  playerTokens: Map<string, string>;
  /** Кількість відкритих з'єднань: ключ 'host', 'stage' або id гравця. */
  connections: Map<string, number>;
  deadline: unknown;
  /** Таймер кроку автопілота (11g) на state.autopilot.at; null — немає. */
  pilot: unknown;
  /** Мить, до якої стан уже доведено таймером; дедлайни після неї ще належить обробити. */
  tickedTo: number;
  absence: unknown;
  /** Автопілот (11g): автор поставив паузу й пішов — через HOST_ABSENCE_MS пауза знімається сама; null — таймера немає. */
  authorAway: unknown;
  expiry: unknown;
  expiryPhase: Phase | null;
  /**
   * Чернетки (10j, 12b): id рядка «Відповідей наживо» (гравець, команда, людина в опитуванні командної гри) → живий вибір.
   * Лише в пам'яті: не в стані гри, не в збереженій кімнаті; після перезапуску порожньо. Товаришам — лише teammates,
   * пульту — лише через liveDrafts і лише з «наживо» (socket.ts).
   */
  drafts: Map<string, Draft>;
  /** Вікно частоти player:draft (12b): людина → початок вікна й кількість подій у ньому. Лише в пам'яті. */
  draftRate: Map<string, { from: number; count: number }>;
  /**
   * Останні нахили картки сортування (11d): id того, хто сортує (гравця чи команди), → нахил. Лише в пам'яті:
   * не в стані гри, не в збереженій кімнаті; після перезапуску порожньо. Хід, пауза, нове запитання й вилучення стирають.
   */
  tilts: Map<string, Tilt>;
  /** Лічильник команд звуку; лише в пам'яті, у збережену кімнату не потрапляє; стартує з Date.now(), щоб після перезапуску клієнт не проґавив команду. */
  audioSeq: number;
  /** Номер слайда каруселі «Нагороди гри» (12d): у пам'яті кімнати, у знімок не йде. */
  awardsSeq: number;
  /** Реакції (13a): людина → мить останньої прийнятої реакції. Лише в пам'яті. */
  reactRate: Map<string, number>;
  /** Реакції (13a): лічильник; стартує з Date.now(). Лише в пам'яті. */
  reactionSeq: number;
  /** Антигугл (12e): люди, чий телефон сказав «пішов»; повернення чи розрив прибирає. Лише в пам'яті. */
  hidden: Set<string>;
  /** Антигугл (12e): людина → останній розрив (dropAt) і повернення (backAt, null — ще без зв'язку); звіт повернення прибирає. Лише в пам'яті. */
  gaps: Map<string, AwayGap>;
  /** Вікно частоти player:away (12e), як draftRate. Лише в пам'яті. */
  awayRate: Map<string, { from: number; count: number }>;
  /** Вікно частоти player:appeal-vote (12f), як draftRate. Лише в пам'яті. */
  appealRate: Map<string, { from: number; count: number }>;
  /** Вікно частоти player:pick-answerer (12g), як appealRate. Лише в пам'яті. */
  pickRate: Map<string, { from: number; count: number }>;
  /**
   * Люди з прийнятим «пішов» (12e), чиє наступне «повернувся» частоти не рахує: одне на кожен прийнятий вихід — відмова в поверненні
   * додала б вигаданий час, а решта повернень рахується, тож ними не засипати. Розрив не прибирає (телефон міг повернутися без зв'язку).
   */
  awayCredit: Set<string>;
  /**
   * Контрольна точка (13b): останній стан на межі між запитаннями (restPoint) і мить його commit; null — гра ще її не мала.
   * «Зберегти й продовжити пізніше» бере саме її: усе з недограного запитання відпадає разом зі станом.
   */
  checkpoint: { state: GameState; at: number } | null;
  /** Кімната продовження збереженої гри (13b); null — звичайна кімната. */
  continued: Continued | null;
  /** Призи на місцях (10): кладе лише ведучий/автор у лобі; резерв — у базі. Іде в знімок кімнати. */
  prizes: PlacedPrize[];
  /** Чинні титули акаунтів кімнати (15): userId → текст. Лише в пам'яті; заповнює attachTitles. */
  titles: Map<string, string>;
}

/** Продовження збереженої гри (13b): лише рівень кімнати, у стані гри нічого нового. */
export interface Continued {
  /** Прив'язки до акаунта, що з'явились у цій кімнаті (claim гостьового слота акаунтом, новенький з акаунтом). */
  bound: Set<string>;
  /** Шлях 12r: старт і бали; на 'start' без resume підставляється це. */
  carry: ResumeSetup | null;
  /** Шлях 12r: id старого збереженого запису. */
  replaces: string | null;
}

/**
 * Розрив зв'язку людини (12e): dropAt — мить розриву, backAt — перепідключення (null — ще без зв'язку).
 * Годинник запитання (awayClock — без заставки й пауз): dropQuestion / clockAtDrop — у мить розриву, backQuestion / clockAtBack — у мить
 * перепідключення; так у вихід іде лише та частина розриву, що припала на поточне запитання й не на паузу.
 * counted — запитання (індекс у plays), на якому інтервал виходу був відкритий у мить розриву й закрився на ній:
 * цей вихід уже порахований, тож розрив і повернення нового разу не додають; null — не був.
 * Людина тримає лише останній розрив: два розриви в одному виході дають лише останній (менше, а не більше — безпечний бік).
 */
export interface AwayGap {
  dropAt: number;
  backAt: number | null;
  dropQuestion: number;
  clockAtDrop: number;
  backQuestion: number | null;
  clockAtBack: number | null;
  counted: number | null;
}

/** Розрив, після перепідключення якого минуло більше, — старий: новий вихід (away: true) його забуває, щоб counted не сховав окремий вихід. */
const AWAY_GAP_STALE_MS = 5000;

/** Звіт повернення телефона (12e): ms — тривалість виходу за телефоном; sinceReturnMs — скільки мс тому телефон знову став видимим. */
export interface AwayReport {
  ms?: number;
  sinceReturnMs?: number;
}

/** Живий вибір (10j, 12b): на якому запитанні (trial — питання на виживання після нього), хто, коли й що в полі. */
export interface Draft {
  questionIndex: number;
  trial: boolean;
  /** Автор — людина, що шле. Команда: лише поки вона й далі відповідає за команду; їй самій чернетка не показується. */
  by: string;
  /** Мить останньої зміни (час менеджера). */
  at: number;
  /** Відбиток поданого на мить чернетки: подане змінилося — чернетка застаріла. */
  stamp: string;
  /** null — поле очищене (зміна теж рахується); нікому не показується. */
  draft: DraftValue | null;
  /** Скільки разів значення змінилося після першого (12b). */
  changes: number;
  /** Командна чернетка на запитанні з балами: її бачать товариші (10j). Соло й опитування командної гри — false. */
  teammates: boolean;
}

/** Останній нахил того, хто сортує (11d): лише пам'ять, не стан гри й не збережена кімната. */
export interface Tilt {
  questionIndex: number;
  seq: number;
  /** Людина, що шле (у команді — капітан): їй нахил не йде. */
  by: string;
  wordId: string;
  toward: string | null;
  amount: number;
  at: number;
}

/** moved — кімнату тепер веде інший процес (9b): вона пішла з пам'яті, але не закрита. */
export type RoomEvent =
  | { type: 'changed' }
  /** released — ведучий (автор) звільнив місце збереженої гри (13b): гравець лишається в грі, телефон іде. */
  | { type: 'kicked'; playerId: string; reason?: 'released' }
  /** saved — гру збережено (13b): рекордер пише її як «Не завершену». */
  | { type: 'closed'; saved?: SavedGameData }
  | { type: 'moved' }
  | { type: 'audio'; action: 'replay' | 'stop'; seq: number }
  | { type: 'awards'; seq: number }
  /** Реакція (13a): усім ролям кімнати; стан гри той самий. */
  | { type: 'reaction'; reaction: Reaction }
  /** Чернетка змінилася: стан гри той самий; товаришам (teammates) — свіжий зріз, пульту — пакет host:drafts (socket.ts). */
  | { type: 'draft'; id: string; by: string; teammates: boolean }
  /** Нахил картки сортування (11d): by — людина, що шле; audience — кому показ дозволено. Стан гри той самий. */
  | { type: 'tilt'; tilt: SortTilt; by: string; audience: 'all' | 'team' };
export type RoomListener = (room: Room, event: RoomEvent) => void;

export type HostAction =
  | { type: 'start'; resume?: ResumeSetup }
  | { type: 'lock' | 'next' | 'pause' | 'resume' | 'end-round' | 'end' | 'save' | 'dice' | 'roll' | 'skip' | 'duel-skip' | 'duel-cancel' | 'guide-skip' | 'clue' | 'survey-all' | 'bluff-all' }
  | { type: 'accept' | 'repick'; playerId: string }
  | { type: 'override'; playerId: string; grade: Grade }
  | { type: 'kick'; playerId: string }
  /** Звільнити місце збереженої гри (13b). */
  | { type: 'release'; playerId: string }
  | { type: 'adjust'; playerId: string; points: number }
  | { type: 'undo'; target: HostUndoTarget }
  | { type: 'debuff'; playerId: string; kind: DebuffKind }
  | { type: 'undebuff'; playerId: string }
  | { type: 'judge'; playerId: string; correct: boolean }
  | { type: 'name'; answer: SubmittedAnswer | null }
  | { type: 'pick'; cellId: string }
  | { type: 'duel-category'; categoryId: string }
  | { type: 'order'; playerIds: string[] }
  | { type: 'cloud-hide'; key: string; hidden: boolean }
  | { type: 'bluff-remove'; optionId: string }
  | { type: 'time'; seconds: -15 | 15 }
  | { type: 'team-form'; form: TeamForm }
  | { type: 'team-assign'; memberId: string; teamId: string | null }
  | { type: 'team-deal' | 'team-dice' | 'team-roll' }
  | { type: 'captain'; teamId: string; memberId: string };

/** Дії, які автор кімнати-автопілота шле з телефона (11g); решта — not_allowed. */
// Прості дії лежать у HostAction одним членом з іншими (lock, next, …), тож Extract їх не виділяє.
export type AuthorAction =
  | { type: 'start'; resume?: ResumeSetup }
  | { type: 'pause' | 'resume' | 'end' | 'save' }
  | Extract<HostAction, { type: 'kick' | 'release' | 'cloud-hide' | 'bluff-remove' | 'team-form' }>;

const AUTHOR_ACTIONS: ReadonlySet<HostAction['type']> = new Set<AuthorAction['type']>(['start', 'pause', 'resume', 'end', 'save', 'kick', 'release', 'cloud-hide', 'bluff-remove', 'team-form']);
const isAuthorAction = (action: HostAction): action is AuthorAction => AUTHOR_ACTIONS.has(action.type);

export type JoinResult =
  | { ok: true; token: string; playerId: string }
  | { ok: false; error: ErrorCode | 'game_not_found' | 'restarting' };

const GONE: AckResult = { ok: false, error: 'game_not_found' };
const FORBIDDEN: AckResult = { ok: false, error: 'forbidden' };
const NOT_ALLOWED: AckResult = { ok: false, error: 'not_allowed' };
const RESTARTING: AckResult = { ok: false, error: 'restarting' };

export const SAVED_ROOM_VERSION = 1;

/** Кімната в базі (9b): усе, без чого її не підняти після перезапуску; з'єднання й таймери — ні. */
export interface SavedRoom {
  v: typeof SAVED_ROOM_VERSION;
  stateVersion: number;
  id: string;
  code: string;
  hostToken: string;
  stageToken: string;
  hostUserId: string | null;
  quizId: string | null;
  playerUsers: [string, string][];
  playerTokens: [string, string][];
  state: GameState;
  tickedTo: number;
  /** Мить знімка за годинником менеджера; відновлений стан стоїть на паузі з неї. */
  savedAt: number;
  /** Контрольна точка (13b); немає — ще не було (старий сервер поле ігнорує). */
  checkpoint?: { state: GameState; at: number };
  /** Продовження збереженої гри (13b); немає — звичайна кімната (старий сервер поле ігнорує: кімната встає без слотів). */
  continued?: { bound: string[]; carry: ResumeSetup | null; replaces: string | null };
  /** Призи на місцях (14a); немає — призів немає (старий сервер поле ігнорує: кімната встає без призів, резерв знімає закриття чи прибирач). */
  prizes?: PlacedPrize[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Перевірка рядка з бази: та сама версія знімка, версія стану, що читається як поточна, на місці поля, без яких кімнату не підняти. */
export function isSavedRoom(raw: unknown): raw is SavedRoom {
  if (!isObject(raw)) return false;
  return (
    raw.v === SAVED_ROOM_VERSION &&
    typeof raw.stateVersion === 'number' &&
    READABLE_STATE_VERSIONS.includes(raw.stateVersion) &&
    ['id', 'code', 'hostToken', 'stageToken'].every((key) => typeof raw[key] === 'string') &&
    Array.isArray(raw.playerUsers) &&
    Array.isArray(raw.playerTokens) &&
    typeof raw.tickedTo === 'number' &&
    typeof raw.savedAt === 'number' &&
    isObject(raw.state) &&
    Array.isArray(raw.state.players)
  );
}

/** Продовження з рядка бази (13b): bound — масив рядків, replaces — рядок чи null, carry — об'єкт з числом roundIndex і points чи null; інакше null. */
function continuedOf(raw: unknown): Continued | null {
  if (!isObject(raw) || !Array.isArray(raw.bound)) return null;
  const bound = raw.bound.filter((id): id is string => typeof id === 'string');
  const replaces = typeof raw.replaces === 'string' ? raw.replaces : null;
  const carry = raw.carry;
  const readable = isObject(carry) && typeof carry.roundIndex === 'number' && isObject(carry.points) && !Array.isArray(carry.points);
  return { bound: new Set(bound), carry: readable ? (carry as unknown as ResumeSetup) : null, replaces };
}

/** Призи з рядка бази (14a): лише елементи, що проходять placedPrizeSchema; не масив — []. */
function prizesOf(raw: unknown): PlacedPrize[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = placedPrizeSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Контрольна точка з рядка бази (13b): лише об'єкт зі state.players-масивом і числом at, інакше null. */
function checkpointOf(raw: unknown): { state: GameState; at: number } | null {
  if (!isObject(raw) || typeof raw.at !== 'number' || !isObject(raw.state) || !Array.isArray(raw.state.players)) return null;
  return { state: raw.state as unknown as GameState, at: raw.at };
}

const newToken = () => randomBytes(24).toString('base64url');

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface RoomManagerOptions {
  /** Заставки переходів (8c); main.ts і наскрізні тести вмикають, модульні тести сервера — ні. */
  transitions?: boolean;
  /** Мінімальний час перед кроками ведучого (11b); типово вимкнено, справжній сервер (main.ts) вмикає. */
  pacing?: boolean;
  /** Журнал кроку автопілота, який рушій відхилив (11g); типово console.warn. */
  warn?: (message: string) => void;
}

/** Кроки ведучого з мінімальним часом (11b) і вікно, яке їх стереже. Решта дій не затримується ніколи. */
const PACED: Partial<Record<HostAction['type'], PacedAction>> = { next: 'next', lock: 'lock', skip: 'skip', 'survey-all': 'next', 'bluff-all': 'next' };

/** Сервер пускає крок до 150 мс раніше кінця вікна: розбіжність годинника пульта в цих межах не «ковтає» натискання (пульт сам чекає +100 мс). */
export const PACE_GRACE_MS = 150;

interface DraftStage {
  trial: boolean;
  /** Опитування чи «хмара»: у командній грі кожна людина відповідає сама. */
  unscored: boolean;
  /** Хто відповідає за команду: на запитанні — як за відповідь (у бліці той, хто натиснув), на виживанні — той, хто відповідає (12g). */
  act: TeamAct;
  question: (id: string) => Question;
}

/** Де ведеться чернетка: етап запитання або відкрите питання на виживання (тоді trial); інакше null. */
function draftStage(state: GameState): DraftStage | null {
  if (state.phase === 'question') {
    const play = state.plays[state.questionIndex];
    if (play === undefined) return null;
    // Опитування й «хмару» кожен проходить сам: запитання одне для всіх.
    if (isUnscored(play.question)) return { trial: false, unscored: true, act: 'answer', question: () => play.question };
    return { trial: false, unscored: false, act: 'answer', question: (id) => questionFor(state, play, id) };
  }
  const trial = trialOpen(state) ? trialQuestionOf(state) : null;
  return trial === null ? null : { trial: true, unscored: false, act: 'answerer', question: () => trial };
}

/**
 * Відбиток того, що гравець (команда, людина) вже подав на поточному запитанні: відповідь, спроби й черга бліцу,
 * відповідь поля, випробування, поступ ланцюжка й стіни, вигадка й вибір блефу.
 */
function answerStamp(state: GameState, id: string): string {
  const play = state.plays[state.questionIndex];
  const bluff = play?.bluff;
  return JSON.stringify([
    recordOf(state, state.questionIndex, id) ?? null,
    play?.blitz?.attempts.filter((a) => a.playerId === id) ?? [],
    play?.blitz?.queue.find((e) => e.playerId === id)?.answer ?? null,
    play?.board?.chooserId === id ? play.board.answer : null,
    play?.survival?.trial?.answers[id] ?? null,
    play?.question.type === 'chain' ? chainOf(state, id) : null,
    play?.question.type === 'wall' ? wallOf(state, id) : null,
    bluff !== undefined && Object.hasOwn(bluff.lies, id) ? bluff.lies[id] : null,
    bluff !== undefined && Object.hasOwn(bluff.picks, id) ? bluff.picks[id] : null,
  ]);
}

export class RoomManager {
  private readonly scheduler: Scheduler;
  private readonly rng: () => number;
  private readonly transitions: boolean;
  private readonly pacing: boolean;
  private readonly warn: (message: string) => void;
  private readonly live = new Map<string, Room>();
  /** Коди кімнат із бази, яких немає в пам'яті. */
  private reserved = new Set<string>();
  private isFrozen = false;
  private readonly listeners = new Set<RoomListener>();

  constructor(scheduler: Scheduler, rng: () => number = Math.random, options: RoomManagerOptions = {}) {
    this.scheduler = scheduler;
    this.rng = rng;
    this.transitions = options.transitions ?? false;
    this.pacing = options.pacing ?? false;
    this.warn = options.warn ?? ((message) => console.warn(message));
  }

  now(): number {
    return this.scheduler.now();
  }

  get size(): number {
    return this.live.size;
  }

  hostOnline(room: Room): boolean {
    // Автопілот: пульта немає, телефони й сцена не чекають ведучого (11g).
    if (room.state.autopilot !== undefined) return true;
    return (room.connections.get('host') ?? 0) > 0;
  }

  stageOnline(room: Room): boolean {
    return (room.connections.get('stage') ?? 0) > 0;
  }

  onEvent(listener: RoomListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  create(quiz: Quiz, hostUserId: string | null = null, quizId: string | null = null): Room {
    return this.open(createGame(quiz, this.gameOptions(quiz)), hostUserId, quizId);
  }

  /** Кімната-автопілот: createAutopilotGame з автором-гравцем (поза зв'язком до сокета), токен гравця; hostToken — випадковий і ніде не видається. */
  createAutopilot(
    quiz: Quiz,
    hostUserId: string,
    quizId: string | null,
    nickname: string,
  ): { ok: true; room: Room; token: string; playerId: string } | { ok: false; error: ErrorCode | 'restarting' } {
    if (this.isFrozen) return { ok: false, error: 'restarting' };
    const playerId = randomUUID();
    const created = createAutopilotGame(quiz, { id: playerId, nickname }, this.gameOptions(quiz));
    if (!created.ok) return created;
    // Автор стає підключеним, коли відкриє сокет.
    const offline = setConnected(created.state, playerId, false, this.now());
    if (!offline.ok) return offline;
    const room = this.open(offline.state, hostUserId, quizId);
    const token = newToken();
    room.playerTokens.set(token, playerId);
    room.playerUsers.set(playerId, hostUserId);
    return { ok: true, room, token, playerId };
  }

  private gameOptions(quiz: Quiz): { transitions: boolean; teamIds: string[] } {
    // Рядок команди стає рядком participant в історії: id команд — uuid.
    return { transitions: this.transitions, teamIds: Array.from({ length: quiz.settings.teams?.count ?? 0 }, () => randomUUID()) };
  }

  private open(state: GameState, hostUserId: string | null, quizId: string | null, id: string = randomUUID()): Room {
    const room: Room = {
      id,
      code: this.newCode(),
      hostToken: newToken(),
      stageToken: newToken(),
      hostUserId,
      quizId,
      playerUsers: new Map(),
      state,
      playerTokens: new Map(),
      connections: new Map(),
      deadline: null,
      pilot: null,
      tickedTo: 0,
      absence: null,
      authorAway: null,
      expiry: null,
      expiryPhase: null,
      drafts: new Map(),
      draftRate: new Map(),
      tilts: new Map(),
      audioSeq: Date.now(),
      awardsSeq: Date.now(),
      reactRate: new Map(),
      reactionSeq: Date.now(),
      hidden: new Set(),
      gaps: new Map(),
      awayRate: new Map(),
      appealRate: new Map(),
      pickRate: new Map(),
      awayCredit: new Set(),
      checkpoint: null,
      continued: null,
      prizes: [],
      titles: new Map(),
    };
    this.live.set(room.code, room);
    this.reschedule(room);
    return room;
  }

  /** Знімок для бази; стан незмінний, тож береться за посиланням. */
  snapshot(room: Room): SavedRoom {
    return {
      v: SAVED_ROOM_VERSION,
      stateVersion: GAME_STATE_VERSION,
      id: room.id,
      code: room.code,
      hostToken: room.hostToken,
      stageToken: room.stageToken,
      hostUserId: room.hostUserId,
      quizId: room.quizId,
      playerUsers: [...room.playerUsers],
      playerTokens: [...room.playerTokens],
      state: room.state,
      tickedTo: room.tickedTo,
      savedAt: this.now(),
      ...(room.checkpoint === null ? {} : { checkpoint: room.checkpoint }),
      ...(room.continued === null ? {} : { continued: { bound: [...room.continued.bound], carry: room.continued.carry, replaces: room.continued.replaces } }),
      ...(room.prizes.length === 0 ? {} : { prizes: room.prizes }),
    };
  }

  /** Піднімає збережену кімнату; null — код уже живий у пам'яті або менеджер заморожено. */
  restore(saved: SavedRoom): Room | null {
    if (this.isFrozen || this.live.has(saved.code)) return null;
    const room: Room = {
      id: saved.id,
      code: saved.code,
      hostToken: saved.hostToken,
      stageToken: saved.stageToken,
      hostUserId: saved.hostUserId,
      quizId: saved.quizId,
      playerUsers: new Map(saved.playerUsers),
      // На паузі з миті знімка; усі поза зв'язком, доки не відкриють сокет.
      state: suspend(saved.state, saved.savedAt),
      playerTokens: new Map(saved.playerTokens),
      connections: new Map(),
      deadline: null,
      pilot: null,
      tickedTo: saved.tickedTo,
      absence: null,
      authorAway: null,
      expiry: null,
      expiryPhase: null,
      drafts: new Map(),
      draftRate: new Map(),
      tilts: new Map(),
      audioSeq: Date.now(),
      awardsSeq: Date.now(),
      reactRate: new Map(),
      reactionSeq: Date.now(),
      hidden: new Set(),
      gaps: new Map(),
      awayRate: new Map(),
      appealRate: new Map(),
      pickRate: new Map(),
      awayCredit: new Set(),
      checkpoint: checkpointOf(saved.checkpoint),
      continued: continuedOf(saved.continued),
      prizes: prizesOf(saved.prizes),
      titles: new Map(),
    };
    this.live.set(room.code, room);
    this.reserved.delete(room.code);
    // Пульт ще не підключений: як після відходу ведучого — 10 хв на повернення (стан уже на паузі).
    // Автопілот: пульта немає; стоїть на паузі «нікого», 30 хв на повернення будь-кого (commit → watchEmpty).
    if (room.state.autopilot === undefined) this.hostLeft(room);
    this.commit(room, room.state);
    return room;
  }

  /** Зупинка: дії відповідають restarting, з'єднання й таймери більше не змінюють стану. */
  freeze(): void {
    this.isFrozen = true;
    for (const room of this.live.values()) this.clearTimers(room);
  }

  get frozen(): boolean {
    return this.isFrozen;
  }

  /** Кімнату тепер веде інший процес: прибрати з пам'яті без видалення з бази. */
  evict(room: Room): void {
    if (this.live.get(room.code) !== room) return;
    this.clearTimers(room);
    this.live.delete(room.code);
    this.emit(room, { type: 'moved' });
  }

  /** Коди кімнат із бази, яких немає в пам'яті: новим кімнатам не видаються. */
  setReserved(codes: Iterable<string>): void {
    this.reserved = new Set(codes);
  }

  /** Усі живі кімнати (для запису на зупинці). */
  rooms(): Room[] {
    return [...this.live.values()];
  }

  /** Призи на місця (14a): лише лобі (інакше wrong_phase), frozen → restarting; кладе placed, emit changed. Резерв у базі — справа маршруту. */
  setPrizes(room: Room, placed: PlacedPrize[]): AckResult {
    if (!this.alive(room)) return this.gone();
    if (room.state.phase !== 'lobby') return { ok: false, error: 'wrong_phase' };
    room.prizes = [...placed].sort((a, b) => a.place - b.place);
    this.emit(room, { type: 'changed' });
    return { ok: true };
  }

  /** Будь-яка фаза: прибрати приз з місця; emit changed, якщо щось змінилось. */
  unplacePrize(room: Room, prizeId: string): void {
    const left = room.prizes.filter((p) => p.id !== prizeId);
    if (left.length === room.prizes.length) return;
    room.prizes = left;
    this.emit(room, { type: 'changed' });
  }

  /** Злити титули (null — прибрати); emit changed, якщо щось змінилось. */
  setTitles(room: Room, titles: Map<string, string | null>): void {
    let changed = false;
    for (const [userId, title] of titles) {
      if (title === null) changed = room.titles.delete(userId) || changed;
      else if (room.titles.get(userId) !== title) {
        room.titles.set(userId, title);
        changed = true;
      }
    }
    if (changed) this.emit(room, { type: 'changed' });
  }

  get(code: string): Room | undefined {
    return this.live.get(code);
  }

  join(code: string, nickname: string, userId: string | null = null): JoinResult {
    // На зупинці новий гравець не з'являється: стан уже не записався б у базу.
    if (this.isFrozen) return { ok: false, error: 'restarting' };
    const room = this.live.get(code);
    if (room === undefined) return { ok: false, error: 'game_not_found' };
    // Продовження (13b): акаунт зі своїм місцем займає його (нік з форми ігнорується); новенький між запитаннями — addLatePlayer.
    const mine = room.continued === null || userId === null ? undefined : this.boundSlot(room, userId);
    if (mine !== undefined) return this.claim(code, mine, userId);
    const playerId = randomUUID();
    const late = room.continued !== null && room.state.phase !== 'lobby';
    const added = late ? addLatePlayer(room.state, { id: playerId, nickname }) : addPlayer(room.state, { id: playerId, nickname });
    if (!added.ok) return added;
    // Гравець стає підключеним, коли відкриє сокет.
    const offline = setConnected(added.state, playerId, false, this.now());
    if (!offline.ok) return offline;
    const token = newToken();
    room.playerTokens.set(token, playerId);
    if (userId !== null) {
      room.playerUsers.set(playerId, userId);
      room.continued?.bound.add(playerId);
    }
    this.commit(room, offline.state);
    return { ok: true, token, playerId };
  }

  /** Місце (слот) кімнати продовження, прив'язане до акаунта; немає — undefined. */
  private boundSlot(room: Room, userId: string): string | undefined {
    return slotsOf(room.state).find((slot) => room.playerUsers.get(slot.id) === userId)?.id;
  }

  /** Кімната з id === gameId або continued.replaces === gameId у пам'яті. */
  openFor(gameId: string): boolean {
    return [...this.live.values()].some((room) => room.id === gameId || room.continued?.replaces === gameId);
  }

  /**
   * Точне продовження: room.id = gameId, новий код і токени, state = continueFrom(saved.state, saved.at) — пауза з миті контрольної точки,
   * не «зараз»; playerUsers з saved, playerTokens порожні, continued { bound ∅, carry null, replaces null }; openFor(gameId) → continue_open;
   * frozen → restarting. Автопілот: токен для autopilot.authorId → author. Як restore: hostLeft (з ведучим) і commit.
   */
  continueSaved(gameId: string, hostUserId: string, saved: SavedGameData): ContinueResult {
    if (this.isFrozen) return { ok: false, error: 'restarting' };
    if (this.openFor(gameId)) return { ok: false, error: 'continue_open' };
    const room = this.open(continueFrom(saved.state, saved.at), hostUserId, saved.quizId, gameId);
    for (const [playerId, userId] of saved.playerUsers) room.playerUsers.set(playerId, userId);
    room.continued = { bound: new Set(), carry: null, replaces: null };
    // Та сама гра — ті самі призи (14a): резерв за id гри лишився після збереження.
    room.prizes = prizesOf(saved.prizes);
    room.tickedTo = this.now();
    let author: { token: string; playerId: string } | null = null;
    const authorId = room.state.autopilot?.authorId;
    if (authorId !== undefined) {
      author = { token: newToken(), playerId: authorId };
      room.playerTokens.set(author.token, authorId);
    }
    if (room.state.autopilot === undefined) this.hostLeft(room);
    this.commit(room, room.state);
    return { ok: true, room, author };
  }

  /**
   * Шлях 12r: create / createAutopilot (автор — учасник з userId === hostUserId, інакше cannot_continue), нові id; кожен збережений
   * соло-гравець / людина команди — addPlayer поза зв'язком з прив'язкою userId; людина — assignTeam у команду з тією самою назвою
   * (немає — без команди); carry { roundIndex, points: новий id гравця чи команди → score у межах RESUME_POINTS_MAX }; replaces = gameId.
   * Автопілот командної гри: спосіб 'pick' — інакше старт автопілота роздав би розставлених наново.
   */
  restartSaved(input: RestartInput): ContinueResult {
    if (this.isFrozen) return { ok: false, error: 'restarting' };
    if (this.openFor(input.gameId)) return { ok: false, error: 'continue_open' };
    const people = input.participants.filter((p) => !p.isTeam);
    const teamNames = new Map(input.participants.filter((p) => p.isTeam).map((p) => [p.id, p.nickname]));
    let room: Room;
    let author: { token: string; playerId: string } | null = null;
    const newIds = new Map<string, string>();
    if (input.autopilot) {
      const saved = people.find((p) => p.userId === input.hostUserId);
      if (saved === undefined) return { ok: false, error: 'cannot_continue' };
      const created = this.createAutopilot(input.quiz, input.hostUserId, input.quizId, saved.nickname);
      if (!created.ok) return created;
      room = created.room;
      author = { token: created.token, playerId: created.playerId };
      newIds.set(saved.id, created.playerId);
    } else {
      room = this.create(input.quiz, input.hostUserId, input.quizId);
    }
    const clamp = (score: number) => Math.max(-RESUME_POINTS_MAX, Math.min(RESUME_POINTS_MAX, Math.round(score)));
    const points: Record<string, number> = {};
    let state = room.state;
    for (const person of people) {
      if (newIds.has(person.id)) continue;
      const playerId = randomUUID();
      const added = addPlayer(state, { id: playerId, nickname: person.nickname });
      if (!added.ok) continue;
      const offline = setConnected(added.state, playerId, false, this.now());
      state = offline.ok ? offline.state : added.state;
      newIds.set(person.id, playerId);
      if (person.userId !== null) room.playerUsers.set(playerId, person.userId);
    }
    if (teamsOn(state)) {
      if (input.autopilot) {
        const picked = setTeamForm(state, 'pick');
        if (picked.ok) state = picked.state;
      }
      for (const person of people) {
        const playerId = newIds.get(person.id);
        const name = person.teamId === null ? undefined : teamNames.get(person.teamId);
        const team = name === undefined ? undefined : state.teams?.list.find((t) => t.name === name);
        if (playerId === undefined || team === undefined) continue;
        const assigned = assignTeam(state, playerId, team.id);
        if (assigned.ok) state = assigned.state;
      }
      for (const [oldId, name] of teamNames) {
        const team = state.teams?.list.find((t) => t.name === name);
        const score = input.participants.find((p) => p.id === oldId)?.score ?? 0;
        if (team !== undefined) points[team.id] = clamp(score);
      }
    } else {
      for (const person of people) {
        const playerId = newIds.get(person.id);
        if (playerId !== undefined) points[playerId] = clamp(person.score);
      }
    }
    room.continued = { bound: new Set(), carry: { roundIndex: input.roundIndex, points }, replaces: input.gameId };
    this.commit(room, state);
    return { ok: true, room, author };
  }

  /** Перенесення шляху 12r на мить старту: лише ключі, що досі серед учасників (resumeParticipants); без carry — undefined. */
  private carryFor(room: Room): ResumeSetup | undefined {
    const carry = room.continued?.carry ?? null;
    if (carry === null) return undefined;
    const known = new Set(resumeParticipants(room.state).map((p) => p.id));
    return { roundIndex: carry.roundIndex, points: Object.fromEntries(Object.entries(carry.points).filter(([id]) => known.has(id))) };
  }

  /**
   * Зайняти місце збереженої гри: 1) кімнати немає → game_not_found, зупинка → restarting; 2) не продовження → not_found;
   * 3) не слот → not_found; 4) прив'язане до іншого акаунта (чи гість) → not_allowed; 5) гостьове з токеном → slot_taken
   * (своє прив'язане — і вдруге); 6) акаунт на гостьовому → прив'язка й continued.bound; акаунт, що вже має місце, — not_allowed.
   */
  claim(code: string, slotId: string, userId: string | null): JoinResult {
    if (this.isFrozen) return { ok: false, error: 'restarting' };
    const room = this.live.get(code);
    if (room === undefined) return { ok: false, error: 'game_not_found' };
    const continued = room.continued;
    if (continued === null || !slotsOf(room.state).some((slot) => slot.id === slotId)) return { ok: false, error: 'not_found' };
    const bound = room.playerUsers.get(slotId);
    if (bound !== undefined && bound !== userId) return { ok: false, error: 'not_allowed' };
    if (bound === undefined) {
      if ([...room.playerTokens.values()].includes(slotId)) return { ok: false, error: 'slot_taken' };
      if (userId !== null) {
        if ([...room.playerUsers.values()].includes(userId)) return { ok: false, error: 'not_allowed' };
        room.playerUsers.set(slotId, userId);
        continued.bound.add(slotId);
      }
    }
    const token = newToken();
    room.playerTokens.set(token, slotId);
    this.commit(room, room.state);
    return { ok: true, token, playerId: slotId };
  }

  /** null — кімнати немає; не продовження → { slots: [], mine: null }; slots — гостьові без прив'язки й без токена; mine — слот, прив'язаний до userId. */
  slots(code: string, userId: string | null): SlotsResponse | null {
    const room = this.live.get(code);
    if (room === undefined) return null;
    if (room.continued === null) return { slots: [], mine: null };
    const taken = new Set(room.playerTokens.values());
    const all = slotsOf(room.state);
    const slots = all.filter((slot) => !room.playerUsers.has(slot.id) && !taken.has(slot.id));
    const mine = userId === null ? undefined : all.find((slot) => room.playerUsers.get(slot.id) === userId);
    return { slots, mine: mine ?? null };
  }

  /** Місця продовження для пульта й автора: taken — є токен, account — є прив'язка; carryRound — стартовий раунд шляху 12r. */
  private continuedView(room: Room, continued: Continued): ContinuedView {
    const taken = new Set(room.playerTokens.values());
    return {
      slots: slotsOf(room.state).map((slot) => ({ ...slot, taken: taken.has(slot.id), account: room.playerUsers.has(slot.id) })),
      carryRound: continued.carry?.roundIndex ?? null,
    };
  }

  /** Звільнити місце: не продовження → not_allowed; не слот → not_found; токени, з'єднання й прив'язка цієї кімнати геть, kicked 'released'. */
  private release(room: Room, personId: string): AckResult {
    const continued = room.continued;
    if (continued === null) return NOT_ALLOWED;
    if (!slotsOf(room.state).some((slot) => slot.id === personId)) return { ok: false, error: 'not_found' };
    for (const [token, id] of room.playerTokens) {
      if (id === personId) room.playerTokens.delete(token);
    }
    room.connections.delete(personId);
    // Прив'язка зі збереження лишається: місце акаунта — і далі його.
    if (continued.bound.delete(personId)) room.playerUsers.delete(personId);
    this.emit(room, { type: 'kicked', playerId: personId, reason: 'released' });
    // Антигугл (12e): вихід, що тривав у того, хто звільнив місце, не дістається наступному — ні в пам'яті менеджера, ні в записі запитання.
    room.hidden.delete(personId);
    room.gaps.delete(personId);
    room.awayCredit.delete(personId);
    room.awayRate.delete(personId);
    let base = room.state;
    const play = base.plays[base.questionIndex];
    // Лише соло: запис команди спільний для всіх її людей.
    if (play?.away?.[personId] !== undefined && awayParticipant(base, personId) === personId) {
      const { [personId]: _dropped, ...rest } = play.away;
      const plays = [...base.plays];
      plays[base.questionIndex] = { ...play, away: rest };
      base = { ...base, plays };
    }
    const offline = setConnected(base, personId, false, this.now());
    this.commit(room, offline.ok ? offline.state : base);
    return { ok: true };
  }

  identify(code: string, role: Role, token: string): { room: Room; identity: Identity } | null {
    const room = this.live.get(code);
    if (room === undefined) return null;
    if (role === 'host' || role === 'stage') {
      // Автопілот: пульта немає, токен ведучого не підходить ніколи (11g).
      if (role === 'host' && room.state.autopilot !== undefined) return null;
      const expected = role === 'host' ? room.hostToken : room.stageToken;
      return sameToken(token, expected) ? { room, identity: { role, playerId: null } } : null;
    }
    const playerId = room.playerTokens.get(token);
    return playerId === undefined ? null : { room, identity: { role, playerId } };
  }

  connect(room: Room, identity: Identity): void {
    if (!this.alive(room)) return;
    const key = identity.playerId ?? identity.role;
    const count = (room.connections.get(key) ?? 0) + 1;
    room.connections.set(key, count);
    if (identity.role === 'host') {
      this.scheduler.clearTimeout(room.absence);
      room.absence = null;
      if (count === 1) this.emit(room, { type: 'changed' });
    }
    if (identity.role === 'stage' && count === 1) this.emit(room, { type: 'changed' });
    if (identity.playerId !== null && count === 1) {
      const gap = room.gaps.get(identity.playerId);
      if (gap !== undefined && gap.backAt === null) {
        gap.backAt = this.now();
        gap.backQuestion = room.state.questionIndex;
        gap.clockAtBack = awayClock(room.state, gap.backAt);
      }
      this.apply(room, setConnected(room.state, identity.playerId, true, this.now()));
    }
  }

  disconnect(room: Room, identity: Identity): void {
    if (!this.alive(room)) return;
    const key = identity.playerId ?? identity.role;
    // Людину вилучили чи звільнили (release / kick стирають її з'єднання): сокет, що закривається після цього, розриву не лишає.
    if (identity.playerId !== null && !room.connections.has(key)) return;
    const count = (room.connections.get(key) ?? 0) - 1;
    if (count > 0) {
      room.connections.set(key, count);
      return;
    }
    room.connections.delete(key);
    if (identity.playerId !== null) {
      // Антигугл (12e): до setConnected, тож awayStep у тому самому commit уже бачить розрив і закриває інтервал на ньому.
      const person = identity.playerId;
      const { state } = room;
      const open = state.plays[state.questionIndex]?.away?.[person]?.since;
      const dropAt = this.now();
      room.gaps.set(person, {
        dropAt,
        backAt: null,
        dropQuestion: state.questionIndex,
        clockAtDrop: awayClock(state, dropAt),
        backQuestion: null,
        clockAtBack: null,
        counted: open !== undefined && open !== null ? state.questionIndex : null,
      });
      room.hidden.delete(person);
      this.apply(room, setConnected(room.state, person, false, this.now()));
      return;
    }
    if (identity.role === 'host') {
      this.hostLeft(room);
      this.emit(room, { type: 'changed' });
    }
    if (identity.role === 'stage') this.emit(room, { type: 'changed' });
  }

  /** Звук поточного запитання: не змінює стан гри, лише розсилається сцені й пульту. */
  audio(room: Room, action: 'replay' | 'stop'): AckResult {
    if (!this.alive(room)) return this.gone();
    if (audioOf(room.state) === null) return { ok: false, error: 'wrong_phase' };
    const seq = ++room.audioSeq;
    this.emit(room, { type: 'audio', action, seq });
    return { ok: true };
  }

  /** «Нагороди гри» (12d): наступний слайд каруселі на сцені; стан гри не змінюється. */
  awards(room: Room): AckResult {
    if (!this.alive(room)) return this.gone();
    // Після фінішу рядка розкриття немає: revealOpen false — той самий кешований запис, що й у зрізах.
    if (room.state.phase !== 'finished' || (gameFacts(room.state, false)?.awards ?? []).length === 0) return { ok: false, error: 'wrong_phase' };
    const seq = ++room.awardsSeq;
    this.emit(room, { type: 'awards', seq });
    return { ok: true };
  }

  /** Реакція (13a): лише REACTION_PHASES; не частіше REACTION_GAP_MS від людини; стан гри не змінюється. */
  react(room: Room, by: string, item: ReactionItem): AckResult {
    if (!this.alive(room)) return this.gone();
    const state = room.state;
    if (!reactionAllowed(state.phase)) return { ok: false, error: 'wrong_phase' };
    const member = by === 'host' ? undefined : memberOf(state, by);
    const player = by === 'host' || member !== undefined ? undefined : state.players.find((p) => p.id === by);
    if (by !== 'host' && member === undefined && player === undefined) return { ok: false, error: 'not_found' };
    const now = this.now();
    const last = room.reactRate.get(by);
    if (last !== undefined && now - last < REACTION_GAP_MS) return { ok: false, error: 'too_soon' };
    room.reactRate.set(by, now);
    const reaction: Reaction = {
      seq: ++room.reactionSeq,
      by,
      nickname: by === 'host' ? null : (member?.nickname ?? player!.nickname),
      rowId: by === 'host' ? null : (teamOf(state, by) ?? by),
      item,
    };
    this.emit(room, { type: 'reaction', reaction });
    return { ok: true };
  }

  view(room: Room, identity: Identity): GameView | null {
    const base = this.baseView(room, identity);
    if (base === null) return null;
    const prizes = prizesView(room, identity.role === 'player' ? { role: 'player', playerId: identity.playerId ?? '' } : { role: identity.role });
    const titles = titlesView(room);
    if (prizes === undefined && titles === undefined) return base;
    // Як continued (13b): ключа немає, коли порожньо.
    return { ...base, ...(prizes === undefined ? {} : { prizes }), ...(titles === undefined ? {} : { titles }) };
  }

  private baseView(room: Room, identity: Identity): GameView | null {
    const continued = room.continued;
    if (identity.role === 'host') return continued === null ? hostView(room.state) : { ...hostView(room.state), continued: this.continuedView(room, continued) };
    if (identity.role === 'stage') return stageView(room.state);
    if (identity.playerId === null) return null;
    const raw = playerView(room.state, identity.playerId);
    if (raw === null) return null;
    // Автор продовження бачить місця у своєму меню (13b).
    const view = continued === null || raw.author === null ? raw : { ...raw, author: { ...raw.author, continued: this.continuedView(room, continued) } };
    const team = view.team;
    if (team === null || team.teamId === null) return this.withPhoneClip(room, view);
    const draft = this.currentDraft(room, team.teamId, identity.playerId);
    return this.withPhoneClip(room, draft === null ? view : { ...view, team: { ...team, draft } });
  }

  /** Автопілот без сцени (11h): звук нема де грати, крім телефонів — гравці дістають джерело поточного запитання. */
  private withPhoneClip(room: Room, view: PlayerView): PlayerView {
    if (room.state.autopilot === undefined || this.stageOnline(room) || view.question?.audio == null) return view;
    // Гравець на власному запасному чує його звук, а не звук основного запитання.
    const clip = phoneAudioOf(room.state, view.me.id);
    if (clip === null) return view;
    return { ...view, question: { ...view.question, audio: { ...view.question.audio, clip } } };
  }

  /**
   * Чернетка команди для товариша (10j): лише командна чернетка на запитанні з балами, чинна (див. liveDraft), не очищена,
   * поле відповіді (не стіна, ланцюжок чи вигадка); глядач — не автор; інакше null.
   */
  private currentDraft(room: Room, teamId: string, viewerId: string): Answer | null {
    const found = this.liveDraft(room, teamId);
    if (found === null || !found.teammates || found.by === viewerId || found.draft === null || !isAnswerDraft(found.draft)) return null;
    return found.draft;
  }

  /** Чинна чернетка під id рядка: те саме запитання (чи питання на виживання), автор досі діє, подане відтоді не змінилося; інакше null. */
  private liveDraft(room: Room, id: string): Draft | null {
    const { state } = room;
    const found = room.drafts.get(id);
    const at = draftStage(state);
    if (found === undefined || at === null) return null;
    if (found.questionIndex !== state.questionIndex || found.trial !== at.trial) return null;
    if (found.teammates) {
      const author = actorOf(state, found.by, at.act);
      if (!author.ok || author.id !== id) return null;
    } else if (found.by !== id || !this.inGame(state, id)) {
      return null;
    }
    return found.stamp === answerStamp(state, id) ? found : null;
  }

  /** Людина досі в грі: соло — серед гравців, командна гра — серед учасників. */
  private inGame(state: GameState, playerId: string): boolean {
    return teamsOn(state) ? memberOf(state, playerId) !== undefined : state.players.some((p) => p.id === playerId);
  }

  /** Пакет живих виборів для пульта (12b): чинні чернетки з draft !== null, лише для рядків hostLive (і aside), у порядку рядків. */
  liveDrafts(room: Room): HostDrafts {
    const { state } = room;
    const at = draftStage(state);
    const live = hostLive(state);
    const batch: HostDrafts = { questionIndex: state.questionIndex, trial: at?.trial ?? false, drafts: [] };
    if (live === null || at === null) return batch;
    const seen = new Set<string>();
    for (const row of [...live.rows, ...(live.aside?.rows ?? [])]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const found = this.liveDraft(room, row.id);
      if (found !== null && found.draft !== null) batch.drafts.push({ id: row.id, draft: found.draft, changes: found.changes, at: found.at });
    }
    return batch;
  }

  /**
   * Чернетка (10j, 12b): етап запитання (чи відкрите питання на виживання). Ключ — id рядка «Відповідей наживо»:
   * соло — сам гравець; командна гра на запитанні з балами — команда (лише той, хто зараз за неї відповідає:
   * капітан чи вибраний ним або чергою товариш (12g), у бліці — той, хто натиснув); в опитуванні й «хмарі» командної гри — сама людина. Гра без ведучого
   * бере лише командні чернетки (їх бачать товариші). Стан гри не змінюється й не пишеться. Понад DRAFTS_PER_SECOND
   * за секунду — too_soon. Та сама чернетка не шлеться вдруге; кожна нова зберігається й шлеться, тож остання не губиться.
   */
  draft(room: Room, playerId: string, draft: DraftValue | null): AckResult {
    if (!this.alive(room)) return this.gone();
    const { state } = room;
    const at = draftStage(state);
    if (at === null) return { ok: false, error: 'wrong_phase' };
    let id = playerId;
    const teammates = teamsOn(state) && !at.unscored;
    if (teammates) {
      const who = this.act(room, playerId, at.act);
      if (!who.ok) return who;
      id = who.id;
    } else if (!this.inGame(state, playerId)) {
      return { ok: false, error: 'not_found' };
    }
    if (state.autopilot !== undefined && !teammates) return NOT_ALLOWED;
    if (draft !== null) {
      if (draftQuestionType(draft) !== at.question(id).type) return { ok: false, error: 'type_mismatch' };
      if (draft.type === 'lie' && state.plays[state.questionIndex]?.bluff?.stage !== 'lies') return { ok: false, error: 'wrong_phase' };
    }
    const now = this.now();
    const rate = room.draftRate.get(playerId);
    if (rate === undefined || now - rate.from >= 1000) room.draftRate.set(playerId, { from: now, count: 1 });
    else if (rate.count + 1 > DRAFTS_PER_SECOND) return { ok: false, error: 'too_soon' };
    else rate.count += 1;
    const live = this.liveDraft(room, id);
    if (draft === null) {
      if (live === null || live.draft === null) return { ok: true };
      room.drafts.set(id, { ...live, draft: null, at: now, changes: live.changes + 1 });
    } else {
      if (live !== null && live.by === playerId && JSON.stringify(live.draft) === JSON.stringify(draft)) return { ok: true };
      room.drafts.set(id, {
        questionIndex: state.questionIndex,
        trial: at.trial,
        by: playerId,
        at: now,
        stamp: answerStamp(state, id),
        draft,
        changes: live === null ? 0 : live.changes + 1,
        teammates,
      });
    }
    this.emit(room, { type: 'draft', id, by: playerId, teammates });
    return { ok: true };
  }

  /**
   * Антигугл (12e): телефон людини пішов із гри (away) чи повернувся (report.ms — тривалість за телефоном; report.sinceReturnMs —
   * скільки мс тому телефон знову став видимим, якщо повернувся без зв'язку). Час рахує рушій за годинником менеджера. Частина
   * виходу без зв'язку — перетин заявленого виходу з розривом (awayGapMs), обмежений часом розриву всередині поточного запитання
   * за його годинником (без заставки й пауз; розрив, що скінчився до запитання, — 0). Подія від гравця: автор автопілота діє як
   * звичайний гравець. Понад AWAY_EVENTS_PER_SECOND за секунду — too_soon; перше повернення після кожного прийнятого виходу частоти
   * не рахує (відмова додала б вигаданий час), решта повернень — рахує. Незмінений стан — { ok: true } без commit.
   */
  away(room: Room, personId: string, away: boolean, report: AwayReport = {}): AckResult {
    if (!this.alive(room)) return this.gone();
    if (awayParticipant(room.state, personId) === null) return { ok: false, error: 'not_found' };
    const now = this.now();
    const { state } = room;
    // Повернення в рахунок прийнятого виходу — без частоти; delete лише тоді, коли воно справді повернення.
    const free = !away && room.awayCredit.delete(personId);
    if (!free) {
      const rate = room.awayRate.get(personId);
      if (rate === undefined || now - rate.from >= 1000) room.awayRate.set(personId, { from: now, count: 1 });
      else if (rate.count + 1 > AWAY_EVENTS_PER_SECOND) return { ok: false, error: 'too_soon' };
      else rate.count += 1;
    }
    let next: GameState;
    if (away) {
      room.hidden.add(personId);
      room.awayCredit.add(personId);
      const gap = room.gaps.get(personId);
      if (gap !== undefined && gap.backAt !== null && now - gap.backAt > AWAY_GAP_STALE_MS) room.gaps.delete(personId);
      next = awayStart(state, personId, now);
    } else {
      room.hidden.delete(personId);
      const gap = room.gaps.get(personId) ?? null;
      room.gaps.delete(personId);
      next = awayEnd(state, personId, now, this.gapMs(state, gap, report, now), gap !== null && gap.counted === state.questionIndex);
    }
    if (next === room.state) return { ok: true };
    this.commit(room, next);
    return { ok: true };
  }

  /** Частина виходу без зв'язку (12e): перетин із заявленим виходом, не більше за час розриву на годиннику поточного запитання. */
  private gapMs(state: GameState, gap: AwayGap | null, report: AwayReport, now: number): number {
    if (gap === null || gap.backAt === null || gap.backQuestion !== state.questionIndex || gap.clockAtBack === null) return 0;
    const inQuestion = gap.dropQuestion === state.questionIndex ? gap.clockAtBack - gap.clockAtDrop : gap.clockAtBack;
    return Math.min(awayGapMs(gap, report.ms ?? 0, now - (report.sinceReturnMs ?? 0)), Math.max(0, inQuestion));
  }

  /** Командна гра: учасник вибирає команду в лобі. */
  teamPick(room: Room, playerId: string, teamId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, pickTeam(room.state, playerId, teamId));
  }

  /** Командна гра: учасник кидає кубик формування. */
  teamRoll(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, rollTeamDie(room.state, playerId, this.rng));
  }

  /** Командна гра: капітан вибирає дуелянта своєї команди. */
  duelist(room: Room, playerId: string, memberId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, pickDuelist(room.state, playerId, memberId));
  }

  /** Командна гра (12g): капітан вибирає відповідача з наступного запитання; понад ANSWERER_PICKS_PER_SECOND за секунду — too_soon. */
  pickAnswerer(room: Room, playerId: string, memberId: string | null, scope: AnswererScope): AckResult {
    if (!this.alive(room)) return this.gone();
    // Частота — як appealVote: вікно лише для людей з команд; решту рушій відхиляє сам (wrong_phase / not_found).
    const state = room.state;
    if (teamsOn(state) && memberOf(state, playerId) !== undefined) {
      const now = this.now();
      const rate = room.pickRate.get(playerId);
      if (rate === undefined || now - rate.from >= 1000) room.pickRate.set(playerId, { from: now, count: 1 });
      else if (rate.count + 1 > ANSWERER_PICKS_PER_SECOND) return { ok: false, error: 'too_soon' };
      else rate.count += 1;
    }
    return this.apply(room, pickAnswerer(room.state, playerId, memberId, scope));
  }

  answer(room: Room, playerId: string, answer: Answer): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, actAnswer(room.state, playerId, answer, this.now()));
  }

  buzz(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, actBuzz(room.state, playerId, this.now()));
  }

  guess(room: Room, playerId: string, word: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, guessWord(room.state, who.id, word, this.now()));
  }

  sort(room: Room, playerId: string, wordId: string, categoryId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    const result = this.apply(room, sortWord(room.state, who.id, wordId, categoryId, this.now()));
    if (result.ok) room.tilts.delete(who.id);
    return result;
  }

  /** Нахил картки (11d): перевірка рушія, дросель SORT_TILT_GAP_MS, подія кімнати лише з новим значенням; стан гри не змінюється. */
  tilt(room: Room, playerId: string, tilt: { wordId: string; categoryId: string | null; amount: number }): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    const now = this.now();
    const refused = tiltRefusal(room.state, who.id, tilt.wordId, tilt.categoryId, now);
    if (refused !== null) return { ok: false, error: refused };
    const audience = sortAudience(room.state, room.state.plays[room.state.questionIndex]);
    if (audience === null) return { ok: false, error: 'wrong_phase' };
    const toward = tilt.categoryId;
    const amount = toward === null ? 0 : Math.round(tilt.amount * 20) / 20;
    const seq = sortSeq(sortOf(room.state, who.id));
    const found = room.tilts.get(who.id);
    // Нахил іншого запитання, старого ходу чи іншої картки вважається відсутнім.
    const last = found !== undefined && found.questionIndex === room.state.questionIndex && found.seq === seq && found.wordId === tilt.wordId ? found : null;
    if (last !== null && last.toward === toward && last.amount === amount) return { ok: true };
    // Зарано після попереднього: не дійшло — телефон надішле це значення знову наступним вікном.
    if (last !== null && toward !== null && now - last.at < SORT_TILT_GAP_MS) return { ok: false, error: 'too_soon' };
    room.tilts.set(who.id, { questionIndex: room.state.questionIndex, seq, by: playerId, wordId: tilt.wordId, toward, amount, at: now });
    this.emit(room, { type: 'tilt', tilt: { sorterId: who.id, wordId: tilt.wordId, toward, amount, seq }, by: playerId, audience });
    return { ok: true };
  }

  /** Нахили, що діють зараз (11d), — для того, хто щойно підключився: те саме запитання й хід, гра йде, є напрям. */
  liveTilts(room: Room): { tilt: SortTilt; by: string; audience: 'all' | 'team' }[] {
    const state = room.state;
    const play = state.plays[state.questionIndex];
    if (state.phase !== 'question' || state.paused || play === undefined) return [];
    const audience = sortAudience(state, play);
    if (audience === null) return [];
    return [...room.tilts]
      .filter(([id, tilt]) => tilt.toward !== null && tilt.questionIndex === state.questionIndex && tilt.seq === sortSeq(sortOf(state, id)))
      .map(([id, tilt]) => ({ tilt: { sorterId: id, wordId: tilt.wordId, toward: tilt.toward, amount: tilt.amount, seq: tilt.seq }, by: tilt.by, audience }));
  }

  wall(room: Room, playerId: string, tiles: number[]): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, guessWall(room.state, who.id, tiles, this.now()));
  }

  lie(room: Room, playerId: string, text: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, writeLie(room.state, who.id, text, this.now()));
  }

  bluff(room: Room, playerId: string, optionId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, pickBluff(room.state, who.id, optionId, this.now()));
  }

  wipeout(room: Room, playerId: string, take: boolean): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, decideWipeout(room.state, who.id, take, this.now()));
  }

  /** «Мільйонер»: учасник бере підказку драбини (10i). */
  lifeline(room: Room, playerId: string, kind: LifelineKind): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, useLifeline(room.state, who.id, kind, this.now(), this.rng));
  }

  /** «Мільйонер»: рішення учасника — «Граю далі» чи «Забрати» (10i). */
  ladderDecide(room: Room, playerId: string, take: boolean): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, decideLadder(room.state, who.id, take, this.now()));
  }

  /** «Мільйонер»: ведучий вибирає учасника на заставці (10i). */
  hostLadderPick(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, pickContestant(room.state, playerId));
  }

  /** «Мільйонер»: ведучий вирішує замість учасника (10i). */
  hostLadderDecide(room: Room, take: boolean): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, decideLadder(room.state, 'host', take, this.now()));
  }

  trial(room: Room, playerId: string, answer: Answer): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, answerTrial(room.state, who.id, answer, this.now()));
  }

  door(room: Room, playerId: string, door: number): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, pickDoor(room.state, who.id, door, this.now()));
  }

  /** Гравець бере баф; targetId — ціль «Підглянути» (12h). У командній грі — той, хто відповідає (12g). */
  buff(room: Room, playerId: string, kind: BuffKind, targetId?: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, takeBuff(room.state, who.id, kind, this.now(), this.rng, targetId));
  }

  /** Гравець купує дебаф для суперника (9c). */
  buyDebuff(room: Room, buyerId: string, targetId: string, kind: DebuffKind): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, buyerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, buyDebuff(room.state, who.id, targetId, kind, this.now()));
  }

  vote(room: Room, playerId: string, askerId: string, answer: Answer): AckResult {
    if (!this.alive(room)) return this.gone();
    // Голос залу подає сама людина (і в командній грі): право перевіряє рушій.
    const who = this.act(room, playerId, 'vote');
    if (!who.ok) return who;
    return this.apply(room, castVote(room.state, who.id, askerId, answer, this.now()));
  }

  /** Апеляція (12f): гравець (у командній грі — капітан) відкриває голосування залу; права й підстави перевіряє рушій. */
  appeal(room: Room, personId: string, reason: AppealReason): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, openAppeal(room.state, personId, reason, this.now()));
  }

  /**
   * Голос в апеляції (12f): людина сама (у командній грі — учасник, не команда); голос можна змінити до кінця.
   * Понад APPEAL_VOTES_PER_SECOND за секунду — too_soon. Кінець голосування закриває таймер кімнати (nextDeadline рушія, reschedule).
   */
  appealVote(room: Room, personId: string, appealId: number, yes: boolean): AckResult {
    if (!this.alive(room)) return this.gone();
    // Людини вже немає в грі (вилучили) — відмова до вікна частоти: вікно для неї не заводиться.
    const state = room.state;
    const known = teamsOn(state) ? memberOf(state, personId) !== undefined : state.players.some((p) => p.id === personId);
    if (!known) return { ok: false, error: 'not_found' };
    const now = this.now();
    const rate = room.appealRate.get(personId);
    if (rate === undefined || now - rate.from >= 1000) room.appealRate.set(personId, { from: now, count: 1 });
    else if (rate.count + 1 > APPEAL_VOTES_PER_SECOND) return { ok: false, error: 'too_soon' };
    else rate.count += 1;
    return this.apply(room, castAppealVote(room.state, personId, appealId, yes, now));
  }

  /** Підказка ведучого на запит гравця з бафом (не плутати з підказкою ланцюжка, hint). */
  hostHint(room: Room, playerId: string, text: string | null): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, giveHint(room.state, playerId, text));
  }

  retry(room: Room, playerId: string, keep: boolean): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, chooseRetry(room.state, who.id, keep, this.now()));
  }

  declareDuel(room: Room, playerId: string, opponentId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, declareDuel(room.state, who.id, opponentId));
  }

  duelCategory(room: Room, playerId: string, categoryId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, pickDuelCategory(room.state, who.id, categoryId, this.now(), this.rng));
  }

  duelAnswer(room: Room, playerId: string, text: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'duel');
    if (!who.ok) return who;
    return this.apply(room, answerDuel(room.state, who.id, text, this.now()));
  }

  hint(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'answerer');
    if (!who.ok) return who;
    return this.apply(room, takeHint(room.state, who.id, this.now()));
  }

  /** «Хто я?» у власному темпі (12c): людина відкриває наступну підказку собі; у командній грі — той, хто відповідає за команду (actorOf 'answer'). */
  clue(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    // Поза запитанням — wrong_phase для всіх, а не not_captain для некапітана (як actAnswer).
    if (room.state.phase !== 'question') return { ok: false, error: 'wrong_phase' };
    const who = this.act(room, playerId, 'answer');
    if (!who.ok) return who;
    return this.apply(room, openClue(room.state, who.id, this.now()));
  }

  pick(room: Room, playerId: string, cellId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, pickCell(room.state, who.id, cellId, this.now(), this.rng));
  }

  roll(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, rollDie(room.state, who.id, this.rng));
  }

  wager(room: Room, playerId: string, amount: number, allIn = false): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, placeWager(room.state, who.id, amount, this.now(), this.rng, allIn));
  }

  /** Дія з телефона гравця подією host:* (11g): звичайна кімната → forbidden; не автор чи дія не з AuthorAction → not_allowed. */
  author(room: Room, playerId: string, action: HostAction): AckResult {
    if (!this.alive(room)) return this.gone();
    const state = room.state;
    if (state.autopilot === undefined) return FORBIDDEN;
    if (!isAuthor(state, playerId) || !isAuthorAction(action)) return NOT_ALLOWED;
    // Затримки 11b для дій автора немає: жодна з них не «Далі».
    switch (action.type) {
      case 'start':
        return this.apply(room, autopilotStart(state, this.now(), this.rng, action.resume ?? this.carryFor(room)));
      case 'pause': {
        const paused = this.apply(room, authorPause(state, this.now()));
        if (paused.ok) room.tilts.clear();
        return paused;
      }
      case 'resume':
        return this.apply(room, authorResume(state, this.now()));
      case 'end':
        return this.apply(room, end(state, this.now()));
      case 'save':
        return this.save(room);
      case 'kick':
        return action.playerId === playerId ? NOT_ALLOWED : this.kick(room, action.playerId);
      case 'release':
        return action.playerId === playerId ? NOT_ALLOWED : this.release(room, action.playerId);
      case 'cloud-hide':
        // Лише поки «хмару» видно на сцені.
        if (state.phase !== 'reveal') return { ok: false, error: 'wrong_phase' };
        return this.apply(room, hideCloudWord(state, action.key, action.hidden));
      case 'bluff-remove':
        // Автор — гравець: прибирати вигадки лише після свого вибору (authorRemoveBluff).
        return this.apply(room, authorRemoveBluff(state, action.optionId));
      case 'team-form':
        return this.apply(room, authorTeamForm(state, action.form));
    }
  }

  host(room: Room, action: HostAction): AckResult {
    if (!this.alive(room)) return this.gone();
    const state = room.state;
    // Автопілот: ролі host немає (identify), тож сюди не дійти; для певності.
    if (state.autopilot !== undefined) return FORBIDDEN;
    // На паузі рушій сам відповість paused; затримка — лише поки гра йде.
    const paced = PACED[action.type];
    if (paced !== undefined && !state.paused && tooSoon(state, paced, this.now() + PACE_GRACE_MS)) return { ok: false, error: 'too_soon' };
    switch (action.type) {
      case 'start':
        return this.apply(room, start(state, this.now(), action.resume ?? this.carryFor(room)));
      case 'lock':
        return this.apply(room, lock(state, this.now()));
      case 'next':
        return this.apply(room, next(state, this.now(), this.rng));
      case 'pause': {
        const paused = this.apply(room, pause(state, this.now()));
        if (paused.ok) room.tilts.clear();
        return paused;
      }
      case 'resume':
        return this.apply(room, resume(state, this.now()));
      case 'end-round':
        return this.apply(room, endRound(state, this.now()));
      case 'end':
        return this.apply(room, end(state, this.now()));
      case 'save':
        return this.save(room);
      case 'override':
        return this.apply(room, override(state, action.playerId, action.grade, this.now()));
      case 'dice':
        return this.apply(room, startDice(state));
      case 'roll':
        return this.apply(room, rollForRest(state, this.rng));
      case 'skip':
        return this.apply(room, skipTurn(state, this.now()));
      case 'pick':
        return this.apply(room, pickCell(state, null, action.cellId, this.now(), this.rng));
      case 'duel-category':
        return this.apply(room, pickDuelCategory(state, null, action.categoryId, this.now(), this.rng));
      case 'duel-skip':
        return this.apply(room, skipDuelQuestion(state, this.now(), this.rng));
      case 'duel-cancel':
        return this.apply(room, cancelDuel(state));
      case 'guide-skip':
        return this.apply(room, skipGuide(state, this.now()));
      case 'clue':
        return this.apply(room, nextClue(state, this.now()));
      case 'survey-all':
        return this.apply(room, revealSurveyAll(state));
      case 'bluff-all':
        return this.apply(room, revealBluffAll(state));
      case 'bluff-remove':
        return this.apply(room, removeBluffOption(state, action.optionId));
      case 'order':
        return this.apply(room, setOrder(state, action.playerIds));
      case 'cloud-hide':
        return this.apply(room, hideCloudWord(state, action.key, action.hidden));
      case 'kick':
        return this.kick(room, action.playerId);
      case 'release':
        return this.release(room, action.playerId);
      case 'adjust':
        return this.apply(room, adjustScore(state, action.playerId, action.points, this.now()));
      case 'undo':
        // Після кінця гри з призами (14a) результат зафіксовано: скасування штрафу за вихід переставило б місця.
        if (state.phase === 'finished' && room.prizes.length > 0) return { ok: false, error: 'prizes_final' };
        return this.apply(room, undoScore(state, action.target, this.now()));
      case 'debuff':
        return this.apply(room, setDebuff(state, action.playerId, action.kind));
      case 'undebuff':
        return this.apply(room, cancelDebuff(state, action.playerId));
      case 'time':
        return this.apply(room, adjustTime(state, action.seconds, this.now()));
      case 'judge':
        return this.apply(room, judge(state, action.playerId, action.correct, this.now()));
      case 'name':
        return this.apply(room, nameAnswer(state, action.answer));
      case 'accept':
        return this.apply(room, acceptAnswer(state, action.playerId, this.now()));
      case 'repick':
        return this.apply(room, repick(state, action.playerId, this.now()));
      case 'team-form':
        return this.apply(room, setTeamForm(state, action.form));
      case 'team-assign':
        return this.apply(room, assignTeam(state, action.memberId, action.teamId));
      case 'team-deal':
        return this.apply(room, dealTeams(state, this.rng));
      case 'team-dice':
        return this.apply(room, startTeamDice(state));
      case 'team-roll':
        return this.apply(room, rollTeamRest(state, this.rng));
      case 'captain':
        return this.apply(room, setCaptain(state, action.teamId, action.memberId));
    }
  }

  /** Хто з людей діє (10j): у командній грі — id команди (голос — сама людина) або помилка; соло — сам гравець. */
  private act(room: Room, playerId: string, kind: TeamAct): { ok: true; id: string } | { ok: false; error: ErrorCode } {
    return actorOf(room.state, playerId, kind);
  }

  private kick(room: Room, playerId: string): AckResult {
    // Після фінішу подіум уже показано; вилучення переписало б результати.
    if (room.state.phase === 'finished') return { ok: false, error: 'wrong_phase' };
    // Ведучий вилучає людей: id команди в командній грі — не людина (команда зникає з останнім учасником).
    if (teamsOn(room.state) && memberOf(room.state, playerId) === undefined) return { ok: false, error: 'not_found' };
    const removed = removePlayer(room.state, playerId, this.now());
    if (!removed.ok) return { ok: false, error: removed.error };
    for (const [token, id] of room.playerTokens) {
      if (id === playerId) room.playerTokens.delete(token);
    }
    room.connections.delete(playerId);
    room.playerUsers.delete(playerId);
    // Чернетка вилученої людини й команди, що зникла з останнім учасником, теж зникає.
    for (const id of room.drafts.keys()) {
      if (!removed.state.players.some((p) => p.id === id) && memberOf(removed.state, id) === undefined) room.drafts.delete(id);
    }
    room.draftRate.delete(playerId);
    room.hidden.delete(playerId);
    room.gaps.delete(playerId);
    room.awayRate.delete(playerId);
    room.appealRate.delete(playerId);
    room.pickRate.delete(playerId);
    room.awayCredit.delete(playerId);
    // Нахил вилученого гравця (чи команди, що зникла з ним) теж.
    for (const sorterId of room.tilts.keys()) {
      if (!removed.state.players.some((p) => p.id === sorterId)) room.tilts.delete(sorterId);
    }
    this.emit(room, { type: 'kicked', playerId });
    // Новою головою черги може стати гравець, чиє вікно вже сплило, поки чекали на ведучого;
    // таймер його вже минув, тож доводимо стан до поточної миті тут.
    room.tickedTo = Math.max(room.tickedTo, this.now());
    this.commit(room, tick(removed.state, room.tickedTo));
    return { ok: true };
  }

  private hostLeft(room: Room): void {
    const { phase, paused } = room.state;
    if (phase === 'lobby' || phase === 'finished') return;
    if (!paused) this.apply(room, pause(room.state, this.now()));
    this.scheduler.clearTimeout(room.absence);
    room.absence = this.scheduler.setTimeout(() => {
      room.absence = null;
      if (this.alive(room)) this.autosave(room);
    }, HOST_ABSENCE_MS);
  }

  /**
   * Автопілот (11g): у грі (не лобі, не фініш) нікого на зв'язку → AUTOPILOT_EMPTY_MS до «Завершити гру» (таймер не перезапускається);
   * хтось повернувся, лобі чи фініш → таймер геть. hostLeft для автопілота не діє ніколи.
   */
  private watchEmpty(room: Room): void {
    const { phase } = room.state;
    if (phase === 'lobby' || phase === 'finished' || anyonePresent(room.state)) {
      this.scheduler.clearTimeout(room.absence);
      room.absence = null;
      return;
    }
    if (room.absence !== null) return;
    room.absence = this.scheduler.setTimeout(() => {
      room.absence = null;
      if (this.alive(room)) this.autosave(room);
    }, AUTOPILOT_EMPTY_MS);
  }

  /**
   * Автопілот (11g): пауза автора (hold 'author') у грі, а автора немає на зв'язку → через HOST_ABSENCE_MS пауза знімається
   * як authorResume (залишок кроку бере planAutopilot); автор повернувся чи паузи вже немає → таймер геть.
   */
  private watchAuthor(room: Room): void {
    const { state } = room;
    const pilot = state.autopilot;
    const away =
      pilot !== undefined &&
      state.paused &&
      pilot.hold === 'author' &&
      state.phase !== 'lobby' &&
      state.phase !== 'finished' &&
      (room.connections.get(pilot.authorId) ?? 0) === 0;
    if (!away) {
      this.scheduler.clearTimeout(room.authorAway);
      room.authorAway = null;
      return;
    }
    if (room.authorAway !== null) return;
    room.authorAway = this.scheduler.setTimeout(() => {
      room.authorAway = null;
      if (this.alive(room)) this.apply(room, authorResume(room.state, this.now()));
    }, HOST_ABSENCE_MS);
  }

  /** Ручне збереження (host 'save', author 'save'): hostUserId null → not_allowed; lobby/finished чи checkpoint null → wrong_phase; інакше закрити з saved. */
  save(room: Room): AckResult {
    if (!this.alive(room)) return this.gone();
    if (room.hostUserId === null) return NOT_ALLOWED;
    if (!this.savable(room, false)) return { ok: false, error: 'wrong_phase' };
    this.closeSaved(room);
    return { ok: true };
  }

  /** Таймери (13b): гру, яку можна зберегти, — зберегти й закрити; інакше «Завершити гру», як досі. */
  private autosave(room: Room): void {
    if (this.savable(room, true)) this.closeSaved(room);
    else this.apply(room, end(room.state, this.now()));
  }

  /** hostUserId є, фаза не lobby/finished, контрольна точка є, а для автозбереження гра ще й дійшла до запитання (plays). */
  private savable(room: Room, auto: boolean): boolean {
    const { phase, plays } = room.state;
    if (room.hostUserId === null || phase === 'lobby' || phase === 'finished' || room.checkpoint === null) return false;
    return !auto || plays.length > 0;
  }

  /** Що піде в saved_game: контрольна точка; акаунти — лише людей і гравців точки. */
  private savedData(room: Room): SavedGameData {
    const checkpoint = room.checkpoint!;
    const people = new Set([...checkpoint.state.players.map((p) => p.id), ...slotsOf(checkpoint.state).map((slot) => slot.id)]);
    return {
      v: SAVED_GAME_VERSION,
      stateVersion: GAME_STATE_VERSION,
      state: checkpoint.state,
      at: checkpoint.at,
      playerUsers: [...room.playerUsers].filter(([playerId]) => people.has(playerId)),
      quizId: room.quizId,
      ...(room.prizes.length === 0 ? {} : { prizes: room.prizes }),
    };
  }

  private closeSaved(room: Room): void {
    const saved = this.savedData(room);
    this.clearTimers(room);
    this.live.delete(room.code);
    this.emit(room, { type: 'closed', saved });
  }

  private alive(room: Room): boolean {
    return !this.isFrozen && this.live.get(room.code) === room;
  }

  /** Відповідь на дію з кімнатою, якої немає: на зупинці — перепідключитися, інакше гри немає. */
  private gone(): AckResult {
    return this.isFrozen ? RESTARTING : GONE;
  }

  private clearTimers(room: Room): void {
    for (const handle of [room.deadline, room.pilot, room.absence, room.authorAway, room.expiry]) this.scheduler.clearTimeout(handle);
    room.deadline = room.pilot = room.absence = room.authorAway = room.expiry = null;
  }

  private apply(room: Room, result: Result): AckResult {
    if (!result.ok) return { ok: false, error: result.error };
    this.commit(room, result.state);
    return { ok: true };
  }

  /** at — мить зміни для мітки кроку (11b): зараз, а для таймера — його дедлайн. */
  private commit(room: Room, state: GameState, at = this.now()): void {
    // Антигугл (12e): годинник виходів між кроками — на кожному кроці (дії, таймери, автопілот), у мить кроку; до stamp.
    state = awayStep(room.state, state, at, room.hidden);
    // Нове запитання: нахили попереднього вже нічого не значать.
    if (state.questionIndex !== room.state.questionIndex) room.tilts.clear();
    // Автопілот: мітка кроку завжди (від неї рахуються заставки й вікна 11b), потім план наступного кроку (11g).
    const wasPaused = room.state.paused;
    const stamped = this.pacing || state.autopilot !== undefined ? stamp(room.state, state, at) : state;
    room.state = planAutopilot(room.state, stamped, at);
    // Межа між запитаннями (13b): звідси гру можна зберегти й продовжити.
    if (restPoint(room.state)) room.checkpoint = { state: room.state, at };
    // Пауза (і та, що ставить автопілот, коли нікого на зв'язку): нахили більше не діють.
    if (!wasPaused && room.state.paused) room.tilts.clear();
    if (room.state.autopilot !== undefined) {
      this.watchEmpty(room);
      this.watchAuthor(room);
    }
    this.reschedule(room);
    this.emit(room, { type: 'changed' });
  }

  /** Приводить таймери кімнати у відповідність до її стану. */
  private reschedule(room: Room): void {
    this.scheduler.clearTimeout(room.deadline);
    room.deadline = null;
    const { phase } = room.state;
    // Крім кінця запитання, у бліці спливають вікна відповіді. Мить, яка вже минула, але до якої
    // таймер ще не доходив, обробляється одразу: інакше її пропустила б зміна стану перед таймером.
    const at = nextDeadline(room.state, room.tickedTo);
    if (at !== null) {
      room.deadline = this.scheduler.setTimeout(() => {
        room.deadline = null;
        // Справжній таймер може спрацювати на мілісекунду раніше; цей дедлайн однаково настав.
        room.tickedTo = Math.max(this.now(), at);
        const ticked = tick(room.state, room.tickedTo);
        // Навіть без змін стану (відповідь у черзі чекає на ведучого) таймер ставиться на наступну мить.
        if (ticked !== room.state) this.commit(room, ticked, room.tickedTo);
        else this.reschedule(room);
      }, Math.max(0, at - this.now()));
    }

    this.scheduler.clearTimeout(room.pilot);
    room.pilot = null;
    const pilotAt = room.state.autopilot?.at ?? null;
    if (pilotAt !== null) {
      room.pilot = this.scheduler.setTimeout(() => {
        room.pilot = null;
        room.tickedTo = Math.max(this.now(), pilotAt);
        // Спершу дедлайни рушія до цієї миті, потім крок автопілота; pilotTry скидає at (чи ставить повтор), нову мить ставить planAutopilot у commit.
        const ticked = tick(room.state, room.tickedTo);
        // Таймер запізнився й рушій уже перейшов на інший підкрок: крок для нього не планувався — commit спланує новий.
        if (pilotKey(ticked) !== pilotKey(room.state)) return this.commit(room, ticked, room.tickedTo);
        const { state: stepped, error } = pilotTry(ticked, room.tickedTo, this.rng);
        // Відхилений крок рушій повторить через AUTOPILOT_MS.retry; помилка — у журнал.
        if (error !== null) this.warn(`Автопілот ${room.code}: крок у фазі ${ticked.phase} відхилено (${error}), повтор.`);
        if (stepped !== room.state) this.commit(room, stepped, room.tickedTo);
        else this.reschedule(room);
      }, Math.max(0, pilotAt - this.now()));
    }

    if (room.expiryPhase === phase) return;
    room.expiryPhase = phase;
    this.scheduler.clearTimeout(room.expiry);
    room.expiry = null;
    const ttl = phase === 'lobby' ? LOBBY_TTL_MS : phase === 'finished' ? FINISHED_TTL_MS : null;
    if (ttl !== null) room.expiry = this.scheduler.setTimeout(() => this.close(room), ttl);
  }

  private close(room: Room): void {
    this.clearTimers(room);
    this.live.delete(room.code);
    this.emit(room, { type: 'closed' });
  }

  private emit(room: Room, event: RoomEvent): void {
    for (const listener of this.listeners) listener(room, event);
  }

  private newCode(): string {
    for (;;) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (!this.live.has(code) && !this.reserved.has(code)) return code;
    }
  }
}
