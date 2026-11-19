import { READABLE_STATE_VERSIONS, slotsOf, type GameState } from '@quiz/engine';
import { BOT_USER_ID, claimSchema, isBotUser, isRecord, type ContinueResponse, type GameSummary, type PlacedPrize, type SavedMode } from '@quiz/shared';
import { and, desc, eq, gt, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CODE_LIMIT, type CurrentUser } from './account-routes';
import { attemptByGame, isActive } from './challenges';
import type { Db } from './db/client';
import { game, liveRoom, participant, savedGame } from './db/schema';
import { gateStatus, type LobbyGate } from './lobby-access';
import { releasePrizes, releaseUnsaved, reservedFor } from './prizes';
import { gameQuestionCount, playerCounts, resumeRound, snapshotOf, teamGameIds } from './history';
import { markAborted, saveSavedGame, trimToCheckpoint } from './recorder';
import { isSavedGameData, SAVED_GAME_VERSION, type RestartParticipant, type SavedGameData } from './rooms/continuation';
import { isSavedRoom, type RoomChallenge, type RoomManager, type SavedRoom } from './rooms/manager';
import type { Located } from './rooms/store';

/** Шлях 12r: старий збережений запис, який замінює кімната (поле continued.replaces конверта); null — немає. */
function replacesOf(data: SavedRoom): string | null {
  const continued = (data as unknown as { continued?: unknown }).continued;
  return isRecord(continued) && typeof continued.replaces === 'string' ? continued.replaces : null;
}

/** Запис кімнати бота (54): ведучий — бот. */
function isBotRoom(data: unknown): boolean {
  return isRecord(data) && isBotUser(typeof data.hostUserId === 'string' ? data.hostUserId : null);
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
    // Призи лишаються в резерві за збереженою грою (14a): продовження грає за них же.
    ...(data.prizes === undefined || data.prizes.length === 0 ? {} : { prizes: data.prizes }),
  };
  return { id: data.id, code: data.code, hostId: hostUserId, quizId: data.quizId, playerUsers: new Map(saved.playerUsers), saved, replaces: replacesOf(data) };
}

/** Сирий запис (може бути нечитабельним): конверт SavedGameData з data.checkpoint, якщо там об'єкт зі state і версія — число; інакше null. */
function rawSaved(data: unknown): { data: SavedGameData | null; stateVersion: number | null } {
  if (!isRecord(data)) return { data: null, stateVersion: null };
  const stateVersion = typeof data.stateVersion === 'number' ? data.stateVersion : null;
  const checkpoint = data.checkpoint;
  if (stateVersion === null || !isRecord(checkpoint) || !isRecord(checkpoint.state)) return { data: null, stateVersion };
  return {
    data: {
      v: SAVED_GAME_VERSION,
      stateVersion,
      state: checkpoint.state as unknown as GameState,
      at: typeof checkpoint.at === 'number' ? checkpoint.at : 0,
      playerUsers: Array.isArray(data.playerUsers) ? (data.playerUsers as [string, string][]) : [],
      quizId: typeof data.quizId === 'string' ? data.quizId : null,
      // Призи сирого запису перевіряє продовження (prizesOf).
      ...(Array.isArray(data.prizes) ? { prizes: data.prizes as PlacedPrize[] } : {}),
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
 * Призи гри (14a): збережена гра лишає їх у резерві, решта повертає на склад (releaseUnsaved).
 * Збій одного рядка — onError і далі.
 */
export async function abandonRooms(db: Db, rows: { roomId: string; data: unknown }[], onError: (error: unknown) => void): Promise<void> {
  for (const row of rows) {
    try {
      // Гра бота (54) ніколи не стає збереженою грою бота: недограна просто перервана.
      if (isBotRoom(row.data)) {
        await markAborted(db, [row.roomId]);
        await releaseUnsaved(db, row.roomId);
        continue;
      }
      const write = exactWrite(row.data);
      if (write !== null && write.id === row.roomId && (await stillOpen(db, row.roomId))) {
        await saveSavedGame(db, write);
      } else if (!(await saveRecorded(db, row.roomId, row.data))) {
        await markAborted(db, [row.roomId]);
      }
      await releaseUnsaved(db, row.roomId);
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

/** Старт сервера (ігри бота, 54, не паркуються — перериваються): 'running' поза except з questions_played > 0 → 'saved' + saved_game з data null; решта 'running' поза except → 'aborted'. */
export async function parkInterrupted(db: Db, except: string[]): Promise<void> {
  const running = except.length === 0 ? eq(game.status, 'running') : and(eq(game.status, 'running'), notInArray(game.id, except));
  await db.transaction(async (tx) => {
    const parked = await tx
      .update(game)
      .set({ status: 'saved' })
      .where(and(running, gt(game.questionsPlayed, 0), ne(game.hostId, BOT_USER_ID)))
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

/**
 * Стан спроби виклику (44) за її грою: done — гру завершено чи перервано, або вона збережена, але точно не продовжується
 * (немає контрольної точки, нечитабельний стан): шлях 12r для спроби закритий, тож «Продовжити» не спрацювало б ніколи.
 * playing — гра йде, точно продовжується або рядка ще немає. status — сирий стан рядка гри (null — рядка немає).
 */
export async function attemptState(db: Db, gameId: string): Promise<{ state: 'playing' | 'done'; status: string | null }> {
  const [row] = await db
    .select({ status: game.status, quizSnapshot: game.quizSnapshot, data: savedGame.data, stateVersion: savedGame.stateVersion })
    .from(game)
    .leftJoin(savedGame, eq(savedGame.gameId, game.id))
    .where(eq(game.id, gameId));
  if (row === undefined) return { state: 'playing', status: null };
  if (row.status === 'finished' || row.status === 'aborted') return { state: 'done', status: row.status };
  if (row.status === 'saved') {
    const mode = savedMode({ data: row.data, stateVersion: row.stateVersion, quizSnapshot: row.quizSnapshot, autopilot: true, hasAuthor: true });
    if (mode !== 'exact') return { state: 'done', status: row.status };
  }
  return { state: 'playing', status: row.status };
}

/**
 * Збережена спроба виклику, яку вже не продовжити (виклик закрито чи немає точної контрольної точки), стає «aborted»:
 * бали й рядки гравця лишаються в таблиці (не завершено), а гра зникає зі збережених у «Моїх іграх» — інакше її не прибрати
 * (продовження відмовляє, видалення заборонене). Відкрита кімната цієї гри (тут чи в іншому процесі) — нічого не чіпаємо.
 */
export async function abortParkedAttempt(db: Db, manager: RoomManager, gameId: string): Promise<void> {
  if (manager.roomById(gameId) !== undefined || manager.openFor(gameId)) return;
  if ((await openGameIds(db, manager)).has(gameId)) return;
  await db
    .update(game)
    .set({ status: 'aborted', finishedAt: new Date() })
    .where(and(eq(game.id, gameId), eq(game.status, 'saved')));
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
    questionCount: gameQuestionCount(row),
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
  /** Пароль лобі (24c) при зайнятті місця. */
  gate: LobbyGate;
}

const UUID = z.string().uuid();

/** Своя збережена гра (host_id — ведучий чи автор автопілота); інакше null (чужа, не збережена, не UUID). */
async function ownSaved(db: Db, id: string, userId: string) {
  if (!UUID.safeParse(id).success) return null;
  const [row] = await db
    .select({ game, data: savedGame.data, stateVersion: savedGame.stateVersion })
    .from(game)
    .leftJoin(savedGame, eq(savedGame.gameId, game.id))
    .where(and(eq(game.id, id), eq(game.hostId, userId), eq(game.status, 'saved')));
  return row ?? null;
}

export type ContinueOutcome = { ok: true; status: 201; body: ContinueResponse } | { ok: false; status: 404 | 409 | 503; error: string };

/**
 * Продовження своєї збереженої гри (13b, 12r): точне з контрольної точки чи з початку раунду.
 * challenge — позначка спроби виклику (44): кімната знову закрита для інших; шлях 12r для неї — cannot_continue (новий id розірвав би зв'язок зі спробою).
 */
export async function continueSavedGame(
  deps: Pick<SavedGameRouteDeps, 'db' | 'manager' | 'maxRooms'>,
  userId: string,
  gameId: string,
  challenge?: RoomChallenge,
): Promise<ContinueOutcome> {
  const { db, manager, maxRooms } = deps;
  const found = await ownSaved(db, gameId, userId);
  if (found === null) return { ok: false, status: 404, error: 'not_found' };
  const row = found.game;
  if ((await openGameIds(db, manager)).has(row.id)) return { ok: false, status: 409, error: 'continue_open' };
  if (manager.size >= maxRooms) return { ok: false, status: 503, error: 'server_busy' };
  if (manager.frozen) return { ok: false, status: 503, error: 'restarting' };
  const participants = await restartParticipants(db, row.id);
  const mode = savedMode({
    data: found.data,
    stateVersion: found.stateVersion,
    quizSnapshot: row.quizSnapshot,
    autopilot: row.autopilot,
    hasAuthor: participants.some((p) => !p.isTeam && p.userId === row.hostId),
  });
  if (mode === 'blocked' || (mode === 'restart' && challenge !== undefined)) return { ok: false, status: 409, error: 'cannot_continue' };
  let result;
  if (mode === 'exact') {
    const stored = found.data as SavedGameData;
    // Призи, яких уже немає в резерві за грою (приз видалили, поки гра лежала), не повертаються на місця.
    const kept = await reservedFor(db, row.id);
    const saved: SavedGameData = { ...stored, prizes: (stored.prizes ?? []).filter((p) => kept.has(p.id)) };
    await trimToCheckpoint(db, row.id, saved.state);
    // Поки обрізали, гру могли видалити чи завершити (інший запит, інший процес): тоді нічого не відкриваємо — 404, як для чужої чи вже не збереженої гри.
    if ((await ownSaved(db, row.id, userId)) === null) return { ok: false, status: 404, error: 'not_found' };
    result = manager.continueSaved(row.id, userId, saved, challenge);
  } else {
    const quiz = snapshotOf(row.quizSnapshot);
    result = manager.restartSaved({
      gameId: row.id,
      quiz: quiz!,
      quizId: row.quizId,
      hostUserId: userId,
      autopilot: row.autopilot,
      roundIndex: resumeRound(quiz, row.plays, row.questionsPlayed),
      participants,
    });
  }
  if (!result.ok) return { ok: false, status: result.error === 'restarting' ? 503 : 409, error: result.error };
  // Шлях 12r: нове лобі — нові місця; резерви старої гри повертаються на склад (14a).
  if (mode === 'restart') await releasePrizes(db, row.id);
  const { room, author } = result;
  const body: ContinueResponse =
    author === null
      ? { gameId: room.id, code: room.code, hostToken: room.hostToken, stageToken: room.stageToken }
      : { gameId: room.id, code: room.code, stageToken: room.stageToken, token: author.token, playerId: author.playerId };
  return { ok: true, status: 201, body };
}

export async function registerSavedGameRoutes(app: FastifyInstance, deps: SavedGameRouteDeps): Promise<void> {
  const { db, manager, locate, currentUser, gate } = deps;
  const CREATE_LIMIT = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const UNAUTHORIZED = { error: 'unauthorized' };
  const NOT_FOUND = { error: 'not_found' };
  const RESTARTING = { error: 'restarting' };

  app.post<{ Params: { id: string } }>('/api/games/:id/continue', CREATE_LIMIT, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    // Чужа чи не збережена — 404 ще до того, як щось казати про виклик.
    if ((await ownSaved(db, request.params.id, user.id)) === null) return reply.code(404).send(NOT_FOUND);
    // Спроба виклику (44): позначки немає в збереженій грі — беремо її зі спроби; виклик завершено чи прострочено — не продовжується.
    // Спроба, яку вже не продовжити, стає «aborted» і зникає зі збережених (бали лишаються в таблиці виклику).
    const source = await attemptByGame(db, request.params.id);
    if (source !== null && !isActive(source, new Date())) {
      await abortParkedAttempt(db, manager, request.params.id);
      return reply.code(409).send({ error: 'challenge_closed' });
    }
    if (source !== null && (await attemptState(db, request.params.id)).state === 'done') {
      await abortParkedAttempt(db, manager, request.params.id);
      return reply.code(409).send({ error: 'challenge_done' });
    }
    const mark = source === null ? undefined : { id: source.id, code: source.code, title: source.title };
    const outcome = await continueSavedGame(deps, user.id, request.params.id, mark);
    return outcome.ok ? reply.code(201).send(outcome.body) : reply.code(outcome.status).send({ error: outcome.error });
  });

  app.delete<{ Params: { id: string } }>('/api/games/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const found = await ownSaved(db, request.params.id, user.id);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    // Спроба виклику (44): видалення відкрило б другу спробу.
    if ((await attemptByGame(db, found.game.id)) !== null) return reply.code(409).send({ error: 'challenge_game' });
    if ((await openGameIds(db, manager)).has(found.game.id)) return reply.code(409).send({ error: 'continue_open' });
    // Перевірка вище чекала на базу: продовження могли відкрити за цей час — звіряємося ще раз без очікування перед самим видаленням.
    if (manager.openFor(found.game.id)) return reply.code(409).send({ error: 'continue_open' });
    // І рядок live_room (продовження в іншому процесі) — теж безпосередньо перед видаленням.
    if ((await openGameIds(db, manager)).has(found.game.id)) return reply.code(409).send({ error: 'continue_open' });
    const removed = await db
      .delete(game)
      .where(and(eq(game.id, found.game.id), eq(game.status, 'saved')))
      .returning({ id: game.id });
    // Гри більше немає — її призи повертаються на склад (14a). Не видалилося нічого (гру тим часом продовжили) — резерви лишаються.
    if (removed.length > 0) await releaseUnsaved(db, found.game.id);
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
    const room = manager.get(request.params.code);
    if (room === undefined) return reply.code(404).send({ error: 'game_not_found' });
    // Пароль лобі (24c): займати місце в продовженій грі — теж вхід.
    const access = await gate.check(room, { userId: account?.id ?? null, password: body.data.password, ip: request.ip, device: body.data.device });
    if (access !== 'ok') return reply.code(gateStatus(access)).send({ error: access });
    const claimed = manager.claim(request.params.code, body.data.slotId, account?.id ?? null);
    if (!claimed.ok) {
      const status = claimed.error === 'game_not_found' || claimed.error === 'not_found' ? 404 : claimed.error === 'not_allowed' ? 403 : claimed.error === 'restarting' ? 503 : 409;
      return reply.code(status).send({ error: claimed.error });
    }
    return reply.code(201).send({ token: claimed.token, playerId: claimed.playerId });
  });
}
