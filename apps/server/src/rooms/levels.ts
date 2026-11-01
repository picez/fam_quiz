import { teamsOn, type GameState } from '@quiz/engine';
import { perksFor, type NickLevel, type PerkGrant } from '@quiz/shared';
import type { Room } from './manager';

/** Нік людини (соло — гравець, команда — люди) → NickLevel, як titlesView; порожньо — undefined. */
export function levelsView(room: Room): Record<string, NickLevel> | undefined {
  if (room.levels.size === 0) return undefined;
  const { state } = room;
  const people = teamsOn(state) ? state.teams.members : state.players;
  const levels: Record<string, NickLevel> = {};
  for (const person of people) {
    const userId = room.playerUsers.get(person.id);
    const level = userId === undefined ? undefined : room.levels.get(userId);
    if (level !== undefined) levels[person.nickname] = level;
  }
  return Object.keys(levels).length === 0 ? undefined : levels;
}

/**
 * Гравці стану з акаунтом і рівнем у room.levels → perksFor(level); гості й без рівня — нічого.
 * Командна гра — нічого (учасник стану — команда, рівень особистий). state — стан, для якого видача (типово room.state).
 */
export function perkGrants(room: Room, state: GameState = room.state): Record<string, PerkGrant> {
  const grants: Record<string, PerkGrant> = {};
  if (room.levels.size === 0 || teamsOn(state)) return grants;
  for (const player of state.players) {
    const userId = room.playerUsers.get(player.id);
    const level = userId === undefined ? undefined : room.levels.get(userId);
    if (level !== undefined) grants[player.id] = perksFor(level.level);
  }
  return grants;
}
