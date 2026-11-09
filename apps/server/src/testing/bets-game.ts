import type { Room, RoomManager } from '../rooms/manager';

/**
 * Від запитання 1 класичного раунду (гра вже почалася, ведуча на `question`) до етапу ставок першого запитання наступного раунду «Ставки»:
 * закриває запитання, на кінці раунду дає балами `given` (id гравця чи команди → бали) і йде через заставку.
 */
export function toBetsWager(manager: RoomManager, room: Room, given: Record<string, number>): void {
  const host = (type: 'lock' | 'next') => {
    const result = manager.host(room, { type });
    if (!result.ok) throw new Error(`${type}: ${result.error}`);
  };
  host('lock');
  host('next'); // reveal
  host('next'); // round_end
  for (const [playerId, points] of Object.entries(given)) {
    const result = manager.host(room, { type: 'adjust', playerId, points });
    if (!result.ok) throw new Error(`adjust: ${result.error}`);
  }
  host('next'); // intro
  host('next'); // wager
  if (room.state.phase !== 'wager') throw new Error(`expected wager, got ${room.state.phase}`);
}
