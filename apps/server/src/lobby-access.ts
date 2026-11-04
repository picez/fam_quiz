import { createHash, timingSafeEqual } from 'node:crypto';
import { approvedForGame } from './calendar-store';
import type { Db } from './db/client';
import type { Invites } from './invites';
import type { Room } from './rooms/manager';

/** Скільки невдалих спроб пароля за вікно дозволено одному входу (userId чи IP + пристрій) у кімнату (24c). */
export const PASSWORD_FAILS = 5;
export const PASSWORD_WINDOW_MS = 60_000;
export const PASSWORD_BLOCK_MS = 60_000;

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
    const record = this.attempts.get(key);
    if (record !== undefined && record.blockedUntil > now) return 'password_limited';
    if (entry.password === undefined) return 'password_required';
    if (safeEqual(entry.password.trim(), current)) return 'ok';
    const open = record !== undefined && record.since + PASSWORD_WINDOW_MS > now ? record : { fails: 0, since: now, blockedUntil: 0 };
    open.fails += 1;
    if (open.fails >= PASSWORD_FAILS) open.blockedUntil = now + PASSWORD_BLOCK_MS;
    this.attempts.set(key, open);
    return 'password_wrong';
  }

  /** Прибирає записи, у яких минули і вікно, і блок. */
  private prune(now: number): void {
    for (const [key, record] of this.attempts) {
      if (record.since + PASSWORD_WINDOW_MS <= now && record.blockedUntil <= now) this.attempts.delete(key);
    }
  }
}
