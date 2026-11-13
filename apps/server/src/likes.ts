import type { Db } from './db/client';
import { roomLikes, saveLike, type LikeChange } from './like-store';
import type { Room, RoomManager } from './rooms/manager';
import { reportError } from './log';

/**
 * Лайки кімнати (17a), як attachLevels:
 * - на changed — roomLikes для акаунтів room.playerUsers, яких ця кімната ще не питала, → manager.setLikes; збій → onError, акаунти питаються знову;
 * - на like — saveLike у черзі кімнати (по порядку). Збій → onError, акаунт стає «брудним»; коли в черзі не лишилось його змін
 *   (після успіху чи збою), брудний акаунт перечитується (setLikes). Читання не чіпає акаунтів зі змінами в черзі: вони знову брудні й
 *   перечитаються після свого останнього запису, тож дотик посеред читання не затирається.
 * Кімнату закрили чи віддали → setLikes не кличеться. Без quizId / hostUserId лайків немає — нічого не читається.
 */
export function attachLikes(
  manager: RoomManager,
  db: Db,
  onError: (error: unknown) => void = (error) => reportError(error, { where: 'likes' }),
): { idle(): Promise<void> } {
  const asked = new WeakMap<Room, Set<string>>();
  const queues = new WeakMap<Room, Promise<void>>();
  /** Зміни акаунта в черзі кімнати, ще не записані: userId → кількість. */
  const queued = new WeakMap<Room, Map<string, number>>();
  /** Акаунти, чий запис не вдався (чи читання яких пропущено): перечитати, щойно черга акаунта спорожніє. */
  const dirty = new WeakMap<Room, Set<string>>();
  const countsOf = (room: Room) => {
    const counts = queued.get(room) ?? new Map<string, number>();
    queued.set(room, counts);
    return counts;
  };
  const dirtyOf = (room: Room) => {
    const set = dirty.get(room) ?? new Set<string>();
    dirty.set(room, set);
    return set;
  };
  const pending = new Set<Promise<void>>();

  const track = (job: Promise<void>) => {
    pending.add(job);
    void job.finally(() => pending.delete(job));
  };

  const usable = (room: Room) => !manager.frozen && manager.get(room.code) === room;

  const read = async (room: Room, userIds: string[]): Promise<void> => {
    if (room.quizId === null) return;
    const load = await roomLikes(db, { quizId: room.quizId, gameId: room.id, userIds });
    // Кімнату тим часом закрили чи віддали: її зріз більше нікому не потрібен.
    if (!usable(room)) return;
    // Дотик посеред читання: прочитане вже застаріло — пропустити акаунт і перечитати після його останнього запису.
    const counts = countsOf(room);
    for (const userId of [...load.mine.keys()]) {
      if ((counts.get(userId) ?? 0) === 0) continue;
      load.mine.delete(userId);
      dirtyOf(room).add(userId);
    }
    manager.setLikes(room, load);
  };

  const look = (room: Room) => {
    if (room.quizId === null || room.hostUserId === null) return;
    const seen = asked.get(room) ?? new Set<string>();
    asked.set(room, seen);
    const fresh = [...new Set(room.playerUsers.values())].filter((userId) => !seen.has(userId));
    if (fresh.length === 0) return;
    // Позначаємо одразу: наступний changed, поки чекаємо на базу, не питає тих самих.
    for (const userId of fresh) seen.add(userId);
    track(
      read(room, fresh).catch((error: unknown) => {
        for (const userId of fresh) seen.delete(userId);
        onError(error);
      }),
    );
  };

  const save = (room: Room, change: LikeChange) => {
    const counts = countsOf(room);
    const { userId } = change;
    counts.set(userId, (counts.get(userId) ?? 0) + 1);
    const job = (queues.get(room) ?? Promise.resolve()).then(async () => {
      try {
        await saveLike(db, change);
      } catch (error) {
        onError(error);
        dirtyOf(room).add(userId);
      }
      const left = (counts.get(userId) ?? 1) - 1;
      if (left > 0) {
        counts.set(userId, left);
        return;
      }
      counts.delete(userId);
      // Пізніші зміни акаунта записано: тепер стан у пам'яті можна звірити з базою.
      if (!dirtyOf(room).delete(userId)) return;
      await read(room, [userId]).catch((error: unknown) => {
        dirtyOf(room).add(userId);
        onError(error);
      });
    });
    queues.set(room, job);
    track(job);
  };

  manager.onEvent((room, event) => {
    if (event.type === 'changed') look(room);
    else if (event.type === 'like') save(room, event.change);
  });

  return {
    idle: async () => {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}
