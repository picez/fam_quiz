import type { Db } from './db/client';
import type { Room, RoomManager } from './rooms/manager';
import { roomLevels, stickerAccess } from './xp-store';
import { reportError } from './log';

/**
 * Рівні акаунтів у кімнаті (15a), як attachTitles: на changed акаунти room.playerUsers, яких ця кімната ще не питала, → roomLevels → manager.setLevels;
 * тим самим запитом — доступ до стікерів (34) → manager.setStickerAccess.
 * Збій → onError, акаунт питається ще раз на наступному changed.
 */
export function attachLevels(
  manager: RoomManager,
  db: Db,
  onError: (error: unknown) => void = (error) => reportError(error, { where: 'levels' }),
): { idle(): Promise<void> } {
  const asked = new WeakMap<Room, Set<string>>();
  const pending = new Set<Promise<void>>();

  const look = (room: Room) => {
    const seen = asked.get(room) ?? new Set<string>();
    asked.set(room, seen);
    const fresh = [...new Set(room.playerUsers.values())].filter((userId) => !seen.has(userId));
    if (fresh.length === 0) return;
    // Позначаємо одразу: наступний changed, поки чекаємо на базу, не питає тих самих.
    for (const userId of fresh) seen.add(userId);
    const job = Promise.all([roomLevels(db, fresh, onError), stickerAccess(db, fresh)])
      .then(([levels, access]) => {
        // Кімнату тим часом закрили чи віддали: її зріз більше нікому не потрібен.
        if (manager.frozen || manager.get(room.code) !== room) return;
        // Доступ — до рівнів: setLevels шле changed, і клієнт може одразу надіслати стікер.
        manager.setStickerAccess(room, access);
        if (levels.size > 0) manager.setLevels(room, levels);
      })
      .catch((error: unknown) => {
        for (const userId of fresh) seen.delete(userId);
        onError(error);
      })
      .finally(() => pending.delete(job));
    pending.add(job);
  };

  manager.onEvent((room, event) => {
    if (event.type === 'changed') look(room);
  });

  return {
    idle: async () => {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}
