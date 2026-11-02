import type { Db } from './db/client';
import { roomLikes, saveLike, type LikeChange } from './like-store';
import type { Room, RoomManager } from './rooms/manager';

/**
 * Лайки кімнати (17a), як attachLevels:
 * - на changed — roomLikes для акаунтів room.playerUsers, яких ця кімната ще не питала, → manager.setLikes; збій → onError, акаунти питаються знову;
 * - на like — saveLike у черзі кімнати (по порядку); збій → onError і перечитати акаунт (setLikes), якщо в черзі немає пізнішої зміни цього акаунта.
 * Кімнату закрили чи віддали → setLikes не кличеться. Без quizId / hostUserId лайків немає — нічого не читається.
 */
export function attachLikes(
  manager: RoomManager,
  db: Db,
  onError: (error: unknown) => void = (error) => console.error('Не вдалося записати чи прочитати лайки:', error),
): { idle(): Promise<void> } {
  const asked = new WeakMap<Room, Set<string>>();
  const queues = new WeakMap<Room, Promise<void>>();
  /** Зміни акаунта в черзі кімнати, ще не записані: userId → кількість. */
  const queued = new WeakMap<Room, Map<string, number>>();
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
    if (usable(room)) manager.setLikes(room, load);
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
    const counts = queued.get(room) ?? new Map<string, number>();
    queued.set(room, counts);
    counts.set(change.userId, (counts.get(change.userId) ?? 0) + 1);
    const done = () => {
      const left = (counts.get(change.userId) ?? 1) - 1;
      if (left === 0) counts.delete(change.userId);
      else counts.set(change.userId, left);
      return left;
    };
    const job = (queues.get(room) ?? Promise.resolve()).then(async () => {
      try {
        await saveLike(db, change);
        done();
      } catch (error) {
        onError(error);
        // Пізніша зміна цього акаунта ще в черзі: вона й запише бажаний стан, перечитування затерло б його.
        if (done() > 0) return;
        await read(room, [change.userId]).catch(onError);
      }
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
