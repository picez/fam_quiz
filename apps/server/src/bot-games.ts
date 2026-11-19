import { autopilotCheck, type Quiz } from '@quiz/shared';
import type { Room, RoomManager } from './rooms/manager';

export type OpenBotGameError = 'server_busy' | 'restarting' | 'autopilot_blocked' | 'bot_rooms_full';

/**
 * Відкрити кімнату бота (54, 56): ті самі перевірки й порядок для адміна («Почати гру») і розкладу —
 * повний сервер, зупинка, автопілот не може вести вікторину, забагато кімнат бота.
 */
export function openBotGame(deps: { manager: RoomManager; maxRooms: number }, quiz: Quiz, quizId: string): { ok: true; room: Room } | { ok: false; error: OpenBotGameError } {
  const { manager, maxRooms } = deps;
  if (manager.size >= maxRooms) return { ok: false, error: 'server_busy' };
  if (manager.frozen) return { ok: false, error: 'restarting' };
  if (autopilotCheck(quiz).blocked.length > 0) return { ok: false, error: 'autopilot_blocked' };
  return manager.createBotRoom(quiz, quizId);
}
