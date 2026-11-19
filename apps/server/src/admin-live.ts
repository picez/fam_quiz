import type { GameState } from '@quiz/engine';
import type { AdminLiveList, AdminLiveRoom, AdminLiveStatus } from '@quiz/shared';
import { inArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { profile } from './db/schema';
import type { Room } from './rooms/manager';

/** Стан кімнати для «Живих ігор» адмінки (53): раунд — лише коли гра вже в раунді (і на паузі). */
export function liveStatus(state: GameState): { status: AdminLiveStatus; round: AdminLiveRoom['round'] } {
  if (state.phase === 'lobby') return { status: 'lobby', round: null };
  if (state.phase === 'finished') return { status: 'finished', round: null };
  if (state.roundIndex < 0) return { status: 'starting', round: null };
  return { status: state.paused ? 'paused' : 'playing', round: { number: state.roundIndex + 1, of: state.quiz.rounds.length } };
}

/**
 * Кімнати в пам'яті для адміна (53): ніки ведучих одним запитом (для автопілота hostUserId — автор), жодного email.
 * Незавершені — перед завершеними, далі новіші за відкриттям лобі першими.
 */
export async function liveRooms(db: Db, rooms: Room[], now: Date): Promise<AdminLiveList> {
  const hostIds = [...new Set(rooms.flatMap((room) => (room.hostUserId === null ? [] : [room.hostUserId])))];
  const nicknames = new Map<string, string>();
  if (hostIds.length > 0) {
    const rows = await db.select({ userId: profile.userId, nickname: profile.nickname }).from(profile).where(inArray(profile.userId, hostIds));
    for (const row of rows) nicknames.set(row.userId, row.nickname ?? '');
  }
  const list = rooms.map((room) => {
    const { state } = room;
    const online = state.players.filter((p) => (room.connections.get(p.id) ?? 0) > 0).length;
    const entry: AdminLiveRoom = {
      code: room.code,
      title: state.quiz.title,
      host: room.hostUserId === null ? null : (nicknames.get(room.hostUserId) ?? ''),
      autopilot: state.autopilot !== undefined,
      players: { online, total: state.players.length },
      ...liveStatus(state),
      openedAt: new Date(room.lobby.openedAt).toISOString(),
      actedAt: new Date(room.actedAt).toISOString(),
      stageUrl: `/stage/${room.code}#${room.stageToken}`,
    };
    return { entry, opened: room.lobby.openedAt };
  });
  list.sort((x, y) => Number(x.entry.status === 'finished') - Number(y.entry.status === 'finished') || y.opened - x.opened);
  return { rooms: list.map((item) => item.entry), at: now.toISOString() };
}
