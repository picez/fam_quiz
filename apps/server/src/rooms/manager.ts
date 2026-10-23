import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  acceptAnswer,
  addPlayer,
  adjustScore,
  adjustTime,
  buzz,
  cancelDebuff,
  createGame,
  end,
  endRound,
  guessWord,
  hostView,
  judge,
  lock,
  nameAnswer,
  next,
  nextDeadline,
  override,
  pause,
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
  skipTurn,
  startDice,
  stageView,
  start,
  submitAnswer,
  takeHint,
  tick,
  type GameState,
  type Result,
} from '@quiz/engine';
import type { AckResult, Answer, DebuffKind, ErrorCode, GameView, Grade, Phase, Quiz, Role, SubmittedAnswer } from '@quiz/shared';
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
}

export type RoomEvent = { type: 'changed' } | { type: 'kicked'; playerId: string } | { type: 'closed' };
export type RoomListener = (room: Room, event: RoomEvent) => void;

export type HostAction =
  | { type: 'start' | 'lock' | 'next' | 'pause' | 'resume' | 'end-round' | 'end' | 'dice' | 'roll' | 'skip' }
  | { type: 'accept' | 'repick'; playerId: string }
  | { type: 'override'; playerId: string; grade: Grade }
  | { type: 'kick'; playerId: string }
  | { type: 'adjust'; playerId: string; points: number }
  | { type: 'debuff'; playerId: string; kind: DebuffKind }
  | { type: 'undebuff'; playerId: string }
  | { type: 'judge'; playerId: string; correct: boolean }
  | { type: 'name'; answer: SubmittedAnswer | null }
  | { type: 'pick'; cellId: string }
  | { type: 'order'; playerIds: string[] }
  | { type: 'time'; seconds: -15 | 15 };

export type JoinResult =
  | { ok: true; token: string; playerId: string }
  | { ok: false; error: ErrorCode | 'game_not_found' };

const GONE: AckResult = { ok: false, error: 'game_not_found' };

const newToken = () => randomBytes(24).toString('base64url');

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class RoomManager {
  private readonly scheduler: Scheduler;
  private readonly rng: () => number;
  private readonly rooms = new Map<string, Room>();
  private readonly listeners = new Set<RoomListener>();

  constructor(scheduler: Scheduler, rng: () => number = Math.random) {
    this.scheduler = scheduler;
    this.rng = rng;
  }

  now(): number {
    return this.scheduler.now();
  }

  get size(): number {
    return this.rooms.size;
  }

  hostOnline(room: Room): boolean {
    return (room.connections.get('host') ?? 0) > 0;
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
      state: createGame(quiz),
      playerTokens: new Map(),
      connections: new Map(),
      deadline: null,
      tickedTo: 0,
      absence: null,
      expiry: null,
      expiryPhase: null,
    };
    this.rooms.set(room.code, room);
    this.reschedule(room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  join(code: string, nickname: string, userId: string | null = null): JoinResult {
    const room = this.rooms.get(code);
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
    const room = this.rooms.get(code);
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
  }

  view(room: Room, identity: Identity): GameView | null {
    if (identity.role === 'host') return hostView(room.state);
    if (identity.role === 'stage') return stageView(room.state);
    return identity.playerId === null ? null : playerView(room.state, identity.playerId);
  }

  answer(room: Room, playerId: string, answer: Answer): AckResult {
    if (!this.alive(room)) return GONE;
    return this.apply(room, submitAnswer(room.state, playerId, answer, this.now()));
  }

  buzz(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return GONE;
    return this.apply(room, buzz(room.state, playerId, this.now()));
  }

  guess(room: Room, playerId: string, word: string): AckResult {
    if (!this.alive(room)) return GONE;
    return this.apply(room, guessWord(room.state, playerId, word, this.now()));
  }

  hint(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return GONE;
    return this.apply(room, takeHint(room.state, playerId, this.now()));
  }

  pick(room: Room, playerId: string, cellId: string): AckResult {
    if (!this.alive(room)) return GONE;
    return this.apply(room, pickCell(room.state, playerId, cellId, this.now(), this.rng));
  }

  roll(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return GONE;
    return this.apply(room, rollDie(room.state, playerId, this.rng));
  }

  wager(room: Room, playerId: string, amount: number, allIn = false): AckResult {
    if (!this.alive(room)) return GONE;
    return this.apply(room, placeWager(room.state, playerId, amount, this.now(), this.rng, allIn));
  }

  host(room: Room, action: HostAction): AckResult {
    if (!this.alive(room)) return GONE;
    const state = room.state;
    switch (action.type) {
      case 'start':
        return this.apply(room, start(state));
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
        return this.apply(room, end(state));
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
      if (this.alive(room)) this.apply(room, end(room.state));
    }, HOST_ABSENCE_MS);
  }

  private alive(room: Room): boolean {
    return this.rooms.get(room.code) === room;
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
    for (const handle of [room.deadline, room.absence, room.expiry]) this.scheduler.clearTimeout(handle);
    room.deadline = room.absence = room.expiry = null;
    this.rooms.delete(room.code);
    this.emit(room, { type: 'closed' });
  }

  private emit(room: Room, event: RoomEvent): void {
    for (const listener of this.listeners) listener(room, event);
  }

  private newCode(): string {
    for (;;) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (!this.rooms.has(code)) return code;
    }
  }
}
