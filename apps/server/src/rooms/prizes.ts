import { rankPlayers, teamMembers, teamsOn, type GameState } from '@quiz/engine';
import { publicContent, type PrizePlace, type PrizeShown, type PrizesView } from '@quiz/shared';
import type { PrizeOutcome } from '../prizes';
import type { Room } from './manager';

/** Хто стоїть на місці (14a): учасник (гравець чи команда) і його люди. */
export interface PlaceHolder {
  place: PrizePlace;
  participantId: string;
  name: string;
  people: { id: string; nickname: string }[];
}

/** Перші три рядки rankPlayers(state.players); соло — people [гравець], команда — teamMembers(state, id). */
export function placeHolders(state: GameState): PlaceHolder[] {
  const teams = teamsOn(state);
  return rankPlayers(state.players)
    .slice(0, 3)
    .map((row, index) => ({
      place: (index + 1) as PrizePlace,
      participantId: row.participantId,
      name: row.nickname,
      people: teams
        ? teamMembers(state, row.participantId).map((m) => ({ id: m.id, nickname: m.nickname }))
        : [{ id: row.participantId, nickname: row.nickname }],
    }));
}

/** Гра, що дає призи: finished і хоча б одне зігране запитання. */
const awarding = (state: GameState) => state.phase === 'finished' && state.plays.length > 0;

/** Лише finished і state.plays.length > 0 (інакше []): для кожного room.prizes — winners з playerUsers (людина без акаунта не входить). */
export function prizeOutcome(room: Room): PrizeOutcome[] {
  if (!awarding(room.state)) return [];
  const holders = placeHolders(room.state);
  return [...room.prizes]
    .sort((a, b) => a.place - b.place)
    .map((placed) => {
      const holder = holders[placed.place - 1];
      const winners = (holder?.people ?? []).flatMap((person) => {
        const userId = room.playerUsers.get(person.id);
        return userId === undefined ? [] : [{ userId, nickname: person.nickname }];
      });
      return { place: placed.place, prizeId: placed.id, winners };
    });
}

/** Зріз призів для ролі; undefined — призів немає. winner і mine (гравцеві) — лише коли гра дає призи (awarding). */
export function prizesView(
  room: Room,
  viewer: { role: 'host' | 'stage' } | { role: 'player'; playerId: string },
): PrizesView | undefined {
  if (room.prizes.length === 0) return undefined;
  const awarded = awarding(room.state);
  const holders = awarded ? placeHolders(room.state) : [];
  const teams = teamsOn(room.state);
  const places: PrizeShown[] = [...room.prizes]
    .sort((a, b) => a.place - b.place)
    .map((placed) => {
      const holder = holders[placed.place - 1];
      return {
        place: placed.place,
        content: publicContent(placed.content),
        winner: holder === undefined ? null : { name: holder.name, members: teams ? holder.people.map((p) => p.nickname) : [] },
      };
    });
  let mine: PrizesView['mine'] = null;
  if (awarded && viewer.role === 'player') {
    const holder = holders.find((h) => h.people.some((p) => p.id === viewer.playerId));
    if (holder !== undefined && room.prizes.some((p) => p.place === holder.place)) {
      mine = { place: holder.place, account: room.playerUsers.has(viewer.playerId) };
    }
  }
  return { places, mine };
}

/** Нік людини → титул: люди стану (соло — players, команда — members) з акаунтом і титулом у room.titles; порожньо → undefined. */
export function titlesView(room: Room): Record<string, string> | undefined {
  if (room.titles.size === 0) return undefined;
  const { state } = room;
  const people = teamsOn(state) ? state.teams.members : state.players;
  const titles: Record<string, string> = {};
  for (const person of people) {
    const userId = room.playerUsers.get(person.id);
    const title = userId === undefined ? undefined : room.titles.get(userId);
    if (title !== undefined) titles[person.nickname] = title;
  }
  return Object.keys(titles).length === 0 ? undefined : titles;
}

