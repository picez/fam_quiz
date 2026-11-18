import type { PlayerXpView } from '@quiz/shared';
import type { Room } from './manager';

/**
 * Телефон (49): лише finished; гість — { account: false } одразу; акаунт — { moment: null }, поки рекордер не дорахував,
 * далі своя картка (лише своя: чужого досвіду телефон не бачить); акаунт без рядка гри — undefined.
 */
export function xpMine(room: Room, personId: string): PlayerXpView | undefined {
  if (room.state.phase !== 'finished') return undefined;
  const userId = room.playerUsers.get(personId);
  if (userId === undefined) return { account: false };
  if (room.xpMoments === null) return { account: true, moment: null };
  const moment = room.xpMoments.get(userId);
  return moment === undefined ? undefined : { account: true, moment };
}
