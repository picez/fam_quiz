import { teamsOn } from '@quiz/engine';
import { isAnti, type AchievementId, type NewAchievementsMine, type NewAchievementsStage } from '@quiz/shared';
import type { Room } from './manager';

/** Спершу звичайні, потім антидосягнення; всередині — порядок каталогу (як дав awardGame). */
const ordered = (ids: readonly AchievementId[]): AchievementId[] => [...ids.filter((id) => !isAnti(id)), ...ids.filter(isAnti)];

/** Телефон (12j): лише finished; гість — { account: false, ids: [] } одразу; акаунт — після нагородження (до того й без нового — undefined). */
export function newAchievementsMine(room: Room, personId: string): NewAchievementsMine | undefined {
  if (room.state.phase !== 'finished') return undefined;
  const userId = room.playerUsers.get(personId);
  if (userId === undefined) return { account: false, ids: [] };
  const ids = room.newAchievements?.byUser.get(userId) ?? [];
  return ids.length === 0 ? undefined : { account: true, ids: ordered(ids) };
}

/**
 * Сцена (12j): лише finished і після нагородження; люди стану (соло — players, команди — teams.members) з акаунтом і непорожнім
 * списком; антидосягнення тих, хто їх ховає, прибрано; порожньо — undefined. Ведучий і автор, що не грали, на слайд не потрапляють.
 */
export function newAchievementsStage(room: Room): NewAchievementsStage | undefined {
  const awarded = room.newAchievements;
  if (room.state.phase !== 'finished' || awarded === null) return undefined;
  const { state } = room;
  const people = teamsOn(state) ? state.teams.members : state.players;
  const shown = people.flatMap((person) => {
    const userId = room.playerUsers.get(person.id);
    if (userId === undefined) return [];
    const all = awarded.byUser.get(userId) ?? [];
    const ids = ordered(awarded.hideAnti.has(userId) ? all.filter((id) => !isAnti(id)) : all);
    return ids.length === 0 ? [] : [{ nickname: person.nickname, ids }];
  });
  return shown.length === 0 ? undefined : { people: shown };
}
