import { READABLE_STATE_VERSIONS, slotsOf, type GameState } from '@quiz/engine';
import { claimSchema, type ContinueResponse, type GameSummary, type SavedMode } from '@quiz/shared';
import { and, desc, eq, gt, inArray, notInArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CODE_LIMIT, type CurrentUser } from './account-routes';
import type { Db } from './db/client';
import { game, liveRoom, participant, savedGame } from './db/schema';
import { playerCounts, questionCountOf, resumeRound, snapshotOf, teamGameIds } from './history';
import { markAborted, saveSavedGame, trimToCheckpoint } from './recorder';
import { isSavedGameData, SAVED_GAME_VERSION, type RestartParticipant, type SavedGameData } from './rooms/continuation';
import { isSavedRoom, type RoomManager, type SavedRoom } from './rooms/manager';
import type { Located } from './rooms/store';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Шлях 12r: старий збережений запис, який замінює кімната (поле continued.replaces конверта); null — немає. */
function replacesOf(data: SavedRoom): string | null {
  const continued = (data as unknown as { continued?: unknown }).continued;
  return isObject(continued) && typeof continued.replaces === 'string' ? continued.replaces : null;
}

/** Точне збереження з контрольної точки читабельного запису: лише гра з ведучим-акаунтом, що дійшла до запитання й не фінішувала. */
function exactWrite(data: unknown) {
  if (!isSavedRoom(data)) return null;
  const { checkpoint, hostUserId, state } = data;
  if (checkpoint === undefined || hostUserId === null || state.plays.length === 0 || state.phase === 'lobby' || state.phase === 'finished') return null;
  const people = new Set([...checkpoint.state.players.map((p) => p.id), ...slotsOf(checkpoint.state).map((slot) => slot.id)]);
  const saved: SavedGameData = {
    v: SAVED_GAME_VERSION,
    stateVersion: data.stateVersion,
    state: checkpoint.state,
    at: checkpoint.at,
    playerUsers: data.playerUsers.filter(([playerId]) => people.has(playerId)),
    quizId: data.quizId,
  };
  return { id: data.id, code: data.code, hostId: hostUserId, quizId: data.quizId, playerUsers: new Map(saved.playerUsers), saved, replaces: replacesOf(data) };
}

/** Сирий запис (може бути нечитабельним): конверт SavedGameData з data.checkpoint, якщо там об'єкт зі state і версія — число; інакше null. */
function rawSaved(data: unknown): { data: SavedGameData | null; stateVersion: number | null } {
  if (!isObject(data)) return { data: null, stateVersion: null };
  const stateVersion = typeof data.stateVersion === 'number' ? data.stateVersion : null;
  const checkpoint = data.checkpoint;
  if (stateVersion === null || !isObject(checkpoint) || !isObject(checkpoint.state)) return { data: null, stateVersion };
  return {
    data: {
      v: SAVED_GAME_VERSION,
      stateVersion,
      state: checkpoint.state as unknown as GameState,
      at: typeof checkpoint.at === 'number' ? checkpoint.at : 0,
      playerUsers: Array.isArray(data.playerUsers) ? (data.playerUsers as [string, string][]) : [],
      quizId: typeof data.quizId === 'string' ? data.quizId : null,
    },
    stateVersion,
  };
}

/** Гра, що вже закрила запитання й ще не завершилась ('running' чи продовження 'saved'), стає 'saved' з saved_game (upsert). true — так і сталось. */
async function saveRecorded(db: Db, roomId: string, data: unknown): Promise<boolean> {
  const { data: saved, stateVersion } = rawSaved(data);
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(game)
      .set({ status: 'saved', finishedAt: null })
      .where(and(eq(game.id, roomId), inArray(game.status, ['running', 'saved']), gt(game.questionsPlayed, 0)))
      .returning({ id: game.id });
    if (rows.length === 0) return false;
    const savedAt = new Date();
    await tx
      .insert(savedGame)
      .values({ gameId: roomId, data: saved, stateVersion, savedAt })
      // Без знімка в записі (сміття) — читабельний знімок, що вже лежить у saved_game, лишається: продовження ним і почнеться.
      .onConflictDoUpdate({ target: savedGame.gameId, set: saved === null ? { savedAt } : { data: saved, stateVersion, savedAt } });
    return true;
  });
}

/**
 * Кімнати, що більше не піднімуться (purge, broken), по одній:
 * 1) isSavedRoom(data), є checkpoint, hostUserId != null, state.plays.length > 0 → saveSavedGame (SavedGameData з stateVersion запису, replaces — data.continued?.replaces ?? null);
 * 2) інакше гра 'running' з questions_played > 0 → status 'saved' + saved_game { data: сирий data.checkpoint як SavedGameData-конверт, якщо це об'єкт зі state; інакше null; stateVersion: data.stateVersion, якщо число, інакше null }; без знімка наявний рядок saved_game лишає свої data і stateVersion;
 * 3) решта → markAborted.
 * Збій одного рядка — onError і далі.
 */
export async function abandonRooms(db: Db, rows: { roomId: string; data: unknown }[], onError: (error: unknown) => void): Promise<void> {
  for (const row of rows) {
    try {
      const write = exactWrite(row.data);
      if (write !== null && write.id === row.roomId && (await stillOpen(db, row.roomId))) {
        await saveSavedGame(db, write);
        continue;
      }
      if (await saveRecorded(db, row.roomId, row.data)) continue;
      await markAborted(db, [row.roomId]);
    } catch (error) {
      onError(error);
    }
  }
}

/** Гру ще не завершено й не перервано (рядка може й не бути: рекордер його ще не записав). */
async function stillOpen(db: Db, id: string): Promise<boolean> {
  const [row] = await db.select({ status: game.status }).from(game).where(eq(game.id, id));
  return row === undefined || row.status === 'running' || row.status === 'saved';
}

/** Старт сервера: 'running' поза except з questions_played > 0 → 'saved' + saved_game з data null; решта 'running' поза except → 'aborted'. */
export async function parkInterrupted(db: Db, except: string[]): Promise<void> {
  const running = except.length === 0 ? eq(game.status, 'running') : and(eq(game.status, 'running'), notInArray(game.id, except));
  await db.transaction(async (tx) => {
    const parked = await tx
      .update(game)
      .set({ status: 'saved' })
      .where(and(running, gt(game.questionsPlayed, 0)))
      .returning({ id: game.id });
    if (parked.length > 0) {
      const savedAt = new Date();
      await tx
        .insert(savedGame)
        .values(parked.map((row) => ({ gameId: row.id, data: null, stateVersion: null, savedAt })))
        .onConflictDoNothing();
    }
    await tx.update(game).set({ status: 'aborted', finishedAt: new Date() }).where(running);
  });
}

/** id ігор, продовження яких відкрите, з кодом відкритої кімнати: кімнати в пам'яті (id чи continued.replaces) і рядки live_room (room_id чи data->continued->replaces). */
export async function openGameIds(db: Db, manager: RoomManager): Promise<Map<string, string>> {
  const open = new Map<string, string>();
  for (const room of manager.rooms()) {
    open.set(room.id, room.code);
    if (room.continued?.replaces != null) open.set(room.continued.replaces, room.code);
  }
  const rows = await db
    .select({ code: liveRoom.code, roomId: liveRoom.roomId, replaces: sql<string | null>`${liveRoom.data}->'continued'->>'replaces'` })
    .from(liveRoom);
  for (const row of rows) {
    if (!open.has(row.roomId)) open.set(row.roomId, row.code);
    if (row.replaces !== null && !open.has(row.replaces)) open.set(row.replaces, row.code);
  }
  return open;
}

/** Як продовжити: знімок вікторини не читається → blocked; читабельний знімок стану → exact; інакше restart (автопілот без рядка автора → blocked). */
export function savedMode(input: { data: unknown; stateVersion: number | null; quizSnapshot: unknown; autopilot: boolean; hasAuthor: boolean }): SavedMode {
  if (snapshotOf(input.quizSnapshot) === null) return 'blocked';
  if (isSavedGameData(input.data) && input.stateVersion !== null && READABLE_STATE_VERSIONS.includes(input.stateVersion)) return 'exact';
  return input.autopilot && !input.hasAuthor ? 'blocked' : 'restart';
}

/** Усі 'saved' ведучого (без ліміту), найновіше збереження першим, як GameSummary + saved. */
export async function savedSummaries(db: Db, hostId: string, open: Map<string, string>): Promise<GameSummary[]> {
  const rows = await db
    .select({ game, data: savedGame.data, stateVersion: savedGame.stateVersion, savedAt: savedGame.savedAt })
    .from(game)
    .leftJoin(savedGame, eq(savedGame.gameId, game.id))
    .where(and(eq(game.hostId, hostId), eq(game.status, 'saved')))
    .orderBy(desc(sql`coalesce(${savedGame.savedAt}, ${game.startedAt})`));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.game.id);
  const players = await playerCounts(db, ids);
  const teamGames = await teamGameIds(db, ids);
  const authors = await db
    .select({ gameId: participant.gameId })
    .from(participant)
    .innerJoin(game, eq(game.id, participant.gameId))
    .where(and(inArray(participant.gameId, ids), eq(participant.isTeam, false), eq(participant.userId, game.hostId)));
  const withAuthor = new Set(authors.map((row) => row.gameId));
  return rows.map(({ game: row, data, stateVersion, savedAt }) => ({
    id: row.id,
    title: row.title,
    code: row.code,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: null,
    playerCount: players.get(row.id) ?? 0,
    questionsPlayed: row.questionsPlayed,
    questionCount: questionCountOf(row.quizSnapshot),
    teams: teamGames.has(row.id),
    autopilot: row.autopilot,
    saved: {
      mode: savedMode({ data, stateVersion, quizSnapshot: row.quizSnapshot, autopilot: row.autopilot, hasAuthor: withAuthor.has(row.id) }),
      open: open.has(row.id),
      openCode: open.get(row.id) ?? null,
      savedAt: (savedAt ?? row.startedAt).toISOString(),
    },
  }));
}

/** Рядки participant гри для шляху 12r. */
export async function restartParticipants(db: Db, gameId: string): Promise<RestartParticipant[]> {
  return db
    .select({ id: participant.id, nickname: participant.nickname, userId: participant.userId, score: participant.score, isTeam: participant.isTeam, teamId: participant.teamId })
    .from(participant)
    .where(eq(participant.gameId, gameId));
}

export interface SavedGameRouteDeps {
  db: Db;
  manager: RoomManager;
  locate: (code: string) => Promise<Located>;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  maxRooms: number;
}

const UUID = z.string().uuid();

export async function registerSavedGameRoutes(app: FastifyInstance, deps: SavedGameRouteDeps): Promise<void> {
  const { db, manager, locate, currentUser, maxRooms } = deps;
  const CREATE_LIMIT = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const UNAUTHORIZED = { error: 'unauthorized' };
  const NOT_FOUND = { error: 'not_found' };
  const RESTARTING = { error: 'restarting' };

  /** Своя збережена гра (host_id — ведучий чи автор автопілота); інакше null (чужа, не збережена, не UUID). */
  const ownSaved = async (id: string, userId: string) => {
    if (!UUID.safeParse(id).success) return null;
    const [row] = await db
      .select({ game, data: savedGame.data, stateVersion: savedGame.stateVersion })
      .from(game)
      .leftJoin(savedGame, eq(savedGame.gameId, game.id))
      .where(and(eq(game.id, id), eq(game.hostId, userId), eq(game.status, 'saved')));
    return row ?? null;
  };

  app.post<{ Params: { id: string } }>('/api/games/:id/continue', CREATE_LIMIT, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const found = await ownSaved(request.params.id, user.id);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    const row = found.game;
    if ((await openGameIds(db, manager)).has(row.id)) return reply.code(409).send({ error: 'continue_open' });
    if (manager.size >= maxRooms) return reply.code(503).send({ error: 'server_busy' });
    if (manager.frozen) return reply.code(503).send(RESTARTING);
    const participants = await restartParticipants(db, row.id);
    const mode = savedMode({
      data: found.data,
      stateVersion: found.stateVersion,
      quizSnapshot: row.quizSnapshot,
      autopilot: row.autopilot,
      hasAuthor: participants.some((p) => !p.isTeam && p.userId === row.hostId),
    });
    if (mode === 'blocked') return reply.code(409).send({ error: 'cannot_continue' });
    let result;
    if (mode === 'exact') {
      const saved = found.data as SavedGameData;
      await trimToCheckpoint(db, row.id, saved.state);
      // Поки обрізали, гру могли видалити чи завершити: тоді нічого не відкриваємо.
      if ((await ownSaved(row.id, user.id)) === null) return reply.code(404).send(NOT_FOUND);
      result = manager.continueSaved(row.id, user.id, saved);
    } else {
      const quiz = snapshotOf(row.quizSnapshot);
      result = manager.restartSaved({
        gameId: row.id,
        quiz: quiz!,
        quizId: row.quizId,
        hostUserId: user.id,
        autopilot: row.autopilot,
        roundIndex: resumeRound(quiz, row.plays, row.questionsPlayed),
        participants,
      });
    }
    if (!result.ok) return reply.code(result.error === 'restarting' ? 503 : 409).send({ error: result.error });
    const { room, author } = result;
    const body: ContinueResponse =
      author === null
        ? { gameId: room.id, code: room.code, hostToken: room.hostToken, stageToken: room.stageToken }
        : { gameId: room.id, code: room.code, stageToken: room.stageToken, token: author.token, playerId: author.playerId };
    return reply.code(201).send(body);
  });

  app.delete<{ Params: { id: string } }>('/api/games/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const found = await ownSaved(request.params.id, user.id);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    if ((await openGameIds(db, manager)).has(found.game.id)) return reply.code(409).send({ error: 'continue_open' });
    // Перевірка вище чекала на базу: продовження могли відкрити за цей час — звіряємося ще раз без очікування перед самим видаленням.
    if (manager.openFor(found.game.id)) return reply.code(409).send({ error: 'continue_open' });
    await db.delete(game).where(and(eq(game.id, found.game.id), eq(game.status, 'saved')));
    return reply.code(200).send({});
  });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/slots', CODE_LIMIT, async (request, reply) => {
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    const account = await currentUser(request);
    const slots = manager.slots(request.params.code, account?.id ?? null);
    return slots === null ? reply.code(404).send({ error: 'game_not_found' }) : slots;
  });

  app.post<{ Params: { code: string } }>('/api/games/by-code/:code/claim', CODE_LIMIT, async (request, reply) => {
    const body = claimSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    const account = await currentUser(request);
    const claimed = manager.claim(request.params.code, body.data.slotId, account?.id ?? null);
    if (!claimed.ok) {
      const status = claimed.error === 'game_not_found' || claimed.error === 'not_found' ? 404 : claimed.error === 'not_allowed' ? 403 : claimed.error === 'restarting' ? 503 : 409;
      return reply.code(status).send({ error: claimed.error });
    }
    return reply.code(201).send({ token: claimed.token, playerId: claimed.playerId });
  });
}
