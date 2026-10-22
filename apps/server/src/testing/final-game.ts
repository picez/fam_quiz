import type { Room, RoomManager } from '../rooms/manager';

const right = { type: 'single', optionId: 'b' } as const;

/**
 * Проходить гру «класичний раунд, потім фінал» до кінця: у класичному всі відповідають правильно,
 * у фіналі лише названі в `finalAnswers` (решта мовчить); ставку кожного дає `stake`.
 * Зупиняється раніше, коли `until` повертає true.
 */
export function playToEnd(
  manager: RoomManager,
  room: Room,
  players: string[],
  finalAnswers: string[],
  stake: (playerId: string) => number,
  until: (room: Room) => boolean = () => false,
): void {
  for (let guard = 0; guard < 60 && room.state.phase !== 'finished' && !until(room); guard++) {
    const phase = room.state.phase;
    if (phase === 'lobby') manager.host(room, { type: 'start' });
    else if (phase === 'wager') for (const id of players) manager.wager(room, id, stake(id));
    else if (phase === 'question') {
      if (room.state.roundIndex === 0) for (const id of players) manager.answer(room, id, right);
      else {
        for (const id of finalAnswers) manager.answer(room, id, right);
        if (room.state.phase === 'question') manager.host(room, { type: 'lock' });
      }
    } else manager.host(room, { type: 'next' });
  }
}
