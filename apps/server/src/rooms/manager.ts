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
  assignTeam,
  adjustScore,
  undoScore,
  adjustTime,
  answerDuel,
  buyDebuff,
  cancelDebuff,
  cancelDuel,
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
  stageView,
  start,
  suspend,
  takeHint,
  teamsOn,
  memberOf,
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
  tooSoon,
  type GameState,
  type PacedAction,
  type Result,
  type TeamAct,
} from '@quiz/engine';
import { draftQuestionType, DRAFTS_PER_SECOND, isAnswerDraft, isUnscored, SORT_TILT_GAP_MS, type AckResult, type Answer, type BuffKind, type DebuffKind, type DraftValue, type ErrorCode, type GameView, type Grade, type HostDrafts, type HostUndoTarget, type LifelineKind, type Phase, type PlayerView, type Question, type Quiz, type Role, type SortTilt, type SubmittedAnswer, type TeamForm } from '@quiz/shared';
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
  | { type: 'kicked'; playerId: string }
  | { type: 'closed' }
  | { type: 'moved' }
  | { type: 'audio'; action: 'replay' | 'stop'; seq: number }
  /** Чернетка змінилася: стан гри той самий; товаришам (teammates) — свіжий зріз, пульту — пакет host:drafts (socket.ts). */
  | { type: 'draft'; id: string; by: string; teammates: boolean }
  /** Нахил картки сортування (11d): by — людина, що шле; audience — кому показ дозволено. Стан гри той самий. */
  | { type: 'tilt'; tilt: SortTilt; by: string; audience: 'all' | 'team' };
export type RoomListener = (room: Room, event: RoomEvent) => void;

export type HostAction =
  | { type: 'start' | 'lock' | 'next' | 'pause' | 'resume' | 'end-round' | 'end' | 'dice' | 'roll' | 'skip' | 'duel-skip' | 'duel-cancel' | 'guide-skip' | 'clue' | 'survey-all' | 'bluff-all' }
  | { type: 'accept' | 'repick'; playerId: string }
  | { type: 'override'; playerId: string; grade: Grade }
  | { type: 'kick'; playerId: string }
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
export type AuthorAction = { type: 'start' | 'pause' | 'resume' | 'end' } | Extract<HostAction, { type: 'kick' | 'cloud-hide' | 'bluff-remove' | 'team-form' }>;

const AUTHOR_ACTIONS: ReadonlySet<HostAction['type']> = new Set<AuthorAction['type']>(['start', 'pause', 'resume', 'end', 'kick', 'cloud-hide', 'bluff-remove', 'team-form']);
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
  /** Хто відповідає за команду: на запитанні — як за відповідь (у бліці той, хто натиснув), на виживанні — капітан. */
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
  return trial === null ? null : { trial: true, unscored: false, act: 'captain', question: () => trial };
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

  private open(state: GameState, hostUserId: string | null, quizId: string | null): Room {
    const room: Room = {
      id: randomUUID(),
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

  get(code: string): Room | undefined {
    return this.live.get(code);
  }

  join(code: string, nickname: string, userId: string | null = null): JoinResult {
    // На зупинці новий гравець не з'являється: стан уже не записався б у базу.
    if (this.isFrozen) return { ok: false, error: 'restarting' };
    const room = this.live.get(code);
    if (room === undefined) return { ok: false, error: 'game_not_found' };
    const playerId = randomUUID();
    const added = addPlayer(room.state, { id: playerId, nickname });
    if (!added.ok) return added;
    // Гравець стає підключеним, коли відкриє сокет.
    const offline = setConnected(added.state, playerId, false, this.now());
    if (!offline.ok) return offline;
    const token = newToken();
    room.playerTokens.set(token, playerId);
    if (userId !== null) room.playerUsers.set(playerId, userId);
    this.commit(room, offline.state);
    return { ok: true, token, playerId };
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
      this.apply(room, setConnected(room.state, identity.playerId, true, this.now()));
    }
  }

  disconnect(room: Room, identity: Identity): void {
    if (!this.alive(room)) return;
    const key = identity.playerId ?? identity.role;
    const count = (room.connections.get(key) ?? 0) - 1;
    if (count > 0) {
      room.connections.set(key, count);
      return;
    }
    room.connections.delete(key);
    if (identity.playerId !== null) {
      this.apply(room, setConnected(room.state, identity.playerId, false, this.now()));
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

  view(room: Room, identity: Identity): GameView | null {
    if (identity.role === 'host') return hostView(room.state);
    if (identity.role === 'stage') return stageView(room.state);
    if (identity.playerId === null) return null;
    const view = playerView(room.state, identity.playerId);
    if (view === null) return null;
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
   * капітан, у бліці — той, хто натиснув); в опитуванні й «хмарі» командної гри — сама людина. Гра без ведучого
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
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, guessWord(room.state, who.id, word, this.now()));
  }

  sort(room: Room, playerId: string, wordId: string, categoryId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    const result = this.apply(room, sortWord(room.state, who.id, wordId, categoryId, this.now()));
    if (result.ok) room.tilts.delete(who.id);
    return result;
  }

  /** Нахил картки (11d): перевірка рушія, дросель SORT_TILT_GAP_MS, подія кімнати лише з новим значенням; стан гри не змінюється. */
  tilt(room: Room, playerId: string, tilt: { wordId: string; categoryId: string | null; amount: number }): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
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
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, guessWall(room.state, who.id, tiles, this.now()));
  }

  lie(room: Room, playerId: string, text: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, writeLie(room.state, who.id, text, this.now()));
  }

  bluff(room: Room, playerId: string, optionId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
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
    const who = this.act(room, playerId, 'captain');
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
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, answerTrial(room.state, who.id, answer, this.now()));
  }

  door(room: Room, playerId: string, door: number): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, pickDoor(room.state, who.id, door, this.now()));
  }

  buff(room: Room, playerId: string, kind: BuffKind): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, takeBuff(room.state, who.id, kind, this.now(), this.rng));
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

  /** Підказка ведучого на запит гравця з бафом (не плутати з підказкою ланцюжка, hint). */
  hostHint(room: Room, playerId: string, text: string | null): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, giveHint(room.state, playerId, text));
  }

  retry(room: Room, playerId: string, keep: boolean): AckResult {
    if (!this.alive(room)) return this.gone();
    const who = this.act(room, playerId, 'captain');
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
    const who = this.act(room, playerId, 'captain');
    if (!who.ok) return who;
    return this.apply(room, takeHint(room.state, who.id, this.now()));
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
        return this.apply(room, autopilotStart(state, this.now(), this.rng));
      case 'pause': {
        const paused = this.apply(room, authorPause(state, this.now()));
        if (paused.ok) room.tilts.clear();
        return paused;
      }
      case 'resume':
        return this.apply(room, authorResume(state, this.now()));
      case 'end':
        return this.apply(room, end(state, this.now()));
      case 'kick':
        return action.playerId === playerId ? NOT_ALLOWED : this.kick(room, action.playerId);
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
        return this.apply(room, start(state, this.now()));
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
      case 'adjust':
        return this.apply(room, adjustScore(state, action.playerId, action.points, this.now()));
      case 'undo':
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
      if (this.alive(room)) this.apply(room, end(room.state, this.now()));
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
      if (this.alive(room)) this.apply(room, end(room.state, this.now()));
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
    // Нове запитання: нахили попереднього вже нічого не значать.
    if (state.questionIndex !== room.state.questionIndex) room.tilts.clear();
    // Автопілот: мітка кроку завжди (від неї рахуються заставки й вікна 11b), потім план наступного кроку (11g).
    const wasPaused = room.state.paused;
    const stamped = this.pacing || state.autopilot !== undefined ? stamp(room.state, state, at) : state;
    room.state = planAutopilot(room.state, stamped, at);
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
