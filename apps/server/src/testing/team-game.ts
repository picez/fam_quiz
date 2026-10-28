import type { Quiz } from '@quiz/shared';
import type { Db } from '../db/client';
import { user } from '../db/schema';
import { attachRecorder, type Recorder } from '../recorder';
import { RoomManager, type Room } from '../rooms/manager';
import { FakeScheduler } from './fake-scheduler';
import { createTestDb } from './test-db';

/**
 * Кімната командної гри: join людей (у порядку layout), спосіб 'host', assign за layout, start.
 * layout — нікнейми людей кожної команди в порядку команд; перший у команді — капітан.
 * users — акаунти людей за нікнеймом; hostUserId — ведучий з акаунтом (без нього гра не пишеться в історію).
 * Повертає id людей за нікнеймом і id команд за порядком.
 */
export function startTeamGame(
  manager: RoomManager,
  quiz: Quiz,
  layout: string[][],
  users: Record<string, string> = {},
  hostUserId: string | null = null,
): { room: Room; members: Record<string, string>; teams: string[] } {
  const room = manager.create(quiz, hostUserId, null);
  const teams = (room.state.teams?.list ?? []).map((team) => team.id);
  if (teams.length < layout.length) throw new Error(`quiz has ${teams.length} teams, layout ${layout.length}`);
  const members: Record<string, string> = {};
  for (const nickname of layout.flat()) {
    const joined = manager.join(room.code, nickname, users[nickname] ?? null);
    if (!joined.ok) throw new Error(`join ${nickname}: ${joined.error}`);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    members[nickname] = joined.playerId;
  }
  const must = (result: { ok: boolean; error?: string }, what: string) => {
    if (!result.ok) throw new Error(`${what}: ${result.error}`);
  };
  must(manager.host(room, { type: 'team-form', form: 'host' }), 'team-form');
  layout.forEach((names, index) => {
    for (const nickname of names) must(manager.host(room, { type: 'team-assign', memberId: members[nickname], teamId: teams[index] }), `assign ${nickname}`);
  });
  must(manager.host(room, { type: 'start' }), 'start');
  return { room, members, teams: teams.slice(0, layout.length) };
}

/** Ведучий записаної командної гри. */
export const TEAM_HOST = 'team-host';

/** Акаунти людей записаної командної гри: Оля (Червоні) і Віра (Сині); Петро й Ігор — без акаунтів. */
export const TEAM_USERS = { Оля: 'olya-user', Віра: 'vira-user' } as const;

/**
 * Записувана командна гра в новій базі: Червоні — Оля, Петро; Сині — Віра, Ігор (капітани — перші).
 * Гра стоїть на першому вступі; помилки запису — у errors.
 */
export async function recordedTeamGame(
  quiz: Quiz,
  database?: Db,
): Promise<{ db: Db; scheduler: FakeScheduler; manager: RoomManager; recorder: Recorder; room: Room; members: Record<string, string>; teams: string[]; errors: unknown[] }> {
  const db = database ?? (await createTestDb());
  if (database === undefined) {
    await db.insert(user).values([
      { id: TEAM_HOST, name: 'Ведуча', email: 'team-host@example.com' },
      { id: TEAM_USERS.Оля, name: 'Оля', email: 'olya@example.com' },
      { id: TEAM_USERS.Віра, name: 'Віра', email: 'vira@example.com' },
    ]);
  }
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error));
  const started = startTeamGame(
    manager,
    quiz,
    [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ],
    TEAM_USERS,
    TEAM_HOST,
  );
  return { db, scheduler, manager, recorder, errors, ...started };
}

/** Ведучий тисне «Далі», доки не відкриється запитання (або гра не скінчиться). */
export function toQuestion(manager: RoomManager, room: Room): void {
  for (let guard = 0; guard < 8 && room.state.phase !== 'question' && room.state.phase !== 'finished'; guard++) manager.host(room, { type: 'next' });
}

/** Ведучий тисне «Далі», доки гра не скінчиться. */
export function toEnd(manager: RoomManager, room: Room): void {
  for (let guard = 0; guard < 40 && room.state.phase !== 'finished'; guard++) {
    if (room.state.phase === 'question') manager.host(room, { type: 'lock' });
    else manager.host(room, { type: 'next' });
  }
}
