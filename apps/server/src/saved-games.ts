import { slotsOf, type GameState } from '@quiz/engine';
import { and, eq, gt, inArray, notInArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { game, savedGame } from './db/schema';
import { markAborted, saveSavedGame } from './recorder';
import { SAVED_GAME_VERSION, type SavedGameData } from './rooms/continuation';
import { isSavedRoom, type SavedRoom } from './rooms/manager';

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
      .onConflictDoUpdate({ target: savedGame.gameId, set: { data: saved, stateVersion, savedAt } });
    return true;
  });
}

/**
 * Кімнати, що більше не піднімуться (purge, broken), по одній:
 * 1) isSavedRoom(data), є checkpoint, hostUserId != null, state.plays.length > 0 → saveSavedGame (SavedGameData з stateVersion запису, replaces — data.continued?.replaces ?? null);
 * 2) інакше гра 'running' з questions_played > 0 → status 'saved' + saved_game { data: сирий data.checkpoint як SavedGameData-конверт, якщо це об'єкт зі state; інакше null; stateVersion: data.stateVersion, якщо число, інакше null };
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
