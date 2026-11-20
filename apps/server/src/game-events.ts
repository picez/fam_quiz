import { randomUUID } from 'node:crypto';
import type { GameState } from '@quiz/engine';
import { DELETED_NICKNAME, type GameEventDetails, type GameEventKind, type Grade } from '@quiz/shared';
import type { GameEventRow } from './db/schema';
import type { Room } from './rooms/manager';

/** Що рекордер бачив у кімнаті минулого разу (65): учасники з рахунком, пауза й оцінки двох останніх запитань. */
export interface Seen {
  /** Учасники рушія (teamId null) і люди командної гри (teamId — їхня команда; score — рахунок команди). */
  players: Map<string, { nickname: string; teamId: string | null; score: number }>;
  paused: boolean;
  /** Ключ — `${index}:${participantId}` для двох останніх plays; бліц-запитань тут немає (спроби оцінює ведучий). */
  grades: Map<string, { grade: Grade; overridden: boolean }>;
}

export function seenOf(state: GameState): Seen {
  const players = new Map<string, { nickname: string; teamId: string | null; score: number }>();
  for (const player of state.players) players.set(player.id, { nickname: player.nickname, teamId: null, score: player.score });
  for (const member of state.teams?.members ?? []) {
    const team = member.teamId === null ? undefined : state.players.find((p) => p.id === member.teamId);
    players.set(member.id, { nickname: member.nickname, teamId: member.teamId, score: team?.score ?? 0 });
  }
  const grades = new Map<string, { grade: Grade; overridden: boolean }>();
  for (let index = Math.max(0, state.plays.length - 2); index < state.plays.length; index++) {
    const play = state.plays[index];
    if (play.blitz !== undefined) continue;
    for (const [id, record] of Object.entries(play.answers)) grades.set(`${index}:${id}`, { grade: record.grade, overridden: record.overridden });
  }
  return { players, paused: state.paused, grades };
}

type EventRow = Omit<GameEventRow, 'gameId'>;

/**
 * Події між prev і next: join — новий учасник, leave — зник (з рахунком і командою на мить, коли рекордер бачив його востаннє),
 * pause / resume — перехід state.paused, verdict — запис став ручним чи змінив ручну оцінку (from — оцінка до того; null — запису не було).
 * Місце видаленого акаунта (forgotten) — DELETED_NICKNAME без акаунта.
 */
export function diffEvents(prev: Seen, next: GameState, at: Date, who: { users: ReadonlyMap<string, string>; forgotten: ReadonlySet<string> }): EventRow[] {
  const now = seenOf(next);
  const questionIndex = next.plays.length - 1;
  const events: EventRow[] = [];
  const add = (kind: GameEventKind, participantId: string | null, nickname: string, details: GameEventDetails | null) => {
    const gone = participantId !== null && who.forgotten.has(participantId);
    events.push({
      id: randomUUID(),
      at,
      questionIndex,
      kind,
      participantId,
      userId: participantId === null || gone ? null : (who.users.get(participantId) ?? null),
      nickname: gone ? DELETED_NICKNAME : nickname,
      details,
    });
  };
  const teamOf = (seen: Seen, teamId: string | null) => (teamId === null ? undefined : seen.players.get(teamId)?.nickname);

  for (const [id, player] of now.players) {
    if (prev.players.has(id)) continue;
    const team = teamOf(now, player.teamId);
    add('join', id, player.nickname, team === undefined ? null : { team });
  }
  for (const [id, player] of prev.players) {
    if (now.players.has(id)) continue;
    const team = teamOf(prev, player.teamId);
    add('leave', id, player.nickname, { score: player.score, ...(team === undefined ? {} : { team }) });
  }
  if (prev.paused !== now.paused) add(now.paused ? 'pause' : 'resume', null, '', null);
  for (const [key, grade] of now.grades) {
    if (!grade.overridden) continue;
    const before = prev.grades.get(key);
    if (before?.overridden === true && before.grade === grade.grade) continue;
    const participantId = key.slice(key.indexOf(':') + 1);
    add('verdict', participantId, now.players.get(participantId)?.nickname ?? '', { from: before?.grade ?? null, to: grade.grade });
  }
  return events;
}

/**
 * Події черги проти кімнати на мить запису: акаунт, видалений, поки подія чекала (forgetUser → forgotten, пара з playerUsers геть),
 * не має лишитися в події — інакше зовнішній ключ user_id валив би кожен наступний запис гри, а нік видаленого витік би.
 * Місце в forgotten — DELETED_NICKNAME без акаунта; акаунт, якого вже немає в playerUsers цього місця, — null. id не змінюються.
 */
export function refreshEvents<T extends Pick<GameEventRow, 'participantId' | 'userId' | 'nickname'>>(
  events: T[],
  who: { users: ReadonlyMap<string, string>; forgotten: ReadonlySet<string> },
): T[] {
  return events.map((event) => {
    const id = event.participantId ?? null;
    if (id === null) return event;
    if (who.forgotten.has(id)) return event.userId == null && event.nickname === DELETED_NICKNAME ? event : { ...event, userId: null, nickname: DELETED_NICKNAME };
    if (event.userId != null && who.users.get(id) !== event.userId) return { ...event, userId: null };
    return event;
  });
}

/**
 * Спостерігач подій рекордера (65). Перше спостереження кімнати поза лобі (і після reset — кімната, піднята після перезапуску,
 * точне продовження) лише запам'ятовує стан і ставить у чергу start: запис пише його, лише якщо start цієї гри в базі ще немає.
 */
export function createEventWatcher(): {
  see(room: Room, now: number): void;
  pending(roomId: string): GameEventRow[];
  written(roomId: string, ids: string[]): void;
  reset(roomId: string): void;
} {
  const seen = new Map<string, Seen>();
  const queued = new Map<string, GameEventRow[]>();
  return {
    see(room, now) {
      const { state } = room;
      if (state.phase === 'lobby') return;
      const at = new Date(now);
      const before = seen.get(room.id);
      const fresh: EventRow[] =
        before === undefined
          ? [{ id: randomUUID(), at, questionIndex: state.plays.length - 1, kind: 'start', participantId: null, userId: null, nickname: '', details: null }]
          : diffEvents(before, state, at, { users: room.playerUsers, forgotten: room.forgotten ?? new Set() });
      seen.set(room.id, seenOf(state));
      if (fresh.length === 0) return;
      queued.set(room.id, [...(queued.get(room.id) ?? []), ...fresh.map((event) => ({ ...event, gameId: room.id }))]);
    },
    pending: (roomId) => [...(queued.get(roomId) ?? [])],
    written(roomId, ids) {
      const done = new Set(ids);
      const rest = (queued.get(roomId) ?? []).filter((event) => !done.has(event.id));
      if (rest.length === 0) queued.delete(roomId);
      else queued.set(roomId, rest);
    },
    reset(roomId) {
      seen.delete(roomId);
      queued.delete(roomId);
    },
  };
}
