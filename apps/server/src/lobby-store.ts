import { LIMITS, LOBBY_LIST_LIMIT, roundQuestions, type LobbyRow } from '@quiz/shared';
import { slotsOf } from '@quiz/engine';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { follow, profile, userBan } from './db/schema';
import { notHidden } from './feed-store';
import { ensureProfile } from './profiles';
import { joinableOf, type Room } from './rooms/manager';
import { roomLevels } from './xp-store';

/**
 * Рядки списку лобі для того, хто дивиться. rooms — уже відібрані за фазою й видимістю «не hidden»; тут — підписки
 * ('friends' — лише ті, на кого підписаний ведучий), сортування (openedAt спадно, далі code), обрізка до LOBBY_LIST_LIMIT
 * і лише потім профілі ведучих (без бану) та рівні. Пароль у рядок не потрапляє.
 */
export async function lobbyRows(db: Db, rooms: Room[], viewerId: string | null): Promise<LobbyRow[]> {
  const hostIds = [...new Set(rooms.map((room) => room.hostUserId).filter((id): id is string => id !== null))];
  if (hostIds.length === 0) return [];

  let followedBy = new Set<string>();
  if (viewerId !== null && rooms.some((room) => room.lobby.visibility === 'friends')) {
    const rows = await db
      .select({ hostId: follow.followerId })
      .from(follow)
      .where(and(inArray(follow.followerId, hostIds), eq(follow.followeeId, viewerId)));
    followedBy = new Set(rows.map((row) => row.hostId));
  }
  const shown = rooms
    .filter((room) => room.hostUserId !== null && (room.lobby.visibility === 'all' || followedBy.has(room.hostUserId)))
    .sort((a, b) => b.lobby.openedAt - a.lobby.openedAt || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .slice(0, LOBBY_LIST_LIMIT);
  if (shown.length === 0) return [];

  const shownHosts = [...new Set(shown.map((room) => room.hostUserId as string))];
  const hosts = await db
    .select({ id: profile.userId, nickname: profile.nickname, avatar: profile.avatar })
    .from(profile)
    .where(and(inArray(profile.userId, shownHosts), notHidden(profile.userId)));
  const hostById = new Map(hosts.map((host) => [host.id, host]));
  // Профіль створюється ліниво: ведучому, що його ще не має, роблять його тут (бан — не показуємо й не створюємо).
  const missing = shownHosts.filter((id) => !hostById.has(id));
  if (missing.length > 0) {
    const banned = new Set((await db.select({ id: userBan.userId }).from(userBan).where(inArray(userBan.userId, missing))).map((row) => row.id));
    for (const id of missing.filter((id) => !banned.has(id))) {
      const card = await ensureProfile(db, id);
      if (card !== null) hostById.set(id, { id, nickname: card.nickname, avatar: card.avatar });
    }
  }

  const peopleIds = [...new Set(shown.flatMap((room) => [...room.playerUsers.values()]))];
  let mine = new Set<string>();
  if (viewerId !== null && peopleIds.length > 0) {
    const rows = await db
      .select({ id: follow.followeeId })
      .from(follow)
      .where(and(eq(follow.followerId, viewerId), inArray(follow.followeeId, peopleIds)));
    mine = new Set(rows.map((row) => row.id));
  }
  const levels = await roomLevels(db, [...hostById.keys()]);

  const out: LobbyRow[] = [];
  for (const room of shown) {
    const host = hostById.get(room.hostUserId as string);
    if (host === undefined) continue;
    const slots = slotsOf(room.state);
    out.push({
      code: room.code,
      title: room.state.quiz.title,
      host: { id: host.id, nickname: host.nickname, avatar: host.avatar, level: levels.get(host.id) ?? null },
      players: slots.length,
      maxPlayers: LIMITS.maxPlayers,
      rounds: room.state.quiz.rounds.length,
      questions: room.state.quiz.rounds.reduce((sum, round) => sum + roundQuestions(round).length, 0),
      locked: room.lobby.password !== null,
      late: joinableOf(room) === 'late',
      friends: slots.filter((slot) => mine.has(room.playerUsers.get(slot.id) ?? '')).map((slot) => slot.nickname),
      openedAt: new Date(room.lobby.openedAt).toISOString(),
    });
  }
  return out;
}
