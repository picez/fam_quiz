import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  audioOf,
  acceptAnswer,
  addPlayer,
  adjustScore,
  adjustTime,
  answerDuel,
  buyDebuff,
  buzz,
  cancelDebuff,
  cancelDuel,
  castVote,
  createGame,
  declareDuel,
  end,
  endRound,
  giveHint,
  guessWord,
  hostView,
  judge,
  lock,
  nameAnswer,
  next,
  nextDeadline,
  override,
  pause,
  pickDuelCategory,
  pickCell,
  placeWager,
  playerView,
  removePlayer,
  repick,
  resume,
  rollDie,
  rollForRest,
  setConnected,
  setDebuff,
  setOrder,
  skipDuelQuestion,
  skipTurn,
  sortWord,
  takeBuff,
  chooseRetry,
  skipGuide,
  startDice,
  stageView,
  start,
  submitAnswer,
  suspend,
  takeHint,
  tick,
  GAME_STATE_VERSION,
  type GameState,
  type Result,
} from '@quiz/engine';
import type { AckResult, Answer, BuffKind, DebuffKind, ErrorCode, GameView, Grade, Phase, Quiz, Role, SubmittedAnswer } from '@quiz/shared';
import type { Scheduler } from './scheduler';

export const HOST_ABSENCE_MS = 10 * 60_000;
export const LOBBY_TTL_MS = 2 * 60 * 60_000;
export const FINISHED_TTL_MS = 30 * 60_000;

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
  /** Мить, до якої стан уже доведено таймером; дедлайни після неї ще належить обробити. */
  tickedTo: number;
  absence: unknown;
  expiry: unknown;
  expiryPhase: Phase | null;
  /** Лічильник команд звуку; лише в пам'яті, у збережену кімнату не потрапляє; стартує з Date.now(), щоб після перезапуску клієнт не проґавив команду. */
  audioSeq: number;
}

/** moved — кімнату тепер веде інший процес (9b): вона пішла з пам'яті, але не закрита. */
export type RoomEvent =
  | { type: 'changed' }
  | { type: 'kicked'; playerId: string }
  | { type: 'closed' }
  | { type: 'moved' }
  | { type: 'audio'; action: 'replay' | 'stop'; seq: number };
export type RoomListener = (room: Room, event: RoomEvent) => void;

export type HostAction =
  | { type: 'start' | 'lock' | 'next' | 'pause' | 'resume' | 'end-round' | 'end' | 'dice' | 'roll' | 'skip' | 'duel-skip' | 'duel-cancel' | 'guide-skip' }
  | { type: 'accept' | 'repick'; playerId: string }
  | { type: 'override'; playerId: string; grade: Grade }
  | { type: 'kick'; playerId: string }
  | { type: 'adjust'; playerId: string; points: number }
  | { type: 'debuff'; playerId: string; kind: DebuffKind }
  | { type: 'undebuff'; playerId: string }
  | { type: 'judge'; playerId: string; correct: boolean }
  | { type: 'name'; answer: SubmittedAnswer | null }
  | { type: 'pick'; cellId: string }
  | { type: 'duel-category'; categoryId: string }
  | { type: 'order'; playerIds: string[] }
  | { type: 'time'; seconds: -15 | 15 };

export type JoinResult =
  | { ok: true; token: string; playerId: string }
  | { ok: false; error: ErrorCode | 'game_not_found' | 'restarting' };

const GONE: AckResult = { ok: false, error: 'game_not_found' };
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

/** Перевірка рядка з бази: та сама версія знімка й стану, на місці поля, без яких кімнату не підняти. */
export function isSavedRoom(raw: unknown): raw is SavedRoom {
  if (!isObject(raw)) return false;
  return (
    raw.v === SAVED_ROOM_VERSION &&
    raw.stateVersion === GAME_STATE_VERSION &&
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
}

export class RoomManager {
  private readonly scheduler: Scheduler;
  private readonly rng: () => number;
  private readonly transitions: boolean;
  private readonly live = new Map<string, Room>();
  /** Коди кімнат із бази, яких немає в пам'яті. */
  private reserved = new Set<string>();
  private isFrozen = false;
  private readonly listeners = new Set<RoomListener>();

  constructor(scheduler: Scheduler, rng: () => number = Math.random, options: RoomManagerOptions = {}) {
    this.scheduler = scheduler;
    this.rng = rng;
    this.transitions = options.transitions ?? false;
  }

  now(): number {
    return this.scheduler.now();
  }

  get size(): number {
    return this.live.size;
  }

  hostOnline(room: Room): boolean {
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
    const room: Room = {
      id: randomUUID(),
      code: this.newCode(),
      hostToken: newToken(),
      stageToken: newToken(),
      hostUserId,
      quizId,
      playerUsers: new Map(),
      state: createGame(quiz, { transitions: this.transitions }),
      playerTokens: new Map(),
      connections: new Map(),
      deadline: null,
      tickedTo: 0,
      absence: null,
      expiry: null,
      expiryPhase: null,
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
      tickedTo: saved.tickedTo,
      absence: null,
      expiry: null,
      expiryPhase: null,
      audioSeq: Date.now(),
    };
    this.live.set(room.code, room);
    this.reserved.delete(room.code);
    // Пульт ще не підключений: як після відходу ведучого — 10 хв на повернення (стан уже на паузі).
    this.hostLeft(room);
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
    return identity.playerId === null ? null : playerView(room.state, identity.playerId);
  }

  answer(room: Room, playerId: string, answer: Answer): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, submitAnswer(room.state, playerId, answer, this.now()));
  }

  buzz(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, buzz(room.state, playerId, this.now()));
  }

  guess(room: Room, playerId: string, word: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, guessWord(room.state, playerId, word, this.now()));
  }

  sort(room: Room, playerId: string, wordId: string, categoryId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, sortWord(room.state, playerId, wordId, categoryId, this.now()));
  }

  buff(room: Room, playerId: string, kind: BuffKind): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, takeBuff(room.state, playerId, kind, this.now(), this.rng));
  }

  /** Гравець купує дебаф для суперника (9c). */
  buyDebuff(room: Room, buyerId: string, targetId: string, kind: DebuffKind): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, buyDebuff(room.state, buyerId, targetId, kind, this.now()));
  }

  vote(room: Room, playerId: string, askerId: string, answer: Answer): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, castVote(room.state, playerId, askerId, answer, this.now()));
  }

  /** Підказка ведучого на запит гравця з бафом (не плутати з підказкою ланцюжка, hint). */
  hostHint(room: Room, playerId: string, text: string | null): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, giveHint(room.state, playerId, text));
  }

  retry(room: Room, playerId: string, keep: boolean): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, chooseRetry(room.state, playerId, keep, this.now()));
  }

  declareDuel(room: Room, playerId: string, opponentId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, declareDuel(room.state, playerId, opponentId));
  }

  duelCategory(room: Room, playerId: string, categoryId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, pickDuelCategory(room.state, playerId, categoryId, this.now(), this.rng));
  }

  duelAnswer(room: Room, playerId: string, text: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, answerDuel(room.state, playerId, text, this.now()));
  }

  hint(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, takeHint(room.state, playerId, this.now()));
  }

  pick(room: Room, playerId: string, cellId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, pickCell(room.state, playerId, cellId, this.now(), this.rng));
  }

  roll(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, rollDie(room.state, playerId, this.rng));
  }

  wager(room: Room, playerId: string, amount: number, allIn = false): AckResult {
    if (!this.alive(room)) return this.gone();
    return this.apply(room, placeWager(room.state, playerId, amount, this.now(), this.rng, allIn));
  }

  host(room: Room, action: HostAction): AckResult {
    if (!this.alive(room)) return this.gone();
    const state = room.state;
    switch (action.type) {
      case 'start':
        return this.apply(room, start(state, this.now()));
      case 'lock':
        return this.apply(room, lock(state));
      case 'next':
        return this.apply(room, next(state, this.now(), this.rng));
      case 'pause':
        return this.apply(room, pause(state, this.now()));
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
      case 'order':
        return this.apply(room, setOrder(state, action.playerIds));
      case 'kick':
        return this.kick(room, action.playerId);
      case 'adjust':
        return this.apply(room, adjustScore(state, action.playerId, action.points, this.now()));
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
    }
  }

  private kick(room: Room, playerId: string): AckResult {
    // Після фінішу подіум уже показано; вилучення переписало б результати.
    if (room.state.phase === 'finished') return { ok: false, error: 'wrong_phase' };
    const removed = removePlayer(room.state, playerId);
    if (!removed.ok) return { ok: false, error: removed.error };
    for (const [token, id] of room.playerTokens) {
      if (id === playerId) room.playerTokens.delete(token);
    }
    room.connections.delete(playerId);
    room.playerUsers.delete(playerId);
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

  private alive(room: Room): boolean {
    return !this.isFrozen && this.live.get(room.code) === room;
  }

  /** Відповідь на дію з кімнатою, якої немає: на зупинці — перепідключитися, інакше гри немає. */
  private gone(): AckResult {
    return this.isFrozen ? RESTARTING : GONE;
  }

  private clearTimers(room: Room): void {
    for (const handle of [room.deadline, room.absence, room.expiry]) this.scheduler.clearTimeout(handle);
    room.deadline = room.absence = room.expiry = null;
  }

  private apply(room: Room, result: Result): AckResult {
    if (!result.ok) return { ok: false, error: result.error };
    this.commit(room, result.state);
    return { ok: true };
  }

  private commit(room: Room, state: GameState): void {
    room.state = state;
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
        if (ticked !== room.state) this.commit(room, ticked);
        else this.reschedule(room);
      }, Math.max(0, at - this.now()));
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
