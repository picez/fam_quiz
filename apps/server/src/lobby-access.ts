import { createHash, timingSafeEqual } from 'node:crypto';
import { approvedForGame } from './calendar-store';
import type { Db } from './db/client';
import type { Invites } from './invites';
import type { Room } from './rooms/manager';

/** Скільки невдалих спроб пароля за вікно дозволено одному входу (userId чи IP + пристрій) у кімнату (24c). */
export const PASSWORD_FAILS = 5;
export const PASSWORD_WINDOW_MS = 60_000;
export const PASSWORD_BLOCK_MS = 60_000;
/** Друга межа — невдачі з однієї IP-адреси в кімнату за вікно, хоч би які пристрій і акаунт: токен пристрою вигадує клієнт. */
export const PASSWORD_IP_FAILS = 20;
/** Як часто, не частіше, прибирати застарілі записи лічильника. */
const PRUNE_EVERY_MS = 10_000;

export type GateResult = 'ok' | 'password_required' | 'password_wrong' | 'password_limited';

export interface GateEntry {
  userId: string | null;
  password?: string;
  ip: string;
  /** Токен пристрою з браузера: гості з однієї адреси не блокують одне одного. */
  device?: string;
}

interface Attempts {
  fails: number;
  /** Початок вікна — мить першої невдачі. */
  since: number;
  /** До якої миті вхід заблоковано; 0 — не заблоковано. */
  blockedUntil: number;
}

export function gateStatus(result: Exclude<GateResult, 'ok'>): 403 | 429 {
  return result === 'password_limited' ? 429 : 403;
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/**
 * Пароль лобі (24c): хто входить без нього, перевірка й лічильник невдалих спроб — лише в пам'яті процесу.
 * Пароль не логується й не повертається.
 */
export class LobbyGate {
  private readonly attempts = new Map<string, Attempts>();
  private prunedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly db: Db,
    private readonly invites: Invites,
    private readonly now: () => number,
  ) {}

  /** Без пароля: ведучий, акаунт, що вже в кімнаті, запрошений друг, схвалений учасник події календаря цієї кімнати. */
  async trusted(room: Room, userId: string | null): Promise<boolean> {
    if (userId === null) return false;
    if (room.hostUserId === userId) return true;
    for (const id of room.playerUsers.values()) if (id === userId) return true;
    if (this.invites.admits(room, userId)) return true;
    return approvedForGame(this.db, room.id, userId);
  }

  async check(room: Room, entry: GateEntry): Promise<GateResult> {
    const password = room.lobby.password;
    if (password === null) return 'ok';
    if (await this.trusted(room, entry.userId)) return 'ok';
    // Ведучий міг змінити чи прибрати пароль, поки ми чекали на базу.
    const current = room.lobby.password;
    if (current === null) return 'ok';
    const now = this.now();
    this.prune(now);
    const key = `${room.id}:${entry.userId !== null ? `u:${entry.userId}` : `g:${entry.ip}|${entry.device ?? ''}`}`;
    const ipKey = `${room.id}:ip:${entry.ip}`;
    if (this.blocked(key, now) || this.blocked(ipKey, now)) return 'password_limited';
    if (entry.password === undefined) return 'password_required';
    if (safeEqual(entry.password.trim(), current)) return 'ok';
    this.fail(key, PASSWORD_FAILS, now);
    this.fail(ipKey, PASSWORD_IP_FAILS, now);
    return 'password_wrong';
  }

  private blocked(key: string, now: number): boolean {
    const record = this.attempts.get(key);
    return record !== undefined && record.blockedUntil > now;
  }

  /** Невдача: вікно від першої невдачі; на cap-й — блок до now + PASSWORD_BLOCK_MS. */
  private fail(key: string, cap: number, now: number): void {
    const record = this.attempts.get(key);
    const open = record !== undefined && record.since + PASSWORD_WINDOW_MS > now ? record : { fails: 0, since: now, blockedUntil: 0 };
    open.fails += 1;
    if (open.fails >= cap) open.blockedUntil = now + PASSWORD_BLOCK_MS;
    this.attempts.set(key, open);
  }

  /** Не частіше ніж раз на PRUNE_EVERY_MS прибирає записи, у яких минули і вікно, і блок. */
  private prune(now: number): void {
    if (now - this.prunedAt < PRUNE_EVERY_MS) return;
    this.prunedAt = now;
    for (const [key, record] of this.attempts) {
      if (record.since + PASSWORD_WINDOW_MS <= now && record.blockedUntil <= now) this.attempts.delete(key);
    }
  }
}
