/** Стан гравця в «Вибуванні»: alive — живий; edge — на межі (з розкриття до кінця випробування); ghost — привид. */
export type SurvivalStatus = 'alive' | 'edge' | 'ghost';

/** Скільки дверей в удачі. */
export const DOOR_COUNT = 3;

/** Живі після кроків: усі playerIds без тих, хто є в будь-якому з outs (вибулі кожного випробування), у порядку playerIds. */
export function survivorsAfter(playerIds: readonly string[], outs: readonly (readonly string[])[]): string[] {
  const gone = new Set(outs.flat());
  return playerIds.filter((id) => !gone.has(id));
}
